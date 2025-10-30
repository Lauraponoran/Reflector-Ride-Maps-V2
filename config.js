// config.js
// Vite environment variables (requires running with `npm run dev` or `vite`)
export const CONFIG = {
  MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN,
  PMTILES_URL: 'http://localhost:8080/data/pmtiles.json',
  AGGREGATED_ROUTES_URL: 'http://localhost:8000/aggregated_routes.geojson',
  MAP_CENTER: [4.9, 52.37],
  MAP_ZOOM: 11,
  MAP_STYLE: 'mapbox://styles/mapbox/dark-v11'
};