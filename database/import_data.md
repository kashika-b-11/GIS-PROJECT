# Import GeoJSON Into PostGIS

Install PostgreSQL with PostGIS and GDAL first. Then create a database:

```sql
CREATE DATABASE gis_project;
\c gis_project
CREATE EXTENSION postgis;
```

Import the current GeoJSON files:

```powershell
ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=gis_project user=postgres password=YOUR_PASSWORD" data/villages.geojson -nln villages -overwrite
ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=gis_project user=postgres password=YOUR_PASSWORD" data/panchayats_from_villages.geojson -nln panchayats -overwrite
```

Add indexes:

```powershell
psql "host=localhost dbname=gis_project user=postgres password=YOUR_PASSWORD" -f database/schema.sql
```

Run the Flask backend with your database connection:

```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/gis_project"
python backend/app.py
```

If `DATABASE_URL` is not set, the backend falls back to the existing files in `data/`.
