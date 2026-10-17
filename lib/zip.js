/* Canlandır — bağımlılıksız ZIP yazıcı (yalnızca "store", sıkıştırmasız).
   PNG kare dizisini tek dosyada indirmek için kullanılır. Tarayıcıda ve Node'da çalışır. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CanlandirZip = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    var year = Math.max(1980, d.getFullYear());
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time & 0xFFFF, date: date & 0xFFFF };
  }

  function utf8(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, "utf8"));
  }

  function ZipWriter() {
    this.parts = [];      // Uint8Array parçaları
    this.entries = [];    // merkezi dizin için kayıtlar
    this.offset = 0;
    this.now = new Date();
  }

  ZipWriter.prototype._push = function (bytes) {
    this.parts.push(bytes);
    this.offset += bytes.length;
  };

  /* Dosya ekle: name (UTF-8 yol), data Uint8Array. */
  ZipWriter.prototype.add = function (name, data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var nameBytes = utf8(name);
    var crc = crc32(data);
    var dt = dosDateTime(this.now);
    var header = new Uint8Array(30 + nameBytes.length);
    var v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);   // yerel dosya başlığı imzası
    v.setUint16(4, 20, true);           // gereken sürüm 2.0
    v.setUint16(6, 0x0800, true);       // bayrak: UTF-8 adlar
    v.setUint16(8, 0, true);            // yöntem: store
    v.setUint16(10, dt.time, true);
    v.setUint16(12, dt.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    this.entries.push({ name: nameBytes, crc: crc, size: data.length, offset: this.offset, time: dt.time, date: dt.date });
    this._push(header);
    this._push(data);
  };

  /* Merkezi dizini yazar ve tüm arşivi tek Uint8Array olarak döndürür. */
  ZipWriter.prototype.finish = function () {
    var cdStart = this.offset;
    for (var i = 0; i < this.entries.length; i++) {
      var e = this.entries[i];
      var h = new Uint8Array(46 + e.name.length);
      var v = new DataView(h.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);         // oluşturan sürüm
      v.setUint16(6, 20, true);         // gereken sürüm
      v.setUint16(8, 0x0800, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, e.time, true);
      v.setUint16(14, e.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      v.setUint16(30, 0, true);         // ek alan
      v.setUint16(32, 0, true);         // yorum
      v.setUint16(34, 0, true);         // disk no
      v.setUint16(36, 0, true);         // iç öznitelik
      v.setUint32(38, 0, true);         // dış öznitelik
      v.setUint32(42, e.offset, true);
      h.set(e.name, 46);
      this._push(h);
    }
    var cdSize = this.offset - cdStart;
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, this.entries.length, true);
    ev.setUint16(10, this.entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdStart, true);
    ev.setUint16(20, 0, true);
    this._push(end);

    var out = new Uint8Array(this.offset), pos = 0;
    for (var p = 0; p < this.parts.length; p++) { out.set(this.parts[p], pos); pos += this.parts[p].length; }
    this.parts = [];
    return out;
  };

  return { ZipWriter: ZipWriter, crc32: crc32 };
});
