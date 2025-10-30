// config.js - Vite-compatible version with .env support

// Vite exposes env variables via import.meta.env
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Set Mapbox token globally
if (typeof mapboxgl !== 'undefined') {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

const CONFIG = {
  MAPBOX_TOKEN: MAPBOX_TOKEN,
  PMTILES_URL: 'http://localhost:8080/data/pmtiles.json',
  AGGREGATED_ROUTES_URL: 'http://localhost:8000/aggregated_routes.geojson',
  MAP_CENTER: [4.9, 52.37],
  MAP_ZOOM: 11,
  MAP_STYLE: 'mapbox://styles/mapbox/dark-v11'
};

// Make CONFIG available globally for other scripts
window.CONFIG = CONFIG;

// Also export for module imports
export default CONFIG;