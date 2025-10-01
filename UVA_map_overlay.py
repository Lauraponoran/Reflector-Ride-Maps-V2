import folium
import glob
import os
import geopandas as gpd

# Center map on Amsterdam
m = folium.Map(location=[52.37, 4.89], zoom_start=13, tiles=None)
folium.TileLayer("CartoDB dark_matter").add_to(m)

# List of sensor folders
sensor_folders = glob.glob("sensor_data/*/")

# Simplification tolerance (adjust for more/less detail)
simplify_tolerance = 0.00005  # ~5 meters

# Color palette for sensors
colors = ["red", "blue", "green", "orange", "purple", "yellow"]
color_idx = 0

for folder in sensor_folders:
    geojson_files = glob.glob(os.path.join(folder, "*.geojson"))
    
    for file in geojson_files:
        print(f"Processing {file} ...")
        
        # Read GeoJSON
        gdf = gpd.read_file(file)
        
        # Simplify geometry in memory
        gdf["geometry"] = gdf["geometry"].simplify(tolerance=simplify_tolerance, preserve_topology=True)
        
        # Add to map directly from GeoDataFrame (no file saved)
        folium.GeoJson(
            gdf.__geo_interface__,
            name=os.path.basename(file),
            style_function=lambda feature, c=colors[color_idx % len(colors)]: {
                "color": c,
                "weight": 2,
                "opacity": 0.8,
            }
        ).add_to(m)
    
    color_idx += 1

# Add layer control
folium.LayerControl().add_to(m)

# Save final map
m.save("UVA_overlay_map.html")
print("✅ Map saved as UVA_overlay_map.html (simplified in memory).")