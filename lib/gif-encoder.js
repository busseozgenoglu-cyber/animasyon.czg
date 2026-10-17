/* Canlandır — bağımlılıksız GIF89a kodlayıcı.
   Her kare için kendi 256 renklik paletini çıkarır (medyan kesme), isteğe bağlı
   Floyd–Steinberg titreme uygular ve LZW ile sıkıştırır. Ana iş parçacığında,
   Web Worker içinde (importScripts) ve Node'da (require) aynı dosya kullanılır. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GifEncoder = api.GifEncoder;
  root.GifQuantize = api.quantize;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SIDE = 32, BINS = SIDE * SIDE * SIDE;   // 5 bit/kanal histogram kutuları

  /* Büyüyen bayt tamponu */
  function ByteSink(initial) {
    this.buf = new Uint8Array(initial || 65536);
    this.len = 0;
  }
  ByteSink.prototype._grow = function (need) {
    var cap = this.buf.length;
    while (cap < need) cap *= 2;
    var nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  };
  ByteSink.prototype.push = function (b) {
    if (this.len + 1 > this.buf.length) this._grow(this.len + 1);
    this.buf[this.len++] = b & 0xFF;
  };
  ByteSink.prototype.pushBytes = function (arr) {
    if (this.len + arr.length > this.buf.length) this._grow(this.len + arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
  };
  ByteSink.prototype.pushU16 = function (v) { this.push(v & 0xFF); this.push((v >> 8) & 0xFF); };
  ByteSink.prototype.toUint8Array = function () { return this.buf.slice(0, this.len); };

  /* ── Renk niceleme ────────────────────────────────────────────── */

  function buildHistogram(rgba, count, transparent) {
    var hist = new Uint32Array(BINS), sr = new Uint32Array(BINS), sg = new Uint32Array(BINS), sb = new Uint32Array(BINS);
    for (var i = 0, p = 0; i < count; i++, p += 4) {
      if (transparent && rgba[p + 3] < 128) continue;
      var r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      var bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      hist[bin]++; sr[bin] += r; sg[bin] += g; sb[bin] += b;
    }
    return { hist: hist, sr: sr, sg: sg, sb: sb };
  }

  function makeBox(bins, hist) {
    var rmin = 31, rmax = 0, gmin = 31, gmax = 0, bmin = 31, bmax = 0, count = 0;
    for (var i = 0; i < bins.length; i++) {
      var bin = bins[i], r = bin >> 10, g = (bin >> 5) & 31, b = bin & 31;
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      if (g < gmin) gmin = g; if (g > gmax) gmax = g;
      if (b < bmin) bmin = b; if (b > bmax) bmax = b;
      count += hist[bin];
    }
    return { bins: bins, count: count, rmin: rmin, rmax: rmax, gmin: gmin, gmax: gmax, bmin: bmin, bmax: bmax };
  }

  /* Medyan kesme: dolu kutuları en fazla maxColors renge böler. Palet [r,g,b] dizileri döner. */
  function medianCut(h, maxColors) {
    var bins = [];
    for (var i = 0; i < BINS; i++) if (h.hist[i]) bins.push(i);
    if (!bins.length) return [[0, 0, 0]];
    var boxes = [makeBox(bins, h.hist)];
    while (boxes.length < maxColors) {
      var bi = -1, best = -1;
      for (var k = 0; k < boxes.length; k++) {
        var bx = boxes[k];
        if (bx.bins.length < 2) continue;
        // İlk yarıda en kalabalık kutu, sonra kalabalık×hacim: hem baskın renkler hem geniş geçişler bölünür.
        var vol = (bx.rmax - bx.rmin + 1) * (bx.gmax - bx.gmin + 1) * (bx.bmax - bx.bmin + 1);
        var score = boxes.length < maxColors / 2 ? bx.count : bx.count * vol;
        if (score > best) { best = score; bi = k; }
      }
      if (bi < 0) break;
      var box = boxes[bi];
      var rr = box.rmax - box.rmin, gg = box.gmax - box.gmin, bb = box.bmax - box.bmin;
      var ch = (gg >= rr && gg >= bb) ? 1 : (rr >= bb ? 0 : 2);
      var keyOf = ch === 0 ? function (x) { return x >> 10; } : ch === 1 ? function (x) { return (x >> 5) & 31; } : function (x) { return x & 31; };
      box.bins.sort(function (a, b) { return keyOf(a) - keyOf(b); });
      var half = box.count / 2, acc = 0, cut = box.bins.length - 2;
      for (var c = 0; c < box.bins.length - 1; c++) {
        acc += h.hist[box.bins[c]];
        if (acc >= half) { cut = c; break; }
      }
      boxes[bi] = makeBox(box.bins.slice(0, cut + 1), h.hist);
      boxes.push(makeBox(box.bins.slice(cut + 1), h.hist));
    }
    var palette = [];
    for (var q = 0; q < boxes.length; q++) {
      var bxx = boxes[q], cnt = 0, r = 0, g = 0, b = 0;
      for (var j = 0; j < bxx.bins.length; j++) {
        var bn = bxx.bins[j];
        cnt += h.hist[bn]; r += h.sr[bn]; g += h.sg[bn]; b += h.sb[bn];
      }
      palette.push([Math.round(r / cnt), Math.round(g / cnt), Math.round(b / cnt)]);
    }
    return palette;
  }

  /* Pikselleri palet dizinlerine eşler. transparent=true ise 0 dizini saydam, renkler 1'den başlar. */
  function mapPixels(rgba, width, height, palette, h, opts) {
    var transparent = !!opts.transparent, dither = opts.dither !== false;
    var n = palette.length, shift = transparent ? 1 : 0;
    var palR = new Uint8Array(n), palG = new Uint8Array(n), palB = new Uint8Array(n);
    for (var i = 0; i < n; i++) { palR[i] = palette[i][0]; palG[i] = palette[i][1]; palB[i] = palette[i][2]; }
    var lut = new Int16Array(BINS); lut.fill(-1);

    function nearest(r, g, b) {
      var best = 0, bd = 1e9;
      for (var k = 0; k < n; k++) {
        var dr = r - palR[k], dg = g - palG[k], db = b - palB[k];
        var d = dr * dr * 2 + dg * dg * 3 + db * db;   // göz yeşile daha duyarlı
        if (d < bd) { bd = d; best = k; if (d === 0) break; }
      }
      return best;
    }
    function indexFor(r, g, b) {
      var bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      var idx = lut[bin];
      if (idx < 0) {
        if (h && h.hist[bin]) {
          var c = h.hist[bin];
          idx = nearest(Math.round(h.sr[bin] / c), Math.round(h.sg[bin] / c), Math.round(h.sb[bin] / c));
        } else {
          idx = nearest(((r >> 3) << 3) + 4, ((g >> 3) << 3) + 4, ((b >> 3) << 3) + 4);
        }
        lut[bin] = idx;
      }
      return idx;
    }

    var out = new Uint8Array(width * height);
    if (!dither) {
      for (var p = 0, q = 0; q < out.length; q++, p += 4) {
        if (transparent && rgba[p + 3] < 128) { out[q] = 0; continue; }
        out[q] = indexFor(rgba[p], rgba[p + 1], rgba[p + 2]) + shift;
      }
      return out;
    }
    // Floyd–Steinberg hata yayma (satır bazlı, iki hata tamponu)
    var stride = (width + 2) * 3;
    var cur = new Float32Array(stride), nxt = new Float32Array(stride);
    for (var y = 0; y < height; y++) {
      nxt.fill(0);
      var row = y * width;
      for (var x = 0; x < width; x++) {
        var pi = (row + x) * 4, e = (x + 1) * 3;
        if (transparent && rgba[pi + 3] < 128) { out[row + x] = 0; continue; }
        var r = rgba[pi] + cur[e], g = rgba[pi + 1] + cur[e + 1], b = rgba[pi + 2] + cur[e + 2];
        r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
        var ri = r | 0, gi = g | 0, bi = b | 0;
        var idx = indexFor(ri, gi, bi);
        out[row + x] = idx + shift;
        var er = r - palR[idx], eg = g - palG[idx], eb = b - palB[idx];
        cur[e + 3] += er * 0.4375; cur[e + 4] += eg * 0.4375; cur[e + 5] += eb * 0.4375;          // sağ 7/16
        nxt[e - 3] += er * 0.1875; nxt[e - 2] += eg * 0.1875; nxt[e - 1] += eb * 0.1875;          // alt-sol 3/16
        nxt[e] += er * 0.3125; nxt[e + 1] += eg * 0.3125; nxt[e + 2] += eb * 0.3125;              // alt 5/16
        nxt[e + 3] += er * 0.0625; nxt[e + 4] += eg * 0.0625; nxt[e + 5] += eb * 0.0625;          // alt-sağ 1/16
      }
      var tmp = cur; cur = nxt; nxt = tmp;
    }
    return out;
  }

  /* Tek kareyi niceler: { indices: Uint8Array, table: [[r,g,b],...] (saydamsa 0 = saydam) } */
  function quantize(rgba, width, height, opts) {
    opts = opts || {};
    var transparent = !!opts.transparent;
    var maxColors = Math.min(256, Math.max(2, opts.maxColors || 256)) - (transparent ? 1 : 0);
    var h = buildHistogram(rgba, width * height, transparent);
    var palette = medianCut(h, maxColors);
    var indices = mapPixels(rgba, width, height, palette, h, opts);
    var table = transparent ? [[0, 0, 0]].concat(palette) : palette;
    return { indices: indices, table: table };
  }

  /* ── LZW ─────────────────────────────────────────────────────── */

  var HBITS = 13, HSIZE = 1 << HBITS, HMASK = HSIZE - 1;

  function lzwEncode(indices, minCodeSize, sink) {
    var CLEAR = 1 << minCodeSize, EOI = CLEAR + 1;
    var codeSize = minCodeSize + 1, nextCode = EOI + 1;
    var hKeys = new Int32Array(HSIZE), hVals = new Int16Array(HSIZE);
    hKeys.fill(-1);
    var acc = 0, nbits = 0;
    var sub = new Uint8Array(255), subLen = 0;

    function flushSub() {
      if (!subLen) return;
      sink.push(subLen);
      sink.pushBytes(sub.subarray(0, subLen));
      subLen = 0;
    }
    function emit(code) {
      acc |= code << nbits;
      nbits += codeSize;
      while (nbits >= 8) {
        sub[subLen++] = acc & 0xFF;
        if (subLen === 255) flushSub();
        acc >>>= 8;
        nbits -= 8;
      }
    }
    function reset() {
      hKeys.fill(-1);
      nextCode = EOI + 1;
      codeSize = minCodeSize + 1;
    }

    emit(CLEAR);
    var n = indices.length;
    if (!n) { emit(EOI); if (nbits > 0) { sub[subLen++] = acc & 0xFF; if (subLen === 255) flushSub(); } flushSub(); sink.push(0); return; }
    var prefix = indices[0];
    for (var i = 1; i < n; i++) {
      var k = indices[i];
      var key = (prefix << 8) | k;
      var pos = (Math.imul(key, 0x9E3779B1) >>> 0) >>> (32 - HBITS);
      var found = false;
      while (hKeys[pos] !== -1) {
        if (hKeys[pos] === key) { prefix = hVals[pos]; found = true; break; }
        pos = (pos + 1) & HMASK;
      }
      if (found) continue;
      emit(prefix);
      if (nextCode < 4096) {
        // Yazılan koddan sonra: sıradaki kod mevcut genişliğe sığmıyorsa genişlik artar (decoder ile aynı anda).
        if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
        hKeys[pos] = key; hVals[pos] = nextCode; nextCode++;
      } else {
        emit(CLEAR);
        reset();
      }
      prefix = k;
    }
    emit(prefix);
    emit(EOI);
    if (nbits > 0) { sub[subLen++] = acc & 0xFF; if (subLen === 255) flushSub(); }
    flushSub();
    sink.push(0);   // blok sonlandırıcı
  }

  /* ── GIF akışı ───────────────────────────────────────────────── */

  function GifEncoder(opts) {
    opts = opts || {};
    this.width = opts.width | 0;
    this.height = opts.height | 0;
    this.loop = opts.loop == null ? 0 : opts.loop;          // 0 = sonsuz
    this.transparent = !!opts.transparent;
    this.dither = opts.dither !== false;
    this.sink = new ByteSink(1 << 20);
    this.frames = 0;
    if (!(this.width > 0 && this.height > 0)) throw new Error("GifEncoder: geçersiz boyut");
  }

  function tableBits(count) {
    var bits = 1;
    while ((1 << bits) < count) bits++;
    return Math.max(1, Math.min(8, bits));
  }

  GifEncoder.prototype._writeHeader = function (firstTable) {
    var s = this.sink;
    s.pushBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);   // GIF89a
    s.pushU16(this.width); s.pushU16(this.height);
    var bits = tableBits(firstTable.length);
    s.push(0x80 | 0x70 | (bits - 1));                   // global tablo var, renk çözünürlüğü 8 bit
    s.push(0);                                            // arka plan dizini
    s.push(0);                                            // en-boy oranı
    this._writeTable(firstTable, bits);
    // NETSCAPE döngü uzantısı
    s.pushBytes([0x21, 0xFF, 0x0B]);
    s.pushBytes([0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30]);
    s.pushBytes([0x03, 0x01]);
    s.pushU16(this.loop & 0xFFFF);
    s.push(0);
  };

  GifEncoder.prototype._writeTable = function (table, bits) {
    var size = 1 << bits;
    for (var i = 0; i < size; i++) {
      var c = table[i] || [0, 0, 0];
      this.sink.push(c[0]); this.sink.push(c[1]); this.sink.push(c[2]);
    }
  };

  /* rgba: Uint8ClampedArray/Uint8Array (w*h*4), delayMs: kare süresi */
  GifEncoder.prototype.addFrame = function (rgba, delayMs) {
    var q = quantize(rgba, this.width, this.height, { transparent: this.transparent, dither: this.dither });
    if (this.frames === 0) this._writeHeader(q.table);
    var s = this.sink;
    var delay = Math.max(2, Math.round((delayMs || 100) / 10));
    // Grafik denetim uzantısı
    s.pushBytes([0x21, 0xF9, 0x04]);
    s.push(((this.transparent ? 2 : 1) << 2) | (this.transparent ? 1 : 0));
    s.pushU16(delay);
    s.push(0);                                            // saydam dizin
    s.push(0);
    // Görüntü tanımlayıcı + yerel renk tablosu
    var bits = tableBits(q.table.length);
    s.push(0x2C);
    s.pushU16(0); s.pushU16(0); s.pushU16(this.width); s.pushU16(this.height);
    s.push(0x80 | (bits - 1));
    this._writeTable(q.table, bits);
    var minCodeSize = Math.max(2, bits);
    s.push(minCodeSize);
    lzwEncode(q.indices, minCodeSize, s);
    this.frames++;
  };

  GifEncoder.prototype.finish = function () {
    if (this.frames === 0) this._writeHeader([[0, 0, 0], [255, 255, 255]]);
    this.sink.push(0x3B);
    var out = this.sink.toUint8Array();
    this.sink = null;
    return out;
  };

  return { GifEncoder: GifEncoder, quantize: quantize, lzwEncode: lzwEncode, ByteSink: ByteSink };
});
