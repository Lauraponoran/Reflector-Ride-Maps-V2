import csv
import json
import os
import sys

# Get input folder
if len(sys.argv) > 1:
    input_folder = sys.argv[1]
else:
    input_folder = input("Enter input folder path (leave empty for current folder): ").strip() or os.getcwd()

print(f"Using input folder: {input_folder}")

# Find all CSV files in the folder
csv_files = [f for f in os.listdir(input_folder) if f.lower().endswith(".csv")]

trips = {}

for csv_file in csv_files:
    # Get first 5 chars of the CSV filename (sensor ID)
    sensor_id = csv_file[:5]

    # Ask user for trip number
    while True:
        trip_num = input(f"Enter trip number for {csv_file} (sensor {sensor_id}): ").strip()
        if trip_num.isdigit():
            break
        print("Please enter a valid number.")

    # Build GeoJSON filename
    geojson_file = f"{sensor_id}_Trip{trip_num}.geojson"
    trips[csv_file] = geojson_file

print("\nPlanned conversions:")
for csv_file, geojson_file in trips.items():
    print(f"  {csv_file} -> {geojson_file}")

for csv_file, geojson_file in trips.items():
    input_path = os.path.join(input_folder, csv_file)
    output_path = os.path.join(input_folder, geojson_file)

    features = []
    coords = []
    last_lat, last_lon = None, None

    # Step 1: Read CSV with DictReader
    with open(input_path, newline='') as csvfile:
        reader = list(csv.DictReader(csvfile))

        # Collect coordinates (interpolate if missing)
        for row in reader:
            lat = row.get('latitude')
            lon = row.get('longitude')
            try:
                lat_float = float(lat)
                lon_float = float(lon)
                last_lat, last_lon = lat_float, lon_float
                coords.append((last_lat, last_lon))
            except (ValueError, TypeError):
                # Interpolate / reuse last coordinate
                if last_lat is not None and last_lon is not None:
                    coords.append((last_lat, last_lon))
                else:
                    coords.append(None)

        # Build LineString features
        for i in range(len(reader) - 1):
            row1, row2 = reader[i], reader[i + 1]
            coord1, coord2 = coords[i], coords[i + 1]

            if coord1 and coord2:
                # Keep all columns except latitude & longitude
                properties = {k: v for k, v in row1.items() if k not in ['latitude', 'longitude']}

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

    # Step 2: Extract bottom metadata manually
    metadata = {}
    with open(input_path) as f:
        lines = f.readlines()

    # Find last GPS line
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

    # Process remaining lines as metadata
    for line in lines[last_gps_line + 1:]:
        line = line.strip()
        if not line:
            continue
        if ':' in line:
            key, val = line.split(':', 1)
            metadata[key.strip()] = val.strip()
        else:
            metadata[line] = line

    # Add metadata as a single feature at the end
    if metadata:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": None},
            "properties": metadata
        })

    # Write GeoJSON
    geojson = {"type": "FeatureCollection", "features": features}
    with open(output_path, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"Processed {csv_file} -> {geojson_file}")