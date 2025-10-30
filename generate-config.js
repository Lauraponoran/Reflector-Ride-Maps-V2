// generate-config.js - Run this script to create browser config from .env
const fs = require('fs');
require('dotenv').config();

const configContent = `// config.js - Auto-generated from .env
// DO NOT EDIT MANUALLY - Run 'node generate-config.js' to regenerate

mapboxgl.accessToken = '${process.env.MAPBOX_TOKEN}';

const CONFIG = {
  MAPBOX_TOKEN: '${process.env.MAPBOX_TOKEN}',
  PMTILES_URL: 'http://localhost:8080/data/pmtiles.json',
  AGGREGATED_ROUTES_URL: 'http://localhost:8000/aggregated_routes.geojson',
  MAP_CENTER: [4.9, 52.37],
  MAP_ZOOM: 11,
  MAP_STYLE: 'mapbox://styles/mapbox/dark-v11'
};

window.CONFIG = CONFIG;
`;

fs.writeFileSync('config.js', configContent);
console.log('✓ config.js generated successfully from .env');
console.log('⚠️  Remember: config.js contains your token. Add it to .gitignore!');