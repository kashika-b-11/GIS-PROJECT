import json
import math
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # Allows the GeoJSON fallback to run before dependencies are installed.
    psycopg = None
    dict_row = None


ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"
DATA_DIR = ROOT_DIR / "data"
DATABASE_URL = os.getenv("DATABASE_URL")

app = Flask(__name__, static_folder=None)
CORS(app)

_panchayats_cache = None
_villages_by_panchayat = None
_village_search_rows = None
_asset_features = None


def get_connection():
    if not DATABASE_URL or psycopg is None:
        return None
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def read_geojson(filename):
    path = DATA_DIR / filename
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def feature_collection(features):
    return {"type": "FeatureCollection", "features": features}


def clone_feature(feature):
    return {
        "type": "Feature",
        "geometry": feature.get("geometry"),
        "properties": dict(feature.get("properties") or {}),
    }


def get_prop(feature, names):
    props = feature.get("properties") or {}
    for name in names:
        value = props.get(name)
        if value not in (None, ""):
            return value
    return None


def get_panchayat_name(feature):
    return get_prop(feature, ["Gram_Panch", "Gram_Panchayat", "GRAM_PANCH", "PANCHAYAT", "Panchayat", "panchayat"])


def normalize_key(value):
    return str(value or "").strip().lower()


def get_village_name(feature):
    return get_prop(feature, ["Village_Ve", "Village_Name", "Village", "VILLAGE", "NAME", "NAME_", "Village_Na"]) or "Village"


def feature_latlng(feature):
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coords, list) or len(coords) < 2:
        return None
    return coords[1], coords[0]


def haversine_km(lat1, lng1, lat2, lng2):
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def slim_village_feature(feature):
    props = feature.get("properties") or {}
    keep = [
        "Village_Ve",
        "Village_Name",
        "Village_Na",
        "Gram_Panch",
        "District_C",
        "Block_Code",
        "Sub_Distri",
    ]
    return {
        "type": "Feature",
        "geometry": feature.get("geometry"),
        "properties": {name: props.get(name) for name in keep if name in props},
    }


def load_panchayats_geojson():
    global _panchayats_cache
    if _panchayats_cache is None:
        _panchayats_cache = read_geojson("panchayats_from_villages.geojson")
    return _panchayats_cache


def load_asset_features():
    global _asset_features
    if _asset_features is None:
        _asset_features = read_geojson("assets/department_assets.geojson").get("features", [])
    return _asset_features


def load_village_indexes():
    global _villages_by_panchayat, _village_search_rows
    if _villages_by_panchayat is not None and _village_search_rows is not None:
        return _villages_by_panchayat, _village_search_rows

    villages_geojson = read_geojson("villages.geojson")
    by_panchayat = {}
    search_rows = []

    for raw_feature in villages_geojson.get("features", []):
        feature = slim_village_feature(raw_feature)
        panchayat_name = get_panchayat_name(feature) or "Unknown panchayat"
        village_name = get_village_name(feature)
        panchayat_key = normalize_key(panchayat_name)

        by_panchayat.setdefault(panchayat_key, []).append(feature)
        search_rows.append({
            "village": village_name,
            "panchayat": panchayat_name,
            "district": get_prop(feature, ["District_C"]) or "",
            "geometry": feature.get("geometry"),
            "search": normalize_key(f"{village_name} {panchayat_name} {get_prop(feature, ['District_C']) or ''}"),
        })

    for features in by_panchayat.values():
        features.sort(key=lambda feature: str(get_village_name(feature)))

    search_rows.sort(key=lambda row: (row["village"], row["panchayat"]))
    _villages_by_panchayat = by_panchayat
    _village_search_rows = search_rows
    return _villages_by_panchayat, _village_search_rows


def panchayat_center(panchayat_name):
    villages_by_panchayat, _ = load_village_indexes()
    features = villages_by_panchayat.get(normalize_key(panchayat_name), [])
    points = [feature_latlng(feature) for feature in features]
    points = [point for point in points if point]
    if not points:
        return None

    lat = sum(point[0] for point in points) / len(points)
    lng = sum(point[1] for point in points) / len(points)
    return lat, lng


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/js/<path:filename>")
def frontend_js(filename):
    return send_from_directory(FRONTEND_DIR / "js", filename)


@app.get("/api/health")
def health():
    village_count = None
    panchayat_count = None
    if not DATABASE_URL and _villages_by_panchayat is not None:
        panchayat_count = len(_villages_by_panchayat)
        village_count = len(_village_search_rows or [])

    return jsonify({
        "ok": True,
        "database": "postgis" if DATABASE_URL else "geojson-fallback",
        "cache_loaded": _villages_by_panchayat is not None,
        "panchayats": panchayat_count,
        "villages": village_count,
    })


@app.get("/api/panchayats")
def panchayats():
    connection = get_connection()
    if connection:
        with connection, connection.cursor() as cur:
            cur.execute(
                """
                SELECT jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(ST_Transform(wkb_geometry, 4326))::jsonb,
                    'properties', to_jsonb(panchayats) - 'wkb_geometry'
                ) AS feature
                FROM panchayats
                ORDER BY panchayat;
                """
            )
            return jsonify(feature_collection([row["feature"] for row in cur.fetchall()]))

    return jsonify(load_panchayats_geojson())


@app.get("/api/villages")
def villages():
    panchayat = request.args.get("panchayat", "").strip()
    if not panchayat:
        return jsonify({"error": "Missing required query parameter: panchayat"}), 400

    connection = get_connection()
    if connection:
        with connection, connection.cursor() as cur:
            cur.execute(
                """
                SELECT jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(ST_Transform(wkb_geometry, 4326))::jsonb,
                    'properties', to_jsonb(villages) - 'wkb_geometry'
                ) AS feature
                FROM villages
                WHERE lower(trim("Gram_Panch")) = lower(trim(%s))
                ORDER BY "Village_Ve";
                """,
                (panchayat,)
            )
            return jsonify(feature_collection([row["feature"] for row in cur.fetchall()]))

    villages_by_panchayat, _ = load_village_indexes()
    selected = villages_by_panchayat.get(normalize_key(panchayat), [])
    return jsonify(feature_collection(selected))


@app.get("/api/search-villages")
def search_villages():
    query = normalize_key(request.args.get("q", ""))
    if len(query) < 2:
        return jsonify([])

    connection = get_connection()
    if connection:
        with connection, connection.cursor() as cur:
            cur.execute(
                """
                SELECT
                    "Village_Ve" AS village,
                    "Gram_Panch" AS panchayat,
                    "District_C" AS district,
                    ST_AsGeoJSON(ST_Transform(wkb_geometry, 4326))::jsonb AS geometry
                FROM villages
                WHERE lower("Village_Ve") LIKE %s
                   OR lower("Gram_Panch") LIKE %s
                ORDER BY "Village_Ve"
                LIMIT 25;
                """,
                (f"%{query}%", f"%{query}%")
            )
            return jsonify(cur.fetchall())

    _, search_rows = load_village_indexes()
    matches = [
        {key: value for key, value in row.items() if key != "search"}
        for row in search_rows
        if query in row["search"]
    ]
    return jsonify(matches[:25])


@app.get("/api/assets")
def assets():
    panchayat = request.args.get("panchayat", "").strip()
    if not panchayat:
        return jsonify({"error": "Missing required query parameter: panchayat"}), 400

    category = normalize_key(request.args.get("category", ""))
    limit = min(max(int(request.args.get("limit", "40")), 1), 200)
    center = panchayat_center(panchayat)
    if not center:
        return jsonify(feature_collection([]))

    center_lat, center_lng = center
    matches = []

    for feature in load_asset_features():
        props = feature.get("properties") or {}
        asset_category = normalize_key(props.get("asset_category"))
        if category and asset_category != category:
            continue

        point = feature_latlng(feature)
        if not point:
            continue

        lat, lng = point
        same_panchayat = normalize_key(props.get("panchayat_name")) == normalize_key(panchayat)
        distance_km = haversine_km(center_lat, center_lng, lat, lng)

        if not same_panchayat and distance_km > 20:
            continue

        cloned = clone_feature(feature)
        cloned["properties"]["distance_km"] = round(distance_km, 2)
        cloned["properties"]["same_panchayat"] = same_panchayat
        matches.append(cloned)

    matches.sort(
        key=lambda feature: (
            0 if feature["properties"].get("same_panchayat") else 1,
            feature["properties"].get("distance_km", 999999),
            feature["properties"].get("asset_name", ""),
        )
    )
    return jsonify(feature_collection(matches[:limit]))


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=int(os.getenv("PORT", "5000")))
