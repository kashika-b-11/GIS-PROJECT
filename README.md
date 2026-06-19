# Panchayat to Villages Map

This project shows Himachal Pradesh village locations on a Leaflet map. Click a panchayat marker to list the villages that belong to it.

## Run locally

Do not open `index.html` directly from File Explorer. Browser security rules can block the GeoJSON files when the page is opened as a local file.

Start a local server from the project folder:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Important files

- `index.html` - web page with the map and sidebar.
- `js/app.js` - Leaflet logic, panchayat matching, popups, and village list rendering.
- `data/villages.geojson` - village point data.
- `data/panchayats_from_villages.geojson` - generated panchayat marker data.

## Data fields used

The current village dataset uses:

- Panchayat name: `Gram_Panch`
- Village name: `Village_Ve`

If you replace the GeoJSON with a different dataset, update `getPanchayatName()` and `getVillageName()` in `js/app.js`.

## Notes

- `data/panchayats.geojson` is optional. If it is not present, the app automatically uses `data/panchayats_from_villages.geojson`.
- The map uses Leaflet from the public CDN, so the browser needs internet access unless you download Leaflet locally and update the links in `index.html`.
