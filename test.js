const fs = require('fs');
const UPNG = require('./index');
const PNG = require('pngjs').PNG;
// test

function applyColormap(inputPixels, colormapLUT ) {
    // Compute the total number of pixels in the input image
    let numPixels = inputPixels.length;
    let outputPixelsRGB = new Uint8Array(numPixels * 4);
    for (let i = 0; i < numPixels; i++) {
        const grayValue = inputPixels[i];
        const color = colormapLUT[grayValue];
        const startIndex = i * 4;
        outputPixelsRGB[startIndex] = color[0];
        outputPixelsRGB[startIndex + 1] = color[1];
        outputPixelsRGB[startIndex + 2] = color[2];
        outputPixelsRGB[startIndex + 3] = color[3]; // assign the calculated alpha value
    }
    return outputPixelsRGB;
}

const data = fs.readFileSync("test.png");
let pngJS = PNG.sync.read(data);
// validation
let encoded_v = UPNG.encode([Uint8Array.from(pngJS.data).buffer], pngJS.width, pngJS.height,pngJS.palette);

pixelData = applyColormap(pngJS.data, pngJS.palette);

let quantized = UPNG.quantize(pixelData, 256);
console.log(quantized);
