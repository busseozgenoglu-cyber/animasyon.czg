/* Canlandır — MediaRecorder'ın ürettiği WebM dosyasına süre (Duration) bilgisi ekler.
   Tarayıcı kaydı canlı akış gibi yazıldığından Info bölümünde süre yoktur; bazı oynatıcılar
   ilerleme çubuğu gösteremez. Burada Info'ya Duration öğesi eklenir, boyutlar düzeltilir. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebmFix = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ID_EBML = 0x1A45DFA3, ID_SEGMENT = 0x18538067, ID_INFO = 0x1549A966, ID_TIMECODESCALE = 0x2AD7B1, ID_DURATION = 0x4489;

  function vintLength(b) { // ilk bayttan uzunluk (1..8)
    for (var i = 0; i < 8; i++) if (b & (0x80 >> i)) return i + 1;
    return 0;
  }
  function readId(buf, pos) {
    var len = vintLength(buf[pos]);
    if (!len || len > 4) return null;
    var v = 0;
    for (var i = 0; i < len; i++) v = v * 256 + buf[pos + i];
    return { value: v, length: len };
  }
  function readSize(buf, pos) {
    var len = vintLength(buf[pos]);
    if (!len) return null;
    var v = buf[pos] & (0xFF >> len), allOnes = v === (0xFF >> len);
    for (var i = 1; i < len; i++) { v = v * 256 + buf[pos + i]; if (buf[pos + i] !== 0xFF) allOnes = false; }
    return { value: v, length: len, unknown: allOnes };
  }
  function encodeSize(value, length) {
    var out = new Uint8Array(length);
    for (var i = length - 1; i >= 0; i--) { out[i] = value & 0xFF; value = Math.floor(value / 256); }
    out[0] |= 0x80 >> (length - 1);
    return out;
  }
  function readUint(buf, pos, len) { var v = 0; for (var i = 0; i < len; i++) v = v * 256 + buf[pos + i]; return v; }

  /* Info öğesindeki çocukları tarar: { hasDuration, timecodeScale } */
  function scanInfo(buf, start, end) {
    var pos = start, hasDuration = false, timecodeScale = 1000000;
    while (pos < end) {
      var id = readId(buf, pos); if (!id) break;
      var size = readSize(buf, pos + id.length); if (!size) break;
      var dataPos = pos + id.length + size.length;
      if (id.value === ID_DURATION) hasDuration = true;
      if (id.value === ID_TIMECODESCALE) timecodeScale = readUint(buf, dataPos, size.value);
      pos = dataPos + size.value;
    }
    return { hasDuration: hasDuration, timecodeScale: timecodeScale };
  }

  /* bytes: Uint8Array; durationMs: toplam süre. Değişiklik gerekmiyorsa aynı diziyi döndürür. */
  function fixWebmDuration(bytes, durationMs) {
    var buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var pos = 0;
    var ebml = readId(buf, 0);
    if (!ebml || ebml.value !== ID_EBML) return buf;
    var ebmlSize = readSize(buf, ebml.length);
    pos = ebml.length + ebmlSize.length + ebmlSize.value;
    var seg = readId(buf, pos);
    if (!seg || seg.value !== ID_SEGMENT) return buf;
    var segSize = readSize(buf, pos + seg.length);
    var segSizePos = pos + seg.length, segDataPos = segSizePos + segSize.length;
    var p = segDataPos, end = segSize.unknown ? buf.length : Math.min(buf.length, segDataPos + segSize.value);
    while (p < end) {
      var id = readId(buf, p); if (!id) return buf;
      var size = readSize(buf, p + id.length); if (!size) return buf;
      var dataPos = p + id.length + size.length;
      if (id.value === ID_INFO) {
        if (size.unknown) return buf;
        var info = scanInfo(buf, dataPos, dataPos + size.value);
        if (info.hasDuration) return buf;
        var durationUnits = durationMs * 1000000 / info.timecodeScale;
        var durEl = new Uint8Array(2 + 1 + 8);
        durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x88;
        new DataView(durEl.buffer).setFloat64(3, durationUnits, false);
        var newInfoSize = size.value + durEl.length;
        var sizeLen = Math.max(size.length, newInfoSize < 0x7F ? 1 : newInfoSize < 0x3FFF ? 2 : newInfoSize < 0x1FFFFF ? 3 : 4);
        var delta = durEl.length + (sizeLen - size.length);
        var out = new Uint8Array(buf.length + delta);
        out.set(buf.subarray(0, p + id.length), 0);
        out.set(encodeSize(newInfoSize, sizeLen), p + id.length);
        out.set(buf.subarray(dataPos, dataPos + size.value), p + id.length + sizeLen);
        out.set(durEl, p + id.length + sizeLen + size.value);
        out.set(buf.subarray(dataPos + size.value), p + id.length + sizeLen + size.value + durEl.length);
        if (!segSize.unknown) out.set(encodeSize(segSize.value + delta, segSize.length), segSizePos);
        return out;
      }
      p = dataPos + size.value;
    }
    return buf;
  }

  return { fixWebmDuration: fixWebmDuration };
});
