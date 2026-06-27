# Panchayat to Villages Map

This project is now split into a frontend, backend, and database setup.

The performance fix is that the browser no longer loads all villages at startup. It loads panchayat markers first, then asks the backend for villages only when you click a panchayat.

The backend also keeps an in-memory index of the GeoJSON data in fallback mode, so repeated panchayat and village searches are much faster after the first load.

## Project Structure

```text
GIS-PROJECT/
  backend/
    app.py
    requirements.txt
  database/
    import_data.md
    schema.sql
  data/
    villages.geojson
    panchayats_from_villages.geojson
  frontend/
    index.html
    js/app.js
```

## Run Without Database First

This mode uses your existing GeoJSON files through the Flask backend. It is useful while you are setting up PostgreSQL/PostGIS.

```powershell
cd "C:\Users\HP\Desktop\GIS PROJECT"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\app.py
```

Open:

```text
http://127.0.0.1:5000
```

## Run With PostGIS

Follow:

```text
database/import_data.md
```

After importing the data, set `DATABASE_URL` before starting Flask:

```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/gis_project"
python backend\app.py
```

## API Routes

```text
GET /api/health
GET /api/panchayats
GET /api/villages?panchayat=Lanjhta
GET /api/search-villages?q=Baraun
```

## Data Fields Used

The current village dataset uses:

```text
Panchayat name: Gram_Panch
Village name: Village_Ve
```

If you replace the GeoJSON files with different fields, update the helper functions in:

```text
backend/app.py
frontend/js/app.js
```
