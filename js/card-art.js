/* Tarjetas de «Elige una zona»: ilustraciones a las que se les quita su cielo para mostrar otro detrás.
   Una <img data-keysky> se procesa una sola vez en un lienzo: se toma el color del cielo de la esquina superior y, desde la fila de arriba, se vuelve
   transparente todo lo que tiene ese color y está conectado con el cielo (relleno por inundación). Así no se tocan los grises de la casa (techo, piso,
   ventanas) ni nada que no toque el cielo. El borde se suaviza para que montañas y árboles no queden dentados.
   Mientras se procesa, la imagen queda oculta (CSS: img[data-keysky]:not(.keyed)); si algo falla, se muestra la original. */
window.FFCardArt = (function () {
  "use strict";
  var cache = {};   // src → Promise<url sin cielo>

  function keyOut(src) {
    if (cache[src]) return cache[src];
    cache[src] = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, c = document.createElement("canvas"); c.width = w; c.height = h;
          var g = c.getContext("2d"); g.drawImage(img, 0, 0);
          var id = g.getImageData(0, 0, w, h), d = id.data, sr = d[0], sg = d[1], sb = d[2];
          var T1 = 22, T2 = 40;   // distancia de color: hasta T1 es cielo; entre T1 y T2, borde semitransparente
          var dist = function (i) { var dr = d[i] - sr, dg = d[i + 1] - sg, db = d[i + 2] - sb; return Math.sqrt(dr * dr + dg * dg + db * db); };
          var seen = new Uint8Array(w * h), stack = [];
          for (var x = 0; x < w; x++) stack.push(x);   // semillas: toda la fila de arriba
          while (stack.length) {
            var p = stack.pop(); if (seen[p]) continue; seen[p] = 1;
            var i = p * 4, dd = dist(i); if (dd > T2) continue;
            d[i + 3] = dd <= T1 ? 0 : Math.round(255 * (dd - T1) / (T2 - T1));
            if (dd > T1) continue;   // el borde no se sigue expandiendo
            var px = p % w, py = (p - px) / w;
            if (px > 0) stack.push(p - 1); if (px < w - 1) stack.push(p + 1); if (py > 0) stack.push(p - w); if (py < h - 1) stack.push(p + w);
          }
          g.putImageData(id, 0, 0);
          c.toBlob(function (b) { b ? resolve(URL.createObjectURL(b)) : reject(new Error("toBlob")); }, "image/png");
        } catch (e) { reject(e); }
      };
      img.onerror = reject; img.src = src;
    });
    cache[src].catch(function () { delete cache[src]; });
    return cache[src];
  }

  function apply(root) {
    [].forEach.call((root || document).querySelectorAll("img[data-keysky]:not(.keyed)"), function (el) {
      var src = el.getAttribute("data-keysky");
      keyOut(src).then(function (url) { el.src = url; el.classList.add("keyed"); })
        .catch(function (err) { console.error("Tarjeta de zona (cielo):", err); el.src = src; el.classList.add("keyed"); });
    });
  }
  return { apply: apply, key: keyOut };   // key: también lo usa el fondo 3D de la zona rural (js/scenery.js)
})();
