CREATE EXTENSION IF NOT EXISTS postgis;

-- These tables are created by ogr2ogr during import.
-- The indexes below make map and panchayat lookups fast.

CREATE INDEX IF NOT EXISTS villages_geom_idx
ON villages
USING GIST (wkb_geometry);

CREATE INDEX IF NOT EXISTS panchayats_geom_idx
ON panchayats
USING GIST (wkb_geometry);

CREATE INDEX IF NOT EXISTS villages_panchayat_idx
ON villages ("Gram_Panch");

CREATE INDEX IF NOT EXISTS panchayats_name_idx
ON panchayats (panchayat);
