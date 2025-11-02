// app.js
import { CONFIG } from './config.js';

console.log('🚀 Starting bike visualization...');

mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: CONFIG.MAP_STYLE,
  center: CONFIG.MAP_CENTER,
  zoom: CONFIG.MAP_ZOOM
});

// Make map accessible for debugging
window.map = map;

let tripLayers = [];
let speedMode = 'gradient';
let showSpeedColors = false;
let selectedTrip = null;
let tripStatsCalculated = false;
let allTripData = {}; // Store complete data for each trip

// Default orange color for routes
const DEFAULT_COLOR = '#FF6600';

// Speed color functions
function getSpeedColorExpression(mode) {
  if (mode === 'gradient') {
    return [
      'interpolate',
      ['linear'],
      ['to-number', ['coalesce', ['get', 'Speed'], 0]],
      0, '#808080',   // Gray - stopped
      2, '#DC2626',   // Red - very slow
      5, '#F97316',   // Orange - slow
      10, '#FACC15',  // Yellow - moderate
      15, '#22C55E',  // Green - fast
      20, '#3B82F6',  // Blue - very fast
      25, '#6366F1'   // Indigo - extreme
    ];
  } else {
    return [
      'step',
      ['to-number', ['coalesce', ['get', 'Speed'], 0]],
      '#808080',  // Gray - stopped (0-2)
      2, '#DC2626',   // Red (2-5)
      5, '#F97316',   // Orange (5-10)
      10, '#FACC15',  // Yellow (10-15)
      15, '#22C55E',  // Green (15-20)
      20, '#3B82F6',  // Blue (20-25)
      25, '#6366F1'   // Indigo (25+)
    ];
  }
}

map.on('error', (e) => {
  console.error('❌ Map error:', e);
});

map.on('load', async () => {
  console.log('✅ Map loaded');
  
  try {
    console.log('📡 Loading bike trips from:', CONFIG.PMTILES_URL);
    
    // Setup PMTiles
    const protocol = new pmtiles.Protocol();
    mapboxgl.addProtocol('pmtiles', protocol.tile);
    
    const pmtilesUrl = `${window.location.origin}${CONFIG.PMTILES_URL}`;
    const p = new pmtiles.PMTiles(pmtilesUrl);
    protocol.add(p);
    
    // Get metadata
    const metadata = await p.getMetadata();
    console.log('✅ PMTiles loaded:', metadata);
    
    // Get layer names
    const layers = metadata.vector_layers || [];
    tripLayers = layers.map(l => l.id);
    
    console.log('📊 Found', tripLayers.length, 'trips');
    
    // Add source
    map.addSource('trips', {
      type: 'vector',
      url: `pmtiles://${pmtilesUrl}`,
      attribution: 'Bike sensor data'
    });
    
    // Add layer for each trip - all visible by default
    tripLayers.forEach(layerId => {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: 'trips',
        'source-layer': layerId,
        paint: {
          'line-color': DEFAULT_COLOR,
          'line-width': 3,
          'line-opacity': 0.7
        }
      });
    });

    console.log('✅ All trips loaded and visible');
    
    // Set initial view centered on Amsterdam
    map.setCenter([4.9041, 52.3676]); // Amsterdam coordinates
    map.setZoom(13); // Closer zoom level
    
    setupControls();
    setupClickHandlers();
    
    // Load complete trip data from all tiles
    loadAllTripData(p);

  } catch (err) {
    console.error('❌ Error loading trips:', err);
  }
});

function setupControls() {
  // Speed colors toggle
  const speedColorsCheckbox = document.getElementById('speedColorsCheckbox');
  if (!speedColorsCheckbox) {
    console.error('Missing speedColorsCheckbox element');
    return;
  }
  
  speedColorsCheckbox.addEventListener('change', (e) => {
    showSpeedColors = e.target.checked;
    console.log('Speed colors toggled:', showSpeedColors);
    const speedLegend = document.getElementById('speedLegend');
    const speedModeGroup = document.getElementById('speedModeGroup');
    
    if (showSpeedColors) {
      const colorExpression = getSpeedColorExpression(speedMode);
      console.log('Applying color expression:', colorExpression);
      tripLayers.forEach(layerId => {
        map.setPaintProperty(layerId, 'line-color', colorExpression);
      });
      speedLegend.style.display = 'block';
      speedModeGroup.style.display = 'block';
    } else {
      tripLayers.forEach(layerId => {
        map.setPaintProperty(layerId, 'line-color', DEFAULT_COLOR);
      });
      speedLegend.style.display = 'none';
      speedModeGroup.style.display = 'none';
    }
  });

  // Speed mode radio buttons
  document.querySelectorAll('input[name="speedMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      speedMode = e.target.value;
      if (showSpeedColors) {
        tripLayers.forEach(layerId => {
          map.setPaintProperty(layerId, 'line-color', getSpeedColorExpression(speedMode));
        });
      }
    });
  });
}

function setupClickHandlers() {

  // Click handlers for trip layers - highlight on click
  tripLayers.forEach(layerId => {
    map.on('click', layerId, async (e) => {
      console.log('Layer clicked:', layerId);
      e.preventDefault();
      if (e.originalEvent) {
        e.originalEvent.stopPropagation();
      }
      
      const props = e.features[0].properties;
      const speed = props.Speed || 0;
      
      // Set selected trip and fade others
      selectedTrip = layerId;
      tripLayers.forEach(id => {
        try {
          if (id === layerId) {
            map.setPaintProperty(id, 'line-opacity', 1.0);
            map.setPaintProperty(id, 'line-width', 4);
            console.log('Highlighted:', id);
          } else {
            map.setPaintProperty(id, 'line-opacity', 0.15);
            map.setPaintProperty(id, 'line-width', 2);
            console.log('Faded:', id);
          }
        } catch (err) {
          console.error('Error updating layer:', id, err);
        }
      });
      
      // Update stats
      document.getElementById('selectedTripRow').style.display = 'flex';
      const tripName = layerId.replace(/_/g, ' ').replace(/processed/gi, '').trim();
      document.getElementById('selectedTrip').textContent = tripName;
      
      // Use pre-calculated trip data if available
      let totalDistance = 0;
      let totalTime = 0;
      
      if (allTripData[layerId]) {
        totalDistance = allTripData[layerId].distance;
        totalTime = allTripData[layerId].time;
        console.log(`Using cached data for ${layerId}: ${totalDistance}m, ${totalTime}s`);
      } else {
        // Fallback to querying rendered features
        const features = map.queryRenderedFeatures({ layers: [layerId] });
        features.forEach(feature => {
          totalDistance += feature.properties.gps_distance_m || 0;
          totalTime += feature.properties.time_diff_s || 0;
        });
        console.log(`Queried ${features.length} features for ${layerId}`);
      }
      
      // Calculate stats
      const distanceKm = (totalDistance / 1000).toFixed(2);
      const avgSpeed = totalTime > 0 ? ((totalDistance / 1000) / (totalTime / 3600)).toFixed(1) : 0;
      
      const durationMinutes = Math.floor(totalTime / 60);
      const durationSeconds = Math.round(totalTime % 60);
      const durationFormatted = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
      
      // Show popup
      const popupTripName = layerId.replace(/_/g, ' ').replace(/processed/gi, '').trim();
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
          <strong>${popupTripName}</strong><br>
          🚴 Speed at point: ${speed} km/h<br>
          📊 Average speed: ${avgSpeed} km/h<br>
          📍 Total distance: ${distanceKm} km<br>
          ⏱️ Duration: ${durationFormatted}
        `)
        .addTo(map);
    });

    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  });
  
  // Click map background to reset
  map.on('click', (e) => {
    console.log('Map background clicked, defaultPrevented:', e.defaultPrevented);
    if (!e.defaultPrevented && selectedTrip) {
      console.log('Resetting from background click');
      selectedTrip = null;
      tripLayers.forEach(layerId => {
        try {
          map.setPaintProperty(layerId, 'line-opacity', 0.7);
          map.setPaintProperty(layerId, 'line-width', 3);
        } catch (err) {
          console.error('Error resetting layer:', layerId, err);
        }
      });
      document.getElementById('selectedTripRow').style.display = 'none';
    }
  });
}

async function loadAllTripData(pmtiles) {
  console.log('Loading all trip data from PMTiles...');
  
  // PMTiles doesn't have a direct way to get all features
  // So we'll calculate on demand when zoomed out
  // For now, just set trip count
  document.getElementById('statTrips').textContent = tripLayers.length;
  
  // Try to calculate by zooming way out
  const originalCenter = map.getCenter();
  const originalZoom = map.getZoom();
  
  // Get bounds from header
  try {
    const header = await pmtiles.getHeader();
    const center = [(header.minLon + header.maxLon) / 2, (header.minLat + header.maxLat) / 2];
    
    map.jumpTo({ center, zoom: 10 });
    
    setTimeout(() => {
      console.log('Calculating stats from zoomed out view...');
      let totalDistance = 0;
      let totalTime = 0;
      
      tripLayers.forEach(layerId => {
        const features = map.queryRenderedFeatures({ layers: [layerId] });
        
        let tripDistance = 0;
        let tripTime = 0;
        
        features.forEach(feature => {
          tripDistance += feature.properties.gps_distance_m || 0;
          tripTime += feature.properties.time_diff_s || 0;
        });
        
        // Store this trip's data
        allTripData[layerId] = { distance: tripDistance, time: tripTime };
        totalDistance += tripDistance;
        totalTime += tripTime;
        
        console.log(`${layerId}: ${tripDistance.toFixed(0)}m, ${tripTime.toFixed(0)}s`);
      });
      
      console.log(`Total: ${totalDistance.toFixed(0)}m, ${totalTime.toFixed(0)}s`);
      
      // Update stats
      const totalDistanceKm = (totalDistance / 1000).toFixed(1);
      const avgSpeed = totalTime > 0 ? ((totalDistance / 1000) / (totalTime / 3600)).toFixed(1) : 0;
      
      const totalHours = Math.floor(totalTime / 3600);
      const totalMinutes = Math.floor((totalTime % 3600) / 60);
      const totalTimeFormatted = totalHours > 0 
        ? `${totalHours}h ${totalMinutes}m` 
        : `${totalMinutes}m`;
      
      document.getElementById('statDistance').textContent = `${totalDistanceKm} km`;
      document.getElementById('statAvgSpeed').textContent = `${avgSpeed} km/h`;
      document.getElementById('statTotalTime').textContent = totalTimeFormatted;
      
      // Return to original view
      map.jumpTo({ center: originalCenter, zoom: originalZoom });
    }, 1500);
    
  } catch (err) {
    console.error('Error loading trip data:', err);
    document.getElementById('statTrips').textContent = tripLayers.length;
  }
}

function calculateAllTripStats() {
  console.log('Calculating stats for all trips...');
  
  let totalDistance = 0;
  let totalTime = 0;
  let tripCount = 0;
  
  // Pan around to load all tiles, then calculate
  const originalCenter = map.getCenter();
  const originalZoom = map.getZoom();
  
  // Zoom out to load more tiles
  map.setZoom(11);
  
  setTimeout(() => {
    tripLayers.forEach(layerId => {
      const features = map.queryRenderedFeatures({ layers: [layerId] });
      
      let tripDistance = 0;
      let tripTime = 0;
      
      features.forEach(feature => {
        tripDistance += feature.properties.gps_distance_m || 0;
        tripTime += feature.properties.time_diff_s || 0;
      });
      
      if (tripDistance > 0 || tripTime > 0) {
        totalDistance += tripDistance;
        totalTime += tripTime;
        tripCount++;
        console.log(`${layerId}: ${tripDistance}m, ${tripTime}s`);
      }
    });
    
    console.log(`Total: ${tripCount} trips, ${totalDistance}m, ${totalTime}s`);
    
    // Update the UI - this won't change after initial calculation
    const totalDistanceKm = (totalDistance / 1000).toFixed(1);
    const avgSpeed = totalTime > 0 ? ((totalDistance / 1000) / (totalTime / 3600)).toFixed(1) : 0;
    
    const totalHours = Math.floor(totalTime / 3600);
    const totalMinutes = Math.floor((totalTime % 3600) / 60);
    const totalTimeFormatted = totalHours > 0 
      ? `${totalHours}h ${totalMinutes}m` 
      : `${totalMinutes}m`;
    
    document.getElementById('statTrips').textContent = tripLayers.length;
    document.getElementById('statDistance').textContent = `${totalDistanceKm} km`;
    document.getElementById('statAvgSpeed').textContent = `${avgSpeed} km/h`;
    document.getElementById('statTotalTime').textContent = totalTimeFormatted;
    
    // Restore original view
    map.setCenter(originalCenter);
    map.setZoom(originalZoom);
    
    tripStatsCalculated = true;
  }, 1000);
}

function updateStats() {
  // This function is no longer needed since stats are calculated once
  document.getElementById('statTrips').textContent = tripLayers.length;
}