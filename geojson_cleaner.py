import json
import os
from pathlib import Path

INPUT_ROOT = "sensor_data"
OUTPUT_ROOT = "cleaned_output"

# Skips
SKIP_TRIPS = {
    "602CD": ["Trip1"],
    "604F0": ["Trip1"]
}

def split_geojson(input_file, trip_id, output_dir=OUTPUT_ROOT):
    os.makedirs(output_dir, exist_ok=True)

    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = []
    metadata = {}

    for feat in data.get("features", []):
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", None)

        if coords is None:
            metadata[trip_id] = feat.get("properties", {})
        else:
            feat["properties"]["trip_id"] = trip_id
            features.append(feat)

    cleaned = {"type": "FeatureCollection", "features": features}
    with open(os.path.join(output_dir, f"{trip_id}_clean.geojson"), "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    meta_file = os.path.join(output_dir, "trips_metadata.json")
    if os.path.exists(meta_file):
        with open(meta_file, "r", encoding="utf-8") as f:
            all_meta = json.load(f)
    else:
        all_meta = {}

    all_meta[trip_id] = metadata.get(trip_id, {})

    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(all_meta, f, indent=2)

    print(f"✅ Processed {trip_id}: {len(features)} features, metadata saved.")

def main():
    for folder in os.listdir(INPUT_ROOT):
        folder_path = os.path.join(INPUT_ROOT, folder)
        if not os.path.isdir(folder_path):
            continue

        for file in os.listdir(folder_path):
            if not file.endswith(".geojson"):
                continue
            serial, trip = file.replace(".geojson", "").split("_")

            # Skip unwanted trips
            if serial in SKIP_TRIPS and trip in SKIP_TRIPS[serial]:
                print(f"⏩ Skipping {serial}_{trip}")
                continue

            trip_id = f"{serial}_{trip}"
            input_file = os.path.join(folder_path, file)
            split_geojson(input_file, trip_id)

if __name__ == "__main__":
    main()
