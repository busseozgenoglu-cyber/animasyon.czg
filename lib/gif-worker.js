/* Canlandır — GIF kodlama işçisi. Ana iş parçacığı kareleri RGBA tampon olarak gönderir,
   işçi anında kodlar; arayüz donmaz. Mesajlar: init → frame* → finish | cancel */
importScripts("gif-encoder.js");

var encoder = null;

self.onmessage = function (ev) {
  var m = ev.data || {};
  try {
    if (m.type === "init") {
      encoder = new GifEncoder({ width: m.width, height: m.height, loop: m.loop, transparent: m.transparent, dither: m.dither });
      self.postMessage({ type: "ready" });
    } else if (m.type === "frame") {
      if (!encoder) throw new Error("init bekleniyor");
      encoder.addFrame(new Uint8Array(m.buffer), m.delay);
      self.postMessage({ type: "progress", index: m.index });
    } else if (m.type === "finish") {
      if (!encoder) throw new Error("init bekleniyor");
      var bytes = encoder.finish();
      encoder = null;
      self.postMessage({ type: "done", buffer: bytes.buffer }, [bytes.buffer]);
    } else if (m.type === "cancel") {
      encoder = null;
      self.postMessage({ type: "cancelled" });
    }
  } catch (err) {
    encoder = null;
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
