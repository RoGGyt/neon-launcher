// Копирует HTML/CSS/картинки из static/ в dist/web/
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'static');
const dst = path.join(__dirname, '..', 'dist', 'web');
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });
console.log('static -> dist/web');
