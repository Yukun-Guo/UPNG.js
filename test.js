const fs = require('fs');
const UPNG = require('./index');
const PNG = require('pngjs').PNG;
// test
const data = fs.readFileSync("test.png");
let pngJS = PNG.sync.read(data);
// validation
let encoded_v = UPNG.encode([Uint8Array.from(pngJS.data).buffer], pngJS.width, pngJS.height,pngJS.palette);
fs.writeFileSync("validation_out.png", encoded_v);
