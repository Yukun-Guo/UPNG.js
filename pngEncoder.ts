import fs from 'fs';
import * as zlib from "zlib";
const crcLib = {
    table: (function () {
        let tab = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                // sourcery skip: possible-incorrect-bitwise-operator
                if (c & 1) {
                    c = 0xedb88320 ^ (c >>> 1);
                } else {
                    c >>>= 1;
                }
            }
            tab[n] = c;
        }
        return tab;
    })(),
    update: function (c: any, buf: any, off: any, len: any) {
        for (let i = 0; i < len; i++) { c = crcLib.table[(c ^ buf[off + i]) & 0xff] ^ (c >>> 8); }
        return c;
    },
    crc: function (b: any, o: any, l: any) {
        return crcLib.update(0xffffffff, b, o, l) ^ 0xffffffff;
    }
};

function writeUint(buff: any, p: number, n: number) {
    buff[p] = (n >> 24) & 255;
    buff[p + 1] = (n >> 16) & 255;
    buff[p + 2] = (n >> 8) & 255;
    buff[p + 3] = n & 255;
}

function compress(buffer: any, w: number, h: number, options?: any) {
    //var time = Date.now();
    let ctype = 6;
    let depth = 8;
    let alphaAnd = 255;
    let palette = options?.palette;
    let gray = options?.gray;

    // when not quantized, other frames can contain colors, that are not in an initial frame
    let img = new Uint8Array(buffer);
    for (let i = 0; i < img.length; i += 4) {
        alphaAnd &= img[i + 3];
    };
    let gotAlpha = (alphaAnd !== 255);

    let frm: any = {
        rect: {
            x: 0,
            y: 0,
            width: w,
            height: h
        },
        img: buffer,
        blend: 0,
        dispose: 0
    };

    let _colormap: any = {};
    let _palette: any = [];
    let img32 = new Uint32Array(buffer);
    let ind = new Uint8Array(img32.length);

    // calc palette and reduce colors, if the palette is assigned by the user skip it
    if (gray) {
        for (let i = 0; i < img32.length; i++) {
            ind[i] = img[i * 4]; // set undefined colors to 0
        }
        frm.img = ind;
        frm.bpl = w;
        frm.bpp = 1;
        ctype = 0;
    }
    else {
        if (palette === undefined) {
            for (let i = 0; i < img32.length; i++) {
                let c = img32[i];
                if (i !== 0 && c === img32[i - 1]) {
                    ind[i] = ind[i - 1];
                } else if (i > w && c === img32[i - w]) {
                    ind[i] = ind[i - w];
                } else {
                    let cmc = _colormap[c];
                    if (cmc === undefined) {
                        _colormap[c] = cmc = _palette.length;
                        _palette.push(c);
                        if (_palette.length >= 300) { break; }
                    }
                    ind[i] = cmc;
                }
            }
        }
        else {// use user palette
            for (let i = 0; i < palette.length; i++) {
                // convert uint8 array to uint32
                _palette.push((new Uint32Array((new Uint8Array(palette[i])).buffer))[0]);
            }
            for (let i = 0; i < img32.length; i++) {
                ind[i] = Math.max(0, _palette.indexOf(img32[i])); // set undefined colors to 0
            }
        }

        let cc = _palette.length;
        if (cc <= 256) {
            if (cc <= 2) {
                depth = 1;
            } else if (cc <= 4) {
                depth = 2;
            } else if (cc <= 16) {
                depth = 4;
            } else {
                depth = 8;
            }
        }

        let cimg = frm.img;
        let bpl = 4 * w;
        let bpp = 4;
        if (cc <= 256) {
            bpl = Math.ceil(depth * w / 8);
            let nimg = new Uint8Array(bpl * h);
            let inj = ind;
            for (let y = 0; y < h; y++) {
                let i = y * bpl;
                let ii = y * w;
                if (depth === 8) {
                    for (var x = 0; x < w; x++) { nimg[i + (x)] = (inj[ii + x]); }
                } else if (depth === 4) {
                    for (var x = 0; x < w; x++) { nimg[i + (x >> 1)] |= (inj[ii + x] << (4 - (x & 1) * 4)); }
                } else if (depth === 2) {
                    for (var x = 0; x < w; x++) { nimg[i + (x >> 2)] |= (inj[ii + x] << (6 - (x & 3) * 2)); }
                } else if (depth === 1) {
                    for (var x = 0; x < w; x++) { nimg[i + (x >> 3)] |= (inj[ii + x] << (7 - (x & 7) * 1)); }
                }
            }
            cimg = nimg;
            ctype = 3;
            bpp = 1;
        } else if (gotAlpha === false) { // some next "reduced" frames may contain alpha for blending
            let nimg = new Uint8Array(w * h * 3);
            let area = w * h;
            for (let i = 0; i < area; i++) {
                let ti = i * 3;
                let qi = i * 4;
                nimg[ti] = cimg[qi];
                nimg[ti + 1] = cimg[qi + 1];
                nimg[ti + 2] = cimg[qi + 2];
            }
            cimg = nimg;
            ctype = 2;
            bpp = 3;
            bpl = 3 * w;
        }
        frm.img = cimg;
        frm.bpl = bpl;
        frm.bpp = bpp;
    }
    return {
        ctype: ctype,
        depth: depth,
        _palette: _palette,
        frame: frm
    };
}

function writeASCII(data: any, p: number, s: any) {
    for (var i = 0; i < s.length; i++) { data[p + i] = s.charCodeAt(i); }
}

function compressPNG(out: any, filter: any) {
    let frm = out.frame;
    let nh = frm.rect.height;
    let fdata = new Uint8Array(nh * frm.bpl + nh);
    frm.cimg = _filterZero(frm.img, nh, frm.bpp, frm.bpl, fdata, filter);
}

function _filterZero(img: any, h: number, bpp: number, bpl: number, data: any, filter: any) {
    let fls: any = [];
    let ftry = [0, 1, 2, 3, 4];
    if (filter !== -1) {
        ftry = [filter];
    } else if (h * bpl > 500000 || bpp === 1) {
        ftry = [0];
    }

    for (let i = 0; i < ftry.length; i++) {
        for (let y = 0; y < h; y++) { _filterLine(data, img, y, bpl, bpp, ftry[i]); }
        fls.push(zlib.deflateSync(data));
    }

    let ti: number = 0;
    let tsize: number = 1e9;
    for (let i = 0; i < fls.length; i++) {
        if (fls[i].length < tsize) {
            ti = i;
            tsize = fls[i].length;
        }
    }
    return fls[ti];
}

function _paeth(a: number, b: number, c: number) {
    var p = a + b - c,
        pa = (p - a),
        pb = (p - b),
        pc = (p - c);
    if (pa * pa <= pb * pb && pa * pa <= pc * pc) {
        return a;
    } else if (pb * pb <= pc * pc) {
        return b;
    }
    return c;
}

function _filterLine(data: any, img: any, y: number, bpl: number, bpp: number, type: number) {
    var i = y * bpl,
        di = i + y;
    data[di] = type;
    di++;

    if (type === 0) {
        if (bpl < 500) {
            for (var x = 0; x < bpl; x++) { data[di + x] = img[i + x]; }
        } else {
            data.set(new Uint8Array(img.buffer, i, bpl), di);
        }
    } else if (type === 1) {
        for (var x = 0; x < bpp; x++) { data[di + x] = img[i + x]; }
        for (var x = bpp; x < bpl; x++) { data[di + x] = (img[i + x] - img[i + x - bpp] + 256) & 255; }
    } else if (y === 0) {
        for (var x = 0; x < bpp; x++) { data[di + x] = img[i + x]; }

        if (type === 2) {
            for (var x = bpp; x < bpl; x++) { data[di + x] = img[i + x]; }
        }
        if (type === 3) {
            for (var x = bpp; x < bpl; x++) { data[di + x] = (img[i + x] - (img[i + x - bpp] >> 1) + 256) & 255; }
        }
        if (type === 4) {
            for (var x = bpp; x < bpl; x++) { data[di + x] = (img[i + x] - _paeth(img[i + x - bpp], 0, 0) + 256) & 255; }
        }
    } else {
        if (type === 2) {
            for (var x = 0; x < bpl; x++) { data[di + x] = (img[i + x] + 256 - img[i + x - bpl]) & 255; }
        }
        if (type === 3) {
            for (var x = 0; x < bpp; x++) { data[di + x] = (img[i + x] + 256 - (img[i + x - bpl] >> 1)) & 255; }
            for (var x = bpp; x < bpl; x++) { data[di + x] = (img[i + x] + 256 - ((img[i + x - bpl] + img[i + x - bpp]) >> 1)) & 255; }
        }
        if (type === 4) {
            for (var x = 0; x < bpp; x++) { data[di + x] = (img[i + x] + 256 - _paeth(0, img[i + x - bpl], 0)) & 255; }
            for (var x = bpp; x < bpl; x++) { data[di + x] = (img[i + x] + 256 - _paeth(img[i + x - bpp], img[i + x - bpl], img[i + x - bpp - bpl])) & 255; }
        }
    }
}

function _main(nimg: any, w: number, h: number) {
    let tabs: any = {};
    let { crc } = crcLib;
    let wUi = writeUint;
    let wAs = writeASCII;
    let offset = 8;
    let pltAlpha = false;
    let cicc: any = null;
    let leng = 8 + (16 + 5 + 4);

    if (tabs["sRGB"] !== undefined) {
        leng += 8 + 1 + 4;
    }
    if (tabs["pHYs"] !== undefined) {
        leng += 8 + 9 + 4;
    }
    if (tabs["iCCP"] !== undefined) {
        cicc = zlib.deflateSync(tabs["iCCP"]);
        leng += 8 + 11 + 2 + cicc.length + 4;
    }
    if (nimg.ctype === 3) {
        let dl = nimg._palette?.length;
        for (let i = 0; i < dl; i++) {
            if ((nimg._palette[i] >>> 24) !== 255) {
                pltAlpha = true;
            }
        }
        leng += (8 + dl * 3 + 4) + (pltAlpha ? (8 + dl * 1 + 4) : 0);
    }
    leng += nimg.frame.cimg.length + 12 + 12;

    var data = new Uint8Array(leng);
    var wr = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (var i = 0; i < 8; i++) { data[i] = wr[i]; }

    wUi(data, offset, 13);
    offset += 4;
    wAs(data, offset, "IHDR");
    offset += 4;
    wUi(data, offset, w);
    offset += 4;
    wUi(data, offset, h);
    offset += 4;
    data[offset] = nimg.depth;
    offset++; // depth
    data[offset] = nimg.ctype;
    offset++; // ctype
    data[offset] = 0;
    offset++; // compress
    data[offset] = 0;
    offset++; // filter
    data[offset] = 0;
    offset++; // interlace
    wUi(data, offset, crc(data, offset - 17, 17));
    offset += 4; // crc

    // 13 bytes to say, that it is sRGB
    if (tabs["sRGB"] !== undefined) {
        wUi(data, offset, 1);
        offset += 4;
        wAs(data, offset, "sRGB");
        offset += 4;
        data[offset] = tabs["sRGB"];
        offset++;
        wUi(data, offset, crc(data, offset - 5, 5));
        offset += 4; // crc
    }
    if (tabs["iCCP"] !== undefined) {
        let sl = 11 + 2 + cicc.length;
        wUi(data, offset, sl);
        offset += 4;
        wAs(data, offset, "iCCP");
        offset += 4;
        wAs(data, offset, "ICC profile");
        offset += 11;
        offset += 2;
        data.set(cicc, offset);
        offset += cicc.length;
        wUi(data, offset, crc(data, offset - (sl + 4), sl + 4));
        offset += 4; // crc
    }
    if (tabs["pHYs"] !== undefined) {
        wUi(data, offset, 9);
        offset += 4;
        wAs(data, offset, "pHYs");
        offset += 4;
        wUi(data, offset, tabs["pHYs"][0]);
        offset += 4;
        wUi(data, offset, tabs["pHYs"][1]);
        offset += 4;
        data[offset] = tabs["pHYs"][2];
        offset++;
        wUi(data, offset, crc(data, offset - 13, 13));
        offset += 4; // crc
    }

    if (nimg.ctype === 3) {
        let dl = nimg._palette?.length;
        wUi(data, offset, dl * 3);
        offset += 4;
        wAs(data, offset, "PLTE");
        offset += 4;
        for (let i = 0; i < dl; i++) {
            let ti = i * 3,
                c = nimg._palette[i],
                r = (c) & 255,
                g = (c >>> 8) & 255,
                b = (c >>> 16) & 255;
            data[offset + ti + 0] = r;
            data[offset + ti + 1] = g;
            data[offset + ti + 2] = b;
        }
        offset += dl * 3;
        wUi(data, offset, crc(data, offset - dl * 3 - 4, dl * 3 + 4));
        offset += 4; // crc

        if (pltAlpha) {
            wUi(data, offset, dl);
            offset += 4;
            wAs(data, offset, "tRNS");
            offset += 4;
            for (let i = 0; i < dl; i++) { data[offset + i] = (nimg._palette[i] >>> 24) & 255; }
            offset += dl;
            wUi(data, offset, crc(data, offset - dl - 4, dl + 4));
            offset += 4; // crc
        }
    }
    wUi(data, offset, nimg.frame.cimg.length);
    offset += 4;
    let iOff = offset;
    wAs(data, offset, "IDAT");
    offset += 4;
    data.set(nimg.frame.cimg, offset);
    offset += nimg.frame.cimg.length;
    wUi(data, offset, crc(data, iOff, offset - iOff));
    offset += 4; // crc
    // }

    wUi(data, offset, 0);
    offset += 4;
    wAs(data, offset, "IEND");
    offset += 4;
    wUi(data, offset, crc(data, offset - 4, 4));
    offset += 4; // crc

    return data;
}

export function parsePixelData(buffer: any, channel: number, maxColors: number = 256) {
    const weights = [0.2989, 0.5870, 0.1140]; //0.2989 * R + 0.5870 * G + 0.1140 * B 
    let colorPixelData = new Uint8Array(buffer);
    let indexedPixels = new Uint8Array(buffer.length / channel);
    let palette: any = [];
    const indexMap = new Map();
    let sortedColorMap = new Map();
    let uniqueColors: any = [];

    // get color numbers
    for (let i = 0; i < colorPixelData.length; i += channel) {
        const color = colorPixelData.slice(i, i + 3).join(',');
        if (!indexMap.has(color) && uniqueColors.length < maxColors) {
            uniqueColors.push(colorPixelData.slice(i, i + 3));
            indexMap.set(color, uniqueColors.length - 1);
        }
    }
    const sortedUniqueColors = uniqueColors.sort((color1: any, color2: any) => {
        const weightedSum1 = color1.reduce((acc: any, val: any, index: any) => acc + val * weights[index], 0);
        const weightedSum2 = color2.reduce((acc: any, val: any, index: any) => acc + val * weights[index], 0);
        return weightedSum1 - weightedSum2;
    });
    for (let i = 0; i < sortedUniqueColors.length; i++) {
        sortedColorMap.set(sortedUniqueColors[i].join(','), i);
        palette.push([...sortedUniqueColors[i], 255]);
    }

    for (let i = 0; i < colorPixelData.length; i += channel) {
        const color = colorPixelData.slice(i, i + 3).join(',');
        const index = sortedColorMap.get(color);
        indexedPixels[i / channel] = index !== undefined ? index : 0;
    }

    return { indexedPixels, palette };
}


export function encode(buffer: any, w: number, h: number, options?: any) {
    let nimg = compress(buffer, w, h, options);
    compressPNG(nimg, -1);
    return _main(nimg, w, h);
}


let data = new Uint8Array([0, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255]);
let palette = [[0, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255], [0, 255, 0, 255]];

let encoded = encode(data.buffer, 2, 2, { gray: true });

fs.writeFileSync("test_out.txt", JSON.stringify(encoded));

fs.writeFileSync("test_out.png", encoded);
