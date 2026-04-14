const FEET = 3.280084;
const INCHES = 2.54;

function numeric(x) {
    return Number.isFinite(x) ? x : null;
}

function inches(field) {
    return tree => numeric(Number(tree[field]) * 2.54);
}

function feet(field) {
    return tree => numeric(Number(tree[field]) / 3.280084);
}

module.exports = [
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com zip URL is dead.
    // Migrated to Madison's MapServer "Street Trees" layer at maps.cityofmadison.com.
    // New schema uses SPP_BOT (scientific) / SPP_COM (common) instead of SPECIES.
    id: 'madison',
    download: 'https://maps.cityofmadison.com/arcgis/rest/services/Public/OPEN_DATA/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://www.cityofmadison.com/engineering/projects/street-trees',
    sourceMetadataUrl: 'https://maps.cityofmadison.com/arcgis/rest/services/Public/OPEN_DATA/MapServer/0?f=json',
    format: 'arcgis-rest',
    short: 'Madison',
    country: 'USA',
    crosswalk: {
        ref: 'site_id',
        scientific: 'SPP_BOT',
        common: 'SPP_COM',
        dbh: x => x.DIAMETER ? Number(x.DIAMETER) * INCHES : null,
        size: 'GSSIZE',
        status: 'STATUS',
    }
},
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com URL is dead. Migrated
    // to portlandmaps.com MapServer layer 1415 ("Street Tree Inventory - Active
    // Records"). This is the new comprehensive 2022-2024 inventory (~252K
    // records). The schema is much smaller than the old one — the new dataset
    // collapses scientific + common into a single "SPECIES" field of the form
    // "Genus species - Common name" which we split in the crosswalk.
    id: 'pdx-street',
    download: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/1415/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://gis-pdx.opendata.arcgis.com/datasets/PDX::street-tree-inventory-active-records',
    sourceMetadataUrl: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/1415?f=json',
    format: 'arcgis-rest',
    short: 'Portland',
    long: 'Portland, Oregon',
    country: 'USA',
    crosswalk: {
        ref: 'OBJECTID',
        // Source SPECIES is "Genus species - Common name"; split.
        scientific: x => x.SPECIES ? String(x.SPECIES).split(' - ')[0] : null,
        common:     x => x.SPECIES ? String(x.SPECIES).split(' - ')[1] || null : null,
        dbh: x => x.DIAMETER ? Math.round(x.DIAMETER * INCHES * 10) / 10 : null,
        health: 'Condition',
        size: 'MATURE_SIZE',
        type: 'FUNCTIONAL_TYPE',
        location: 'Site_Type',
        address: 'Address',
    },
},
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com URL is dead. Migrated
    // to portlandmaps.com MapServer layer 220 ("Parks Tree Inventory" — the
    // layer ID was preserved across the migration). The new schema has the full
    // field names (Genus_species, Common_name, Species_factoid) instead of
    // stevage's 10-char shapefile truncations. Also two crown widths (NS+EW)
    // averaged into one. ~25K records.
    id: 'pdx-park',
    download: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/220/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://gis-pdx.opendata.arcgis.com/maps/parks-tree-inventory',
    sourceMetadataUrl: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/220?f=json',
    format: 'arcgis-rest',
    short: 'Portland, Oregon',
    long: 'Portland, Oregon',
    country: 'USA',
    crosswalk: {
        ref: 'OBJECTID',
        dbh: x => x.DBH ? Math.round(x.DBH * INCHES * 10) / 10 : null,
        height: x => x.TreeHeight ? Math.round(x.TreeHeight / FEET * 10) / 10 : null,
        crown: x => {
            const ns = Number(x.CrownWidthNS) || 0;
            const ew = Number(x.CrownWidthEW) || 0;
            const avg = (ns + ew) / 2;
            return avg > 0 ? Math.round(avg / FEET * 10) / 10 : null;
        },
        health: 'Condition',
        family: 'Family',
        genus: 'Genus',
        scientific: 'Genus_species',
        common: 'Common_name',
        description: 'Species_factoid',
        size: 'Size',
        native: 'Native',
        edible: 'Edible',
    },
    primary: 'pdx-street',
},
{
    // Added 2026-04-13: Portland's Heritage Trees registry — 463 trees
    // formally designated by the City Forester under Portland's Heritage Tree
    // ordinance. These are city-recognized hero trees, perfect for Pining's
    // "designated significant" feed alongside the city-wide street/park
    // inventories. Each entry has full measurements (height, spread, diameter,
    // circumference), the year of heritage designation, ownership, address,
    // and a Delist_Date/Delist_Reason if a tree has been removed from the
    // registry. We filter to currently-listed trees only.
    id: 'pdx_heritage',
    download: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/26/query?where=Delist_Date+IS+NULL&outFields=*&outSR=4326&f=geojson',
    info: 'https://www.portland.gov/trees/get-involved/heritage-trees',
    sourceMetadataUrl: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/26?f=json',
    format: 'arcgis-rest',
    short: 'Portland Heritage Trees',
    long: 'Portland, Oregon — Heritage Trees Registry',
    country: 'USA',
    crosswalk: {
        ref: 'TREEID',
        scientific: 'SCIENTIFIC',
        common: 'COMMON',
        // Heritage trees use real measurements: HEIGHT and SPREAD in feet,
        // DIAMETER in inches, CIRCUMF (circumference) as a separate double.
        height: x => x.HEIGHT ? Number(x.HEIGHT) / FEET : null,
        spread: x => x.SPREAD ? Number(x.SPREAD) / FEET : null,
        dbh: x => x.DIAMETER ? Number(x.DIAMETER) * INCHES : null,
        // CIRCUMF is in FEET (not inches like DIAMETER). Verified against several
        // samples: a tree with 25" diameter has CIRCUMF=7.6 (= ~6.5 ft expected).
        // Convert feet → cm = × 30.48.
        circumference: x => x.CIRCUMF ? Math.round(Number(x.CIRCUMF) * 30.48 * 10) / 10 : null,
        notes: 'NOTES',
        owner: 'Ownership',
        address: 'SITE_ADDRESS',
        neighborhood: 'Neighborhood',
        stateId: 'STATE_ID',
        yearDesignated: 'YEAR_Designated',
        designatedDate: x => x.DATE_DESIG ? new Date(x.DATE_DESIG).toISOString() : null,
        // These fields drive Pining's hero tag — every record is a heritage
        // tree by construction (we filtered Delist_Date IS NULL above).
        heritage: () => true,
        // Date stamps for measurements (from the most recent verification)
        dateHeight: x => x.Date_Height ? new Date(x.Date_Height).toISOString() : null,
        dateSpread: x => x.Date_Spread ? new Date(x.Date_Spread).toISOString() : null,
        dateCircumference: x => x.Date_Circumference ? new Date(x.Date_Circumference).toISOString() : null,
    },
    primary: 'pdx-street',
},
{
    // Verified 2026-04-13: stevage's URL still works. NYC TreesCount! 2015 census
    // is still the canonical historical bulk dataset (the 2025 census is in
    // fieldwork but not yet bulk-published). rowsUpdatedAt = 2017-10-04 (post-
    // census QA fixes). The 45-column schema is much richer than what stevage's
    // original 5-field crosswalk extracted; we now pull location context, status,
    // health observations, stewardship info, and per-record creation timestamps.
    // For LIVE NYC tree data, see the `nyc_forestry` source below — that's the
    // operational ForMS 2.0 inventory and is updated continuously.
    id: 'nyc',
    download: 'https://data.cityofnewyork.us/api/views/uvpi-gqnh/rows.csv?accessType=DOWNLOAD',
    info: 'https://data.cityofnewyork.us/Environment/2015-Street-Tree-Census-Tree-Data/uvpi-gqnh',
    sourceMetadataUrl: 'https://data.cityofnewyork.us/api/views/uvpi-gqnh.json',
    format: 'csv',
    filename: 'nyc.vrt',
    short: 'New York',
    long: 'New York City',
    country: 'USA',
    crosswalk: {
        // Note: Socrata's bulk CSV download is INCONSISTENT about column names
        // — some columns use the underscore_form fieldName (tree_id, spc_latin),
        // some use the display name (`borough` not `boroname`, `postcode` not
        // `zipcode`). A few have spaces (`council district`, `census tract`,
        // `community board`). Always verify against the actual CSV header.
        ref: 'tree_id',
        dbh: x => x.tree_dbh ? Number(x.tree_dbh) * INCHES : null, // source is in inches
        stumpDiameter: x => x.stump_diam ? Number(x.stump_diam) * INCHES : null,
        scientific: 'spc_latin',
        common: 'spc_common',
        health: 'health',
        status: 'status', // Alive / Dead / Stump
        steward: 'steward',
        guards: 'guards',
        sidewalk: 'sidewalk',
        problems: 'problems',
        address: 'address',
        postcode: 'postcode', // bulk-CSV uses the display name 'postcode' (not 'zipcode')
        zipCity: 'zip_city',
        borough: 'borough', // bulk-CSV uses display name 'borough' (not 'boroname')
        boroughCode: 'borocode',
        nta: 'nta',
        ntaName: 'nta_name',
        councilDistrict: x => x['council district'], // CSV column has space
        censusTract: x => x['census tract'],         // CSV column has space
        communityBoard: x => x['community board'],   // CSV column has space
        cncldist: 'cncldist', // integer council district number (different format)
        created: x => x.created_at ? new Date(x.created_at).toISOString() : null,
        curbLoc: 'curb_loc',
        userType: 'user_type',
        // Health observation flags
        rootStone: 'root_stone',
        rootGrate: 'root_grate',
        trunkWire: 'trunk_wire',
        trunkLight: 'trnk_light',
        branchLight: 'brch_light',
        branchShoe: 'brch_shoe',
    },
},
{
    // Added 2026-04-13: NYC Parks & Recreation Forestry Tree Points — the LIVE
    // operational tree management database (ForMS 2.0), updated continuously
    // (last edit 2026-04-03 as of this addition). 1,107,952 records — about
    // 60% more than the 2015 census, AND much fresher. Includes both Active
    // and Retired (removed) trees, with per-record condition, risk rating,
    // planting date, and update timestamp. Pining can filter by tpstructure
    // to show only living trees.
    //
    // Schema notes:
    //   genusspecies field is "Genus species - Common name" (split in crosswalk)
    //   geometry / location both contain WKT POINT — extractCsvLatLon picks up
    //   the WKT first so we get true WGS84 coords.
    id: 'nyc_forestry',
    // 1.1M rows of bulk CSV exceeds Node's max string length (~512 MB) so we
    // use the paginated SODA JSON endpoint instead. SODA returns lowercase
    // field names (the JSON API form), not the bulk-CSV Socrata display names.
    download: 'https://data.cityofnewyork.us/resource/hn5i-inap.json',
    info: 'https://data.cityofnewyork.us/Environment/Forestry-Tree-Points/hn5i-inap',
    sourceMetadataUrl: 'https://data.cityofnewyork.us/api/views/hn5i-inap.json',
    format: 'socrata-soda',
    short: 'New York (live forestry)',
    long: 'NYC Parks ForMS 2.0 — Forestry Tree Points',
    country: 'USA',
    crosswalk: {
        ref: 'objectid',
        // genusspecies = "Acer nigrum - black maple" (sometimes genus only:
        // "Acer - maple"). Split on " - "; the right-hand side is the common
        // name, possibly multi-token.
        scientific: x => x.genusspecies ? String(x.genusspecies).split(' - ')[0] : null,
        common:     x => x.genusspecies ? String(x.genusspecies).split(' - ').slice(1).join(' - ') || null : null,
        dbh: x => x.dbh ? Number(x.dbh) * INCHES : null, // source is in inches
        stumpDiameter: x => x.stumpdiameter ? Number(x.stumpdiameter) * INCHES : null,
        health: 'tpcondition', // Excellent/Good/Fair/Poor/Dead
        structure: 'tpstructure', // Active / Retired / Full / etc.
        riskRating: 'riskrating',
        riskRatingDate: x => x.riskratingdate ? new Date(x.riskratingdate).toISOString() : null,
        planted: x => x.planteddate ? new Date(x.planteddate).toISOString() : null,
        created: x => x.createddate ? new Date(x.createddate).toISOString() : null,
        updated: x => x.updateddate ? new Date(x.updateddate).toISOString() : null,
    },
    primary: 'nyc',
},
// TODO there is a lat lon buiried in "Property Address" field
{
    id: 'providence',
    download: 'https://data.providenceri.gov/api/views/uv9w-h8i4/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    short: 'Providence',
    long: 'Providence, Rhode Island',
    coordsFunc: x => x['Property Address'].split('\n').reverse()[0].split(/[(), ]/).filter(Number).map(Number).reverse(),
    crosswalk: {
        scientific: 'Species',
        dbh: x => Number(x['Diameter in Inches']) * INCHES
    },
    centre: [-71.43, 41.83],
},
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com URL is dead. Migrated
    // to maps2.dcgis.dc.gov MapServer "UFA Street Trees" layer 23. Common name
    // field is CMMN_NM (not COMMON.NAME like the old shapefile name). Schema
    // also exposes DBH directly + LAST_EDITED_DATE for freshness.
    id: 'washington-dc',
    download: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/23/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://opendata.dc.gov/datasets/urban-forestry-street-trees',
    sourceMetadataUrl: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/23?f=json',
    format: 'arcgis-rest',
    short: 'Washington DC',
    long: 'Washington DC',
    country: 'USA',
    centre: [-77, 38.92],
    crosswalk: {
        ref: 'FACILITYID',
        dbh: x => x.DBH ? Number(x.DBH) * INCHES : null,
        common: 'CMMN_NM',
        scientific: 'SCI_NM',
        genus: 'GENUS_NAME',
        family: 'FAM_NAME',
        planted: x => x.DATE_PLANT ? new Date(x.DATE_PLANT).toISOString() : null,
        updated: x => x.LAST_EDITED_DATE ? new Date(x.LAST_EDITED_DATE).toISOString() : null,
        condDate: x => x.CONDITIODT ? new Date(x.CONDITIODT).toISOString() : null,
        retired: x => x.RETIREDDT ? new Date(x.RETIREDDT).toISOString() : null,
        note: 'TREE_NOTES',
        health: 'CONDITION',
        owner: 'OWNERSHIP',
        ward: 'WARD',
        vicinity: 'VICINITY',
        // Tree box dimensions
        tboxLength: 'TBOX_L',
        tboxWidth: 'TBOX_W',
        tboxStatus: 'TBOX_STAT',
        // Site context
        wires: 'WIRES',
        curb: 'CURB',
        sidewalk: 'SIDEWALK',
        disease: 'DISEASE',
        pests: 'PESTS',
        // Crown / canopy measurements
        maxCrownHeight: 'MAX_CROWN_HEIGHT',
        minCrownBase: 'MIN_CROWN_BASE',
        crownArea: 'CROWN_AREA',
        // Other
        cicadaSurvey: 'CICADA_SURVEY',
        elevation: 'ELEVATION',
        gisId: 'GIS_ID',
    },
},
{
    // Added 2026-04-13: DC's "DC Trees" layer (layer 11) — the COMPREHENSIVE
    // DC tree dataset spanning street trees, park trees, and urban forest
    // patches. ~1,985,917 records (9x larger than the UFA Street Trees layer 23
    // we use as `washington-dc`). Schema is breadth-focused (23 fields) vs
    // layer 23's deep 48-field per-tree records — both are valuable. This one
    // gets us total geographic coverage; layer 23 gets us per-tree detail for
    // street trees specifically.
    id: 'washington_dc_all',
    download: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/11/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://opendata.dc.gov/datasets/dc-trees',
    sourceMetadataUrl: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/11?f=json',
    format: 'arcgis-rest',
    short: 'Washington DC (all)',
    long: 'Washington DC — All Trees (street + parks + forest patches)',
    country: 'USA',
    centre: [-77, 38.92],
    crosswalk: {
        ref: 'TREE_ID',
        scientific: 'SCIENTIFIC_NAME',
        common: 'COMMON_NAME',
        genus: 'GENUS_NAME',
        dbh: x => x.DBH ? Number(x.DBH) * INCHES : null,
        height: x => x.HEIGHT ? Number(x.HEIGHT) / FEET : null,
        status: 'STATUS',
        owner: 'OWNERSHIP',
        ward: 'WARD',
        arborist: 'ARBORIST',
        landCover: 'NLCD_LAND_COVER',
        forestPatchId: 'FOREST_PATCH_ID',
        forestPatchType: 'FOREST_PATCH_TYPE',
        tract2010: 'TRACT_2010',
        ancId: 'ANC_ID', // Advisory Neighborhood Commission ID
        smdId: 'SMD_ID', // Single Member District ID
    },
    primary: 'washington-dc',
},

{
    id: 'buffalo-ny',
    download: 'https://data.buffalony.gov/api/views/n4ni-uuec/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    short: 'Buffalo',
    long: 'City of Buffalo, NY',
    country: 'USA',
    crosswalk: {
        scientific: 'Botanical Name',
        common: 'Common Name',
        dbh: x => Number(x.DBH) * 2.54, // assuming
        id: 'Site ID',   
    },
},
// {
    // these seem to be included in london already, in better quality.
//     id: 'camden-uk',
//     download: 'https://opendata.camden.gov.uk/api/views/csqp-kdss/rows.csv?accessType=DOWNLOAD',
//     format: 'csv',
//     short: 'Camden',
//     long: 'Camden Council, UK'
        // crosswalk: {
        //     scientific: 'Scientific Name',
        //     common: 'Common Name',
        //     height: 'Height in Metres',
        //     spread: 'Spread in Metres',
        //     dbh: 'Diameter In Centimetres At Breast Height',
        //     maturity: 'Maturity',
        //     health: 'Physiological Condition',
        //     id: 'Identifier'

        // },

// },
{
    // Updated 2026-04-13: stevage's 337t-q2b4 dataset returned 404. The correct
    // active dataset is tkzw-k3nq ("Street Tree List", ~198K records, live updates).
    id: 'san_francisco',
    download: 'https://data.sfgov.org/api/views/tkzw-k3nq/rows.csv?accessType=DOWNLOAD',
    info: 'https://data.sfgov.org/City-Infrastructure/Street-Tree-List/tkzw-k3nq',
    format:'csv',
    short: 'San Francisco',
    long: 'City of San Francisco',
    country: 'USA',
    sourceMetadataUrl: 'https://data.sfgov.org/api/views/tkzw-k3nq.json',
    crosswalk: {
        id: 'TreeID',
        // qSpecies = "Genus species :: Common name" (e.g. "Fraxinus uhdei :: Shamel Ash: Evergreen Ash")
        scientific: x => x.qSpecies ? String(x.qSpecies).split(' :: ')[0] : null,
        common:     x => x.qSpecies ? String(x.qSpecies).split(' :: ')[1] || null : null,
        description: 'qSiteInfo',
        dbh: x => x.DBH ? Number(x.DBH) * INCHES : null, // SF DBH is in inches
        planted: x => x.PlantDate ? new Date(x.PlantDate).toISOString() : null,
        legalStatus: 'qLegalStatus', // DPW Maintained / Private / Section 143 / etc.
        caretaker: 'qCaretaker', // Private / DPW / etc.
        careAssistant: 'qCareAssistant',
        plantType: 'PlantType',
        plotSize: 'PlotSize',
        permitNotes: 'PermitNotes',
        address: 'qAddress',
        siteOrder: 'SiteOrder',
        // Computed-region columns (from Socrata spatial joins, exposed in CSV
        // with human-readable names that include spaces).
        analysisNeighborhood: x => x['Analysis Neighborhoods'],
        supervisorDistrict: x => x['Supervisor Districts'],
        zipCode: x => x['Zip Codes'],
        firePreventionDistrict: x => x['Fire Prevention Districts'],
    },
    centre: [-122.435, 37.77],

}, 
{
    id: 'philadelphia',
    download: 'http://data.phl.opendata.arcgis.com/datasets/957f032f9c874327a1ad800abd887d17_0.csv',
    format: 'csv',
    short: 'Philadelphia',
    long: 'City of Philadelphia',
    country: 'USA',
    crosswalk: {
           // Species, Status, DBH fields but they are all blank. bleh.
    }
}, 
{
    // Verified 2026-04-13: stevage's URL still works but the field names in
    // their crosswalk were all wrong-cased (UPPERCASE) — the actual CSV columns
    // are lowercase: site_id / species_botanic / species_common / diameter /
    // y_lat / x_long. Diameter is a range string like "0 to 6" or "13 to 18",
    // not numeric — we extract the midpoint.
    id: 'denver',
    download: 'https://data.colorado.gov/api/views/wz8h-dap6/rows.csv?accessType=DOWNLOAD',
    info: 'https://data.colorado.gov/Communities-and-Education/Denver-Tree-Inventory/wz8h-dap6',
    sourceMetadataUrl: 'https://data.colorado.gov/api/views/wz8h-dap6.json',
    format: 'csv',
    short: 'Denver',
    country: 'USA',
    crosswalk: {
        ref: 'site_id',
        scientific: 'species_botanic',
        common: 'species_common',
        // Diameter is a range string like "0 to 6", "13 to 18", "25 to 30" (in inches).
        // Extract the midpoint and convert to cm.
        dbh: x => {
            if (!x.diameter) return null;
            const m = String(x.diameter).match(/^(\d+)\s*to\s*(\d+)$/i);
            if (!m) return null;
            const midInches = (Number(m[1]) + Number(m[2])) / 2;
            return Math.round(midInches * INCHES * 10) / 10;
        },
        health: 'condition',
        location: 'location_name',
        address: x => x.address && x.street ? `${x.address} ${x.street}` : null,
        neighbor: 'neighbor',
        notable: 'notable',
    },
    centre: [-104.9454,39.7273],

}, 
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com URL is dead. Migrated
    // to gis.bouldercolorado.gov MapServer (Boulder runs their own ArcGIS
    // Server). ~50K records. Stevage's original `dbh: x => 'DBHINT' * 2.54` was
    // a long-standing bug (string * number = NaN) — now fixed to use x.DBHINT.
    id: 'boulder',
    country: 'USA',
    download: 'https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/TreesOpenData/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://open-data.bouldercolorado.gov/datasets/trees',
    sourceMetadataUrl: 'https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/TreesOpenData/MapServer/0?f=json',
    format: 'arcgis-rest',
    short: 'Boulder',
    long: 'City of Boulder, Colorado',
    crosswalk: {
        ref: 'FACILITYID',
        scientific: 'LATINNAME',
        common: 'COMMONNAME',
        genus: 'GENUS',
        variety: 'CULTIVAR',
        dbh: x => x.DBHINT ? Number(x.DBHINT) * INCHES : null, // fixed bug
        location: 'LOCTYPE',
        owner: 'OWNEDBY',
        updated: x => x.LAST_EDITED_DATE ? new Date(x.LAST_EDITED_DATE).toISOString() : null,
    },
},
{
    id: 'cambridge',
    country: 'USA',
    download: 'https://data.cambridgema.gov/api/views/q83f-7quz/rows.csv?accessType=DOWNLOAD',
    info: 'https://data.cambridgema.gov/Public-Works/Street-Trees/ni4i-5bnn',
    format: 'csv',
    crosswalk: {
        common: 'CommonName',
        scientific: 'Scientific',
        ref: 'TreeID',
        dbh: 'diameter',
        updated: 'last_edite',
        planted: 'PlantDate',
        health: x => String(x.TreeCondit).replace(/ \(.*/, '') // strings like "Good (EW 2013)"
    },
    short: 'Cambridge',


},
{
    id: 'berkeley',
    country: 'USA',
    download: 'https://data.cityofberkeley.info/api/views/x39z-ushg/rows.csv?accessType=DOWNLOAD',
    info:'https://data.cityofberkeley.info/Natural-Resources/City-Trees/9t35-jmin',
    format:'csv',
    crosswalk: {
        scientific: 'SPECIES',
        common: 'Common_Nam',
        height: x => Number(x.HEIGHT_FT) / FEET,
        dbh: x => Number(x.DBH_IN) * INCHES,
        health: 'CONDITION', // numeric...
        note: 'note',

    },
    short: 'Berkeley',

},
{
    // Verified 2026-04-13: stevage's URL still works. Pittsburgh's tree inventory
    // lives on data.wprdc.org (Western Pennsylvania Regional Data Center, CKAN
    // backed). No programmatic freshness lookup configured — CKAN dataset
    // metadata format is different from Socrata/ArcGIS; sourceLastUpdated stays
    // null until we add CKAN support.
    id: 'pittsburgh',
    country: 'USA',
    download: 'https://data.wprdc.org/dataset/9ce31f01-1dfa-4a14-9969-a5c5507a4b40/resource/d876927a-d3da-44d1-82e1-24310cdb7baf/download/trees_img.geojson',
    info: 'https://data.wprdc.org/dataset/city-trees',
    format: 'geojson',
    centre: [-80,40.436],
    short: 'Pittsburgh',
    crosswalk: {
        ref: 'id',
        common: 'common_name',
        scientific: 'scientific_name',
        // Stevage's old `dbh: 'dbh'` was silently broken — the actual field
        // name in this GeoJSON is `diameter_base_height`. Verified against
        // sample features 2026-04-13.
        dbh: x => x.diameter_base_height ? Number(x.diameter_base_height) * INCHES : null,
        height: x => x.height ? Number(x.height) / FEET : null,
        width: 'width',
        stems: 'stems',
        health: 'condition',
        landUse: 'land_use',
        overheadUtilities: 'overhead_utilities',
        growthSpaceWidth: 'growth_space_width',
        growthSpaceLength: 'growth_space_length',
        growthSpaceType: 'growth_space_type',
        address: x => x.address_number && x.street ? `${x.address_number} ${x.street}` : null,
        // i-Tree benefit calculations — most are sparse but some trees have
        // them. Pining can use these for "wow" cards: "this tree saves $X
        // in stormwater" / "stores Y lbs of CO2".
        co2StoredLbs: 'co2_benefits_totalco2_lbs',
        co2SequesteredLbs: 'co2_benefits_sequestered_lbs',
        co2BenefitsDollar: 'co2_benefits_dollar_value',
        airQualityBenefitsDollar: 'air_quality_benfits_total_dollar_value',
        airQualityBenefitsLbs: 'air_quality_benfits_total_lbs',
        stormwaterBenefitsDollar: 'stormwater_benefits_dollar_value',
        stormwaterRunoffElim: 'stormwater_benefits_runoff_elim',
        energyElectricityDollar: 'energy_benefits_electricity_dollar_value',
        energyGasDollar: 'energy_benefits_gas_dollar_value',
        propertyValueDollar: 'property_value_benefits_dollarvalue',
        leafSurfaceArea: 'property_value_benefits_leaf_surface_area',
        overallBenefitsDollar: 'overall_benefits_dollar_value',
    }

},
{
    id: 'colombus',
    country: 'USA',
    download: 'https://opendata.arcgis.com/datasets/674e4a358e8042f69a734f229a93823c_1.zip?outSR=%7B%22wkt%22%3A%22PROJCS%5B%5C%22Ohio%203402%2C%20Southern%20Zone%20(1983%2C%20US%20Survey%20feet)%5C%22%2CGEOGCS%5B%5C%22NAD%2083%20(Continental%20US)%5C%22%2CDATUM%5B%5C%22NAD%2083%20(Continental%20US)%5C%22%2CSPHEROID%5B%5C%22GRS%2080%5C%22%2C6378137.0%2C298.257222101%5D%5D%2CPRIMEM%5B%5C%22Greenwich%5C%22%2C0.0%5D%2CUNIT%5B%5C%22Degree%5C%22%2C0.0174532925199433%5D%5D%2CPROJECTION%5B%5C%22Lambert_Conformal_Conic%5C%22%5D%2CPARAMETER%5B%5C%22False_Easting%5C%22%2C1968500.0%5D%2CPARAMETER%5B%5C%22Central_Meridian%5C%22%2C-82.5%5D%2CPARAMETER%5B%5C%22Standard_Parallel_1%5C%22%2C38.7333333333%5D%2CPARAMETER%5B%5C%22Standard_Parallel_2%5C%22%2C40.0333333333%5D%2CPARAMETER%5B%5C%22Latitude_Of_Origin%5C%22%2C38.0%5D%2CUNIT%5B%5C%22U.S.%20Foot%5C%22%2C0.3048006096012%5D%5D%22%7D',
    info: 'http://opendata.columbus.gov/datasets/public-owned-trees',
    format: 'zip',
    filename: 'Public_Owned_Trees.shp',
    short: 'Colombus',
    crosswalk: {
        ref: 'OBJECTID',
        dbh: x => Number('DIAM_BREAS') * INCHES,
        updated: 'INSPECTION',
        health: 'CONDITION1',
        maturity: 'LIFE_STAGE',
        common: 'SP_CODE',
        description: 'STR_NAME',
    }

},

{
    // Updated 2026-04-13: stevage's old 7aq7-a66u dataset returned 404. Switched
    // to wrik-xasw ("Tree Inventory"), the current Austin canonical inventory.
    // Compiled from multiple internal Austin sources (Tree Division, AISD,
    // Parks/Rec, downtown 2013 inventory). Only contains species + diameter
    // (no scientific name, no condition, no height). Source data dates from
    // March 2020 — Austin hasn't published a refresh since.
    // Note the source's typo: "longtitude" (with an extra T).
    id:'austin',
    country: 'USA',
    short: 'Austin',
    long: '',
    download: 'https://data.austintexas.gov/api/views/wrik-xasw/rows.csv?accessType=DOWNLOAD',
    info:'https://data.austintexas.gov/Environment/Tree-Inventory/wrik-xasw',
    sourceMetadataUrl: 'https://data.austintexas.gov/api/views/wrik-xasw.json',
    format: 'csv',
    crosswalk: {
        // Austin's CSV has no per-tree primary key column — it's a compilation
        // of tree points with just SPECIES, DIAMETER, LATITUDE, LONGTITUDE. We
        // synthesize a stable ref from the coordinates. CSV column names are
        // UPPERCASE in the bulk download (Socrata's CSV uses display names);
        // the JSON API uses lowercase but we're not using the JSON API.
        // Note the source's typo: LONGTITUDE (with extra T).
        ref: x => `${x.LATITUDE}_${x.LONGTITUDE}`,
        common: 'SPECIES', // common name only — no scientific in this dataset
        dbh: x => x.DIAMETER ? Number(x.DIAMETER) * INCHES : null,
    }
},
{
    // Added 2026-04-13: Austin's "Downtown Tree Inventory 2013" — a richer
    // companion to wrik-xasw. ~7,295 trees in the central business district,
    // surveyed 2013, focused on heritage species and trees ≥19" DBH. Has the
    // full schema stevage's original Austin crosswalk was built for: SPECIES
    // (scientific), COM_NAME (common), DBH, HEIGHT, CONDITION, LAND_TYPE,
    // PARK_NAME. Geometry is a WKT POINT in `the_geom`; live-refresh.js
    // parses it via the WKT fallback in extractCsvLatLon. The bulk CSV URL
    // returns 404 on HEAD requests but works on GET (Socrata oddity).
    id: 'austin_downtown',
    country: 'USA',
    short: 'Austin (downtown 2013)',
    long: 'Austin Downtown Tree Inventory 2013',
    download: 'https://data.austintexas.gov/api/views/7aq7-a66u/rows.csv?accessType=DOWNLOAD',
    info: 'https://data.austintexas.gov/Environment/Downtown-Tree-Inventory-2013/7aq7-a66u',
    sourceMetadataUrl: 'https://data.austintexas.gov/api/views/7aq7-a66u.json',
    format: 'csv',
    crosswalk: {
        ref: 'TREE_ID',
        scientific: 'SPECIES',
        common: 'COM_NAME',
        dbh: x => x.DBH ? Number(x.DBH) * INCHES : null,
        height: x => x.HEIGHT ? Number(x.HEIGHT) / FEET : null,
        health: 'CONDITION',
        location: 'LAND_TYPE',
        park: 'PARK_NAME',
        address: 'ADDRESS',
    },
    primary: 'austin',
},
{
    id:'cornell',
    country: 'USA',
    short: 'Cornell University',
    // long: '',
    download: 'https://cugir-data.s3.amazonaws.com/00/80/25/cugir-008025.zip',
    info:'https://cugir.library.cornell.edu/catalog/cugir-008025',
    format: 'zip',
    filename: 'cugir-008025/CornellTree2009.shp',
    crosswalk: {
        scientific: 'Botanic',
        common: 'Common',
        dbh: x => x.DBH * INCHES,
        note: 'Comment',
        updated: 'SurveyDate'
    }
},

{
    id:'cary',
    country: 'USA',
    short: 'Cary',
    long: '',
    download: 'https://data.townofcary.org/api/v2/catalog/datasets/cary-trees/exports/csv',
    info:'https://catalog.data.gov/dataset/cary-trees',
    format: 'csv',
    crosswalk: {
        updated: 'editdate',
        common: 'name',
        description: 'description',

    }
},
{
    id:'rochester',
    country: 'USA',
    short: 'Rochester',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/4c209944e2984b4a908a14b0cbe48075_0.zip',
    info:'http://hub.arcgis.com/datasets/RochesterNY::trees-open-data',
    format: 'zip',
    crosswalk: {
        description: 'TREE_NAME',
        health: 'COND',
        dbh: x => String(x.DBH).replace('"','') * INCHES,
        ref: 'TREE_NUMBE',
        note: 'NOTES'
    }
},
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com zip URL is dead. The
    // dataset migrated to a hosted FeatureServer ("SDOT_Trees_(Active)" — ~209K
    // records, live updates). Stevage's original crosswalk used 10-char field name
    // truncations from the old shapefile distribution; the FeatureServer exposes
    // the full names, which we use here.
    id:'seattle',
    country: 'USA',
    short: 'Seattle',
    long: 'Seattle Department of Transportation',
    download: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/SDOT_Trees_(Active)/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-trees-active',
    sourceMetadataUrl: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/SDOT_Trees_(Active)/FeatureServer/0?f=json',
    format: 'arcgis-rest',
    paginate: true,
    crosswalk: {
        ref: 'UNITID',
        scientific: 'SCIENTIFIC_NAME', // was 'SCIENTIFIC' (10-char shapefile truncation)
        common: 'COMMON_NAME',         // was 'COMMON_NAM'
        genus: 'GENUS',
        // Heritage / exceptional designations — Y/N flags. 273 heritage trees
        // and 33 exceptional trees in Seattle as of 2026-04-13. Pining can
        // tag these as hero candidates.
        heritage: x => x.HERITAGE === 'Y',
        exceptional: x => x.EXCEPTIONAL === 'Y',
        // Measurements (source is imperial)
        dbh: x => x.DIAM ? Number(x.DIAM) * INCHES : null,
        height: x => x.TREEHEIGHT ? Number(x.TREEHEIGHT) / FEET : null,
        growSpace: 'GROWSPACE',  // size of the planting box in feet
        // Condition fields. CONDITION is text (Excellent/Good/Fair/Poor),
        // CONDITION_RATING is a 1-5 numeric. Both are exposed for richness.
        health: 'CONDITION',
        conditionRating: 'CONDITION_RATING',
        currentStatus: 'CURRENT_STATUS', // INSVC = in service, etc.
        // Site context
        owner: 'OWNERSHIP', // PRIV / PUB / SDOT / etc.
        spaceType: 'SPACETYPE', // SOIL / GRAVEL / etc.
        siteType: 'SITETYPE',   // PIT / etc.
        wires: x => x.WIRES === 'Y',
        cabled: x => x.CABLED === 'Y',
        clearanceProblem: x => x.CLEARANCE_PROBLEM === 'Y',
        district: 'PRIMARYDISTRICTCD',
        // Address / description
        address: 'UNITDESC',
        notes: 'COMMENTS',
        // Date fields (ArcGIS REST returns Unix epoch ms)
        planted: x => x.PLANTED_DATE ? new Date(x.PLANTED_DATE).toISOString() : null,
        updated: x => x.MODDATE ? new Date(x.MODDATE).toISOString() : null,
        verified: x => x.LAST_VERIFY_DATE ? new Date(x.LAST_VERIFY_DATE).toISOString() : null,
        conditionAssessmentDate: x => x.CONDITION_ASSESSMENT_DATE ? new Date(x.CONDITION_ASSESSMENT_DATE).toISOString() : null,
        // Schema doc: https://www.seattle.gov/Documents/Departments/SDOT/GIS/Trees_OD.pdf
    }
},
{
    id:'cupertino',
    country: 'USA',
    short: 'Cupertino',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/caa50a924b7d4b5ba8e8a4cbfd0d7f13_29.csv',
    info:'http://hub.arcgis.com/datasets/Cupertino::trees',
    format: 'csv',
    latitudeField: 'LONG', // sigh, really, yes.
    longitudeField: 'LAT',
    crosswalk: {
        ref: 'AssetID',
        updated: 'UpdateDate',
        scientific: 'Species',
        common: 'SpeciesCommonName',
        dbh: x => Number(x.DiameterBreastHeight) * INCHES,
        height: x => Number(x.Height) / FEET,
        location: 'LocationType',
        health: 'Condition',


    },
    centre: [-122.03987,37.31706],
},
{
    id:'oxnard',
    country: 'USA',
    short: 'Oxnard',
    long: 'City of Oxnard',
    download: 'https://opendata.arcgis.com/datasets/a5aa2d1dfd344ef79d61507d33cdbc02_1.csv',
    info:'http://hub.arcgis.com/datasets/a5aa2d1dfd344ef79d61507d33cdbc02_1',
    format: 'csv',
    crosswalk: {
        // FICTITIOUS?
        scientific: 'BOTANICALN',
        common: 'COMMONNAME',
        dbh: x => Number(x.DBH) * INCHES,
        height: x => Number(x.HEIGHT) / FEET,


    }
},
{
    id:'wake_forest',
    country: 'USA',
    short: 'Wake Forest',
    long: 'Town of Wake Forest',
    download: 'https://opendata.arcgis.com/datasets/ba930858554a43cca1be2f06a44d2449_0.csv',
    info:'http://hub.arcgis.com/datasets/wakeforestnc::trees',
    // format: 'csv',
    crosswalk: {
        scientific: 'SPECIES_LA',
        common: 'SPECIES_CO',
        health: 'STATUS', // alive / not
    }
},
{
    id:'aurora',
    country: 'USA',
    short: 'Aurora',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/1dbb32bf07ca421db4f01dac6beb812d_85.csv',
    info:'http://hub.arcgis.com/datasets/AuroraCo::trees-city',
    format: '',
    crosswalk: {
        ref: 'TREE_ID_NO',
        common: 'SPECIES',
        dbh: x => Number(x.DIAMETER) * INCHES,
        health: 'CONDITION', // what, there is "CONDITION_RATING_NUMERIC" which has "Good" twhereas condition is "Fair"...
        updated: 'ACTIVITY_DATE',
        // genus: 'GENUS', // "Pine" is not a genus...

    }
},
{
    id:'bakersfield',
    short: 'Bakersfield',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/b7a17f7ecb564be4b26ced85016ed1da_0.csv',
    info:'http://hub.arcgis.com/datasets/cob::city-trees?geometry=-129.468%2C33.767%2C-108.539%2C36.903',
    crosswalk: {
        updated: 'DATE_',
        scientific: 'BOTANICAL_',
        common: 'COMMON_N',
        dbh: inches('DIAMETER'),
        height: feet('HEIGHT'),
        crown: feet('CROWN_RADI'),
        health: 'RATING', // out of 10?
        note: 'COMMENT',
        ref: 'TREE_ID',
        
    }
},
{
    id:'las_vegas',
    short: 'Las Vegas',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/23364bb40f2640ff841ba4a8680b6421_0.csv',
    info:'http://hub.arcgis.com/datasets/lasvegas::trees',
    format: '',
    crosswalk: {
        location: 'LOC_TYPE',
        scientific: 'BOTANICAL',
        common: 'COMMON',
        // water_use!
        dbh: 'DBH', // "25-30",
        spread: 'WIDTH',
        height: 'HEIGHT',
        health: 'COND',
        note: 'NOTES',

    }
},
{
    // Updated 2026-04-13: stevage's old opendata.arcgis.com URL is dead. Migrated
    // to maps.mountainview.gov MapServer "Trees" layer 0. ~35K records. New
    // schema has BOTNAME (botanical/scientific) as a separate field from
    // SPECIES; SPECIES looks like a code/short form. NAME is the common name.
    // No CONDITION or LASTUPDATE in the new schema — those mappings dropped.
    id:'mountain_view',
    short: 'Mountain View',
    long: 'City of Mountain View',
    download: 'https://maps.mountainview.gov/arcgis/rest/services/Public/Trees/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info:'https://gisdata-csj.opendata.arcgis.com/maps/MountainView::trees',
    sourceMetadataUrl: 'https://maps.mountainview.gov/arcgis/rest/services/Public/Trees/MapServer/0?f=json',
    format: 'arcgis-rest',
    crosswalk: {
        ref: 'FACILITYID',
        scientific: 'BOTNAME',
        common: 'NAME',
        species: 'SPECIES',
        variety: 'Variety',
        dbh: x => x.DIAMETER ? Number(x.DIAMETER) * INCHES : null,
        height: x => x.HEIGHT ? Number(x.HEIGHT) / FEET : null,
        circumference: 'Circumference',
        planted: x => x.INSTALLDATE ? new Date(x.INSTALLDATE).toISOString() : null,
        location: 'PROPSIDE',
        zone: 'PLANTINGZONE',
        heritage: 'HERITAGE',
    }
},
{
    id:'three_rivers',
    short: 'Three Rivers',
    long: 'Three Rivers Park District',
    download: 'https://opendata.arcgis.com/datasets/ffbb9401412141a79c7164ade8d2ee2d_0.csv',
    info:'http://hub.arcgis.com/datasets/trpd::managed-trees-open-data?geometry=-96.405%2C44.562%2C-90.563%2C45.243',
    crosswalk: {
        common: 'CommonName',
        scientific: 'ScientificName',
        planted: 'YearPlanted',
        ref: 'CartedID', //?
    }
},
{
    id:'richardson',
    short: 'Richardson',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/cd10a9e85354488dbdb697ce97ccb064_0.csv',
    info:'http://hub.arcgis.com/datasets/richardson::trees',
    crosswalk: {
        common: 'NAME',
        genus: 'GENUS',
        species: 'SPECIES',
        age: 'TREEAGE',
        dbh: inches('DIAMETER'), // also TRUNKDIAM
        height: feet('HEIGHT'),
        owner: 'OWNEDBY',
        structure: 'TRUNKSTRCT', // also BRANCHSTRCT
        note: 'COMMENTS',
        updated: 'last_edited_date'


    }
},
{
    id:'allentown',
    short: 'Allentown',
    long: 'City of Allentown',
    download: 'https://opendata.arcgis.com/datasets/4383052db35e4f93bbd83e5bde468a00_0.csv',
    info:'http://hub.arcgis.com/datasets/AllentownPA::city-trees',
    crosswalk: {
        common: 'TR_COMMON',
        scientific: 'TR_GENUS',
        dbh: inches('TR_DIA'),
        health: 'CONDITION',
        // lots of others
        updated: 'INPUT_DATE',


    }
},
{
    id:'sioux_falls',
    short: 'Sioux Falls',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/c880d62ae5fb4652b1f8e6cbca244107_10.csv',
    info:'http://hub.arcgis.com/datasets/cityofsfgis::trees',
    crosswalk: {
        ref: 'AssetID',
        location: 'Location',
        common: 'FullName',
        scientific: 'Species',
        family: 'Family',
        //TreeType: Deciduous
        Spread: 'Spread',
        height: feet('Height'),
        dbh: inches('Diameter'),
        health: 'Condition', // /100,
        Note: 'SpecialComments',
        updated: 'last_edited_date',
    }
},
{
    id:'amherst',
    short: 'Amherst',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/b4a74ab24f114f22b438a19e589f6f76_0.zip',
    info:'http://hub.arcgis.com/datasets/AmherstMA::street-trees',
    crosswalk: {
        ref: 'TreeID',
        updated: 'LastEdit',
        common: 'Species',
        note: 'Notes',
        // TreeSize?
    },
    centre: [-72.49307,42.3818],
},
{
    id:'colorado_springs',
    short: 'Colorado Springs',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/91758518026d4b1089f2180602399d73_0.csv',
    info:'http://hub.arcgis.com/datasets/coloradosprings::trees/data?geometry=-106.259%2C38.699%2C-103.338%2C39.073',
    crosswalk: {
        common: 'Common_Name',
        dbh: inches('DBH'),

    }
},
{
    id:'marysville_oh',
    short: 'Marysville',
    long: 'City of Marysville',
    download: 'https://opendata.arcgis.com/datasets/44b6c7a1307d48ff99d2034b5695c149_0.csv',
    info:'http://hub.arcgis.com/datasets/Marysville::individual-trees-sites',
    delFunc: x => x.status === 'Site - Vacant',
    crosswalk: {
        ref: 'treeid',
        common: 'common',
        genus: 'genus',
        species: 'sp_epith',
        variety: 'variety',
        location: 'type',
        dbh: inches('dbh'),
        height: feet('height'),
        health: 'trcond',
        updated: 'last_edited_date'


    }
},
{
    id:'springfield_mo',
    short: 'Springfield',
    long: 'City of Springfield',
    download: 'https://opendata.arcgis.com/datasets/7a890a7b54d6438f80bd60e5e34c8e62_34.csv',
    info:'http://hub.arcgis.com/datasets/COSMO::tree-inventory',
    crosswalk: {
        health: 'Condition',
        common: 'TreeType',
        scientific: 'SciName',
        height: 'Height', // 11-20
        dbh: inches('Diameter'),
        spread: 'Spread',


    }
},
{
    id:'anaheim_ca',
    short: 'Anaheim',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/0f96c6cf73904424bc9ce14197990201_41.csv',
    info:'https://data-anaheim.opendata.arcgis.com/datasets/city-trees',
    crosswalk: {
        common: 'COMMONNAME',
        scientific: 'BOTANICALNAME',
        dbh: 'DBH', //13-18
        height: 'HEIGHT',
        // FICTITIOUS?


    },
    centre: [-117.86, 33.83],
},
{
    id:'charlottesville_nc',
    short: 'Charlottesville',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/e7c856379492408e9543a25d684b8311_79.csv',
    info:'http://hub.arcgis.com/datasets/charlottesville::tree-inventory-point',
    format: '',
    delFunc: x => x.Removal_Date,
    crosswalk: {
        planted: 'Install_Date',
        common: 'Common_Name',
        owner: 'Agency',
        genus: 'Genus',
        species: 'Species',
        updated: 'last_edited_date',

        //Removal_Date?

    }
},
{
    id:'west_chester_pa',
    short: 'West Chester',
    long: 'West Chester Borough',
    download: 'https://opendata.arcgis.com/datasets/7fdf2b5d2b674e99b33e8d77d052e30c_0.csv',
    info:'http://hub.arcgis.com/datasets/WCUPAGIS::borotrees-1?geometry=-87.273%2C38.460%2C-63.905%2C41.408',
    format: '',
    crosswalk: {
        dbh: inches('DBH'),
        ref: 'ID_1',
        genus: 'Genus',
        species: 'Species_1',
        common: 'CommonName',
        health: 'Condition_1',

    }
},
{
    id:'durango_co',
    short: 'Durango',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/3e3e00d6224b43ee9acc514244fffdb9_0.csv',
    info:'http://hub.arcgis.com/datasets/CityOfDurango::city-trees',
    format: '',
    crosswalk: {
        planted: 'DATEID', //?
        ref: 'ID',
        //type: 'Deciduous',
        common: 'COMMON',
        genus: 'GENUS',
        species: 'SPECIES',
        variety: 'CULTIVAR',
        dbh: inches('DBH'),
        health: 'CONDITION',
        updated: 'LASTMODDATE',
    }
},
{
    id:'washington_me',
    short: 'Washington',
    long: 'Washington County',
    download: 'https://opendata.arcgis.com/datasets/ae14fc063c1e44a995e750805b1c864b_0.csv',
    info:'http://hub.arcgis.com/datasets/WCMN::tree-inventory',
    format: '',
    crosswalk: {
        common: 'Tree_Type',
        health: 'Health',
        note: 'Comments',
        ref: 'OBJECTID',
    }
},
{
    id:'westerville_oh',
    short: 'Westerville',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/137785bc78da47b4a2159f9c76218d55_0.csv',
    info:'http://hub.arcgis.com/datasets/Westerville::comm-parks-rec-trees/data?geometry=-83.315%2C40.085%2C-82.585%2C40.177',
    format: '',
    crosswalk: {
        dbh: inches('DBH'),
        common: 'COMMON_NAME',
        //class: deciduous
        location: 'TREE_TYPE',
        health: 'CONDITION',
        scientific: 'SCIENTIFIC',

    }
},
{
    id:'st_augustine_fl',
    short: 'St Augustine',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/8372c7d0f5a24764bd10f62f0b2f1b65_0.csv',
    info:'http://hub.arcgis.com/datasets/STAUG::trees?geometry=-93.005%2C28.223%2C-69.637%2C31.556',
    format: '',
    crosswalk: {
        updated: 'INSPECT_DT',
        note: 'NOTES',
        scientific: 'SPP', // often "Palm" though
        dbh: 'DBH', //13-14
    }
},
{
    id:'weston_fl',
    short: 'Weston',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/c95f89a4db39414a89f5c29bcb6fb48d_6.csv',
    info:'http://hub.arcgis.com/datasets/westonfl::trees',
    format: '',
    crosswalk: {
        common: 'NAME',
        genus: 'GENUS',
        species: 'SPECIES',
        age: 'TREEAGE',
        dbh: inches('TRUNKDIAM'),
        height: feet('HEIGHT'),
        health: 'CONDITION',
        owner: 'OWNEDBY',
        updated: 'LASTUPDATE',
        scientific: 'BOTNAME',
        family: 'FAMILY'


    }
},
/*
// broken
// alternative, also broken: http://opendata.minneapolismn.gov/datasets/tree-inventory/data
{
    id:'minneapolis_mn',
    short: 'Minneapolis',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/5c607cf94314467f87e285526b72e4d6_0.csv',
    info:'http://hub.arcgis.com/datasets/cityoflakes::tree-inventory',
    format: '',
    crosswalk: {
    }
},*/
{
    id:'pacific_grove_ca',
    short: 'Pacific Grove',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/87bcc6e824214422be859b3251350829_3.csv',
    info:'http://hub.arcgis.com/datasets/CityPacificGrove::trees',
    format: '',
    crosswalk: {
        common: 'Type',
        scientific: 'BOTANICAL',
        variety: 'CULTIVAR',
        dbh: inches('DBH'),
        condition: x => String(x.CONDITION).split(' - ')[0],
        comment: 'NOTES',

        // DATE_1 - 2015-ish. planted? updated?
    }
},
{
    id:'bozeman_mt',
    short: 'Bozeman',
    long: 'City of Bozeman',
    download: 'https://opendata.arcgis.com/datasets/ba0dea7927184014a8b84e64af5c7684_0.csv',
    info:'http://hub.arcgis.com/datasets/bozeman::trees',
    format: '',
    crosswalk: {
        genus: 'Genus',
        species: 'Species',
        variety: 'Cultivar',
        dbh: inches('DBH'),
        health: 'Condition',
        updated: 'last_edited_date',
        common: 'Common_Name',
        ref: 'FacilityID',
    }
},
{
    id:'champaign_il',
    short: 'Champaign',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/979bbeefffea408e8f1cb7a397196c64_22.csv',
    info:'http://hub.arcgis.com/datasets/cityofchampaign::city-owned-trees',
    format: '',
    crosswalk: {
        ref: 'ID',
        scientific: 'SPP',
        common: 'COMMON',
        dbh: inches('DBH'),
        health: 'COND',
        updated: 'INSPECT_DT',
        note: 'NOTES',
        family: 'FAMILY',
    }
},
{
    id:'placentia_ca',
    short: 'Placentia',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/8efcbe9c80ed42a29e6ad5483bd01c32_0.csv',
    info:'http://hub.arcgis.com/datasets/placentia::city-trees',
    format: '',
    crosswalk: {
        ref: 'INVENTORYI',
        scientific: 'BOTANICALN',
        common: 'COMMONNAME',
        dbh: 'DBH', //07-12
        height: 'HEIGHT', // 15-30
        updated: 'EditDate',

    }
},
// broken - generating
// {
//     id:'ucsb',
// //     short: 'UC Santa Barbara',
//     long: 'University of California, Santa Barbara',
//     download: 'https://opendata.arcgis.com/datasets/c6eb1b782f674be082f9eb764314dda5_0.csv',
//     info:'http://hub.arcgis.com/datasets/ucsb::treekeeper-012116',
//     format: '',
//     crosswalk: {
//     }
// },
{
    id:'sarasota_fl',
    short: 'Sarasota',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/4deeb30f44bc4b60847cf43aed1a4670_0.csv',
    info:'http://hub.arcgis.com/datasets/sarasota::tree-inventory',
    format: '',
    crosswalk: {
        scientific: 'Species', // often common names like "Laurel Oak',
        dbh: inches('DBH_1_99_'),
        height: feet('Height_1_1'),
        health: 'Condition',
        owner: 'Ownership',
        note: 'Notes',
        updated: 'last_edited_date',
    }
},
{
    id:'nichols_arboretum',
    short: 'Nichols Arboretum',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/febee55e7dac43298952af77c8f8d809_0.csv',
    info:'http://hub.arcgis.com/datasets/umich::nichols-arboretum-inventory-survey',
    format: '',
    crosswalk: {
        common: 'COMMON',
        scientific: 'BOTANICAL',
        variety: 'CULTIVAR',
        dbh: inches('DBH'),
        health: 'COND',
        note: 'NOTES',
        updated: 'DATE', // EDITTIME? 


    }
},
{
    id:'unt',
    short: 'UNT',
    long: 'University of North Texas',
    download: 'https://opendata.arcgis.com/datasets/ee33bf4535cd47bbb1c5661d2333d834_0.csv',
    info:'http://hub.arcgis.com/datasets/untgis::tree',
    format: '',
    crosswalk: {
        note: 'NOTES',
        common: 'NAME_COMN',
        ref: 'UNT_ID',
    }
},
{
    id:'escondido_ca',
    short: 'Escondido',
    long: 'City of Escondido',
    download: 'https://opendata.arcgis.com/datasets/ac9caf3c7a9847b78100cc8860ddf51a_0.csv',
    info:'http://hub.arcgis.com/datasets/CityofEscondido::tree-inventory?geometry=-122.895%2C32.313%2C-111.211%2C33.923',
    format: '',
    crosswalk: {
        ref: 'TREEID',
        // FICTITIOUS ??
        scientific: 'BOTANICAL',
        common: 'COMMON',
        dbh: 'DBH_RANGE', //19-24 also EXACTDBH
        height: feet('HEIGHT_RAN'), // 30-45
        health: 'CONDITION',
        updated: 'LAST_EDITED_DATE',

    }
},
{
    id:'wylie_tx',
    short: 'Wylie',
    long: 'City of Wylie',
    download: 'https://opendata.arcgis.com/datasets/82060fffb84045fdafbe2a56c989b353_0.csv',
    info:'http://hub.arcgis.com/datasets/WylieTX::treesurvey',
    format: '',
    crosswalk: {
        ref: 'TK_ID',
        common: 'COMMON',dbh: inches('DBH'),
        health: 'CONDITION',
        updated: 'INSPECT_DT',
        
    }
},
{
    id:'auburn_me',
    short: 'Auburn',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/91bffc476216422481b511a48796a327_0.csv',
    info:'http://hub.arcgis.com/datasets/AuburnME::treeinventory?geometry=-81.930%2C42.701%2C-58.562%2C45.462',
    format: '',
    crosswalk: {
        ref: 'ID',
        common: 'COMMON',
        scientific: 'BOTANICAL',
        dbh: 'DBH', // many blanks...?
        health: 'COND',
        note: 'NOTES',
    }
},
// not downloading
// {
//     id:'uc_davis',
// //     short: 'UC Davis',
//     long: 'University of California Davis',
//     download: '',
//     info:'http://hub.arcgis.com/datasets/ucda::uc-davis-tree-database',
//     format: 'https://opendata.arcgis.com/datasets/07939ef894984a95b58098315f80c046_0.zip',
//     crosswalk: {
//     }
// },
{
    id:'hudson_river_park',
    short: 'Hudson River Park',
    long: 'Hudson River Park Trust',
    download: 'https://opendata.arcgis.com/datasets/51b5e5da030f4331af48cb052f2d2d5e_1.csv',
    info:'http://hub.arcgis.com/datasets/SustainableMSU::tree',
    format: '',
    crosswalk: {
        scientific: 'Species_Latin_Name',
        common: 'Species_Common_Name',
        height: feet('Height'),
        dbh: inches('DBH'),
        structure: 'Structural_Value',
        ref: 'HRPT_Numbering_1',

    }
},
{
    id:'cape_coral_fl',
    short: 'Cape Coral',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/e988fe06668e44ea996a53c4365531b9_0.csv',
    info:'http://hub.arcgis.com/datasets/CapeGIS::tree-inventory',
    format: '',
    crosswalk: {
        common: 'SPECIES',
        dbh: 'DBH', // 0-6"
        crown: 'CANOPY',
        location: 'SITE',
        health: 'CONDITION',
        updated: 'last_edited_date',
        heaght: 'HEIGHT', //11-20
        note: 'COMMENTS',
    }
},
{
    id:'naperville_il',
    short: 'Naperville',
    long: '',
    download: 'https://opendata.arcgis.com/datasets/51d4726531cd4ef99bfa24b99ae3ba24_0.csv',
    info:'http://hub.arcgis.com/datasets/naperville::right-of-way-tree-inventory',
    format: '',
    crosswalk: {
        common: 'ROWTREE_TYPE',
        ref: 'FACILITYID',
        health: 'CONDITION_CLASS',
        updated: 'DATE_CHANGED',
        planted: 'DatePlanted',
        dbh: inches('EST_DBH'),
        family: 'FAMILY',
        variety: 'CULTIVAR',
        genus: 'GENUS', // no species?
    }
},
{
    // Updated 2026-04-13: stevage had three separate San Jose entries (medians,
    // special districts, general fund) on opendata.arcgis.com URLs that all
    // returned 400. The current canonical San Jose street tree inventory is a
    // single consolidated dataset on geo.sanjoseca.gov MapServer layer 510
    // ("Street Trees"). This entry replaces all three. The old field names
    // (NAMESCIENTIFIC, DIAMETER, HEIGHT, TRUNKDIAM, CONDITION, OWNEDBY, NOTES)
    // all carry over.
    id:'san_jose',
    short: 'San Jose',
    long: 'City of San Jose',
    download: 'https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/510/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://gisdata-csj.opendata.arcgis.com/datasets/7db16e012fe8402db45074cd260c8f4e',
    sourceMetadataUrl: 'https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/510?f=json',
    format: 'arcgis-rest',
    crosswalk: {
        ref: 'FACILITYID',
        scientific: 'NAMESCIENTIFIC',
        dbh: x => x.TRUNKDIAM ? Number(x.TRUNKDIAM) * INCHES : null,
        height: x => x.HEIGHT ? Number(x.HEIGHT) / FEET : null,
        crown: x => x.DIAMETER ? Number(x.DIAMETER) / FEET : null, // SJ DIAMETER = crown spread, not trunk
        health: x => x.CONDITION ? String(x.CONDITION).split(' ')[0] : null,
        note: 'NOTES',
        owner: 'OWNEDBY',
        planted: x => x.INSTALLDATE ? new Date(x.INSTALLDATE).toISOString() : null,
        updated: x => x.LASTUPDATE ? new Date(x.LASTUPDATE).toISOString() : null,
        address: x => x.ADDRESSNUM && x.STREETNAME ? `${x.ADDRESSNUM} ${x.STREETNAME}` : null,
    }
},
{
    // Added 2026-04-13: San Jose Heritage Trees — 110 trees formally
    // designated by the city as historically significant. Each has an
    // IMAGELINK pointing to a photo on gis.sanjoseca.gov, plus a HISTORY
    // field with descriptive notes ("Large Specimen", historical significance,
    // etc.). Perfect Pining hero candidates with free photos. layer 511 in
    // San Jose's MapServer.
    id: 'san_jose_heritage',
    short: 'San Jose Heritage',
    long: 'San Jose Heritage Trees Registry',
    download: 'https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/511/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    info: 'https://www.sanjoseca.gov/your-government/departments-offices/transportation/street-trees/heritage-trees',
    sourceMetadataUrl: 'https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/511?f=json',
    format: 'arcgis-rest',
    crosswalk: {
        ref: 'FACILITYID',
        scientific: 'SCIENTIFICNAME',
        common: 'COMMONNAME',
        dbh: x => x.DIAMETER ? Number(x.DIAMETER) * INCHES : null,
        circumference: x => x.CIRCUMFERENCE ? Number(x.CIRCUMFERENCE) * INCHES : null,
        address: 'ADDRESS',
        location: 'TREELOCATION',
        treesOnSite: 'NUMBEROFTREESONSITE',
        history: 'HISTORY',
        imageUrl: 'IMAGELINK',
        notes: 'NOTES',
        councilDistrict: 'COUNCILDISTRICT',
        fileNumber: 'FILENUMBER',
        status: 'TREESTATUS',
        photoDate: x => x.PHOTODATE ? new Date(x.PHOTODATE).toISOString() : null,
        created: x => x.CREATIONDATE ? new Date(x.CREATIONDATE).toISOString() : null,
        updated: x => x.LASTUPDATE ? new Date(x.LASTUPDATE).toISOString() : null,
        heritage: () => true, // every record is a heritage tree by construction
    },
    primary: 'san_jose',
},
// maybe https://opendata.arcgis.com/datasets/a31898f9fff4417ab6f784c9b4fe5f43_27.csv

// OSU: http://hub.arcgis.com/datasets/2b4fc9ac4cdc43b7bba6f2b1e0d6f75f_29


// oh yeah, this guy:
// http://hub.arcgis.com/datasets/usfs::raw-urban-street-tree-inventory-data-for-49-california-cities


].map(s => { s.country = 'USA'; return s; });

// Sigh, every point has the exact same geometry.
// {
    
//     id: 'oakland',
//     download: 'https://data.oaklandnet.com/api/views/4jcx-enxf/rows.csv?accessType=DOWNLOAD',
//     format: 'csv',
//     short: 'Oakland',
//     crosswalk: {
//         scientific: 'SPECIES',
//         ref: 'OBJECTID'

//     }
// },
 
 
/*
https://pg-cloud.com/hawaii/
- can't really use this in this form
*/