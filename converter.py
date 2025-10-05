import csv
import json
import os
from pathlib import Path
import re

INPUT_ROOT = "csv_data"
OUTPUT_ROOT = "cleaned_output"

def get_next_trip_number(sensor_id_folder):
    """Find the next available trip number for a sensor folder."""
    if not os.path.exists(sensor_id_folder):
        return 1
    existing = [
        int(m.group(1))
        for f in os.listdir(sensor_id_folder)
        if (m := re.match(r".*_Trip(\d+)_clean\.geojson", f))
    ]
    return max(existing, default=0) + 1

def process_csv(input_path, sensor_id, trip_num):
    features = []
    coords = []
    last_lat, last_lon = None, None

    # Step 1: read CSV
    with open(input_path, newline='') as csvfile:
        reader = list(csv.DictReader(csvfile))

        # Collect coordinates
        for row in reader:
            lat = row.get('latitude')
            lon = row.get('longitude')
            try:
                lat_f = float(lat)
                lon_f = float(lon)
                last_lat, last_lon = lat_f, lon_f
                coords.append((last_lat, last_lon))
            except (ValueError, TypeError):
                if last_lat is not None and last_lon is not None:
                    coords.append((last_lat, last_lon))
                else:
                    coords.append(None)

        # Build LineString features
        for i in range(len(reader) - 1):
            row1, row2 = reader[i], reader[i + 1]
            coord1, coord2 = coords[i], coords[i + 1]
            if coord1 and coord2:
                properties = {k: v for k, v in row1.items() if k not in ['latitude', 'longitude']}
                properties["trip_id"] = f"{sensor_id}_Trip{trip_num}"
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [coord1[1], coord1[0]],
                            [coord2[1], coord2[0]]
                        ]
                    },
                    "properties": properties
                }
                features.append(feature)

    # Step 2: extract metadata (lines after last valid GPS row)
    metadata = {}
    with open(input_path, "r") as f:
        lines = f.readlines()

    last_gps_line = 0
    for i, line in enumerate(lines):
        parts = line.strip().split(',')
        if len(parts) >= 2:
            try:
                float(parts[0])
                float(parts[1])
                last_gps_line = i
            except ValueError:
                continue

    for line in lines[last_gps_line + 1:]:
        line = line.strip()
        if not line:
            continue
        if ':' in line:
            key, val = line.split(':', 1)
            metadata[key.strip()] = val.strip()
        else:
            metadata[line] = line

    return features, metadata

def main():
    os.makedirs(OUTPUT_ROOT, exist_ok=True)

    metadata_index_file = os.path.join(OUTPUT_ROOT, "trips_metadata.json")
    if os.path.exists(metadata_index_file):
        with open(metadata_index_file, "r", encoding="utf-8") as f:
            all_metadata = json.load(f)
    else:
        all_metadata = {}

    for folder in os.listdir(INPUT_ROOT):
        folder_path = os.path.join(INPUT_ROOT, folder)
        if not os.path.isdir(folder_path):
            continue

        for file in os.listdir(folder_path):
            if not file.lower().endswith(".csv"):
                continue

            sensor_id = file[:5]
            input_file = os.path.join(folder_path, file)

            # Create sensor-specific output folder
            sensor_output = os.path.join(OUTPUT_ROOT, sensor_id)
            os.makedirs(sensor_output, exist_ok=True)

            # Determine next trip number
            trip_num = get_next_trip_number(sensor_output)
            trip_id = f"{sensor_id}_Trip{trip_num}"

            # Process
            features, metadata = process_csv(input_file, sensor_id, trip_num)

            # Save GeoJSON
            geojson = {"type": "FeatureCollection", "features": features}
            out_geojson = os.path.join(sensor_output, f"{trip_id}_clean.geojson")
            with open(out_geojson, "w", encoding="utf-8") as f:
                json.dump(geojson, f, indent=2)

            # Update metadata index
            all_metadata[trip_id] = metadata
            with open(metadata_index_file, "w", encoding="utf-8") as f:
                json.dump(all_metadata, f, indent=2)

            print(f"✅ {file} → {trip_id}_clean.geojson (Trip #{trip_num})")

if __name__ == "__main__":
    main()