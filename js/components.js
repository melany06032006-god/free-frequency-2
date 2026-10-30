/* Componentes reutilizables: cada función recibe datos y devuelve HTML. Sin estado propio.
   (La secuencia de cada alternativa y su cuadro los genera js/sequence.js.) */
window.FFC = (function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  /* iconos discretos (trazo, color heredado) para la fila de conceptos de «¿Por qué elegimos estas zonas?» */
  var IDEA_ICONS = [
    /* señal limitada: barras con las dos últimas apagadas */
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20v-3M9 20v-6" stroke-linecap="round"/><path d="M14 20v-9M19 20V7" stroke-linecap="round" opacity=".35"/></svg>',
    /* redes congestionadas: tres nodos muy conectados */
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M8.2 7h7.6M7.2 9l3.7 7M16.8 9l-3.7 7M8 8.4l8 0" stroke-linecap="round"/></svg>',
    /* alternativas de comunicación: ondas que salen de un punto */
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="1.8"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" stroke-linecap="round"/></svg>'
  ];

  /* Selector de zona: dos tarjetas (escenario + personaje) como protagonistas y, debajo, un bloque compacto con la justificación desplegable */
  function ZoneSelect(zones, progress, info) {
    return '<div class="zones-in"><h1 id="zones-title">Elige una zona</h1>' +
      '<p class="hub-sub">' + esc(info.pickLead) + '</p>' +
      '<div class="zone-cards">' + Object.keys(zones).map(function (id) {
        var z = zones[id], p = progress(id);
        return '<a class="zone-card ' + id + '" href="#' + id + '" data-zone="' + id + '">' +
          /* con cardSky: el cielo va detrás y a la ilustración se le quita su propio cielo (js/card-art.js) */
          (z.cardSky ? '<img class="zc-sky" src="' + z.cardSky + '" alt="" aria-hidden="true"><img class="zc-scene" src="' + z.cardImg + '" data-keysky="' + z.cardImg + '" alt="" aria-hidden="true">'
            : '<img class="zc-scene" src="' + (z.cardImg || z.img) + '" alt="" aria-hidden="true">') +
          '<img class="zc-char" src="' + z.char + '" alt="" aria-hidden="true">' +
          '<span class="zc-body"><b>' + esc(z.name) + "</b>" +
          '<span class="zc-foot"><span class="zc-go">' + esc(info.pickGo) + ' <span aria-hidden="true">→</span></span><span class="zc-meta">Con ' + esc(z.who) + " · " + esc(p) + "</span></span></span></a>";
      }).join("") + "</div>" +
      '<section class="zone-why" id="por-que" aria-labelledby="why-title">' +
        '<div class="zw-head"><div><h2 id="why-title">' + esc(info.whyTitle) + '</h2><p class="zw-lead">' + esc(info.whyLead) + '</p></div>' +
        '<ul class="zw-ideas">' + info.whyIdeas.map(function (t, i) { return "<li>" + IDEA_ICONS[i] + "<span>" + esc(t) + "</span></li>"; }).join("") + "</ul></div>" +
        '<details class="zw-more"><summary><span class="zw-open">' + esc(info.whyMore) + '</span><span class="zw-close">' + esc(info.whyLess) + '</span><span class="zw-chev" aria-hidden="true"></span></summary>' +
          '<div class="zw-grid">' + Object.keys(zones).map(function (id) {
            var z = zones[id];
            return '<article class="zw-card ' + id + '"><p class="zw-tag">' + esc(z.whyTag) + "</p><h3>" + esc(z.name) + '</h3><p class="zw-sum">' + esc(z.whyText) + "</p>" +
              '<p class="zw-key">' + esc(z.whyKey) + "</p>" + (z.whyFact ? '<p class="zw-fact">' + esc(z.whyFact) + " <small>" + esc(z.whyRef) + "</small></p>" : "") + "</article>";
          }).join("") + '</div><p class="zw-note">' + esc(info.whyNote) + ' <a href="#fuentes">' + esc(info.whySources) + "</a></p>" +
        "</details></section></div>";
  }

  /* Sección final y de fuentes */
  function Final(F, zones, journeys, order, visited) {
    var Q = F.quiz;
    /* enlaces de navegación: arriba, debajo del logo */
    var links = '<nav class="final-links" aria-label="Navegación">' + Object.keys(zones).map(function (id) { return '<a href="#' + id + '">Volver a: ' + esc(zones[id].name) + "</a>"; }).join("") + '<a href="#zonas">Elegir zona</a><a href="#inicio">Ir al inicio</a></nav>';
    /* reto final: una pregunta abierta y un campo para responder (sin cuadros) */
    var quiz = '<section class="quiz" aria-labelledby="quiz-q"><p class="quiz-kicker">' + esc(Q.kicker) + '</p><h2 id="quiz-q" class="quiz-q">' + esc(Q.question) + "</h2>" +
      '<label class="sr-only" for="quiz-a">Tu respuesta</label><textarea id="quiz-a" class="quiz-a" rows="4" placeholder="' + esc(Q.placeholder) + '"></textarea>' +
      '<div class="quiz-row"><button type="button" class="quiz-save">' + esc(Q.save) + '</button><p class="quiz-msg" role="status" aria-live="polite"></p></div>' +
      '<div class="quiz-hint" hidden><h3>' + esc(Q.hintTitle) + "</h3><ul>" + Q.hint.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div></section>";
    return '<div class="final-in">' + links + '<p class="kicker">Preparación y aprendizajes</p>' +
      '<h1 id="final-title">' + esc(F.title) + "</h1><p class=\"lede big\">" + esc(F.lead) + "</p>" +
      '<div class="cols">' + F.columns.map(function (c, i) {
        return '<section><span class="num">0' + (i + 1) + "</span><h3>" + esc(c.title) + "</h3><ul>" +
          c.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></section>";
      }).join("") + "</div>" +
      quiz +
      '<section class="sources-box" id="fuentes" aria-labelledby="src-title"><h3 id="src-title">' + esc(F.sourcesTitle) + "</h3><p>" + esc(F.sourcesLead) + "</p><ul>" +
      F.sources.map(function (s) { return "<li><b>" + esc(s.name) + "</b> · " + esc(s.site) + " — " + esc(s.use) + "</li>"; }).join("") + "</ul>" +
      '<p class="credits">' + esc(F.credits) + "</p></section></div>";
  }

  return { ZoneSelect: ZoneSelect, Final: Final };
})();
