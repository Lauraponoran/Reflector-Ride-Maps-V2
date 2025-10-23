import json
import math
import os
from pathlib import Path
from datetime import datetime, timedelta

WHEEL_DIAMETER_MM = 660  # 26 inches
WHEEL_CIRCUMFERENCE_M = (WHEEL_DIAMETER_MM / 1000) * math.pi  # ~2.073 meters
SAMPLE_RATE_HZ = 50
SECONDS_PER_SAMPLE = 1 / SAMPLE_RATE_HZ  # 0.02 seconds

def parse_time(time_str, milliseconds):
    """Parse HH:mm:ss and SSS into datetime"""
    if not time_str or not milliseconds:
        return None
    try:
        base_time = datetime.strptime(str(time_str), "%H:%M:%S")
        return base_time + timedelta(milliseconds=int(milliseconds))
    except:
        return None

def calculate_speed_from_rotations(hrot_diff, sample_diff):
    """Calculate speed from wheel rotation count difference"""
    if sample_diff <= 0:
        return 0
    
    revolutions = hrot_diff / 2.0
    distance_m = revolutions * WHEEL_CIRCUMFERENCE_M
    time_s = sample_diff * SECONDS_PER_SAMPLE
    
    if time_s > 0:
        speed_ms = distance_m / time_s
        speed_kmh = speed_ms * 3.6
        return speed_kmh
    
    return 0

def haversine_distance(lon1, lat1, lon2, lat2):
    """Calculate distance between two points in meters"""
    if not all([lon1, lat1, lon2, lat2]):
        return 0
    
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2)**2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def safe_int(value, default=0):
    """Safely convert value to int"""
    if value is None or value == '':
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        # If it's a datetime string, try to parse it
        try:
            # Handle datetime string format
            if isinstance(value, str) and '-' in value:
                dt = datetime.fromisoformat(value.strip())
                return int(dt.timestamp() * 1000)  # Convert to milliseconds
            return default
        except:
            return default

def process_geojson_file(filepath, debug=False):
    """Process a single GeoJSON file"""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        if 'features' not in data:
            return None
        
        features = data['features']
        if not features:
            return None
        
        # Debug: print first feature to see structure
        if debug and features:
            print(f"\n  DEBUG - First feature properties:")
            for key, value in features[0]['properties'].items():
                print(f"    {key}: {value} (type: {type(value).__name__})")
        
        # Extract points first (don't sort yet)
        points = []
        for idx, feature in enumerate(features):
            coords = feature['geometry']['coordinates']
            props = feature['properties']
            
            if len(coords) >= 2:
                lon, lat = coords[-1]
            else:
                continue
            
            if not lon or not lat or lon == 0 or lat == 0:
                continue
            
            # Handle Samples field - could be int or datetime string
            samples_value = props.get('Samples', 0)
            samples_int = safe_int(samples_value, idx)
            
            points.append({
                'lon': float(lon),
                'lat': float(lat),
                'marker': safe_int(props.get('marker', 0)),
                'samples': samples_int,
                'samples_raw': samples_value,  # Keep raw value for debugging
                'hrot': safe_int(props.get('HRot Count', 0)),
                'time': parse_time(props.get('HH:mm:ss'), props.get('SSS')),
                'time_str': props.get('HH:mm:ss'),
                'time_ms': props.get('SSS'),
                'original_speed': props.get('Speed'),
                'idx': idx  # Keep original order
            })
        
        # Sort by samples value (which could be timestamp or sample number)
        points.sort(key=lambda p: p['samples'])
        
        if debug and len(points) >= 2:
            print(f"\n  DEBUG - First two points for time calculation:")
            for i, p in enumerate(points[:2]):
                print(f"    Point {i}: samples_raw={p['samples_raw']}, samples={p['samples']}, time={p['time']}, hrot={p['hrot']}")
        
        
        
        
        if len(points) < 2:
            return None
        
        # Calculate speeds between consecutive points WITH MOVEMENT
        # We need to find segments where HRot actually changes
        new_features = []
        
        i = 0
        while i < len(points) - 1:
            start_point = points[i]
            
            # Find next point where HRot has changed (actual wheel movement)
            j = i + 1
            while j < len(points) and points[j]['hrot'] == start_point['hrot']:
                j += 1
            
            if j >= len(points):
                break
            
            end_point = points[j]
            
            # Calculate sample difference and time
            sample_diff = end_point['samples'] - start_point['samples']
            time_diff_seconds = sample_diff * SECONDS_PER_SAMPLE
            
            # Calculate speed from wheel rotations
            hrot_diff = end_point['hrot'] - start_point['hrot']
            
            if hrot_diff > 0 and time_diff_seconds > 0:
                revolutions = hrot_diff / 2.0
                distance_m = revolutions * WHEEL_CIRCUMFERENCE_M
                speed_ms = distance_m / time_diff_seconds
                speed_kmh = speed_ms * 3.6
            else:
                speed_kmh = 0
            
            gps_distance = haversine_distance(
                start_point['lon'], start_point['lat'], 
                end_point['lon'], end_point['lat']
            )
            
            if debug and len(new_features) < 3:
                print(f"  DEBUG - Speed calc for segment {len(new_features)}:")
                print(f"    Points {i} to {j} (skipped {j-i-1} stationary points)")
                print(f"    sample_diff={sample_diff}, time_diff_s={time_diff_seconds:.3f}")
                print(f"    hrot_diff={hrot_diff}, revolutions={hrot_diff/2:.1f}")
                print(f"    distance_m={distance_m if hrot_diff > 0 else 0:.2f}, speed_kmh={speed_kmh:.1f}")
                print(f"    gps_distance_m={gps_distance:.1f}")
            
            
            # Only create segments with different coordinates and reasonable speeds
            # Cap speed at 50 km/h for bikes (anything higher is likely a data error)
            if speed_kmh > 50:
                speed_kmh = 50
            
            if (start_point['lon'] != end_point['lon'] or start_point['lat'] != end_point['lat']) and speed_kmh < 100:
                new_feature = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [
                            [start_point['lon'], start_point['lat']],
                            [end_point['lon'], end_point['lat']]
                        ]
                    },
                    'properties': {
                        'Speed': round(speed_kmh, 1),
                        'marker': start_point['marker'],
                        'hrot_diff': hrot_diff,
                        'sample_diff': sample_diff,
                        'time_diff_s': round(time_diff_seconds, 3),
                        'gps_distance_m': round(gps_distance, 1),
                        'original_speed': start_point['original_speed']
                    }
                }
                new_features.append(new_feature)
            
            # Move to the next point after the one we just processed
            i = j
        
        if not new_features:
            return None
        
        return {
            'type': 'FeatureCollection',
            'features': new_features
        }
    
    except Exception as e:
        import traceback
        print(f"  ⚠️  Error processing {filepath.name}: {e}")
        if debug:
            print(f"  Traceback: {traceback.format_exc()}")
        return None

def process_all_geojson_files(sensor_data_dir, output_dir):
    """Process all GeoJSON files in sensor data directory structure"""
    
    sensor_data_path = Path(sensor_data_dir)
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    if not sensor_data_path.exists():
        print(f"❌ Directory not found: {sensor_data_dir}")
        return
    
    # Find all sensor subdirectories
    sensor_dirs = [d for d in sensor_data_path.iterdir() if d.is_dir()]
    
    if not sensor_dirs:
        print(f"❌ No sensor subdirectories found in {sensor_data_dir}")
        return
    
    print(f"📂 Found {len(sensor_dirs)} sensor directories")
    print(f"📂 Output directory: {output_path}\n")
    
    total_files = 0
    processed_files = 0
    failed_files = 0
    total_segments = 0
    
    for sensor_dir in sorted(sensor_dirs):
        sensor_id = sensor_dir.name
        print(f"Processing sensor {sensor_id}...")
        
        # Create output subdirectory for this sensor
        sensor_output_dir = output_path / sensor_id
        sensor_output_dir.mkdir(exist_ok=True)
        
        # Find all GeoJSON files in this sensor directory
        geojson_files = list(sensor_dir.glob("*.geojson"))
        total_files += len(geojson_files)
        
        sensor_segments = 0
        sensor_processed = 0
        
        for idx, geojson_file in enumerate(geojson_files):
            # Enable debug for first file only
            debug = (idx == 0)
            processed_data = process_geojson_file(geojson_file, debug=debug)
            
            if processed_data:
                # Save processed file
                output_file = sensor_output_dir / geojson_file.name
                with open(output_file, 'w') as f:
                    json.dump(processed_data, f)
                
                num_segments = len(processed_data['features'])
                sensor_segments += num_segments
                sensor_processed += 1
                processed_files += 1
            else:
                failed_files += 1
        
        total_segments += sensor_segments
        print(f"  ✅ {sensor_processed}/{len(geojson_files)} files processed, {sensor_segments} segments created\n")
    
    print("=" * 60)
    print(f"✅ Processing complete!")
    print(f"   Total files found: {total_files}")
    print(f"   Successfully processed: {processed_files}")
    print(f"   Failed/skipped: {failed_files}")
    print(f"   Total segments created: {total_segments}")
    print(f"   Output saved to: {output_path}")
    
    # Calculate statistics from all processed files
    all_speeds = []
    for processed_file in output_path.rglob("*.geojson"):
        try:
            with open(processed_file, 'r') as f:
                data = json.load(f)
                speeds = [f['properties']['Speed'] for f in data['features'] 
                         if f['properties']['Speed'] > 0]
                all_speeds.extend(speeds)
        except:
            pass
    
    if all_speeds:
        print(f"\n📊 Speed statistics (excluding stopped):")
        print(f"   Min: {min(all_speeds):.1f} km/h")
        print(f"   Max: {max(all_speeds):.1f} km/h")
        print(f"   Average: {sum(all_speeds)/len(all_speeds):.1f} km/h")
        print(f"   Median: {sorted(all_speeds)[len(all_speeds)//2]:.1f} km/h")

if __name__ == "__main__":
    import sys
    
    # Default paths (relative to script location)
    default_input = "sensor_data"
    default_output = "processed_sensor_data"
    
    if len(sys.argv) >= 2:
        input_dir = sys.argv[1]
    else:
        input_dir = default_input
    
    if len(sys.argv) >= 3:
        output_dir = sys.argv[2]
    else:
        output_dir = default_output
    
    print("🚴 Batch Processing Bike Trip Data")
    print("=" * 60)
    
    process_all_geojson_files(input_dir, output_dir)