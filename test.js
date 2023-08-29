const fs = require('fs');
const UPNG = require('./index');
// const UPNG = require('upng-js');
const PNG = require('pngjs').PNG;


function decodeColorCodedImage(imgData, colormap) {
    const decodedPixels = new(colormap.length <= 256 ? Uint8Array : Uint16Array)(imgData.length / 4);
    for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];

        let nearestIndex = 0;
        let minDistance = Number.MAX_SAFE_INTEGER;

        for (let j = 0; j < colormap.length; j++) {
            const color = colormap[j];
            const distance = Math.sqrt(
                Math.pow(r - color[0], 2) +
                Math.pow(g - color[1], 2) +
                Math.pow(b - color[2], 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = j;
            }
        }
        decodedPixels[i / 4] = nearestIndex;
    }

    return decodedPixels;
}

const data = fs.readFileSync("wfdr.png");

let png = UPNG.decode(data);
let pngJS = PNG.sync.read(data);

let encoded = UPNG.encode([Uint8Array.from(pngJS.data).buffer], pngJS.width, pngJS.height,pngJS.palette);
fs.writeFileSync("wfdr2.png", encoded);