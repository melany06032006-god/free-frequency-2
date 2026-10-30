// Servidor estático mínimo: npm run dev  (o: node serve.js)
// Busca un puerto libre a partir de 5190 y escribe en la terminal la dirección exacta que debes abrir.
// index.html también puede abrirse directamente con doble clic.
const http = require("http"), net = require("net"), fs = require("fs"), path = require("path");
const root = __dirname, start = +process.env.PORT || 5190;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  if (p === "/favicon.ico") p = "/assets/favicon.svg";   // algunos navegadores piden /favicon.ico aunque index.html declare el icono
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { console.log("404 " + p); res.writeHead(404); return res.end("404"); }
    // sin caché: al recargar, el navegador siempre toma la versión más reciente de los archivos
    var head = { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
    // pedidos por partes (audio): permiten conocer la duración, adelantar y repetir la canción en bucle
    var m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m) {
      var size = d.length, a = m[1] === "" ? size - +m[2] : +m[1], b = m[1] === "" || m[2] === "" ? size - 1 : Math.min(+m[2], size - 1);
      if (a >= size || a > b) { res.writeHead(416, { "Content-Range": "bytes */" + size }); return res.end(); }
      head["Content-Range"] = "bytes " + a + "-" + b + "/" + size; head["Content-Length"] = b - a + 1;
      res.writeHead(206, head); return res.end(d.subarray(a, b + 1));
    }
    res.writeHead(200, head); res.end(d);
  });
});

// Un puerto cuenta como ocupado si responde en IPv4 o en IPv6: así no se confunde con otro servidor
// (p. ej. Vite escucha en ::1 y "localhost" llegaría a él en lugar de a este proyecto).
function busy(port) {
  const probe = host => new Promise(ok => {
    const s = net.connect({ port, host, timeout: 400 });
    s.on("connect", () => { s.destroy(); ok(true); });
    s.on("timeout", () => { s.destroy(); ok(false); });
    s.on("error", () => ok(false));
  });
  return Promise.all([probe("127.0.0.1"), probe("::1")]).then(r => r[0] || r[1]);
}

(async () => {
  let port = start;
  while (await busy(port)) { console.log("Puerto " + port + " ocupado por otro programa, probando " + (port + 1) + "..."); port++; if (port > start + 30) { console.error("No hay puertos libres."); process.exit(1); } }
  server.listen(port, () => console.log("\nFree Frequency listo. Abre: http://localhost:" + port + "\n"));
})();
