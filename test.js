const fs = require('fs');
const UPNG = require('./index');
// const UPNG = require('upng-js');
import {encoder} from "./pngEncoder"
const PNG = require('pngjs').PNG;

const data = fs.readFileSync("_4ffc9_mask.png");

let png = UPNG.decode(data);
let pngJS = PNG.sync.read(data);

let encoded = encoder([Uint8Array.from(pngJS.data).buffer], pngJS.width, pngJS.height,pngJS.palette);
fs.writeFileSync("wfdr2.png", encoded);