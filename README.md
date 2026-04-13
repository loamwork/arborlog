## OpenTrees data

Author: Steve Bennett

Scripts that fetch and process data about council-managed trees from open data sources, ultimately generating vector tiles for display in opentrees.org.

---

## Loamwork fork — live refresh for the Pining app

This is a fork of [stevage/opentrees-data](https://github.com/stevage/opentrees-data) maintained by [loamwork](https://github.com/loamwork) to feed fresh tree data into [Pining](https://github.com/loamwork/pining), a "dating app for trees." The original tile-generation pipeline (`1-gettrees.js` → `5-upload.js`) is preserved for historical reference but is **not** the path Pining uses.

Instead, a new entry point, **`live-refresh.js`**, fetches each configured source over HTTP, normalizes via stevage's existing crosswalks, and writes one canonical JSON file per city plus a manifest with per-source freshness metadata. Pining's loader reads those JSON files into Firestore.

### Quickstart

```bash
node live-refresh.js                        # refresh the default set: nyc, san_francisco, seattle
node live-refresh.js nyc                    # refresh just NYC
node live-refresh.js nyc san_francisco      # refresh several
```

Output lands in `live-data/`:

- `live-data/{sourceId}.json` — normalized tree records (gitignored — regenerable, ~300MB for NYC alone)
- `live-data/manifest.json` — freshness metadata per source (committed)

### What "fresh" means

Each manifest entry carries a `sourceLastUpdated` field pulled from the source's metadata endpoint:

- **Socrata** datasets (NYC, SF) expose `rowsUpdatedAt` as Unix epoch seconds in `https://{portal}/api/views/{id}.json`
- **ArcGIS REST** layers (Seattle) expose `editingInfo.lastEditDate` as Unix epoch milliseconds in the layer's `?f=json` endpoint
- For sources without programmatic freshness (none currently configured), the manifest uses `null` and Pining surfaces "freshness unknown" in the UI

The script writes the actual freshness it found, not a guess. NYC, for example, currently shows `2017-10-04` because the 2015 Street Tree Census got QA fixes through 2017 and there's no newer bulk dataset (the 2025 census is in fieldwork but not yet published).

### Adding a new source

The script reads from stevage's existing `sources/` registry. To add a city:

1. Edit the appropriate `sources/{country}.js` file (e.g. `sources/usa.js`)
2. Add or update an entry following stevage's schema: `{ id, download, format, crosswalk, ... }`
3. Two extension fields used by `live-refresh.js`:
   - `sourceMetadataUrl` — URL returning JSON with freshness info (Socrata or ArcGIS layer endpoint)
   - `format: 'arcgis-rest'` — for paginated ArcGIS REST FeatureServer queries (in addition to stevage's `csv` / `zip` / `geojson` / `gml`)
4. Run `node live-refresh.js {sourceId}` and inspect the output

### Currently active in `live-refresh.js`

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `nyc` | csv | ~683K | 2017-10-04 | NYC TreesCount! 2015 census. 2025 census in fieldwork but not yet published |
| `san_francisco` | csv | ~198K | live (Apr 2026) | SF Street Tree List, actively maintained |
| `seattle` | arcgis-rest | ~209K | live (Apr 2026) | SDOT Trees Active, paginated FeatureServer |

### Requirements

- Node 18+ (built-in `fetch`)
- The shebang on `live-refresh.js` requests `--max-old-space-size=8192` because NYC's CSV alone is ~100MB raw and the parser holds it in memory

### Original opentrees.org pipeline

The original GDAL/PostGIS/tippecanoe pipeline files (`1-gettrees.js` through `5-upload.js`, plus the `vrt/` directory and `cleanTree.js`) are unchanged from upstream and remain functional for anyone who wants to generate vector tiles. They are not used by `live-refresh.js`.