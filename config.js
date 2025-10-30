// config.js
// Vite environment variables (requires running with `npm run dev` or `vite`)

// Set Mapbox token globally
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

if (typeof mapboxgl !== 'undefined') {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export const CONFIG = {
  MAPBOX_TOKEN: MAPBOX_TOKEN,
  PMTILES_URL: '/trips.pmtiles',
  AGGREGATED_ROUTES_URL: '/aggregated_routes.geojson',
  MAP_CENTER: [4.9, 52.37],
  MAP_ZOOM: 11,
  // Use an open style that works with MapLibre
  MAP_STYLE: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
};

// Also make available globally for non-module scripts
window.CONFIG = CONFIG;