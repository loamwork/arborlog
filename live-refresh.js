#!/usr/bin/env node --max-old-space-size=8192
/**
 * live-refresh.js — fetch fresh tree data per source, normalize via stevage's
 * crosswalks, write canonical JSON output.
 *
 * Added 2026-04-13 by Kevin Frankenfeld (loamwork fork) for the Pining app.
 *
 * Why this exists:
 *   stevage's original pipeline (1-gettrees → 2-loadtrees → 3-processFiles →
 *   4-makeVectorTiles → 5-upload) is built around a heavy GDAL/PostGIS/tippecanoe
 *   stack that produces vector tiles. The Pining consumer app wants per-record
 *   data in a queryable store (Firestore), not tiles. This script reuses
 *   stevage's source registry + crosswalks but bypasses the tile pipeline:
 *   it fetches each source over HTTP, normalizes via the crosswalk, and writes
 *   one JSON file per city plus a manifest with freshness metadata.
 *
 * Usage:
 *   node live-refresh.js                       # refresh all configured cities
 *   node live-refresh.js nyc                   # refresh just NYC
 *   node live-refresh.js nyc san_francisco     # refresh several
 *
 * Output (in ./live-data/):
 *   {sourceId}.json    — array of normalized records
 *   manifest.json      — freshness metadata per source
 *
 * Requires Node 18+ (built-in fetch).
 *
 * Configured sources (the Pining "start with these three" set):
 *   nyc            — NYC 2015 Street Tree Census (CSV, ~683K rows, dataset
 *                    last updated 2017; NYC's 2025 census not yet published)
 *   san_francisco  — SF Street Tree List (CSV, ~198K rows, live updates)
 *   seattle        — SDOT Trees Active (ArcGIS REST FeatureServer, ~209K
 *                    records, live updates, paginated)
 */

const fs = require('fs');
const path = require('path');

const sources = require('./sources');

// ---------- Inline CSV parser ----------

/**
 * Parse RFC-4180-ish CSV text into an array of objects keyed by header.
 *
 * Handles:
 *   - quoted fields with embedded commas
 *   - quoted fields with embedded newlines
 *   - escaped quotes ("" inside a quoted field)
 *   - trailing/empty lines
 *
 * Does NOT handle: alternative delimiters, BOMs, header-less files (callers
 * must provide CSV with a header row).
 */
function csvParse(text) {
    if (!text) return [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const len = text.length;

    while (i < len) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                } else {
                    inQuotes = false;
                    i++;
                }
            } else {
                field += ch;
                i++;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
                i++;
            } else if (ch === ',') {
                row.push(field);
                field = '';
                i++;
            } else if (ch === '\n' || ch === '\r') {
                row.push(field);
                field = '';
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
                if (ch === '\r' && text[i + 1] === '\n') i += 2;
                else i++;
            } else {
                field += ch;
                i++;
            }
        }
    }
    // Flush trailing field/row
    if (field !== '' || row.length > 0) {
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
    }

    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(r => {
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = r[j] !== undefined ? r[j] : '';
        }
        return obj;
    });
}

// ---------- Config ----------

const DEFAULT_SOURCE_IDS = ['nyc', 'san_francisco', 'seattle'];

const ARCGIS_PAGE_SIZE = 2000;
const ARCGIS_PAGE_DELAY_MS = 150;

const OUT_DIR = path.join(__dirname, 'live-data');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');

// ---------- HTTP helpers ----------

async function httpGet(url, { headers = {}, timeoutMs = 60_000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'opentrees-data live-refresh (loamwork fork)', ...headers },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        }
        return res;
    } finally {
        clearTimeout(timer);
    }
}

async function httpGetText(url, opts) {
    const res = await httpGet(url, opts);
    return await res.text();
}

async function httpGetJson(url, opts) {
    const res = await httpGet(url, opts);
    return await res.json();
}

// ---------- Source freshness ----------

/**
 * Fetch when the source was last updated. Strategy depends on the source's
 * sourceMetadataUrl:
 *   - Socrata (data.*.us / data.*.gov) returns rowsUpdatedAt as Unix epoch
 *     seconds in the dataset metadata JSON
 *   - ArcGIS REST returns editingInfo.lastEditDate as Unix epoch milliseconds
 *     in the layer metadata JSON
 * Returns ISO 8601 date string, or null if we couldn't determine it.
 */
async function fetchSourceLastUpdated(source) {
    if (!source.sourceMetadataUrl) return null;
    try {
        const meta = await httpGetJson(source.sourceMetadataUrl);

        // Socrata dataset metadata
        if (typeof meta.rowsUpdatedAt === 'number') {
            return new Date(meta.rowsUpdatedAt * 1000).toISOString();
        }

        // ArcGIS REST layer metadata
        if (meta.editingInfo && typeof meta.editingInfo.lastEditDate === 'number') {
            return new Date(meta.editingInfo.lastEditDate).toISOString();
        }
        if (typeof meta.editFieldsInfo === 'object' && meta.editingInfo) {
            // sometimes nested differently
            const last = meta.editingInfo.lastEditDate;
            if (typeof last === 'number') return new Date(last).toISOString();
        }

        return null;
    } catch (e) {
        console.warn(`  freshness lookup failed: ${e.message}`);
        return null;
    }
}

// ---------- Fetchers (one per format) ----------

/**
 * Fetch and parse a CSV download. Returns array of row objects, with header
 * names as keys. Uses the inline csvParse defined above (RFC-4180-ish, handles
 * quoted fields with commas/newlines/escaped quotes).
 */
async function fetchCsvRows(url) {
    const text = await httpGetText(url, { timeoutMs: 300_000 }); // CSVs can be large; 5min
    return csvParse(text);
}

/**
 * Fetch all features from a paginated ArcGIS REST FeatureServer query endpoint.
 * Iterates with resultOffset until the server returns fewer features than
 * pageSize. Returns array of GeoJSON Feature objects (because the source URL
 * includes f=geojson).
 */
async function fetchArcgisGeoJsonAll(baseUrl) {
    const allFeatures = [];
    let offset = 0;
    while (true) {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${sep}resultRecordCount=${ARCGIS_PAGE_SIZE}&resultOffset=${offset}`;
        const data = await httpGetJson(url, { timeoutMs: 60_000 });
        if (data.error) {
            throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);
        }
        const features = data.features || [];
        allFeatures.push(...features);
        process.stdout.write(`  fetched ${allFeatures.length}\r`);
        if (features.length < ARCGIS_PAGE_SIZE) break;
        offset += features.length;
        if (ARCGIS_PAGE_DELAY_MS) {
            await new Promise(r => setTimeout(r, ARCGIS_PAGE_DELAY_MS));
        }
    }
    process.stdout.write('\n');
    return allFeatures;
}

// ---------- Normalize via stevage's crosswalk ----------

/**
 * Convert an arbitrary "row" (CSV row object, or GeoJSON feature properties)
 * to the canonical opentrees record shape by walking the source's crosswalk.
 *
 * Stevage's crosswalks use either string field names (direct rename) or
 * arrow functions that take the raw row and return a value. We honor both.
 *
 * Lat/lon are extracted separately from the row geometry (for ArcGIS GeoJSON)
 * or from known column names (for CSV).
 */
function applyCrosswalk(rawRow, source) {
    const out = {};
    const cw = source.crosswalk || {};
    for (const [canonField, mapper] of Object.entries(cw)) {
        let value;
        try {
            if (typeof mapper === 'function') {
                value = mapper(rawRow);
            } else if (typeof mapper === 'string') {
                value = rawRow[mapper];
            }
        } catch (e) {
            value = null;
        }
        // Empty string and undefined become null for cleanness; preserve 0 and false
        if (value === undefined || value === '') {
            value = null;
        }
        out[canonField] = value;
    }
    return out;
}

/**
 * Extract lat/lon from a CSV row, trying common field name conventions.
 */
function extractCsvLatLon(row) {
    const candidates = [
        ['latitude', 'longitude'],
        ['Latitude', 'Longitude'],
        ['LATITUDE', 'LONGITUDE'],
        ['lat', 'lon'],
        ['lat', 'lng'],
        ['Y', 'X'],
        ['y', 'x'],
    ];
    for (const [latKey, lonKey] of candidates) {
        if (row[latKey] != null && row[lonKey] != null) {
            const lat = Number(row[latKey]);
            const lon = Number(row[lonKey]);
            if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0) {
                return { lat, lon };
            }
        }
    }
    return { lat: null, lon: null };
}

/**
 * Build the canonical record for one tree, regardless of source format.
 * Required fields: id, sourceId, sourceNativeId, lat, lon. Other canonical
 * fields are populated from the crosswalk and may be null.
 */
function makeCanonicalRecord(rawRow, source, latLon, sourceLastUpdated, ingestedAt) {
    const crossed = applyCrosswalk(rawRow, source);
    // Stevage uses 'ref' or 'id' as the native ID field name in crosswalks.
    // Both are pulled out and removed from the crosswalk result so they don't
    // collide with our canonical `id` field.
    const nativeIdRaw = crossed.ref ?? crossed.id ?? null;
    const sourceNativeId = nativeIdRaw == null ? null : String(nativeIdRaw);
    if (sourceNativeId == null) return null;
    delete crossed.ref;
    delete crossed.id;
    return {
        // Canonical fields first
        id: `${source.id}_${sourceNativeId}`,
        sourceId: source.id,
        sourceNativeId,
        country: source.country,
        short: source.short,
        long: source.long,
        lat: latLon.lat,
        lon: latLon.lon,
        license: 'CC-BY-NC-4.0', // inherited from stevage's repo license
        attributionUrl: source.info || null,
        sourceLastUpdated,
        ingestedAt,
        // Crosswalk fields (scientific, common, dbh, height, planted, health, etc.)
        ...crossed,
    };
}

// ---------- Per-source runner ----------

async function refreshOneSource(source) {
    const startedAt = Date.now();
    console.log(`\n=== ${source.id} (${source.short}) ===`);
    console.log(`  format: ${source.format}, url: ${source.download.slice(0, 80)}${source.download.length > 80 ? '...' : ''}`);

    const sourceLastUpdated = await fetchSourceLastUpdated(source);
    console.log(`  sourceLastUpdated: ${sourceLastUpdated || '(unknown)'}`);

    const ingestedAt = new Date().toISOString();
    let records = [];

    if (source.format === 'csv') {
        const rows = await fetchCsvRows(source.download);
        console.log(`  fetched ${rows.length} CSV rows`);
        for (const row of rows) {
            const latLon = extractCsvLatLon(row);
            const rec = makeCanonicalRecord(row, source, latLon, sourceLastUpdated, ingestedAt);
            if (rec) records.push(rec);
        }
    } else if (source.format === 'arcgis-rest') {
        const features = await fetchArcgisGeoJsonAll(source.download);
        console.log(`  fetched ${features.length} ArcGIS features`);
        for (const f of features) {
            const props = f.properties || {};
            // GeoJSON: geometry.coordinates = [lon, lat]
            let latLon = { lat: null, lon: null };
            if (f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
                latLon = { lon: Number(f.geometry.coordinates[0]), lat: Number(f.geometry.coordinates[1]) };
            }
            const rec = makeCanonicalRecord(props, source, latLon, sourceLastUpdated, ingestedAt);
            if (rec) records.push(rec);
        }
    } else {
        throw new Error(`Unsupported format '${source.format}' for source ${source.id}`);
    }

    // Drop records without valid coords
    const valid = records.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat !== 0 && r.lon !== 0);
    const droppedNoGeo = records.length - valid.length;

    // Write output
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, `${source.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(valid));
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`  wrote ${valid.length} records to ${outPath} (${sizeKb} KB)`);
    if (droppedNoGeo > 0) console.log(`  dropped ${droppedNoGeo} records with missing/invalid coords`);

    return {
        sourceId: source.id,
        short: source.short,
        long: source.long,
        country: source.country,
        format: source.format,
        download: source.download,
        info: source.info,
        license: 'CC-BY-NC-4.0',
        sourceLastUpdated,
        ingestedAt,
        recordCount: valid.length,
        droppedNoGeo,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        lastRunStatus: 'ok',
    };
}

// ---------- Main ----------

function loadManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        return { schemaVersion: '1.0.0', sources: {} };
    }
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function writeManifest(manifest) {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function main() {
    const args = process.argv.slice(2);
    const requestedIds = args.length ? args : DEFAULT_SOURCE_IDS;

    const manifest = loadManifest();

    for (const id of requestedIds) {
        const source = sources.find(s => s.id === id);
        if (!source) {
            console.error(`\nUnknown source id: '${id}' (not in sources/*.js)`);
            continue;
        }
        try {
            const entry = await refreshOneSource(source);
            manifest.sources[id] = entry;
        } catch (e) {
            console.error(`\nFAILED ${id}: ${e.message}`);
            manifest.sources[id] = manifest.sources[id] || { sourceId: id };
            manifest.sources[id].lastRunStatus = 'failed';
            manifest.sources[id].lastRunError = e.message;
            manifest.sources[id].lastRunAt = new Date().toISOString();
        }
    }

    manifest.lastRefreshedAt = new Date().toISOString();
    writeManifest(manifest);
    console.log(`\nManifest: ${MANIFEST_PATH}`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
