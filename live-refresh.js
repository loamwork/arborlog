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

// Default set of sources that get refreshed when no args are given. These are
// the Pining-priority cities currently configured. Add more by extending this
// list (and ensuring the corresponding entry exists in sources/).
const DEFAULT_SOURCE_IDS = [
    // First batch (committed earlier)
    'nyc',
    'nyc_forestry',
    'san_francisco',
    'seattle',
    // Second batch
    'madison',
    'pdx-street',
    'pdx-park',
    'pdx_heritage',
    'washington-dc',
    'washington_dc_all',
    'denver',
    'boulder',
    'pittsburgh',
    'atlanta',
    'atlanta_champion',
    'austin',
    'austin_downtown',
    'bellevue',
    'boston',
    'beaverton',
    'cambridge',
    'irvine',
    'ithaca',
    'mountain_view',
    'oakland',
    'palo_alto',
    'redmond',
    'san_diego',
    'san_jose',
    'san_jose_heritage',
    'santa_barbara',
    'santa_fe',
    'london',
    'bristol',
    'cambridge_uk',
    'uk_planning_tpo',
    'edinburgh',
    'york',
    'york-private',
    'york_tpo',
    // Pining priority UK cities surveyed but with no usable open data found:
    //   Newcastle upon Tyne — TPO dataset on data.gov.uk has only a stub
    //                         record (no actual file). ezyPortal is UI-only.
    //   Oxford UK           — No public city tree inventory found. Oxford
    //                         results on ArcGIS Hub are Oxford MS / Oxford
    //                         County NJ.
    //   Exeter UK           — Exeter City Council has TPO/conservation maps
    //                         but no downloadable inventory.
    //   St Andrews / Fife   — Tree Preservation Orders dataset exists on
    //                         data.gov.uk but the Fife GeoServer endpoint
    //                         (arcgisweb.fife.gov.uk) was unreachable as of
    //                         2026-04-13. Worth retrying or contacting Fife
    //                         Council directly.
];

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
 * Fetch a single-shot GeoJSON download (no pagination). Returns the array of
 * features. Used for sources whose download URL returns the full FeatureCollection
 * in one response (e.g. CKAN, Opendatasoft).
 */
async function fetchGeoJsonOnce(url) {
    const data = await httpGetJson(url, { timeoutMs: 300_000 });
    if (data.error) throw new Error(`GeoJSON error: ${JSON.stringify(data.error)}`);
    return data.features || [];
}

/**
 * Fetch all rows from a paginated Socrata SODA JSON resource endpoint. Used
 * for very large Socrata datasets where the bulk CSV download exceeds Node's
 * max string length (~512 MB). SODA returns JSON objects with lowercase
 * fieldName keys (NOT the Socrata display names from the metadata).
 *
 * Stop conditions: empty page OR page smaller than the configured limit.
 */
const SODA_PAGE_SIZE = 50000;
const SODA_PAGE_DELAY_MS = 100;
async function fetchSocrataSodaAll(baseUrl) {
    const all = [];
    let offset = 0;
    while (true) {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${sep}$limit=${SODA_PAGE_SIZE}&$offset=${offset}`;
        const data = await httpGetJson(url, { timeoutMs: 180_000 });
        if (!Array.isArray(data)) {
            throw new Error(`SODA expected array, got: ${JSON.stringify(data).slice(0, 200)}`);
        }
        if (data.length === 0) break;
        all.push(...data);
        process.stdout.write(`  fetched ${all.length}\r`);
        if (data.length < SODA_PAGE_SIZE) break;
        offset += data.length;
        if (SODA_PAGE_DELAY_MS) {
            await new Promise(r => setTimeout(r, SODA_PAGE_DELAY_MS));
        }
    }
    process.stdout.write('\n');
    return all;
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
        // Stop conditions:
        //   1. We got 0 features (we're past the end of the dataset).
        //   2. ArcGIS explicitly says we got everything (exceededTransferLimit
        //      is false — only present in f=json responses, not f=geojson, but
        //      we honor it when available).
        // We do NOT use features.length < ARCGIS_PAGE_SIZE because some servers
        // have a per-layer maxRecordCount smaller than our requested pageSize
        // (Madison = 1000, Portland's MapServer = 200), which would cause us
        // to break on the first page even though more data exists.
        if (features.length === 0) break;
        allFeatures.push(...features);
        process.stdout.write(`  fetched ${allFeatures.length}\r`);
        if (data.exceededTransferLimit === false) break;
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
        ['LATITUDE', 'LONGTITUDE'], // Austin CSV (uppercase + typo)
        ['latitude', 'longtitude'], // lowercase variant of Austin's typo
        ['lat', 'lon'],
        ['lat', 'lng'],
        ['Y', 'X'],
        ['y', 'x'],
        ['y_lat', 'x_long'],         // Denver's column names
        ['y_latitude', 'x_longitude'], // Boston BPRD's column names
    ];
    // WKT first — checked before generic Y/X columns because in many Socrata
    // datasets Y/X are state plane projection coordinates (feet/meters in a
    // local CRS, not lat/lon). The WKT in `the_geom` / `Geometry` / `Location`
    // / `shape_wkt` is always WGS84.
    const wktSources = ['the_geom', 'geom', 'GEOMETRY', 'geometry', 'Geometry', 'Location', 'location', 'shape_wkt', 'point'];
    for (const key of wktSources) {
        const v = row[key];
        if (typeof v !== 'string') continue;
        const m = v.match(/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
        if (m) {
            const lon = Number(m[1]);
            const lat = Number(m[2]);
            if (isValidLatLon(lat, lon)) return { lat, lon };
        }
    }
    for (const [latKey, lonKey] of candidates) {
        if (row[latKey] != null && row[lonKey] != null) {
            const lat = Number(row[latKey]);
            const lon = Number(row[lonKey]);
            if (isValidLatLon(lat, lon)) return { lat, lon };
        }
    }
    return { lat: null, lon: null };
}

function isValidLatLon(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
        lat !== 0 && lon !== 0 &&
        lat >= -90 && lat <= 90 &&
        lon >= -180 && lon <= 180;
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
        // Default license inherited from stevage's repo (CC BY-NC 4.0).
        // Individual sources can override via source.license — e.g. London 2025
        // is OGL-UK-3.0 (open commercial use), which is meaningfully different
        // from the rest of the dataset.
        license: source.license || 'CC-BY-NC-4.0',
        attributionUrl: source.info || null,
        sourceLastUpdated,
        ingestedAt,
        // Crosswalk fields (scientific, common, dbh, height, planted, health, etc.)
        ...crossed,
    };
}

/**
 * Stream-write an array of records as a JSON array, one record per write call.
 * Avoids building one giant string in memory (which V8 caps at ~512 MB).
 * Output is standard JSON: `[record1,record2,...,recordN]`.
 */
function writeJsonArrayStreamed(outPath, records) {
    return new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });
        ws.on('error', reject);
        ws.on('finish', resolve);
        ws.write('[');
        for (let i = 0; i < records.length; i++) {
            if (i > 0) ws.write(',');
            ws.write(JSON.stringify(records[i]));
        }
        ws.write(']');
        ws.end();
    });
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
        let droppedNoId = 0;
        for (const f of features) {
            const props = f.properties || {};
            // GeoJSON: geometry.coordinates = [lon, lat]
            let latLon = { lat: null, lon: null };
            if (f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
                latLon = { lon: Number(f.geometry.coordinates[0]), lat: Number(f.geometry.coordinates[1]) };
            }
            const rec = makeCanonicalRecord(props, source, latLon, sourceLastUpdated, ingestedAt);
            if (rec) records.push(rec);
            else droppedNoId++;
        }
        if (droppedNoId > 0) console.log(`  dropped ${droppedNoId} records with no crosswalk ref/id`);
    } else if (source.format === 'geojson') {
        const features = await fetchGeoJsonOnce(source.download);
        console.log(`  fetched ${features.length} GeoJSON features`);
        for (const f of features) {
            const props = f.properties || {};
            let latLon = { lat: null, lon: null };
            if (f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
                latLon = { lon: Number(f.geometry.coordinates[0]), lat: Number(f.geometry.coordinates[1]) };
            }
            const rec = makeCanonicalRecord(props, source, latLon, sourceLastUpdated, ingestedAt);
            if (rec) records.push(rec);
        }
    } else if (source.format === 'socrata-soda') {
        const rows = await fetchSocrataSodaAll(source.download);
        console.log(`  fetched ${rows.length} SODA rows`);
        for (const row of rows) {
            // SODA may return a Socrata `location` field as an object; convert
            // to a WKT-friendly string so extractCsvLatLon picks it up via the
            // generic 'location' WKT candidate.
            if (row.location && typeof row.location === 'object' && Array.isArray(row.location.coordinates)) {
                const [lon, lat] = row.location.coordinates;
                row.location = `POINT (${lon} ${lat})`;
            }
            const latLon = extractCsvLatLon(row);
            const rec = makeCanonicalRecord(row, source, latLon, sourceLastUpdated, ingestedAt);
            if (rec) records.push(rec);
        }
    } else {
        throw new Error(`Unsupported format '${source.format}' for source ${source.id}`);
    }

    // Drop records without valid coords. The "Null Island" check catches GPS
    // sentinels that slipped through an exact `!== 0` test — e.g. one San
    // Diego record had lat≈8e-13, lon≈3e-12. We require BOTH lat and lon to
    // be near zero to drop, so legitimate Greenwich-meridian trees (lat≈51,
    // lon≈0) and equatorial trees (lat≈0, lon≠0) stay.
    const NULL_ISLAND_RADIUS = 0.01; // degrees — ~1.1 km at equator
    const valid = records.filter(r =>
        Number.isFinite(r.lat) && Number.isFinite(r.lon) &&
        !(Math.abs(r.lat) < NULL_ISLAND_RADIUS && Math.abs(r.lon) < NULL_ISLAND_RADIUS)
    );
    const droppedNoGeo = records.length - valid.length;

    // Write output as chunked JSON array — one record at a time to avoid
    // building a single giant string buffer. V8 caps strings at ~512 MB which
    // breaks JSON.stringify(huge_array) on datasets like NYC Forestry's 1.1M
    // records. The on-disk file is still standard JSON (parses with any
    // JSON.parse).
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, `${source.id}.json`);
    await writeJsonArrayStreamed(outPath, valid);
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
        license: source.license || 'CC-BY-NC-4.0',
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
