import shapefile, json, os, sys

def shp_to_geojson(shp_path, out_path):
    reader = shapefile.Reader(shp_path)
    fields = [f[0] for f in reader.fields if f[0] != 'Deletion']
    features = []
    for sr in reader.shapeRecords():
        shape = sr.shape
        rec = sr.record
        props = dict(zip(fields, rec))
        geom = None
        if shape.shapeType == 1:  # Point
            geom = {"type": "Point", "coordinates": shape.points[0]}
        elif shape.shapeType in (3, 5):  # PolyLine or Polygon
            pts = shape.points
            parts = list(shape.parts) + [len(pts)]
            rings = []
            for i in range(len(parts)-1):
                ring = pts[parts[i]:parts[i+1]]
                rings.append([[p[0], p[1]] for p in ring])
            if shape.shapeType == 3:
                geom = {"type": "MultiLineString", "coordinates": rings}
            else:
                geom = {"type": "Polygon", "coordinates": rings}
        else:
            geom = {"type": "MultiPoint", "coordinates": shape.points}
        features.append({"type": "Feature", "geometry": geom, "properties": props})
    geo = {"type": "FeatureCollection", "features": features}
    with open(out_path, 'w', encoding='utf8') as f:
        json.dump(geo, f, ensure_ascii=False)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: shp_to_geojson.py input.shp output.geojson')
        sys.exit(2)
    shp = sys.argv[1]
    out = sys.argv[2]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shp_to_geojson(shp, out)
    print('Wrote', out)
