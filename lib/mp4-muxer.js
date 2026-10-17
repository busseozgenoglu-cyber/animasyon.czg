/* Canlandır — bağımlılıksız MP4 (ISO BMFF) muxer: WebCodecs VideoEncoder çıktısını (H.264/AVC "avc" biçimi
   ya da VP9) tek parçalı, hızlı başlayan (moov önde) bir .mp4 dosyasına yazar. Yalnızca video, tek parça (chunk). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Mp4Muxer = api.Mp4Muxer;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function concat(parts) {
    var n = 0, i;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), pos = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], pos); pos += parts[i].length; }
    return out;
  }
  function u8(v) { return new Uint8Array([v & 0xFF]); }
  function u16(v) { return new Uint8Array([(v >> 8) & 0xFF, v & 0xFF]); }
  function u32(v) { return new Uint8Array([(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]); }
  function i32(v) { return u32(v < 0 ? v + 0x100000000 : v); }
  function str(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xFF; return o; }
  function zeros(n) { return new Uint8Array(n); }
  function box(type) {
    var payload = concat(Array.prototype.slice.call(arguments, 1));
    return concat([u32(8 + payload.length), str(type), payload]);
  }
  function fullBox(type, version, flags) {
    var payload = concat(Array.prototype.slice.call(arguments, 3));
    return box(type, u8(version), new Uint8Array([(flags >> 16) & 0xFF, (flags >> 8) & 0xFF, flags & 0xFF]), payload);
  }
  var MATRIX = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

  /* opts: { width, height, fps, codec: 'avc' | 'vp9', description?: Uint8Array (avcC içeriği) } */
  function Mp4Muxer(opts) {
    this.width = opts.width; this.height = opts.height; this.fps = opts.fps || 30;
    this.codec = opts.codec === "vp9" ? "vp9" : "avc";
    this.description = opts.description ? new Uint8Array(opts.description) : null;
    this.timescale = Math.round(this.fps * 1000);
    this.frameDur = 1000;
    this.samples = [];      // { data, key, pts (µs) }
  }
  Mp4Muxer.prototype.setDescription = function (desc) { if (desc) this.description = new Uint8Array(desc instanceof ArrayBuffer ? desc : desc.buffer ? desc.buffer.slice(desc.byteOffset, desc.byteOffset + desc.byteLength) : desc); };
  /* WebCodecs EncodedVideoChunk ya da { data: Uint8Array, key: bool, timestamp: µs } */
  Mp4Muxer.prototype.addChunk = function (chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) this.setDescription(meta.decoderConfig.description);
    var data;
    if (typeof chunk.copyTo === "function") { data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); }
    else data = chunk.data instanceof Uint8Array ? chunk.data : new Uint8Array(chunk.data);
    this.samples.push({ data: data, key: chunk.type ? chunk.type === "key" : !!chunk.key, pts: chunk.timestamp || 0 });
  };

  Mp4Muxer.prototype._sampleEntry = function () {
    var visual = concat([
      zeros(6), u16(1),                       // reserved, data_reference_index
      u16(0), u16(0), zeros(12),              // pre_defined, reserved, pre_defined[3]
      u16(this.width), u16(this.height),
      u32(0x00480000), u32(0x00480000),       // 72 dpi
      u32(0), u16(1),                         // reserved, frame_count
      zeros(32),                              // compressorname
      u16(0x0018), u16(0xFFFF)                // depth, pre_defined
    ]);
    if (this.codec === "vp9") {
      var vpcC = fullBox("vpcC", 1, 0, u8(0), u8(10), u8((8 << 4) | (1 << 1) | 0), u8(1), u8(1), u8(1), u16(0));
      return box("vp09", visual, vpcC);
    }
    if (!this.description) throw new Error("avcC (decoderConfig.description) alınamadı");
    return box("avc1", visual, box("avcC", this.description), box("pasp", u32(1), u32(1)));
  };

  Mp4Muxer.prototype.finish = function () {
    var n = this.samples.length;
    if (!n) throw new Error("Hiç kare yok");
    var ts = this.timescale, fd = this.frameDur, mediaDur = n * fd, movieDur = Math.round(n * 1000 / this.fps);
    var i;
    // B-kare var mı? (sunum zamanı kod çözme sırasıyla aynı değilse ctts yazılır)
    var needCtts = false, offsets = new Array(n), minOff = 0;
    for (i = 0; i < n; i++) {
      var ptsUnits = Math.round(this.samples[i].pts * ts / 1e6), dts = i * fd;
      offsets[i] = ptsUnits - dts;
      if (offsets[i] !== 0) needCtts = true;
      if (offsets[i] < minOff) minOff = offsets[i];
    }
    var sizes = [], keys = [], mdatSize = 0;
    for (i = 0; i < n; i++) { sizes.push(u32(this.samples[i].data.length)); mdatSize += this.samples[i].data.length; if (this.samples[i].key) keys.push(u32(i + 1)); }

    var stsd = fullBox("stsd", 0, 0, u32(1), this._sampleEntry());
    var stts = fullBox("stts", 0, 0, u32(1), u32(n), u32(fd));
    var stss = keys.length === n ? null : fullBox("stss", 0, 0, u32(keys.length), concat(keys));
    var stsc = fullBox("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1));
    var stsz = fullBox("stsz", 0, 0, u32(0), u32(n), concat(sizes));
    var ctts = null;
    if (needCtts) {
      var entries = [], prev = null, count = 0;
      for (i = 0; i < n; i++) {
        var off = offsets[i];
        if (prev !== null && off === prev) count++;
        else { if (prev !== null) entries.push(u32(count), i32(prev)); prev = off; count = 1; }
      }
      entries.push(u32(count), i32(prev));
      ctts = fullBox("ctts", 1, 0, u32(entries.length / 2), concat(entries));
    }
    var self = this;
    function buildMoov(chunkOffset) {
      var stco = fullBox("stco", 0, 0, u32(1), u32(chunkOffset));
      var stbl = box("stbl", stsd, stts, ctts || new Uint8Array(0), stss || new Uint8Array(0), stsc, stsz, stco);
      var dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));
      var minf = box("minf", fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf, stbl);
      var mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(ts), u32(mediaDur), u16(0x55C4), u16(0));
      var hdlr = fullBox("hdlr", 0, 0, u32(0), str("vide"), zeros(12), str("VideoHandler"), u8(0));
      var mdia = box("mdia", mdhd, hdlr, minf);
      var tkhd = fullBox("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDur), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(self.width << 16), u32(self.height << 16));
      var trak = box("trak", tkhd, mdia);
      var mvhd = fullBox("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x00010000), u16(0x0100), u16(0), zeros(8), MATRIX, zeros(24), u32(2));
      return box("moov", mvhd, trak);
    }
    var ftyp = this.codec === "vp9" ? box("ftyp", str("isom"), u32(0x200), str("isom"), str("iso2"), str("mp41"))
                                    : box("ftyp", str("isom"), u32(0x200), str("isom"), str("iso2"), str("avc1"), str("mp41"));
    var moovSize = buildMoov(0).length;
    var moov = buildMoov(ftyp.length + moovSize + 8);
    var parts = [ftyp, moov, u32(8 + mdatSize), str("mdat")];
    for (i = 0; i < n; i++) parts.push(this.samples[i].data);
    return concat(parts);
  };

  /* Yardımcı: Annex-B H.264 akışını (00 00 01 başlangıç kodlu) örneklere ve avcC'ye çevirir — testler ve
     "annexb" döndüren kodlayıcılar için. */
  function parseAnnexB(bytes) {
    var nals = [], i = 0, n = bytes.length, start = -1;
    while (i + 2 < n) {
      if (bytes[i] === 0 && bytes[i + 1] === 0 && (bytes[i + 2] === 1 || (bytes[i + 2] === 0 && i + 3 < n && bytes[i + 3] === 1))) {
        var scLen = bytes[i + 2] === 1 ? 3 : 4;
        if (start >= 0) nals.push(bytes.subarray(start, trimZeros(bytes, start, i)));
        start = i + scLen; i += scLen;
      } else i++;
    }
    if (start >= 0) nals.push(bytes.subarray(start, n));
    return nals;
  }
  function trimZeros(bytes, s, e) { while (e > s && bytes[e - 1] === 0) e--; return e; }
  function buildAvcC(sps, pps) {
    return concat([u8(1), u8(sps[1]), u8(sps[2]), u8(sps[3]), u8(0xFF), u8(0xE1), u16(sps.length), sps, u8(1), u16(pps.length), pps]);
  }
  function annexBToSamples(bytes) {
    var nals = parseAnnexB(bytes), sps = null, pps = null, samples = [], cur = [], curKey = false;
    function flush() { if (cur.length) { samples.push({ data: concat(cur), key: curKey }); cur = []; curKey = false; } }
    for (var i = 0; i < nals.length; i++) {
      var nal = nals[i], type = nal[0] & 0x1F;
      if (type === 7) { sps = nal; continue; }
      if (type === 8) { pps = nal; continue; }
      if (type === 9) { flush(); continue; }      // AUD: yeni erişim birimi
      if (type === 6) continue;                   // SEI atlanır
      if (type === 1 || type === 5) {
        if (cur.length && (nal[1] & 0x80)) flush();   // first_mb_in_slice == 0 → yeni kare
        if (type === 5) curKey = true;
        cur.push(u32(nal.length), nal);
      }
    }
    flush();
    return { samples: samples, avcC: sps && pps ? buildAvcC(sps, pps) : null };
  }

  return { Mp4Muxer: Mp4Muxer, annexBToSamples: annexBToSamples, parseAnnexB: parseAnnexB, buildAvcC: buildAvcC };
});
