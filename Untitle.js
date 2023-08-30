function parsePixelData(buffer,channel,maxColors=256) {
    const weights = [0.2989, 0.5870, 0.1140]; //0.2989 * R + 0.5870 * G + 0.1140 * B 
    let colorPixelData = new Uint8Array(buffer);
    let indexedPixels = new Uint8Array(buffer.length/channel);
    let palette = [];
    const indexMap = new Map();
    let uniqueColors = [];
    
    // get color numbers
    for (let i = 0; i < colorPixelData.length; i += channel) {
        const color = colorPixelData.slice(i, i + 3).join(',');
        if (!indexMap.has(color) && uniqueColors.length < maxColors) {
            uniqueColors.push(colorPixelData.slice(i, i + 3));
            indexMap.set(color, uniqueColors.length - 1);
        }
    }
    const sortedUniqueColors = uniqueColors.sort((color1, color2) => {
        const weightedSum1 = color1.reduce((acc, val, index) => acc + val * weights[index], 0);
        const weightedSum2 = color2.reduce((acc, val, index) => acc + val * weights[index], 0);
        return weightedSum1 - weightedSum2;
    });
    let sortedColorMap = new Map();
    for (let i = 0; i < sortedUniqueColors.length; i++) {
        sortedColorMap.set(sortedUniqueColors[i].join(','),i);
        palette.push([...sortedUniqueColors[i],255]);
    }

    for (let i = 0; i < buffer.length; i += channel) {
        const color = buffer.slice(i, i + 3).join(',');
        const index = sortedColorMap.get(color);
        indexedPixels[i / channel] = index !== undefined ? index : 0;
    }

    return {indexedPixels, palette};
}

let buffer = [0,255,0,255 ,0,0,0,255 ,0,0,0,255 ,0,0,0,255 ,0,0,255,255, 0,0,255,255, 255,0,0,255];
let channel=4;

let prased = parsePixelData(buffer,channel);
console.log(prased);