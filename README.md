# Panchayat → Villages Map (up to Module 3)

This small project shows how to click a panchayat and list all villages under it using a Leaflet web map.

Files created:
- `index.html` — web page with map and sidebar.
- `js/app.js` — mapping logic and interaction.
- `data/` — place your GeoJSON files here: `panchayats.geojson` and `villages.geojson`.

Quick steps to get running (Windows):

1. Convert your File Geodatabase (.gdb) to GeoJSON

Install GDAL/ogr2ogr (use OSGeo4W, conda, or the standalone GDAL binaries). Then list layers:

```powershell
ogrinfo "C:\path\to\your\8_State_Vigilance_Bureau.gdb"
```

Find the layer names for panchayats and villages. Then export each layer to GeoJSON:

```powershell
ogr2ogr -f GeoJSON data/panchayats.geojson "C:\path\to\8_State_Vigilance_Bureau.gdb" "PanchayatLayerName"
ogr2ogr -f GeoJSON data/villages.geojson "C:\path\to\8_State_Vigilance_Bureau.gdb" "VillageLayerName"
```

Replace the layer names with the ones shown by `ogrinfo`.

2. Start a local web server (to avoid CORS/file issues)

```powershell
cd "C:\Users\HP\Desktop\GIS PROJECT"
python -m http.server 8000
```

Open http://localhost:8000 in your browser.

3. Where to change things

- Data files: put your GeoJSON files at `data/panchayats.geojson` and `data/villages.geojson`.
- Property names used for matching: edit `js/app.js`. The helper `getProp` tries common property names (e.g. `PANCHAYAT`, `NAME`). If your files use other property names, update the arrays passed to `getProp`.
- Styles and behavior: change the `style` objects in `js/app.js` or adjust the popup/list HTML.

4. Notes and debugging

- If the sidebar says data not found, check file names and that the server is serving the `data/` folder.
- If panchayats show but villages don't list, open your `villages.geojson` in a text editor and inspect `properties` for the correct linking field (panchayat name or ID). Update `js/app.js` to use that property.

