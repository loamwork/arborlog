module.exports = [
    {
        id: 'belfast',
        country: 'UK',
        download:
            'https://www.belfastcity.gov.uk/nmsruntime/saveasdialog.aspx?lID=14543&sID=2430',
        info:
            'https://www.belfastcity.gov.uk/council/Openandlinkeddata/opendatasets.aspx',
        format: 'csv',
        short: 'Belfast',
        crosswalk: {
            location: 'TYPEOFTREE',
            common: 'SPECIESTYPE',
            scientific: 'SPECIES',
            maturity: 'AGE',
            health: 'CONDITION',
            dbh: 'DIAMETERinCENTIMETRES',
            spread: 'SPREADRADIUSinMETRES',
            height: 'TREEHEIGHTinMETRES',
        },
    },
    {
        // Updated 2026-04-13: switched from stevage's 2018 GLA snapshot
        // (~715K trees) to the new "London Public Realm Trees" 2025 release
        // (~1.14 MILLION trees, published 2025-12-01 by GLA + GiGL). Sources:
        // 32 London boroughs, City of London, Transport for London, the Royal
        // Parks, Olympic Park, Quintain. Includes future climate suitability
        // ratings — perfect Pining themed-card material. License: UK Open
        // Government Licence v3.0 (fully open, commercial use OK — separate
        // from the CC BY-NC of the rest of stevage's data).
        // Dataset page: https://data.london.gov.uk/dataset/london-public-realm-trees-2r45m/
        id: 'london',
        download: 'https://data.london.gov.uk/download/2r45m/e62a6a1f-390d-4193-ae32-3aabd9846f36/Borough_tree_list_2025Nov.csv',
        info: 'https://data.london.gov.uk/dataset/london-public-realm-trees-2r45m/',
        format: 'csv',
        short: 'London',
        long: 'Greater London Authority — Public Realm Trees',
        country: 'UK',
        centre: [-0.1051, 51.5164],
        license: 'OGL-UK-3.0', // overrides the inherited CC-BY-NC for this source

        crosswalk: {
            ref: 'uniqueid',
            scientific: 'taxon_species', // sometimes genus-only when species unknown
            common: 'common_name',
            genus: 'taxon_genus',
            commonGenus: 'common_genus',
            glaName: 'gla_name',
            family: 'taxon_family',
            borough: 'borough',
            maintainer: 'maintainer',
            location: 'location',
            climateSuitability: 'climate_suitability', // Future climate suitability rating
            climateSuitabilityConfidence: 'cs_confidence',
            ageCategory: 'age_cat',
            // Measurement fields are strings with units like "10 m", "32 cm".
            // Parse the leading number; units are documented in the field name.
            height: x => {
                if (!x.height_m) return null;
                const m = String(x.height_m).match(/(\d+(?:\.\d+)?)/);
                return m ? Number(m[1]) : null;
            },
            crown: x => {
                if (!x.canopy_m) return null;
                const m = String(x.canopy_m).match(/(\d+(?:\.\d+)?)/);
                return m ? Number(m[1]) : null;
            },
            dbh: x => {
                if (!x.girth_dbh) return null;
                const m = String(x.girth_dbh).match(/(\d+(?:\.\d+)?)/);
                return m ? Number(m[1]) : null;
            },
        },
    },
    {
        id: 'birmingham',
        download:
            'https://cc-p-birmingham.ckan.io/dataset/e9c314fc-fb6d-4189-a19c-7eec962733a8/resource/4bfd9191-a520-42fb-9ebf-8fefaededf6c/download/trees-dec2016.csv',
        format: 'csv',
        short: 'Birmingham',
        country: 'UK',
        crosswalk: {
            scientific: 'species',
            maturity: 'age',
            height: 'height',
            location: 'site_name',
        },
        centre: [-1.8673, 52.47],
    },
    {
        // Updated 2026-04-13: stevage's old opendata.bristol.gov.uk Opendatasoft
        // download URL now serves only the HTML landing page. Migrated to the
        // city's MapServer "Trees" layer 32 at maps2.bristol.gov.uk. ~56K
        // records. New schema uses uppercase field names and stores measurements
        // as strings with units ("15 Metres", "No Code Allocated"). Spatial
        // reference is British National Grid; we reproject to WGS84 in the
        // query.
        id: 'bristol',
        country: 'UK',
        download: 'https://maps2.bristol.gov.uk/server2/rest/services/ext/ll_environment_and_planning/MapServer/32/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
        info: 'https://open-data-bristol-bcc.hub.arcgis.com/datasets/trees-2/about',
        sourceMetadataUrl: 'https://maps2.bristol.gov.uk/server2/rest/services/ext/ll_environment_and_planning/MapServer/32?f=json',
        format: 'arcgis-rest',
        crosswalk: {
            ref: 'ASSET_ID',
            scientific: 'LATIN_NAME',
            common: 'FULL_COMMON_NAME',
            commonShort: 'COMMON_NAME',
            // DBH is stored as a string ("No Code Allocated" or rarely a numeric value).
            // Parse only if it looks numeric.
            dbh: x => {
                if (!x.DBH || x.DBH === 'No Code Allocated') return null;
                const n = parseFloat(String(x.DBH));
                return Number.isFinite(n) ? n : null;
            },
            // Height/crown are strings like "15 Metres" — parse the leading number.
            height: x => {
                if (!x.CROWN_HEIGHT) return null;
                const m = String(x.CROWN_HEIGHT).match(/(\d+(?:\.\d+)?)/);
                return m ? Number(m[1]) : null;
            },
            crown: x => {
                if (!x.CROWN_WIDTH) return null;
                const m = String(x.CROWN_WIDTH).match(/(\d+(?:\.\d+)?)/);
                return m ? Number(m[1]) : null;
            },
            location: 'SITE_NAME',
            type: 'TYPE',
            updated: x => x.last_edited_date ? new Date(x.last_edited_date).toISOString() : null,
            dead: 'DEAD',
        },
        short: 'Bristol',
    },
    {
        // Updated 2026-04-13: stevage's old data.edinburghcouncilmaps.info zip URL
        // returned 403 (subscription canceled). The current Edinburgh Council
        // tree inventory is on services-eu1.arcgis.com (the EU-region ArcGIS
        // Online cluster — confirms UK location), service "Trees", on layer
        // 41 specifically (uncommon ID, not 0). ~50K records. Source spatial
        // reference is British National Grid (wkid 27700); we reproject to
        // WGS84 in the query. DiameterAtBreastHeight is now the full field name
        // (was truncated to DiameterAt in stevage's old shapefile).
        id: 'edinburgh',
        country: 'UK',
        short: 'Edinburgh',
        long: 'City of Edinburgh Council',
        download: 'https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Trees/FeatureServer/41/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
        info: 'https://city-of-edinburgh-council-open-spatial-data-cityofedinburgh.hub.arcgis.com/datasets/cityofedinburgh::trees/about',
        sourceMetadataUrl: 'https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Trees/FeatureServer/41?f=json',
        format: 'arcgis-rest',
        crosswalk: {
            ref: 'PrimaryKey',
            scientific: 'LatinName',
            common: 'CommonName',
            height: 'Height',
            spread: 'Spread',
            maturity: 'AgeGroup',
            dbh: 'DiameterAtBreastHeight',
            owner: 'Owner',
            ward: 'Ward',
            site: 'Site',
        },
    },
    {
        id: 'dundee',
        country: 'UK',
        short: 'Dundee',
        long: 'Dundee City Council',
        download:
            'https://data.dundeecity.gov.uk/datastore/dump/e54ef90a-76e5-415e-a272-5e489d9f5c67',
        info: 'https://data.dundeecity.gov.uk/dataset/trees',
        format: 'csv',
        crosswalk: {
            ref: 'TREE_NUMBER',
            height: 'HEIGHT_M',
            circumference: 'GIRTH',
            maturity: 'AGE_CLASS',
            scientific: 'SCIENTIFIC_NAME',
            common: 'POPULAR_NAME',
        },
    },
    {
        // Updated 2026-04-13: stevage's old opendata.arcgis.com URL is dead.
        // Migrated to maps.york.gov.uk MapServer "EnvPlan" layer 3 ("Council
        // trees"). ~20K records. Field names unchanged from stevage's
        // crosswalk — just the URL needed updating.
        id: 'york',
        country: 'UK',
        short: 'York',
        long: 'City of York Council',
        download: 'https://maps.york.gov.uk/arcgis/rest/services/Public/EnvPlan/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
        info: 'https://data.gov.uk/dataset/12dcc527-a7e2-4b23-a3c5-1501053ff0f5/council-owned-trees',
        sourceMetadataUrl: 'https://maps.york.gov.uk/arcgis/rest/services/Public/EnvPlan/MapServer/3?f=json',
        format: 'arcgis-rest',
        crosswalk: {
            ref: 'TREEID',
            scientific: 'BOTANICAL',
            common: 'SPECIES',
            site: 'SITE_NAME',
            owner: 'OWNER',
            planted: 'Planted',
        },
    },
    {
        // Updated 2026-04-13: same migration as the council trees entry above —
        // moved to maps.york.gov.uk MapServer "EnvPlan" layer 18 ("Private
        // trees"). ~1.1K records.
        id: 'york-private',
        country: 'UK',
        short: 'York',
        long: 'York privately-owned trees',
        download: 'https://maps.york.gov.uk/arcgis/rest/services/Public/EnvPlan/MapServer/18/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
        info: 'https://data.gov.uk/dataset/c166b067-5a9d-487b-a37d-4d350f8cff51/private-trees',
        sourceMetadataUrl: 'https://maps.york.gov.uk/arcgis/rest/services/Public/EnvPlan/MapServer/18?f=json',
        format: 'arcgis-rest',
        crosswalk: {
            ref: 'TREEID',
            owner: 'OWNER',
            common: 'SPECIES',
            scientific: 'BOTANICAL',
            site: 'SITE_NAME',
            planted: 'Planted',
        },
        primary: 'york',
    },
    {
        // Added 2026-04-13: York Tree Preservation Orders — 3,521 legally
        // protected trees under UK Tree Preservation Order legislation. TPOs
        // are the UK's equivalent of US heritage tree designation: trees
        // recognized as having significant amenity value, with legal
        // restrictions on cutting, topping, lopping, or uprooting. Schema
        // includes TYPE (Single tree / Group), SPECIES, BOTANICAL, OWNER.
        // layer 10 in York's EnvPlan MapServer.
        id: 'york_tpo',
        country: 'UK',
        short: 'York TPO',
        long: 'York Tree Preservation Orders',
        download: 'https://maps.york.gov.uk/arcgis/rest/services/Public/EnvPlan/MapServer/10/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
        info: 'https://www.york.gov.uk/TreePreservationOrders',
        sourceMetadataUrl: 'https://maps.york.gov.uk/arcgis/rest/services/Public/EnvPlan/MapServer/10?f=json',
        format: 'arcgis-rest',
        crosswalk: {
            ref: 'TREEID',
            scientific: 'BOTANICAL',
            common: 'SPECIES',
            site: 'SITE_NAME',
            owner: 'OWNER',
            type: 'TYPE',
            location: 'LOCATION',
            // These measurement fields are present but typically empty in TPOs
            // — the legal designation doesn't require recording them.
            age: 'AGE',
            height: 'HEIGHT',
            spread: 'SPREAD',
            trunk: 'TRUNK',
            planted: 'Planted',
            // Every record is a TPO-protected tree by definition
            tpo: () => true,
            heritage: () => true,
        },
        primary: 'york',
    },
    {
        id: 'craigynos_uk',
        short: 'Craig-y-Nos',
        long: 'Craig-y-Nos Country Park',
        download:
            'https://gis.beacons-npa.gov.uk/geoserver/inspire/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=inspire:cyn_tree_survey',
        info:
            'https://data.gov.uk/dataset/35853f97-5cb9-4779-89aa-87fd4d657595/craig-y-nos-tree-survey',
        format: 'gml',
        crosswalk: {
            updated: 'survey_date',
        },
        license: '',
        centre: [-3.684357, 51.826852],
    },
];
