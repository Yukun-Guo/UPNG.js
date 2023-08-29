import pako from 'pako';

let crcLib = {
    table: (function () {
        var tab = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) {
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
    update: function (c:any, buf:any, off:any, len:any) {
        for (var i = 0; i < len; i++) c = crcLib.table[(c ^ buf[off + i]) & 0xff] ^ (c >>> 8);
        return c;
    },
    crc: function (b:any, o:any, l:any) {
        return crcLib.update(0xffffffff, b, o, l) ^ 0xffffffff;
    }
}

function writeUshort(buff:any, p:number, n:number) {
    buff[p] = (n >> 8) & 255;
    buff[p + 1] = n & 255;
}
function readUint(buff:any, p:number) {
    return (buff[p] * (256 * 256 * 256)) + ((buff[p + 1] << 16) | (buff[p + 2] << 8) | buff[p + 3]);
}
function writeUint (buff:any, p:number, n:number) {
    buff[p] = (n >> 24) & 255;
    buff[p + 1] = (n >> 16) & 255;
    buff[p + 2] = (n >> 8) & 255;
    buff[p + 3] = n & 255;
}

function compress(buffers: any, w: number, h: number, palette: any) {
    //var time = Date.now();
    let ctype = 6;
    let depth = 8;
    let alphaAnd = 255

    // when not quantized, other frames can contain colors, that are not in an initial frame
    let img = new Uint8Array(buffers);
    for (let i = 0; i < img.length; i += 4) {
        alphaAnd &= img[i + 3]
    };
    let gotAlpha = (alphaAnd != 255);

    let frm: any = {
        rect: {
            x: 0,
            y: 0,
            width: w,
            height: h
        },
        img: buffers,
        blend: 0,
        dispose: 0
    };

    let _colormap: any = {};
    let _palette: any = [];
    let inds: any = [];

    let img32 = new Uint32Array(buffers);
    let nx = 0;
    let ny = 0;
    let nh = h;
    let nw = w;
    let ind = new Uint8Array(img32.length);

    // calc palette and reduce colors, if the palette is assigned by the user skip it
    if (palette === null) {
        for (let i = 0; i < img32.length; i++) {
            let c = img32[i];
            if (i != 0 && c == img32[i - 1]) {
                ind[i] = ind[i - 1];
            } else if (i > w && c == img32[i - w]) {
                ind[i] = ind[i - w];
            } else {
                let cmc = _colormap[c];
                if (cmc == null) {
                    _colormap[c] = cmc = _palette.length;
                    _palette.push(c);
                    if (_palette.length >= 300) { break; }
                }
                ind[i] = cmc;
            }
        }
    } else { // use user palette
        for (let i = 0; i < palette.length; i++) {
            // convert uint8 array to uint32
            _palette.push((new Uint32Array((new Uint8Array(palette[i])).buffer))[0]);
        }
        for (var i = 0; i < img32.length; i++) {
            ind[i] = Math.max(0, _palette.indexOf(img32[i])); // set undefined colors to 0
        }
    }
    // inds.push(ind);

    var cc = _palette.length; //console.log("colors:",cc);
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
    // let cimg32 = new Uint32Array(cimg.buffer);
    let bpl = 4 * nw;
    let bpp = 4;
    if (cc <= 256) {
        bpl = Math.ceil(depth * nw / 8);
        let nimg = new Uint8Array(bpl * nh);
        let inj = ind;
        for (let y = 0; y < nh; y++) {
            let i = y * bpl;
            let ii = y * nw;
            if (depth == 8) {
                for (var x = 0; x < nw; x++) nimg[i + (x)] = (inj[ii + x]);
            } else if (depth == 4) {
                for (var x = 0; x < nw; x++) nimg[i + (x >> 1)] |= (inj[ii + x] << (4 - (x & 1) * 4));
            } else if (depth == 2) {
                for (var x = 0; x < nw; x++) nimg[i + (x >> 2)] |= (inj[ii + x] << (6 - (x & 3) * 2));
            } else if (depth == 1) {
                for (var x = 0; x < nw; x++) nimg[i + (x >> 3)] |= (inj[ii + x] << (7 - (x & 7) * 1));
            }
        }
        cimg = nimg;
        ctype = 3;
        bpp = 1;
    } else if (gotAlpha == false) { // some next "reduced" frames may contain alpha for blending
        let nimg = new Uint8Array(nw * nh * 3);
        let area = nw * nh;
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
        bpl = 3 * nw;
    }
    frm.img = cimg;
    frm.bpl = bpl;
    frm.bpp = bpp;
    //console.log("colors => palette indices", Date.now()-time);  time = Date.now();

    return {
        ctype: ctype,
        depth: depth,
        _palette: _palette,
        frames: frm
    };
}

function writeASCII(data: any, p:number, s:any) {
    for (var i = 0; i < s.length; i++) data[p + i] = s.charCodeAt(i);
}

function compressPNG(out: any, filter: any) {
    for (let i = 0; i < out.frames.length; i++) {
        let frm = out.frames[i];
        let nw = frm.rect.width;
        let nh = frm.rect.height;
        let fdata = new Uint8Array(nh * frm.bpl + nh);
        frm.cimg = _filterZero(frm.img, nh, frm.bpp, frm.bpl, fdata, filter);
    }
}

function _filterZero(img:any, h:number, bpp:number, bpl:number, data:any, filter:any) {
    let fls:any = [];
    let ftry = [0, 1, 2, 3, 4];
    if (filter != -1) {
      ftry = [filter];
    } else if (h * bpl > 500000 || bpp == 1) {
             ftry = [0];
           }

    for (var i = 0; i < ftry.length; i++) {
        for (var y = 0; y < h; y++) _filterLine(data, img, y, bpl, bpp, ftry[i]);
        fls.push(pako.deflate(data,{level: 0 }));
    }

    var ti, tsize = 1e9;
    for (var i = 0; i < fls.length; i++)
        if (fls[i].length < tsize) {
            ti = i;
            tsize = fls[i].length;
        }
    return fls[ti];
}

function _getBPP(out: any): any {
    let noc = [1, null, 3, 1, 2, null, 4][out.ctype];
    return noc! * out.depth;
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

function _filterLine(data:any, img:any, y:number, bpl:number, bpp:number, type:number) {
    var i = y * bpl,
        di = i + y;
    data[di] = type;
    di++;

    if (type == 0) {
        if (bpl < 500) {
          for (var x = 0; x < bpl; x++) data[di + x] = img[i + x];
        } else {
          data.set(new Uint8Array(img.buffer, i, bpl), di);
        }
    } else if (type == 1) {
        for (var x = 0; x < bpp; x++) data[di + x] = img[i + x];
        for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] - img[i + x - bpp] + 256) & 255;
    } else if (y == 0) {
        for (var x = 0; x < bpp; x++) data[di + x] = img[i + x];

        if (type == 2) {
          for (var x = bpp; x < bpl; x++) data[di + x] = img[i + x];
        }
        if (type == 3) {
          for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] - (img[i + x - bpp] >> 1) + 256) & 255;
        }
        if (type == 4) {
          for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] - _paeth(img[i + x - bpp], 0, 0) + 256) & 255;
        }
    } else {
        if (type == 2) {
            for (var x = 0; x < bpl; x++) data[di + x] = (img[i + x] + 256 - img[i + x - bpl]) & 255;
        }
        if (type == 3) {
            for (var x = 0; x < bpp; x++) data[di + x] = (img[i + x] + 256 - (img[i + x - bpl] >> 1)) & 255;
            for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] + 256 - ((img[i + x - bpl] + img[i + x - bpp]) >> 1)) & 255;
        }
        if (type == 4) {
            for (var x = 0; x < bpp; x++) data[di + x] = (img[i + x] + 256 - _paeth(0, img[i + x - bpl], 0)) & 255;
            for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] + 256 - _paeth(img[i + x - bpp], img[i + x - bpl], img[i + x - bpp - bpl])) & 255;
        }
    }
}

function _main(nimg, w, h, dels, tabs) {
    if (tabs == null) tabs = {};
    var crc = crcLib.crc,
        wUi =writeUint,
        wUs = writeUshort,
        wAs = writeASCII;
    var offset = 8,
        anim = nimg.frames.length > 1,
        pltAlpha = false;

    var cicc;

    var leng = 8 + (16 + 5 + 4) /*+ (9+4)*/ + (anim ? 20 : 0);
    if (tabs["sRGB"] != null) leng += 8 + 1 + 4;
    if (tabs["pHYs"] != null) leng += 8 + 9 + 4;
    if (tabs["iCCP"] != null) {
        cicc = pako.deflate(tabs["iCCP"]);
        leng += 8 + 11 + 2 + cicc.length + 4;
    }
    if (nimg.ctype == 3) {
        var dl = nimg.plte.length;
        for (var i = 0; i < dl; i++)
            if ((nimg.plte[i] >>> 24) != 255) pltAlpha = true;
        leng += (8 + dl * 3 + 4) + (pltAlpha ? (8 + dl * 1 + 4) : 0);
    }
    for (var j = 0; j < nimg.frames.length; j++) {
        var fr = nimg.frames[j];
        if (anim) leng += 38;
        leng += fr.cimg.length + 12;
        if (j != 0) leng += 4;
    }
    leng += 12;

    var data = new Uint8Array(leng);
    var wr = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (var i = 0; i < 8; i++) data[i] = wr[i];

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
    if (tabs["sRGB"] != null) {
        wUi(data, offset, 1);
        offset += 4;
        wAs(data, offset, "sRGB");
        offset += 4;
        data[offset] = tabs["sRGB"];
        offset++;
        wUi(data, offset, crc(data, offset - 5, 5));
        offset += 4; // crc
    }
    if (tabs["iCCP"] != null) {
        var sl = 11 + 2 + cicc.length;
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
    if (tabs["pHYs"] != null) {
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

    if (anim) {
        wUi(data, offset, 8);
        offset += 4;
        wAs(data, offset, "acTL");
        offset += 4;
        wUi(data, offset, nimg.frames.length);
        offset += 4;
        wUi(data, offset, tabs["loop"] != null ? tabs["loop"] : 0);
        offset += 4;
        wUi(data, offset, crc(data, offset - 12, 12));
        offset += 4; // crc
    }

    if (nimg.ctype == 3) {
        var dl = nimg.plte.length;
        wUi(data, offset, dl * 3);
        offset += 4;
        wAs(data, offset, "PLTE");
        offset += 4;
        for (var i = 0; i < dl; i++) {
            var ti = i * 3,
                c = nimg.plte[i],
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
            for (var i = 0; i < dl; i++) data[offset + i] = (nimg.plte[i] >>> 24) & 255;
            offset += dl;
            wUi(data, offset, crc(data, offset - dl - 4, dl + 4));
            offset += 4; // crc
        }
    }

    var fi = 0;
    for (var j = 0; j < nimg.frames.length; j++) {
        var fr = nimg.frames[j];
        if (anim) {
            wUi(data, offset, 26);
            offset += 4;
            wAs(data, offset, "fcTL");
            offset += 4;
            wUi(data, offset, fi++);
            offset += 4;
            wUi(data, offset, fr.rect.width);
            offset += 4;
            wUi(data, offset, fr.rect.height);
            offset += 4;
            wUi(data, offset, fr.rect.x);
            offset += 4;
            wUi(data, offset, fr.rect.y);
            offset += 4;
            wUs(data, offset, dels[j]);
            offset += 2;
            wUs(data, offset, 1000);
            offset += 2;
            data[offset] = fr.dispose;
            offset++; // dispose
            data[offset] = fr.blend;
            offset++; // blend
            wUi(data, offset, crc(data, offset - 30, 30));
            offset += 4; // crc
        }

        var imgd = fr.cimg,
            dl = imgd.length;
        wUi(data, offset, dl + (j == 0 ? 0 : 4));
        offset += 4;
        var ioff = offset;
        wAs(data, offset, (j == 0) ? "IDAT" : "fdAT");
        offset += 4;
        if (j != 0) {
            wUi(data, offset, fi++);
            offset += 4;
        }
        data.set(imgd, offset);
        offset += dl;
        wUi(data, offset, crc(data, ioff, offset - ioff));
        offset += 4; // crc
    }

    wUi(data, offset, 0);
    offset += 4;
    wAs(data, offset, "IEND");
    offset += 4;
    wUi(data, offset, crc(data, offset - 4, 4));
    offset += 4; // crc

    return data;
}

function encode(buffers: any, w: number, h: number, palette: any, ps?: number, dels?: any, tabs?: any) {
    let nimg = compress(buffers, w, h, palette);
    compressPNG(nimg, -1);
    return _main(nimg, w, h, dels, tabs);
}

// export default {
//     encode
// }

import fs from 'fs';
import  {PNG} from 'pngjs';
// const UPNG = require('./index');
// const UPNG = require('upng-js');
// import {encoder} from "./pngEncoder"
// const PNG = require('pngjs').PNG;

const data = fs.readFileSync("_4ffc9_mask.png");

// let png = UPNG.decode(data);
let pngJS = PNG.sync.read(data);

let encoded = encode(Uint8Array.from(pngJS.data).buffer, pngJS.width, pngJS.height,pngJS.palette);
fs.writeFileSync("wfdr2.png", encoded);