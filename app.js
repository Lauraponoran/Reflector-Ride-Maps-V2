// app.js
import { CONFIG } from './config.js';

console.log('🚀 Starting bike sensor visualization...');
console.log('Config:', CONFIG);

// Check if Mapbox token is set
if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN_HERE') {
  alert('⚠️ Please set your Mapbox token in config.js!');
  console.error('Mapbox token not configured');
}

mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: CONFIG.MAP_STYLE,
  center: CONFIG.MAP_CENTER,
  zoom: CONFIG.MAP_ZOOM
});

let tripLayers = [];
let speedMode = 'gradient';

// Add error handler for map
map.on('error', (e) => {
  console.error('❌ Map error:', e);
});

// Add load confirmation
map.on('load', () => {
  console.log('✅ Base map loaded successfully');
});

// Speed color functions
function getSpeedColorExpression(mode) {
  if (mode === 'gradient') {
    return [
      'interpolate',
      ['linear'],
      ['to-number', ['coalesce', ['get', 'Speed'], 0]],
      0, '#808080',    // Gray for stopped
      2, '#DC2626',    // Red for very slow
      5, '#F97316',    // Orange
      8, '#FACC15',    // Yellow
      12, '#BEF264',   // Light green
      16, '#4ADE80',   // Green
      20, '#22C55E',   // Dark green
      25, '#059669'    // Very dark green
    ];
  } else {
    return [
      'step',
      ['to-number', ['coalesce', ['get', 'Speed'], 0]],
      '#808080',  // Gray for stopped (0)
      2, '#DC2626',   // Red (2-5)
      5, '#F97316',   // Orange (5-10)
      10, '#FACC15',  // Yellow (10-15)
      15, '#BEF264',  // Light green (15-20)
      20, '#4ADE80',  // Green (20-25)
      25, '#22C55E',  // Dark green (25-30)
      30, '#059669'   // Very dark green (30+)
    ];
  }
}

function getAggregatedSpeedColorExpression(mode) {
  if (mode === 'gradient') {
    return [
      'interpolate',
      ['linear'],
      ['to-number', ['coalesce', ['get', 'avg_speed'], 0]],
      0, '#DC2626',
      5, '#F97316',
      8, '#FB923C',
      12, '#FACC15',
      16, '#BEF264',
      20, '#4ADE80',
      25, '#22C55E',
      30, '#059669'
    ];
  } else {
    return [
      'step',
      ['to-number', ['coalesce', ['get', 'avg_speed'], 0]],
      '#DC2626',
      5, '#F97316',
      10, '#FACC15',
      15, '#BEF264',
      20, '#4ADE80',
      25, '#22C55E',
      30, '#059669'
    ];
  }
}

map.on('load', async () => {
  console.log('✅ Base map loaded, now loading data...');
  
  // Load trips from PMTiles
  try {
    console.log('📡 Loading PMTiles from:', CONFIG.PMTILES_URL);
    
    // PMTiles v2 syntax - simpler approach
    const protocol = new pmtiles.Protocol();
    mapboxgl.addProtocol('pmtiles', protocol.tile);
    
    // Create PMTiles instance with full URL
    const pmtilesUrl = `${window.location.origin}${CONFIG.PMTILES_URL}`;
    const p = new pmtiles.PMTiles(pmtilesUrl);
    protocol.add(p);
    
    // Get metadata to find layer names
    const header = await p.getHeader();
    const metadata = await p.getMetadata();
    
    console.log('✅ PMTiles metadata:', metadata);
    
    // Get layer names from metadata
    const layers = metadata.vector_layers || [];
    tripLayers = layers.map(l => l.id);
    
    console.log('📊 Found', tripLayers.length, 'trip layers:', tripLayers);
    
    // Add PMTiles source using the custom protocol
    map.addSource('trips', {
      type: 'vector',
      url: `pmtiles://${pmtilesUrl}`,
      attribution: 'Bike sensor data'
    });
    
    // Add a layer for each trip in the PMTiles
    tripLayers.forEach(layerId => {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: 'trips',
        'source-layer': layerId,
        paint: {
          'line-color': '#FF6600',
          'line-width': 2,
          'line-opacity': 0.4
        }
      });
    });

    console.log('✅ Loaded', tripLayers.length, 'trip layers');
    
    // Populate trip filter dropdown
    const tripFilter = document.getElementById('tripFilter');
    tripLayers.forEach(layerId => {
      const option = document.createElement('option');
      option.value = layerId;
      option.textContent = layerId.replace(/_/g, ' ');
      tripFilter.appendChild(option);
    });
    
    setupTripControls();
    updateStats();

  } catch (err) {
    console.error('❌ Error loading trips:', err);
    console.error('Full error:', err.stack);
  }
  
  // Load aggregated routes
  try {
    console.log('📡 Fetching aggregated routes from:', CONFIG.AGGREGATED_ROUTES_URL);
    
    const response = await fetch(CONFIG.AGGREGATED_ROUTES_URL);
    const aggregatedData = await response.json();
    
    console.log('✅ Aggregated data loaded:', aggregatedData.features.length, 'features');
    
    map.addSource('aggregated-routes', {
      type: 'geojson',
      data: aggregatedData
    });
    
    map.addLayer({
      id: 'aggregated-routes-layer',
      type: 'line',
      source: 'aggregated-routes',
      paint: {
        'line-color': getAggregatedSpeedColorExpression('gradient'),
        'line-width': 4,
        'line-opacity': 0.8
      },
      layout: {
        'visibility': 'none'
      }
    });
    
    console.log('✅ Aggregated routes layer added');
    setupAggregatedControls();
    
  } catch (err) {
    console.error('❌ Error loading aggregated routes:', err);
  }
});

function setupTripControls() {
  // Trip filter dropdown
  document.getElementById('tripFilter').addEventListener('change', (e) => {
    const selectedTrip = e.target.value;
    
    tripLayers.forEach(layerId => {
      if (selectedTrip === 'all') {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
        map.setPaintProperty(layerId, 'line-opacity', 0.4);
      } else if (layerId === selectedTrip) {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
        map.setPaintProperty(layerId, 'line-opacity', 0.9);
      } else {
        map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    });
    updateStats();
  });
  
  // Main trips toggle
  document.getElementById('tripsCheckbox').addEventListener('change', (e) => {
    const visibility = e.target.checked ? 'visible' : 'none';
    const selectedTrip = document.getElementById('tripFilter').value;
    
    tripLayers.forEach(layerId => {
      if (selectedTrip === 'all' || layerId === selectedTrip) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  });

  // Speed segments toggle
  document.getElementById('speedSegmentsCheckbox').addEventListener('change', (e) => {
    const speedLegend = document.getElementById('speedLegend');
    
    if (e.target.checked) {
      tripLayers.forEach(layerId => {
        map.setPaintProperty(layerId, 'line-color', getSpeedColorExpression(speedMode));
        map.setPaintProperty(layerId, 'line-width', 3);
      });
      speedLegend.style.display = 'block';
    } else {
      tripLayers.forEach(layerId => {
        map.setPaintProperty(layerId, 'line-color', '#FF6600');
        map.setPaintProperty(layerId, 'line-width', 2);
      });
      speedLegend.style.display = 'none';
    }
  });

  // Speed mode radio buttons
  document.querySelectorAll('input[name="speedMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      speedMode = e.target.value;
      if (document.getElementById('speedSegmentsCheckbox').checked) {
        tripLayers.forEach(layerId => {
          map.setPaintProperty(layerId, 'line-color', getSpeedColorExpression(speedMode));
        });
      }
      if (document.getElementById('aggregatedCheckbox').checked) {
        map.setPaintProperty('aggregated-routes-layer', 'line-color', getAggregatedSpeedColorExpression(speedMode));
      }
    });
  });

  // Add click handler for trip layers
  tripLayers.forEach(layerId => {
    map.on('click', layerId, (e) => {
      const props = e.features[0].properties;
      const speed = props.Speed || 0;
      
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
          <strong>Trip: ${layerId}</strong><br>
          🚴 Speed: ${speed} km/h<br>
          📍 Distance: ${props.distance_m || props.gps_distance_m || 'N/A'} m<br>
          ⏱️ Time diff: ${props.time_diff_s || 'N/A'} s<br>
          🔧 HRot diff: ${props.hrot_diff || 'N/A'}<br>
          📊 Sample diff: ${props.sample_diff || 'N/A'}
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
}

function setupAggregatedControls() {
  // Aggregated routes toggle
  document.getElementById('aggregatedCheckbox').addEventListener('change', (e) => {
    const visibility = e.target.checked ? 'visible' : 'none';
    map.setLayoutProperty('aggregated-routes-layer', 'visibility', visibility);
    
    if (e.target.checked) {
      const currentMode = document.querySelector('input[name="speedMode"]:checked').value;
      map.setPaintProperty('aggregated-routes-layer', 'line-color', getAggregatedSpeedColorExpression(currentMode));
      document.getElementById('speedLegend').style.display = 'block';
    }
  });
  
  // Min samples filter
  document.getElementById('minSamplesSlider').addEventListener('input', (e) => {
    const minSamples = parseInt(e.target.value);
    document.getElementById('minSamplesValue').textContent = minSamples;
    
    const filter = ['>=', ['get', 'sample_count'], minSamples];
    map.setFilter('aggregated-routes-layer', filter);
  });
  
  // Click handler for aggregated routes
  map.on('click', 'aggregated-routes-layer', (e) => {
    const props = e.features[0].properties;
    
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <strong>Aggregated Route Segment</strong><br>
        🚴 Avg Speed: ${props.avg_speed} km/h<br>
        📊 Samples: ${props.sample_count} trips<br>
        📈 Range: ${props.min_speed} - ${props.max_speed} km/h<br>
        📍 Median: ${props.median_speed} km/h<br>
        📉 Variance: ${props.speed_variance} km/h
      `)
      .addTo(map);
  });
  
  map.on('mouseenter', 'aggregated-routes-layer', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  
  map.on('mouseleave', 'aggregated-routes-layer', () => {
    map.getCanvas().style.cursor = '';
  });
}

function updateStats() {
  const selectedTrip = document.getElementById('tripFilter').value;
  const activeTrips = selectedTrip === 'all' ? tripLayers.length : 1;
  
  document.getElementById('statTrips').textContent = activeTrips;
  document.getElementById('statAvgSpeed').textContent = '—';
}