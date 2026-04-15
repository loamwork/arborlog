## OpenTrees data

Author: Steve Bennett

Scripts that fetch and process data about council-managed trees from open data sources, ultimately generating vector tiles for display in opentrees.org.

---

## arborlog — live refresh for the Pining app

This is a fork of [stevage/opentrees-data](https://github.com/stevage/opentrees-data), maintained by [loamwork](https://github.com/loamwork) as **[arborlog](https://github.com/loamwork/arborlog)** (renamed from `opentrees-data` on 2026-04-14). It feeds fresh tree data into [Pining](https://github.com/loamwork/pining), a "dating app for trees." The original tile-generation pipeline (`1-gettrees.js` → `5-upload.js`) is preserved for historical reference but is **not** the path Pining uses.

Instead, a new entry point, **`live-refresh.js`**, fetches each configured source over HTTP, normalizes via stevage's existing crosswalks, and writes one canonical JSON file per source plus a manifest with per-source freshness metadata. Pining's loader reads those JSON files into Firestore.

As of 2026-04-14, arborlog ingests **59 sources** totaling **~8.31 million trees** across the US and UK.

### Quickstart

```bash
node live-refresh.js                        # refresh ALL 59 configured sources
node live-refresh.js nyc                    # refresh just NYC
node live-refresh.js nyc san_francisco      # refresh several
```

Output lands in `live-data/`:

- `live-data/{sourceId}.json` — normalized tree records (gitignored — regenerable, ~300MB for NYC alone)
- `live-data/manifest.json` — freshness metadata per source (committed)

### What "fresh" means

Each manifest entry carries a `sourceLastUpdated` field pulled from the source's metadata endpoint when one exists:

- **Socrata** datasets (NYC, SF, Denver, Austin, Cambridge MA, …) expose `rowsUpdatedAt` as Unix epoch seconds in `https://{portal}/api/views/{id}.json`
- **Socrata SODA** datasets (NYC live forestry) expose `:updated_at` per row and the manifest records the max across the query result
- **ArcGIS REST** FeatureServers (most of the catalog) expose `editingInfo.lastEditDate` as Unix epoch milliseconds in the layer's `?f=json` endpoint
- For sources without a programmatic freshness endpoint (many ArcGIS portals don't publish `editingInfo`, and bulk CSV downloads like London and the UK TPO national dataset), `sourceLastUpdated` is `null` and Pining surfaces "freshness unknown" in the UI

The script writes the actual freshness it found, not a guess. NYC, for example, currently shows `2017-10-04` because the 2015 Street Tree Census got QA fixes through 2017 and there's no newer bulk dataset (the 2025 census is in fieldwork but not yet published; the `nyc_forestry` source covers live forestry work orders over the same footprint).

In addition to freshness, `live-refresh.js` applies two cross-source data-quality filters:

- **Null Island filter** — records at exactly `(0, 0)` are dropped as GPS sentinels rather than ingested as "somewhere in the Gulf of Guinea"
- **Per-source crosswalk normalization** — stevage's `sources/*.js` entries map raw column names to the canonical schema (`scientific`, `common`, `dbh`, `height`, etc.); some 2026 additions extend crosswalks for datasets stevage never covered (e.g. Bellevue's combined `SpeciesDesc` field is split into scientific + cultivar + common)

### Adding a new source

The script reads from stevage's existing `sources/` registry. To add a city:

1. Edit the appropriate `sources/{country}.js` file (e.g. `sources/usa.js`)
2. Add or update an entry following stevage's schema: `{ id, download, format, crosswalk, ... }`
3. Extension fields used by `live-refresh.js`:
   - `sourceMetadataUrl` — URL returning JSON with freshness info (Socrata view, ArcGIS layer `?f=json`, etc.)
   - `format: 'arcgis-rest'` — paginated ArcGIS REST FeatureServer queries
   - `format: 'socrata-soda'` — paginated Socrata SODA API queries (for datasets too large to fetch as a single CSV)
   - In addition to stevage's original `csv` / `zip` / `geojson` / `gml` formats
4. Add the new id to `DEFAULT_SOURCE_IDS` in `live-refresh.js` so it runs in the default refresh
5. Run `node live-refresh.js {sourceId}` and inspect the output

### Currently active sources

**59 sources · ~8.31M trees · USA + UK** (manifest snapshot 2026-04-14)

<details>
<summary>Full source table (click to expand)</summary>

Record counts are after the Null Island filter. Freshness is the `sourceLastUpdated` value the script actually observed; `—` means the source has no programmatic freshness endpoint.

#### United States

##### New York City metro

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `nyc` | csv | 683,788 | 2017-10-04 | TreesCount! 2015 census; 2025 census in fieldwork, not yet published |
| `nyc_forestry` | socrata-soda | 1,107,952 | 2026-04-03 | NYC Forestry Work Orders — live |

##### Northeast (non-NYC)

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `boston` | arcgis-rest | 52,778 | 2026-04-13 | BPRD Trees — PDDL-1.0 public domain |
| `cambridge` | csv | 42,711 | 2026-04-08 | Cambridge, MA (current dataset) |
| `ithaca` | arcgis-rest | 13,258 | 2024-09-26 | Real city inventory |
| `peekskill` | arcgis-rest | 2,373 | 2026-04-09 | Westchester County, NY |
| `bedford_ny` | arcgis-rest | 4,448 | 2019-02-04 | Westchester County, NY |
| `ossining` | arcgis-rest | 664 | 2018-03-07 | Westchester County, NY |
| `dobbs_ferry` | arcgis-rest | 65 | 2015-04-13 | Westchester County, NY |

##### Mid-Atlantic

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `washington-dc` | arcgis-rest | 156,478 | — | DDOT Urban Forestry street trees |
| `washington_dc_all` | arcgis-rest | 1,985,917 | — | DC canopy — all trees (parks, ROW, private) |
| `pittsburgh` | geojson | 45,458 | — | WPRDC city trees |

##### Southeast

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `atlanta` | arcgis-rest | 85,986 | 2023-05-10 | Trees Atlanta plant inventory |
| `atlanta_champion` | arcgis-rest | 437 | 2026-02-23 | Atlanta Champion Trees registry |
| `athens_uga` | arcgis-rest | 3,745 | 2017-06-08 | UGA campus (includes DBH) |

##### Midwest

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `madison` | arcgis-rest | 111,662 | — | City of Madison street trees |
| `arlington_heights` | arcgis-rest | 34,918 | — | Chicago suburb |
| `glenview` | arcgis-rest | 30,381 | — | Chicago suburb |
| `northbrook` | arcgis-rest | 17,951 | — | Chicago suburb |
| `park_ridge` | arcgis-rest | 21,677 | — | Chicago suburb |
| `winnetka` | arcgis-rest | 8,240 | — | Chicago North Shore |
| `deerfield` | arcgis-rest | 7,690 | — | Chicago North Shore |
| `glencoe` | arcgis-rest | 11,232 | — | Chicago North Shore |
| `kenilworth` | arcgis-rest | 2,003 | — | Chicago North Shore |
| `morton_grove` | arcgis-rest | 10,154 | — | Chicago suburb |
| `oak_park` | arcgis-rest | 18,549 | 2026-04-14 | Chicago inner suburb |
| `evanston` | arcgis-rest | 35,526 | — | Chicago inner suburb |

##### Mountain West

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `denver` | csv | 374,128 | 2026-04-01 | Denver tree inventory |
| `boulder` | arcgis-rest | 50,025 | — | City of Boulder parks trees |
| `santa_fe` | arcgis-rest | 5,944 | 2024-01-24 | Santa Fe, NM |

##### Texas

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `austin` | csv | 62,274 | 2020-03-13 | City of Austin tree inventory |
| `austin_downtown` | csv | 7,295 | 2015-07-24 | Austin Downtown 2013 survey |

##### Pacific Northwest

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `seattle` | arcgis-rest | 209,057 | 2026-04-13 | SDOT Trees Active |
| `bellevue` | arcgis-rest | 10,478 | 2026-04-13 | Crosswalk splits SpeciesDesc into scientific + cultivar + common |
| `redmond` | arcgis-rest | 7,985 | 2022-06-16 | Species codes normalized in crosswalk |
| `pdx-street` | arcgis-rest | 252,205 | — | Portland street trees |
| `pdx-park` | arcgis-rest | 25,734 | — | Portland parks trees |
| `pdx_heritage` | arcgis-rest | 363 | — | Portland Heritage Trees registry |
| `beaverton` | arcgis-rest | 30,828 | — | Portland metro |

##### Bay Area

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `san_francisco` | csv | 195,358 | 2026-04-06 | SF Street Tree List (3,072 records dropped for missing geometry) |
| `san_jose` | arcgis-rest | 346,235 | — | City of San Jose |
| `san_jose_heritage` | arcgis-rest | 110 | — | SJ Heritage Trees registry |
| `oakland` | arcgis-rest | 70,420 | 2023-08-08 | City of Oakland |
| `palo_alto` | arcgis-rest | 35,856 | 2026-04-13 | City of Palo Alto |
| `mountain_view` | arcgis-rest | 34,100 | — | City of Mountain View |

##### Southern California

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `la_county` | arcgis-rest | 166,342 | 2026-04-14 | LA County unincorporated + contract cities |
| `pasadena` | arcgis-rest | 51,629 | 2023-03-14 | City of Pasadena |
| `santa_monica` | arcgis-rest | 33,438 | — | City of Santa Monica |
| `san_diego` | arcgis-rest | 258,979 | 2026-04-03 | City of San Diego |
| `santa_barbara` | arcgis-rest | 39,101 | — | City of Santa Barbara |
| `irvine` | arcgis-rest | 63,395 | — | City of Irvine |

#### United Kingdom

| Source | Format | Records | Last source update | Notes |
|---|---|---|---|---|
| `london` | csv | 1,136,049 | — | GLA Public Realm Trees (OGL-UK-3.0) |
| `bristol` | arcgis-rest | 56,022 | — | Bristol City Council |
| `edinburgh` | arcgis-rest | 50,400 | 2024-06-11 | City of Edinburgh Council |
| `york` | arcgis-rest | 19,881 | — | City of York council-owned |
| `york-private` | arcgis-rest | 1,154 | — | York privately-owned trees |
| `york_tpo` | arcgis-rest | 3,521 | — | York Tree Preservation Orders |
| `cambridge_uk` | csv | 20,989 | — | Cambridge UK (distinct from Cambridge MA) |
| `uk_planning_tpo` | csv | 191,081 | — | UK national TPO dataset — fills Newcastle, Oxford, Bucks gaps (OGL-UK-3.0) |

</details>

### Licenses

Most municipal sources ship under CC-BY-NC-4.0 (which is why Pining is non-commercial). Notable exceptions in the current set:

- `boston` — **PDDL-1.0** (public domain)
- `london`, `uk_planning_tpo` — **OGL-UK-3.0** (UK Open Government License)

### Requirements

- Node 18+ (built-in `fetch`)
- The shebang on `live-refresh.js` requests `--max-old-space-size=8192` because several sources (NYC, London, DC-all) hold 100MB+ of raw text in memory during parsing

### Original opentrees.org pipeline

The original GDAL/PostGIS/tippecanoe pipeline files (`1-gettrees.js` through `5-upload.js`, plus the `vrt/` directory and `cleanTree.js`) are unchanged from upstream and remain functional for anyone who wants to generate vector tiles. They are not used by `live-refresh.js`.
