// config.js
// Vite environment variables (requires running with `npm run dev` or `vite`)

// Set Mapbox token globally
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

if (typeof mapboxgl !== 'undefined') {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export const CONFIG = {
  MAPBOX_TOKEN: '', // Not needed for OSM
  MAP_STYLE: 'https://tiles.openfreemap.org/styles/dark-matter',
  MAP_CENTER: [4.9041, 52.3676], // Amsterdam
  MAP_ZOOM: 13,
  PMTILES_URL: '/your-pmtiles-file.pmtiles'
};

// Also make available globally for non-module scripts
window.CONFIG = CONFIG;