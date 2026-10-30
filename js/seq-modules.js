/* Módulos de la secuencia (js/sequence.js): cada alternativa aporta su modelo 3D, sus manos, su demostración en el primer plano y sus poses.
   Contrato de un módulo (se crea con el contexto 3D `X` que le da el motor):
     root      grupo con el objeto y las manos (el motor lo mueve por las poses y lo usa en las tres etapas)
     pivot     punto de `root` que las poses colocan en el espacio
     dark      true si la escena es oscura (linterna)
     cams(portrait, aspect, tan) → { hero, close }   cámaras de las etapas 1 y 2
     duration(topicId) → segundos que dura la acción del primer plano
     pose.hero(t,info) / pose.close(info) / pose.wide(info) → { p, q, s }
     frame(info)   anima manos, pantalla, luz… según info.stage ("hero" | "close" | "wide"), info.ta (tiempo de la acción) y info.live (estado de los controles)
     reset() / finish() / setTopic(id) / setContext(id) / charAdjust(grupoPersonaje, info) / hotWorld(out)   opcionales */
(function () {
  "use strict";
  var clamp01 = function (t) { return Math.max(0, Math.min(1, t)); };
  var smooth = function (t) { t = clamp01(t); return t * t * (3 - 2 * t); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function newPose(X) { return { p: X.V(0, 0, 0), q: new X.THREE.Quaternion(), s: 1 }; }

  /* Marcar 119 (Cali, tema "voz"): estado compartido entre la pantalla 3D y los controles del cuadro (js/sequence.js).
     step: 0 inicio · 1 teclado abierto · 2 119 marcado · 3 llamada en curso · 4 llamada finalizada (simulación).
     Es solo una representación: no se llama a ningún número. MAX = duración máxima de la llamada simulada (segundos). */
  window.FFVoice = {
    MAX: 12,
    fresh: function () { return { step: 0, rec: 0, recAt: 0 }; },
    elapsed: function (v, now) { return Math.min(this.MAX, v.rec + (v.step === 3 ? ((now || performance.now()) - v.recAt) / 1000 : 0)); },
    fmt: function (sec) { var n = Math.floor(sec); return "0:" + (n < 10 ? "0" : "") + n; }
  };

  /* Mano articulada de los primeros planos (teléfono y radio), con el estilo del personaje: palma redondeada y dedos gruesos de puntas romas.
     Cada dedo tiene tres falanges de largo FIJO unidas por articulaciones (solo giran: nada se estira) y el pulgar sale del lado de la palma.
     El antebrazo es otra pieza de largo fijo que sale de la muñeca; para alcanzar un punto se mueve la mano entera (nunca se alargan dedos ni brazos).
     Ejes locales de la mano: +Y = hacia los dedos, +Z = hacia donde mira la palma, origen en la muñeca. side = +1 mano derecha, −1 izquierda (lado del pulgar). */
  var FINGERS = { indice: { x: 0.2, y: 0.54, r: 0.078, len: [0.24, 0.17, 0.14], splay: 0.07 }, medio: { x: 0.068, y: 0.57, r: 0.08, len: [0.26, 0.18, 0.15], splay: 0.0 },
    anular: { x: -0.068, y: 0.55, r: 0.077, len: [0.24, 0.17, 0.14], splay: -0.06 }, menique: { x: -0.2, y: 0.5, r: 0.068, len: [0.19, 0.13, 0.11], splay: -0.14 } };
  function makeHand(X, side, opts) {
    var THREE = X.THREE, V = X.V, skin = X.skin, hand = new THREE.Group(), fore = new THREE.Group(), joints = {}, s = side;
    function seg(parent, len, r, y) {
      var j = new THREE.Group(); j.position.y = y; parent.add(j);
      var m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 12), skin); m.position.y = len / 2; j.add(m);
      j.userData.len = len; return j;
    }
    var palm = new THREE.Mesh(X.rbox(0.6, 0.6, 0.25, 0.22, 0.08), skin); palm.position.set(0, 0.29, 0); hand.add(palm);
    var heel = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), skin); heel.scale.set(1.25, 0.9, 0.75); heel.position.set(s * 0.08, 0.1, 0.02); hand.add(heel);
    Object.keys(FINGERS).forEach(function (k) {
      var F = FINGERS[k], base = new THREE.Group(); base.position.set(s * F.x, F.y, 0); base.rotation.z = s * -F.splay; hand.add(base);
      var j0 = seg(base, F.len[0], F.r, 0), j1 = seg(j0, F.len[1], F.r * 0.96, F.len[0]), j2 = seg(j1, F.len[2], F.r * 0.9, F.len[1]);
      joints[k] = [j0, j1, j2];
    });
    /* pulgar: tres piezas; la base sale de la parte baja de la palma, del lado del pulgar, inclinada hacia la palma */
    var tb = new THREE.Group(); tb.position.set(s * 0.24, 0.13, 0.05); hand.add(tb);
    var t0 = seg(tb, 0.17, 0.088, 0), t1 = seg(t0, 0.16, 0.085, 0.17), t2 = seg(t1, 0.13, 0.08, 0.16); joints.pulgar = [t0, t1, t2];
    var wrist = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), skin); hand.add(wrist);
    /* antebrazo: piel algo más ancha hacia el codo; en el Cauca, puño enrollado y manga a cuadros; en Cali, brazo descubierto con pulsera */
    var L = 2.4, fa = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, L, 18, 1), skin); fa.position.y = L / 2; fore.add(fa);
    var cuff = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.06, 10, 24), X.sleeveMat); cuff.rotation.x = Math.PI / 2; cuff.position.y = 1.55; fore.add(cuff);
    var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, L - 1.55, 18, 1), X.sleeveMat); sleeve.position.y = 1.55 + (L - 1.55) / 2; fore.add(sleeve);
    var bracelet = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), X.gold); bracelet.rotation.x = Math.PI / 2; bracelet.position.y = 0.2; fore.add(bracelet);
    var h = { side: side, scale: (opts && opts.scale) || 1, group: hand, forearm: fore, joints: joints, q: new THREE.Quaternion(), _m: new THREE.Matrix4(), _x: V(0, 0, 0), _y: V(0, 0, 0), _z: V(0, 0, 0), _p: V(0, 0, 0) };
    h.setContext = function (C3) { var plaid = C3.sleeve === "plaid"; cuff.visible = sleeve.visible = plaid; bracelet.visible = !!C3.bracelet; };
    /* curls: { indice: [a, b, c], …, pulgar: [a, b, c] } en radianes (positivo = hacia la palma); thumb: dirección de la base del pulgar en ejes de la mano */
    h.pose = function (curls, thumb) {
      Object.keys(joints).forEach(function (k) { var c = curls[k] || [0, 0, 0]; joints[k][0].rotation.x = c[0]; joints[k][1].rotation.x = c[1]; joints[k][2].rotation.x = c[2]; });
      if (thumb) tb.quaternion.setFromUnitVectors(V(0, 1, 0), V(s * thumb[0], thumb[1], thumb[2]).normalize());
    };
    /* orientación: dir = hacia donde apuntan los dedos, palm = hacia donde mira la palma (en el espacio del módulo) */
    h.orient = function (dir, palm) {
      var y = h._y.copy(dir).normalize(), z = h._z.copy(palm).addScaledVector(y, -palm.dot(y)).normalize(), x = h._x.copy(y).cross(z);
      h.q.setFromRotationMatrix(h._m.makeBasis(x, y, z)); hand.quaternion.copy(h.q);
    };
    /* punta de un dedo en ejes de la mano (con la pose actual) */
    h.tipLocal = function (k, out) {
      var js = joints[k]; out.set(0, js[2].userData.len + js[2].children[0].geometry.parameters.radius * 0.8, 0);
      for (var i = 2; i >= 0; i--) { js[i].updateMatrix(); out.applyMatrix4(js[i].matrix); }
      var b = js[0].parent; b.updateMatrix(); return out.applyMatrix4(b.matrix);
    };
    /* coloca la muñeca para que la punta del dedo k quede en `target` (no se estira nada: se mueve la mano entera) */
    h.placeTip = function (k, target) { h.tipLocal(k, h._p).multiplyScalar(h.scale).applyQuaternion(h.q); h.place(target.clone().sub(h._p)); };
    h.place = function (w) { hand.position.copy(w); fore.position.copy(w); };
    /* coloca la muñeca para que un punto de la mano (en ejes de la mano, sin escala) quede en `world` */
    h.placeLocal = function (local, world) { h.place(h._p.copy(local).multiplyScalar(h.scale).applyQuaternion(h.q).negate().add(world)); };
    /* orienta la mano para que un vector propio (lp) apunte a wp y, dentro de lo posible, otro (ls) apunte a ws */
    var e1 = V(0, 0, 0), e2 = V(0, 0, 0), e3 = V(0, 0, 0), w1 = V(0, 0, 0), w2 = V(0, 0, 0), w3 = V(0, 0, 0), mE = new THREE.Matrix4(), mW = new THREE.Matrix4();
    function frame(a, b, o1, o2, o3) { o1.copy(a).normalize(); o2.copy(b).addScaledVector(o1, -b.dot(o1)).normalize(); o3.copy(o1).cross(o2); }
    h.align = function (lp, wp, ls, ws) {
      frame(lp, ls, e1, e2, e3); frame(wp, ws, w1, w2, w3);
      mE.makeBasis(e1, e2, e3); mW.makeBasis(w1, w2, w3); h.q.setFromRotationMatrix(mW.multiply(mE.transpose())); hand.quaternion.copy(h.q);
    };
    h.armDir = function (d) { fore.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); };
    hand.scale.setScalar(h.scale); fore.scale.setScalar(h.scale);
    if (opts && opts.parent) { opts.parent.add(hand); opts.parent.add(fore); }
    return h;
  }


  /* ======================================================= LINTERNA ======================================================= */
  FFSeq.modules.torch = function (X) {
    var THREE = X.THREE, V = X.V, M = X.M, skin = X.skin, rbox = X.rbox;
    var glows = [], beamHolder = {};
    var torch = M.buildTorch(glows, beamHolder), tu = torch.userData, beam = beamHolder.beam, lensMat = glows[0];
    var root = new THREE.Group(); root.add(torch);
    var spot = new THREE.SpotLight(0xfff0c8, 0, 16, 0.5, 0.7, 1.1); X.scene.add(spot); X.scene.add(spot.target);
    /* Recorrido «apagón» (Cali; mod.setApagon(true)): la luz se ve con claridad en el plano completo. El haz apunta a la calle junto a la chica y la
       recorre, el cono se alarga desde la boca hasta el suelo con un brillo más parejo, un círculo de luz marca dónde cae y la luz real es más intensa.
       En Cauca (código Morse) todo queda como antes. */
    /* círculo de luz en el suelo donde apunta la linterna (plano completo): deja ver con claridad que la luz ilumina el camino y los obstáculos */
    var poolMat = new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,   // pegado a la calle: se dibuja por encima sin parpadear (como un calco sobre el suelo)
      map: X.canvasTex(128, 128, function (x, w, h) { var g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); }) });
    var pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat); pool.rotation.order = "YXZ"; pool.renderOrder = 2; X.scene.add(pool);
    /* apagón: el haz debe verse a lo largo de todo el cono (por defecto se concentra junto al lente): alfa más parejo, de la boca hacia el extremo */
    function evenBeam() { var ca = beam.geometry.attributes.color, bp = beam.geometry.attributes.position, bh = beam.geometry.parameters.height;
      for (var i = 0; i < ca.count; i++) { var tt = (bp.getY(i) + bh / 2) / bh; ca.setW(i, 0.16 + 0.34 * tt); } ca.needsUpdate = true; }

    /* mano (articulada, ver makeHand, la misma del teléfono y la radio) que sujeta la linterna y presiona el botón con el índice.
       El botón real del modelo (tu.sw) está en el costado +x del mango, a y = 1,6, mirando hacia +x; el mango es un cilindro de radio 0,3 en el eje y.
       La mano rodea el mango con el pulgar hacia arriba: medio, anular y meñique lo envuelven, el pulgar lo abraza por el otro lado y el índice
       (el dedo de arriba) llega por el costado hasta apoyar la yema en el centro del botón. La pose se calcula al crear la escena:
       · para cada giro y altura posibles de la mano, cada dedo del agarre se cierra lo justo para quedar pegado al mango sin atravesarlo;
       · el índice (flexión de sus tres falanges y una ligera apertura) se ajusta para que la yema quede sobre el botón sin tocar la carcasa;
       · se elige la combinación con la yema más cerca del botón y sin dedos metidos en la geometría.
       Se resuelve con el botón suelto y hundido; al encender, el índice pasa de una pose a la otra (presiona). */
    var hands = new THREE.Group(); torch.add(hands);
    var HAND = makeHand(X, 1, { parent: hands, scale: 1.4 }), HS = HAND.scale;
    var AX_R = 0.3, HOUSING = { x0: 0.18, x1: 0.44, y0: 1.41, y1: 1.79, z0: -0.12, z1: 0.12 };
    var THUMB = [-0.3, 0.6, 0.6], GRIPF = ["medio", "anular", "menique", "pulgar"];
    var AWAY = V(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, -0.5, -0.55)).invert());
    var mA = new THREE.Matrix4(), idxBase = HAND.joints.indice[0].parent, idxSplay0 = idxBase.rotation.z;
    function handFrame(th, h) {
      var R0 = AX_R + 0.125 * HS + 0.015, n = V(-Math.cos(th), 0, -Math.sin(th)), t = V(Math.sin(th), 0, -Math.cos(th));
      HAND.align(V(0, 1, 0), t, V(0, 0, 1), n); HAND.placeLocal(V(0, 0.29, 0), V(R0 * Math.cos(th), h, R0 * Math.sin(th)));
      HAND.armDir(t.clone().negate().add(V(0, -0.45, 0)).addScaledVector(AWAY, 0.6));
    }
    var cur = { indice: [0.3, 0.6, 0.3], medio: [0.9, 1.0, 0.6], anular: [0.9, 1.0, 0.6], menique: [0.9, 1.0, 0.6], pulgar: [0.3, 0.4, 0.3] }, splay = 0;
    function apply() { HAND.pose(cur, THUMB); idxBase.rotation.z = idxSplay0 + splay; }
    function toWorld(p) { return p.multiplyScalar(HS).applyQuaternion(HAND.q).add(HAND.group.position); }
    /* puntos a lo largo de un dedo (en el espacio de la linterna) para medir choques; el último es la yema */
    function fingerPoints(k, out) {
      var js = HAND.joints[k], b = js[0].parent; b.updateMatrix(); mA.copy(b.matrix); out.length = 0;
      for (var i = 0; i < 3; i++) {
        js[i].updateMatrix(); mA.multiply(js[i].matrix); var L = js[i].userData.len;
        for (var f = 0; f <= 2; f++) out.push(toWorld(V(0, L * f / 2, 0).applyMatrix4(mA)));
      }
      var r = js[2].children[0].geometry.parameters.radius; out.push(toWorld(V(0, js[2].userData.len + r * 0.8, 0).applyMatrix4(mA)));
      return out;
    }
    var pts = [];
    function radius(k) { return HAND.joints[k][0].children[0].geometry.parameters.radius * HS * 0.9; }
    function intrusion(k) {   // cuánto se mete un dedo en el mango o en la carcasa del botón
      var r = radius(k), s = 0;
      fingerPoints(k, pts).forEach(function (p) {
        if (p.y > 0.25 && p.y < 2.05) { var d = Math.hypot(p.x, p.z) - (AX_R + r); if (d < 0) s += d * d; }
        if (p.x > HOUSING.x0 - r && p.x < HOUSING.x1 && p.y > HOUSING.y0 - r && p.y < HOUSING.y1 + r && p.z > HOUSING.z0 - r && p.z < HOUSING.z1 + r) s += 0.02;
      });
      return s;
    }
    function hug(k) {   // los dedos del agarre: pegados al mango (ni metidos ni separados)
      var r = radius(k), s = 0; fingerPoints(k, pts);
      for (var i = 3; i < pts.length; i++) { var d = Math.hypot(pts[i].x, pts[i].z) - (AX_R + r + 0.01); s += d < 0 ? d * d * 60 : d * d * 2; }
      return s;
    }
    function descend(vars, f) {   // descenso por coordenadas: vars = [[obj, key, i, min, max], …]
      var best = f(), step = 0.25;
      for (var it = 0; it < 45 && step > 0.006; it++) {
        var improved = false;
        for (var j = 0; j < vars.length; j++) for (var sg = -1; sg <= 1; sg += 2) {
          var v = vars[j], o = v[0][v[1]], old = v[2] < 0 ? o : o[v[2]], nv = Math.max(v[3], Math.min(v[4], old + sg * step));
          if (v[2] < 0) v[0][v[1]] = nv; else o[v[2]] = nv;
          apply(); var c = f();
          if (c < best) { best = c; improved = true; } else { if (v[2] < 0) v[0][v[1]] = old; else o[v[2]] = old; }
        }
        if (!improved) step *= 0.5;
      }
      apply(); return best;
    }
    var BTN_C = V(0.42, 1.6, 0), tipR = HAND.joints.indice[2].children[0].geometry.parameters.radius * HS;
    function btnTarget(press, out) { return out.set(BTN_C.x - 0.05 * press + 0.06 + tipR * 0.35, BTN_C.y, BTN_C.z); }
    function solveGrip() { GRIPF.forEach(function (k) { descend([[cur, k, 0, 0, 1.7], [cur, k, 1, 0, 1.8], [cur, k, 2, 0, 1.4]], function () { return hug(k); }); }); }
    function solveIndex(target) {
      return descend([[cur, "indice", 0, -0.1, 1.6], [cur, "indice", 1, 0, 1.7], [cur, "indice", 2, 0, 1.4], [{ s: 0 }, "s", -1, 0, 0]].slice(0, 3).concat([[holder, "splay", -1, -0.9, 0.45]]), function () {
        splay = holder.splay; apply(); var p = fingerPoints("indice", pts), tip = p[p.length - 1];
        var ex = Math.max(0, Math.abs(holder.splay) - 0.3);   // abrir el índice más de ~17° se ve forzado
        return tip.distanceToSquared(target) * 120 + intrusion("indice") * 80 + ex * ex * 4;
      });
    }
    var holder = { splay: 0 };
    var SOL = (function () {
      var best = null, tgt = btnTarget(0, V(0, 0, 0));
      for (var th = Math.PI * 0.3; th <= Math.PI * 0.85; th += Math.PI * 0.05) for (var h = 1.08; h <= 1.46; h += 0.05) {
        handFrame(th, h); cur.indice = [0.3, 0.6, 0.3]; holder.splay = splay = 0; GRIPF.forEach(function (k) { cur[k] = k === "pulgar" ? [0.3, 0.4, 0.3] : [0.9, 1.0, 0.6]; }); apply();
        solveGrip(); var ci = solveIndex(tgt);
        var other = GRIPF.reduce(function (a, k) { return a + intrusion(k); }, 0), c = ci + other * 60;
        if (!best || c < best.c) best = { c: c, th: th, h: h, cur: JSON.parse(JSON.stringify(cur)), splay: holder.splay };
      }
      handFrame(best.th, best.h); cur = best.cur; holder.splay = splay = best.splay; apply();
      var up = cur.indice.slice(), upSplay = splay;
      solveIndex(btnTarget(1, V(0, 0, 0)));
      var down = cur.indice.slice(), downSplay = holder.splay;
      cur.indice = up; splay = upSplay; apply();
      return { th: best.th, h: best.h, up: up, down: down, upSplay: upSplay, downSplay: downSplay, cost: best.c };
    })();
    function placeHand(press) {
      var a = SOL.up, b = SOL.down;
      cur.indice = [a[0] + (b[0] - a[0]) * press, a[1] + (b[1] - a[1]) * press, a[2] + (b[2] - a[2]) * press];
      splay = SOL.upSplay + (SOL.downSplay - SOL.upSplay) * press; apply();
    }
    placeHand(0);
    /* obstáculos cercanos que la luz deja ver (escombros del apagón en Cali; en la zona rural no se muestran) */
    var obstacles = [];
    function obstacle(geo, color, x, y, z, ry) { var m = new THREE.Mesh(geo, X.envMat(new THREE.MeshLambertMaterial({ color: color }))); m.position.set(x, y, z); m.rotation.y = ry || 0; X.env.add(m); obstacles.push(m); return m; }
    var crate = obstacle(new THREE.BoxGeometry(0.8, 0.6, 0.7), 0xc8a46a, 1.8, 0.3, 1.9, 0.5);   // apagón: se aparta a (3,1; 0,9) para no tapar la calle donde cae la luz
    obstacle(new THREE.BoxGeometry(1.5, 0.12, 0.3), 0x9a6a46, 2.4, 0.06, 1.1, -0.35);
    obstacle(new THREE.DodecahedronGeometry(0.28), 0xb9b2a6, 1.0, 0.2, 2.5, 0.3);
    obstacle(new THREE.DodecahedronGeometry(0.2), 0xa39d92, 1.3, 0.14, 2.9, 1.1);
    obstacle(new THREE.CylinderGeometry(0.25, 0.28, 0.7, 14), 0xd7653a, 3.0, 0.35, 2.3, 0);
    obstacle(new THREE.BoxGeometry(0.5, 0.35, 0.5), 0x8d8f9c, -1.9, 0.18, 1.2, 0.2);

    /* poses */
    var SCALE_WIDE = 0.3, W_IN_TORCH = V(0, 1.05, -0.62), poseA = newPose(X), poseB = newPose(X), poseC = newPose(X);
    var CLOSE_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, -0.5, -0.22)), beamDir = V(0, 0, 0), up = V(0, 1, 0), zz = V(0, 0, 0), xx = V(0, 0, 0), mx = new THREE.Matrix4();   // práctica: casi vertical, con el interruptor hacia quien mira
    var pressed = false, level = 0, press = 0, q1 = new THREE.Quaternion(), u3 = V(0, 0, 0), v1 = V(0, 0, 0);

    var mod = {
      root: root, pivot: V(0, 0, 0), dark: true, mode: null, apagon: false, noBox: [hands, beam],
      setApagon: function (on) {
        if (!on || mod.apagon) return; mod.apagon = true;
        evenBeam(); crate.position.set(3.1, 0.3, 0.9);
        spot.distance = 18; spot.angle = 0.55; spot.penumbra = 0.6; spot.decay = 1;
      },
      setContext: function (id, C3) { HAND.setContext(C3); obstacles.forEach(function (m) { m.visible = id !== "rural"; }); },
      cams: function (portrait, aspect, tn) {
        var d = Math.max(3.4 / (2 * tn * aspect), 4.6 / (2 * tn));   // distancia para que quepan la linterna y las dos manos en vertical
        var dy = portrait ? 1.0 : 0, dc = portrait ? 1.55 : 0;   // en vertical el cuadro ocupa la parte baja: el objeto y las manos suben
        if (portrait || window.innerWidth <= 720) {   /* celular: el cuadro ocupa la parte baja; la linterna y las manos se encuadran completas en la mitad de arriba */
          var up = 0.5 - 0.3, hh = Math.max(3.6 / (0.46 * 2 * tn), 2.8 / (2 * tn * aspect)), hk = Math.max(4.8 / (0.46 * 2 * tn), 4.0 / (2 * tn * aspect));
          var yh = 1.65 - up * 2 * hh * tn, yk = 1.45 - up * 2 * hk * tn;
          return { hero: { p: V(0, yh + 0.2, hh), l: V(0, yh, 0) }, close: { p: V(0.3, yk + 0.25, hk), l: V(0.3, yk, 0) } };
        }
        /* en pantallas anchas el cuadro ocupa la derecha (~38 %): la linterna y las manos se encuadran completas y centradas en el espacio libre de la izquierda */
        var free = 0.6, cx = 0.5 - free / 2;
        var dh = Math.max(5.4 / (2 * tn), 2.8 / (2 * tn * aspect * free)), sh = cx * 2 * dh * tn * aspect;
        var dk = Math.max(6.2 / (2 * tn), 4.6 / (2 * tn * aspect * free)), sk = cx * 2 * dk * tn * aspect;
        return { hero: { p: V(sh, 1.75, dh), l: V(sh, 1.65, 0) }, close: { p: V(0.15 + sk, 1.75, dk), l: V(0.15 + sk, 1.45, 0) } };
      },
      duration: function () { return 3.2; },
      pose: {
        hero: function (time) { poseA.p.set(0, 0.05, 0); poseA.q.setFromEuler(new THREE.Euler(0, time * 0.7, 0)); poseA.s = 1.12; return poseA; },
        close: function () { poseB.p.set(-0.1, 0.25, 0); poseB.q.copy(CLOSE_Q); poseB.s = 1; return poseB; },
        wide: function (info) {
          var sw = info.sweep, wr = info.wrist;
          /* mod.mode (recorrido «apagón»): "scan" = el haz barre despacio el suelo cercano (los escombros); "signal" = apunta hacia arriba, a un lugar visible */
          var up2 = mod.sos || mod.mode === "signal", T = X.reduce ? 0 : performance.now() / 1000;
          if (up2) beamDir.set(0.75, 0.22, 0.62).normalize();   // señal: el haz apunta hacia un lado y hacia arriba, hacia el fondo de la escena
          else if (mod.apagon) {   /* el haz apunta a la calle a la derecha de la chica, entre ella y el cuadro (delante de ella casi no se ve suelo: sus pies
                                      están cerca del borde inferior), en diagonal: el cono se ve de perfil. Al barrer, recorre la calle y los escombros */
            var sx = mod.mode === "scan" ? Math.sin(T * 0.9) : Math.sin(sw);
            beamDir.set(2.0 + 0.6 * sx - wr.x, -wr.y, 0.7 - wr.z).normalize();
          }
          else beamDir.set(0.35 + 0.42 * Math.sin(sw), -0.62 + 0.05 * Math.sin(sw * 2), 0.85).normalize();
          zz.copy(up).addScaledVector(beamDir, -up.dot(beamDir)).normalize().negate(); xx.copy(beamDir).cross(zz).normalize();
          poseC.q.setFromRotationMatrix(mx.makeBasis(xx, beamDir.clone(), zz)); poseC.s = SCALE_WIDE;
          poseC.p.copy(wr).sub(u3.copy(W_IN_TORCH).multiplyScalar(SCALE_WIDE).applyQuaternion(poseC.q)); poseC.p.y += info.character3D ? 0.16 : 0; if (up2) poseC.p.y += 0.22;   // el agarre del modelo queda en la muñeca de la ilustración
          return poseC;
        }
      },
      reset: function () { pressed = false; level = 0; },
      finish: function () { pressed = true; X.setLight(true); level = X.reduce ? 1 : level; },
      hotWorld: function (out) { return tu.sw.getWorldPosition(out); },
      charAdjust: function (cg, info) {
        X.charMat.emissiveIntensity = 0.5 - 0.25 * level;
        cg.rotation.x = X.reduce ? 0 : -0.04 * level; cg.rotation.y = X.reduce ? 0 : 0.16 * Math.sin(info.sweep) * level;
      },
      frame: function (info) {
        var live = info.live, st = info.stage;
        hands.visible = st !== "hero" && !info.practice && !(info.character3D && st === "wide"); hands.position.y = -2.6 * (1 - info.rise);
        var kL = Math.max(0.001, info.leftK);
        [HAND].forEach(function (h) { h.forearm.visible = info.armsK > 0; h.group.scale.setScalar(kL * h.scale); h.forearm.scale.setScalar(kL * h.scale); });
        hands.visible = hands.visible && info.leftK > 0.01;
        /* acción: el pulgar baja sobre el interruptor y la linterna se enciende */
        if (!X.guided && !info.practice && !pressed && st === "wide") { pressed = true; X.setLight(true); }   // práctica: la luz solo la enciende el usuario
        var target = X.guided || info.practice ? (live.light ? 1 : 0) : (performance.now() - live.kick < 140 ? 1 : 0);   // el botón se hunde mientras la luz está encendida   // en el recorrido guiado el pulgar sigue a la luz: presionado = encendida
        press += (target - press) * Math.min(1, info.dt * 18);
        tu.sw.position.x = 0.42 - 0.05 * press;
        placeHand(press);
        level += ((live.light ? 1 : 0) - level) * (X.reduce ? 1 : Math.min(1, info.dt * (mod.slow ? 1.3 : 10)));   // mod.slow: la luz sube poco a poco en la presentación
        lensMat.color.copy(lensMat.userData.base).multiplyScalar(0.28 + level * 0.9);
        var wideK = st === "wide" ? info.kOut : (info.fromWide ? 1 - info.kIn : 0);
        beam.visible = level > 0.02;
        if (mod.apagon) {   /* el cono se alarga desde la boca de la linterna hasta el suelo (la base queda fija en el lente) */
          beam.material.opacity = level * lerp(0.6, 0.95, wideK);
          var by = lerp(1, 3.6, wideK); beam.scale.set(lerp(1, 3.4, wideK), by, lerp(1, 3.4, wideK)); beam.position.y = 3.02 + 0.8 * by;
        } else { beam.material.opacity = level * 0.6; beam.scale.set(lerp(1, 3.4, wideK), lerp(1, 4.4, wideK), lerp(1, 3.4, wideK)); }
        tu.lens.getWorldPosition(u3); spot.position.copy(u3);
        torch.getWorldQuaternion(q1); v1.set(0, 1, 0).applyQuaternion(q1); spot.target.position.copy(u3).addScaledVector(v1, 6);
        spot.intensity = level * (info.envA > 0.3 ? (mod.apagon ? 4.2 : 2.6) : 0.9);
        /* círculo de luz (apagón): intersección del eje del haz con el suelo; más grande y alargado cuanto más lejos e inclinado */
        if (mod.apagon && info.envA > 0.3 && level > 0.02 && v1.y < -0.15) {
          var d = (0.02 - u3.y) / v1.y, r = 0.35 + d * Math.tan(0.42);
          pool.position.set(u3.x + v1.x * d, 0.02, u3.z + v1.z * d);
          pool.rotation.set(-Math.PI / 2, 0, Math.atan2(-v1.x, -v1.z), "YXZ");   // el lado largo del círculo, en la dirección horizontal del haz
          pool.scale.set(r * 2, r * 2 / Math.max(0.35, -v1.y), 1);
          poolMat.opacity = level * 0.85 * info.envA;
        } else poolMat.opacity = 0;
        pool.visible = poolMat.opacity > 0.01;
      }
    };
    return mod;
  };

  /* ======================================================= TELÉFONO ======================================================= */
  FFSeq.modules.phone = function (X) {
    var THREE = X.THREE, V = X.V, M = X.M, skin = X.skin, rbox = X.rbox;
    var glows = [], phone = M.buildPhone(glows), ud = phone.userData;
    ud.dock.visible = false; ud.body.rotation.x = 0; phone.position.set(0, -1.36, 0);
    var root = new THREE.Group(); root.add(phone);

    /* pantalla dibujada en un canvas (se redibuja solo cuando cambia el estado) */
    var cv = document.createElement("canvas"); cv.width = 256; cv.height = 548; var g = cv.getContext("2d");
    var tex = new THREE.CanvasTexture(cv); ud.screen.material.map = tex; ud.screen.material.needsUpdate = true;
    var topicId = "sms", lastKey = "", tapIdx = 0;
    function rr(x, y, w, h, r, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }
    function txt(s, x, y, size, color, align, weight) { g.fillStyle = color; g.font = (weight || "bold") + " " + size + "px Arial, sans-serif"; g.textAlign = align || "left"; g.fillText(window.FFi18n ? FFi18n.t(s) : s, x, y); }
    function bars(n, x0, y0, color) { for (var i = 0; i < 4; i++) { var bh = 6 + i * 5; g.fillStyle = i < n ? color : "rgba(120,120,130,.35)"; g.fillRect(x0 + i * 9, y0 - bh, 6, bh); } }
    function plane(cx, cy, s, color) { g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = color; g.beginPath(); g.moveTo(0, -12); g.lineTo(3, -12); g.lineTo(11, 0); g.lineTo(11, 3); g.lineTo(2, 1); g.lineTo(2, 8); g.lineTo(6, 11); g.lineTo(6, 13); g.lineTo(0, 11); g.lineTo(-6, 13); g.lineTo(-6, 11); g.lineTo(-2, 8); g.lineTo(-2, 1); g.lineTo(-11, 3); g.lineTo(-11, 0); g.lineTo(-3, -12); g.closePath(); g.fill(); g.restore(); }
    function circ(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
    /* logo de Free Frequency (blanco) en la barra superior del teléfono, centrado entre la hora y la señal */
    function logo(cx, cy, size) { g.font = size + "px Georgia, 'Times New Roman', serif"; var w1 = g.measureText("Free ").width; g.font = "italic " + size + "px Georgia, 'Times New Roman', serif"; var w2 = g.measureText("Frequency").width, x0 = cx - (w1 + w2) / 2; g.fillStyle = "#ffffff"; g.textAlign = "left"; g.font = size + "px Georgia, 'Times New Roman', serif"; g.fillText("Free ", x0, cy); g.font = "italic " + size + "px Georgia, 'Times New Roman', serif"; g.fillText("Frequency", x0 + w1, cy); }
    function smsIcon(x, y, s2, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x + 3 * s2, y); g.lineTo(x + 21 * s2, y); g.quadraticCurveTo(x + 24 * s2, y, x + 24 * s2, y + 3 * s2); g.lineTo(x + 24 * s2, y + 15 * s2); g.quadraticCurveTo(x + 24 * s2, y + 18 * s2, x + 21 * s2, y + 18 * s2); g.lineTo(x + 10 * s2, y + 18 * s2); g.lineTo(x + 4 * s2, y + 23 * s2); g.lineTo(x + 4 * s2, y + 18 * s2); g.lineTo(x + 3 * s2, y + 18 * s2); g.quadraticCurveTo(x, y + 18 * s2, x, y + 15 * s2); g.lineTo(x, y + 3 * s2); g.quadraticCurveTo(x, y, x + 3 * s2, y); g.fill(); g.fillStyle = "#e9dfc8"; [7, 12, 17].forEach(function (dx) { g.beginPath(); g.arc(x + dx * s2, y + 9 * s2, 1.7 * s2, 0, 6.3); g.fill(); }); }
    /* barra superior: hora, logo y señal; netLabel (opcional) = tipo de red activo ("5G", "3G"…), a la izquierda de las barras */
    function statusBar(nBars, air, netLabel) { g.fillStyle = "#1e2236"; g.fillRect(0, 0, 256, 40); txt("9:41", 18, 26, 15, "#f6efe2", "left"); logo(128, 27, 15); if (air) plane(226, 21, 0.7, "#ffb627"); else bars(nBars, 206, 30, "#ffb627"); if (netLabel && !air) g.fillStyle = "#ffb627", g.font = "bold 12px Arial, sans-serif", g.textAlign = "right", g.fillText(netLabel, 202, 29); }

    /* teclado: posiciones (px del canvas) */
    var ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"], ROWY = [336, 382, 428], ROWX0 = [20, 32, 56];
    function keyPos(ch) {
      if (ch === " ") return [128, 474];
      for (var r = 0; r < 3; r++) { var i = ROWS[r].indexOf(ch); if (i >= 0) return [ROWX0[r] + i * 24, ROWY[r]]; }
      return [128, 400];
    }
    var MSG = window.FFi18n ? FFi18n.t("estoy bien") : "estoy bien", SMS_TAPS = [];
    MSG.split("").forEach(function (ch, i) { var p = keyPos(ch); SMS_TAPS.push({ t: 0.5 + i * 0.24, x: p[0], y: p[1], ch: ch }); });
    SMS_TAPS.push({ t: 3.3, x: 218, y: 274, send: true });
    var SCRIPTS = {
      sms: { A: 5.0, taps: SMS_TAPS },
      llamadas: { A: 5.4, taps: [{ t: 1.0, x: 128, y: 126 }, { t: 4.5, x: 128, y: 472 }] },
      cobertura: { A: 5.0, taps: [{ t: 0.9, x: 128, y: 432 }] },
      lugar: { A: 4.2, taps: [{ t: 1.2, x: 128, y: 432 }] },   // «Buscar un lugar con mejor señal»: toca «Actualizar» y sigue «Sin servicio»
      avion: { A: 5.0, taps: [{ t: 1.0, x: 196, y: 204 }, { t: 3.3, x: 196, y: 204 }] },
      red: { A: 5.0, taps: [{ t: 1.0, x: 128, y: 266 }] },   // toca «3G» en el menú «Tipo de red preferido»
      voz: { A: 6.0, taps: [{ t: 0.8, x: 128, y: 165 }, { t: 1.6, x: 64, y: 232 }, { t: 2.1, x: 64, y: 232 }, { t: 2.6, x: 192, y: 348 }, { t: 3.4, x: 128, y: 478 }, { t: 5.3, x: 128, y: 472 }] }   // abrir «Teléfono» · 1 · 1 · 9 · llamar · colgar
    };
    SCRIPTS.reconexion = SCRIPTS.avion;   // en la zona rural el tema de reconexión usa la misma demostración del modo avión
    function tapped(id, ta, i) { var tp = SCRIPTS[id].taps[i]; return ta >= tp.t + 0.04; }
    function pressedAt(id, ta) { var T = SCRIPTS[id].taps, k = -1; for (var i = 0; i < T.length; i++) if (Math.abs(ta - T[i].t) < 0.11) k = i; return k; }

    /* texto con salto de línea (se traduce completo antes de partirlo); devuelve el número de líneas */
    function wrap(s, x, y, maxW, lh, size, color, align, weight) {
      s = window.FFi18n ? FFi18n.t(s) : s; g.fillStyle = color; g.font = (weight || "normal") + " " + size + "px Arial, sans-serif"; g.textAlign = align || "left";
      var line = "", n = 0;
      s.split(" ").forEach(function (w) { var test = line ? line + " " + w : w; if (line && g.measureText(test).width > maxW) { g.fillText(line, x, y + n * lh); n++; line = w; } else line = test; });
      if (line) { g.fillText(line, x, y + n * lh); n++; }
      return n;
    }
    /* pantalla «Marcar 119»: st = paso, el = segundos de llamada (simulados), pk = pulsación del primer plano, n = cifras ya marcadas (0–3) */
    var DIAL = "119", KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
    function drawVoice(st, el, now, pk, n) {
      var VO = window.FFVoice, blink = Math.floor(now / 450) % 2;
      statusBar(2, false);
      if (st === 0) {
        g.fillStyle = "#2b3150"; g.fillRect(0, 40, 256, 508); txt("Inicio", 128, 92, 18, "#f6efe2", "center");
        [["Mensajes", "#f08a4b"], ["Teléfono", "#2f8a4a"], ["Ajustes", "#6a6f86"]].forEach(function (a, k) {
          var cx = 60 + k * 68;
          if (k === 1) rr(cx - 34, 130, 68, 68, 18, pk === 0 ? "#ffb627" : "rgba(255,182,39," + (blink ? 0.55 : 0.25) + ")");   // la app que hay que tocar parpadea
          rr(cx - 26, 138, 52, 52, 14, a[1]);
          if (k === 0) smsIcon(cx - 13, 151, 1.08, "#fff"); else if (k === 1) txt("☎", cx, 175, 28, "#fff", "center", "normal"); else txt("⚙", cx, 175, 26, "#fff", "center", "normal");
          wrap(a[0], cx, 214, 66, 14, 11, "#f6efe2", "center", "bold");
        });
        txt("Toca «Teléfono»", 128, 330, 15, "#ffb627", "center");
        return;
      }
      if (st === 1 || st === 2) {
        var hotKey = pk >= 1 && pk <= 3 ? DIAL[pk - 1] : null;
        rr(0, 40, 256, 52, 0, "#e9dfc8"); txt("Teléfono", 16, 74, 20, "#23251f", "left");
        rr(14, 104, 228, 72, 14, "#fff");
        if (n > 0) txt(DIAL.slice(0, n) + (n < 3 && blink ? "|" : ""), 128, 153, 36, "#23251f", "center");
        else txt("Marca 119", 128, 150, 18, "#a59e8a", "center", "normal");
        txt(st === 2 || n >= 3 ? "Pulsa el botón verde para llamar" : "Toca 1, 1 y 9", 128, 196, 12, "#6a6556", "center", "normal");
        KEYS.forEach(function (k, i) {
          var x = 64 + (i % 3) * 64, y = 232 + Math.floor(i / 3) * 58, want = st === 1 && n < 3 && k === DIAL[n];
          circ(x, y, 24, k === hotKey ? "#ffb627" : want && blink ? "#fde3b0" : "#fff");
          txt(k, x, y + (k === "*" ? 12 : 8), k === "*" ? 30 : 22, "#23251f", "center");
        });
        var ready = st === 2 || n >= 3;
        if (ready && pk !== 4) circ(128, 478, 36, "rgba(47,138,74," + (blink ? 0.35 : 0.15) + ")");
        circ(128, 478, 28, pk === 4 ? "#1f6634" : "#2f8a4a"); txt("☎", 128, 489, 26, "#fff", "center", "normal");
        return;
      }
      if (st === 3) {
        g.fillStyle = "#1f2238"; g.fillRect(0, 40, 256, 508);
        circ(128, 170, 50, "#2f8a4a"); txt("☎", 128, 188, 46, "#fff", "center", "normal");
        txt(DIAL, 128, 270, 34, "#f6efe2", "center");
        txt(el < 1.5 ? "Llamando…" : "En llamada · " + VO.fmt(el), 128, 304, 17, "#cfd8e8", "center", "normal");
        wrap("Sigue las indicaciones de la grabación y di lo esencial", 128, 346, 210, 18, 13, "#ffb627", "center", "bold");
        txt("Simulación: no se llama a nadie", 128, 410, 12, "#cfd8e8", "center", "normal");
        circ(128, 472, 30, pk === 5 ? "#a8261e" : "#d7342a"); txt("✕", 128, 483, 26, "#fff", "center");
        txt("Colgar", 128, 524, 12, "#cfd8e8", "center", "normal");
        return;
      }
      circ(128, 150, 32, "#2f5d3a"); txt("✓", 128, 164, 36, "#fff", "center");
      txt("Llamada finalizada", 128, 214, 20, "#23251f", "center");
      txt(DIAL, 128, 256, 30, "#23251f", "center");
      txt("Duración: " + VO.fmt(el), 128, 284, 13, "#6a6556", "center", "normal");
      rr(58, 304, 140, 24, 12, "#ffb627"); txt("SIMULACIÓN", 128, 321, 13, "#23251f", "center");
      txt("No se llamó a ningún número", 128, 364, 13, "#a8261e", "center");
    }

    var practicing = false;   // práctica (etapa 2): la pantalla sigue solo lo que hace el usuario
    function flash(live, ch, now) { return practicing && live.tapCh === ch && now - live.tapAt < 170; }   // tecla recién tocada
    function drawScreen(id, ta, live) {
      if (id === "reconexion") id = "avion";
      var A = SCRIPTS[id].A, pk = practicing ? -1 : pressedAt(id, ta), i, now = performance.now(), done = ta >= A - 0.001;
      g.clearRect(0, 0, 256, 548); g.fillStyle = "#f6efe2"; g.fillRect(0, 0, 256, 548);
      if (id === "sms") {
        statusBar(1, false); rr(0, 40, 256, 52, 0, "#e9dfc8"); smsIcon(14, 52, 1.0, "#f08a4b"); txt("Mensaje nuevo", 48, 64, 17, "#23251f", "left"); txt("Para: Familia", 16, 84, 13, "#6a6556", "left", "normal");
        var typed = 0; for (i = 0; i < MSG.length; i++) if (tapped("sms", ta, i)) typed = i + 1;
        var sent = ta >= SMS_TAPS[SMS_TAPS.length - 1].t + 0.15, shownText = MSG[0].toUpperCase() + MSG.slice(1) + ".", typing = null;
        if (done) { if (live.sms.sent) { sent = true; shownText = live.sms.text; } else if (live.sms.text) { sent = false; typing = live.sms.text; } }
        if (practicing) { sent = live.sms.sent; shownText = live.sms.text; typing = live.sms.text; }
        if (sent) { rr(40, 120, 200, 56, 18, "#f08a4b"); txt(shownText.length > 17 ? shownText.slice(0, 16) + "…" : shownText, 140, 156, 21, "#fff", "center"); txt("Enviado (simulado) · red celular", 238, 196, 12, "#6a6556", "right", "normal"); }
        else {
          rr(14, 110, 228, 84, 14, "#fff"); var tv = typing !== null ? typing : MSG.slice(0, typed);
          if (practicing && !tv) txt("Escribe tu mensaje", 26, 160, 18, "#a59e8a", "left", "normal");
          txt((tv.length > 16 ? "…" + tv.slice(-15) : tv) + (Math.floor(now / 400) % 2 || !done ? "|" : ""), practicing && !tv ? 24 : 26, 160, 22, "#23251f", "left");
          var sendHot = (pk >= 0 && SMS_TAPS[pk].send) || flash(live, "send", now), ready = practicing && live.sms.text.trim().length > 0;
          if (ready && !sendHot && Math.floor(now / 450) % 2) circ(218, 274, 27, "rgba(240,138,75,.3)");   // el botón de enviar invita a tocarlo
          circ(218, 274, 20, sendHot ? "#d7652a" : "#f08a4b"); txt("➤", 218, 281, 18, "#fff", "center");
        }
        rr(0, 304, 256, 244, 0, "#d3d8e2");
        ROWS.forEach(function (row, r) { row.split("").forEach(function (ch, k) { var on = (pk >= 0 && SMS_TAPS[pk].ch === ch) || flash(live, ch, now); rr(ROWX0[r] + k * 24 - 10, ROWY[r] - 17, 21, 34, 5, on ? "#ffb627" : "#fff"); txt(ch, ROWX0[r] + k * 24, ROWY[r] + 6, 16, "#23251f", "center", "normal"); }); });
        rr(56, 454, 144, 40, 8, (pk >= 0 && SMS_TAPS[pk].ch === " ") || flash(live, " ", now) ? "#ffb627" : "#fff");
        if (practicing) { rr(214, 411, 34, 34, 5, flash(live, "del", now) ? "#ffb627" : "#b9c0ce"); txt("⌫", 231, 434, 17, "#23251f", "center", "normal"); txt("espacio", 128, 479, 13, "#6a6556", "center", "normal"); }
      } else if (id === "llamadas") {
        var st2 = ta < 1.3 ? 0 : ta < 2.9 ? 1 : ta < 4.6 ? 2 : 3;
        if (practicing) { var C = live.call || { step: 0 }, ce = (now - C.at) / 1000; st2 = C.step === 0 ? 0 : C.step === 1 ? (ce < 1.6 ? 1 : 2) : 3; ta = 2.9 + Math.max(0, ce - 1.6); }
        statusBar(2, false);
        if (st2 === 0) {
          rr(0, 40, 256, 52, 0, "#e9dfc8"); txt("Llamadas", 16, 74, 20, "#23251f", "left");
          ["Familia", "Vecinos", "Puesto de salud"].forEach(function (nm, k) { var y = 108 + k * 66, on = k === 0 && pk === 0; rr(10, y, 236, 56, 14, on ? "#ffb627" : "#fff"); circ(40, y + 28, 18, ["#2f5d3a", "#2c7a9a", "#a64630"][k]); txt(nm, 70, y + 35, 18, "#23251f", "left"); });
          txt("Una llamada breve deja la línea libre", 128, 360, 13, "#6a6556", "center", "normal");
        } else {
          g.fillStyle = "#1f2238"; g.fillRect(0, 40, 256, 508); circ(128, 190, 52, "#2f5d3a"); txt("F", 128, 208, 52, "#f6efe2", "center");
          txt("Familia", 128, 290, 26, "#f6efe2", "center");
          var line = st2 === 1 ? "Llamando…" : st2 === 2 ? "En llamada · 00:0" + Math.min(9, Math.floor(ta - 2.9) + 1) : "Llamada finalizada";
          txt(line, 128, 326, 17, "#cfd8e8", "center", "normal");
          txt(st2 === 3 ? "Línea libre para otras personas" : "Lo esencial, en pocas palabras", 128, 358, 13, "#ffb627", "center", "normal");
          if (st2 < 3) { circ(128, 472, 30, pk === 1 ? "#a8261e" : "#d7342a"); txt("✕", 128, 483, 26, "#fff", "center"); }
        }
      } else if (id === "cobertura") {
        var phase = ta < 0.9 ? 0 : ta < 3.4 ? 1 : 2, nb = 0;
        if (done) { var sr = (now - live.searchAt) / 1000; if (sr >= 0 && sr < 3.2) { phase = 1; ta = sr + 0.9; } else phase = 2; if (practicing && live.searchAt < 0) phase = 0; }
        if (phase === 1) nb = 1 + Math.floor(ta * 4) % 4; if (phase === 2) nb = (Math.sin(ta * 7) > 0.2 ? 2 : 1);
        statusBar(phase === 0 ? 0 : phase === 2 ? 1 : 0, false);
        rr(0, 40, 256, 52, 0, "#e9dfc8"); txt("Red celular", 16, 74, 20, "#23251f", "left");
        for (i = 0; i < 4; i++) { var bh = 28 + i * 24, lit = phase === 0 ? false : phase === 1 ? i === (Math.floor(ta * 5) % 4) : i < nb; g.fillStyle = lit ? (phase === 2 ? "#2f5d3a" : "#f08a4b") : "rgba(120,120,130,.3)"; g.fillRect(58 + i * 36, 250 - bh, 26, bh); }
        txt(phase === 0 ? "Sin servicio" : phase === 1 ? "Buscando red…" : "Señal débil", 128, 306, 24, "#23251f", "center");
        txt(phase === 2 ? "Puede ir y venir; sin garantía" : phase === 1 ? "Espera unos segundos" : "Toca para buscar red", 128, 336, 14, "#6a6556", "center", "normal");
        rr(48, 400, 160, 62, 20, pk === 0 ? "#d7652a" : "#f08a4b"); txt("Buscar red", 128, 439, 21, "#fff", "center");
      } else if (id === "voz") {
        /* primer plano: la demostración avanza sola (abrir «Teléfono», marcar 119, llamar, colgar); después, la pantalla sigue los controles del cuadro */
        var vst, vel, vn = 0;
        if (done) { vst = live.voice.step; vel = window.FFVoice.elapsed(live.voice, now); vn = vst >= 2 ? 3 : (practicing ? live.voice.n || 0 : 0); if (practicing && vst === 1 && flash(live, live.tapCh, now)) pk = DIAL.indexOf(live.tapCh) >= 0 && live.tapCh === DIAL[Math.max(0, vn - 1)] ? vn : -1; }
        else {
          vst = ta < 0.85 ? 0 : ta < 3.45 ? 1 : ta < 5.35 ? 3 : 4;
          for (i = 1; i <= 3; i++) if (tapped("voz", ta, i)) vn = i;
          vel = vst === 3 ? (ta - 3.45) * 3 : 6;
        }
        drawVoice(vst, vel, now, pk, vn);
      } else if (id === "lugar") {
        /* sin señal → (el personaje camina) → buscando → resultado. En el primer plano: toca «Actualizar» y sigue sin servicio.
           Después, la pantalla sigue a live.walk (lo actualiza js/sequence.js): sig "none" | "search" | "result", bars 0–2. Es una ilustración. */
        var W0 = live.walk || { sig: "none", bars: 0 }, wsig = done ? W0.sig : (ta >= 1.25 && ta < 2.9 ? "search" : "none"), wb = wsig === "result" ? W0.bars : 0;
        if (practicing) { var ls = now - live.searchAt; wsig = live.searchAt < 0 ? "none" : ls < 2000 ? "search" : "result"; wb = 0; }   // práctica: aquí no hay señal
        statusBar(wb, false);
        rr(0, 40, 256, 52, 0, "#e9dfc8"); txt("Red celular", 16, 74, 20, "#23251f", "left");
        for (i = 0; i < 4; i++) { var lbh = 28 + i * 24, lon = wsig === "search" ? i === (Math.floor(now / 200) % 4) : i < wb; g.fillStyle = lon ? (wsig === "search" ? "#f08a4b" : "#2f5d3a") : "rgba(120,120,130,.3)"; g.fillRect(58 + i * 36, 250 - lbh, 26, lbh); }
        txt(wsig === "search" ? "Buscando red…" : wsig === "result" ? (wb === 0 ? "Sin servicio" : wb === 1 ? "Señal débil" : "Señal parcial") : "Sin servicio", 128, 306, 24, "#23251f", "center");
        txt(wsig === "search" ? "Espera unos segundos" : wsig === "result" ? "Simulación: sin garantía" : "Busca un lugar abierto y seguro", 128, 336, 14, "#6a6556", "center", "normal");
        rr(48, 400, 160, 62, 20, pk === 0 ? "#d7652a" : "#f08a4b"); txt("Actualizar", 128, 439, 21, "#fff", "center");
      } else if (id === "red") {
        /* tipo de red preferido: de 5G (saturada, 1 barra) a 3G (más básica, más señal). basic = 3G elegida; scanning = buscando la nueva red */
        var sinceNet = (now - live.netAt) / 1000, basic = done ? !!live.net : ta >= 1.1, scanning = done ? (sinceNet >= 0 && sinceNet < 2.4) : (ta >= 1.1 && ta < 2.8);
        statusBar(scanning ? 0 : basic ? 3 : 1, false, scanning ? "" : basic ? "3G" : "5G");
        rr(0, 40, 256, 52, 0, "#e9dfc8"); txt("Tipo de red preferido", 16, 74, 19, "#23251f", "left");
        [["5G (automático)", "La más rápida"], ["4G / LTE", "Rápida"], ["3G", "Más lenta; llamadas y SMS"]].forEach(function (o, k) {
          var y = 106 + k * 66, sel = (k === 2) === basic && (k === 0 || k === 2), hot = k === 2 && pk === 0;
          rr(10, y, 236, 56, 14, hot ? "#ffb627" : sel ? "#fff1d6" : "#fff"); txt(o[0], 26, y + 26, 18, "#23251f", "left"); txt(o[1], 26, y + 45, 12, "#6a6556", "left", "normal");
          circ(222, y + 28, 10, sel ? "#2f5d3a" : "#c9c2ad"); if (sel) circ(222, y + 28, 4, "#fff");   // botón de opción
        });
        txt(scanning ? "Buscando red…" : basic ? "Conectado a 3G (simulado)" : "5G: red saturada", 128, 336, 19, "#23251f", "center");
        txt(scanning ? "Solo si el teléfono y el operador lo permiten" : basic ? "Internet lento; llamadas y SMS posibles" : "Toca «3G» para probar una red básica", 128, 362, 12, "#6a6556", "center", "normal");
        if (!scanning) { txt(basic ? "Señal: buena" : "Señal: débil", 128, 400, 14, basic ? "#2f5d3a" : "#a8261e", "center"); bars(basic ? 3 : 1, 110, 440, basic ? "#2f5d3a" : "#d7652a"); }
      } else {
        var sinceRec = (now - live.recAt) / 1000, air = done ? live.airplane : (ta >= 1.15 && ta < 3.45), searching = done ? (!live.airplane && sinceRec >= 0 && sinceRec < 2.8) : ta >= 3.45, after = done && !live.airplane && sinceRec >= 2.8 && sinceRec < 7;
        statusBar(air ? 0 : (searching ? 1 : 2), air);
        rr(0, 40, 256, 52, 0, "#e9dfc8"); txt("Ajustes rápidos", 16, 74, 20, "#23251f", "left");
        rr(10, 108, 112, 62, 14, "#fff"); txt("Wi-Fi", 22, 146, 17, "#23251f", "left"); rr(134, 108, 112, 62, 14, "#fff"); txt("Datos", 146, 146, 17, "#23251f", "left");
        rr(10, 180, 236, 50, 14, pk >= 0 ? "#fff1d6" : "#fff"); plane(36, 205, 0.95, "#f08a4b"); txt("Modo avión", 62, 212, 18, "#23251f", "left");
        rr(168, 190, 56, 30, 15, air ? "#f08a4b" : "#c9c2ad"); circ(air ? 209 : 183, 205, 11, "#fff");
        txt(air ? "Modo avión activado" : searching ? "Buscando red…" : after ? "Reconexión ilustrativa" : "Red celular disponible", 128, 300, 20, "#23251f", "center");
        txt(air ? "Sin llamadas ni SMS mientras esté activo" : searching ? "El teléfono vuelve a buscar una red" : after ? "Puede conectarse o no: sin garantía" : "Activa y desactiva el modo avión", 128, 328, 13, "#6a6556", "center", "normal");
        if (air) plane(128, 420, 3.4, "rgba(240,138,75,.9)");
      }
      tex.needsUpdate = true;
    }

    /* manos (articuladas, ver makeHand): la izquierda sostiene el teléfono por detrás — palma contra la parte trasera, dedos que rodean el borde derecho
       y asoman por delante, pulgar sobre el borde izquierdo —; la derecha escribe con la punta del índice y el resto de los dedos recogidos.
       Para llegar a cada tecla se mueve la mano completa con el antebrazo: los dedos y los brazos conservan siempre su largo. */
    function scr(px, py) { return V((px / 256 - 0.5) * 1.04, (0.5 - py / 548) * 2.22, 0); }
    var hands = new THREE.Group(); root.add(hands);
    var HOLDH = makeHand(X, -1, { parent: hands, scale: 1.3 }), TAPH = makeHand(X, 1, { parent: hands, scale: 1.3 });
    HOLDH.pose({ indice: [0.12, 1.25, 0.95], medio: [0.12, 1.3, 1.0], anular: [0.15, 1.3, 1.0], menique: [0.2, 1.25, 0.95], pulgar: [0, 0.1, 0.1] }, [0.55, 0.8, 0]);
    HOLDH.orient(V(0.95, 0.3, 0), V(0, 0, 1)); HOLDH.armDir(V(-0.2, -0.95, 0.15));
    TAPH.pose({ indice: [0.15, 0.25, 0.15], medio: [1.25, 1.35, 0.6], anular: [1.3, 1.35, 0.6], menique: [1.35, 1.3, 0.55], pulgar: [0.2, 0.3, 0.2] }, [-0.3, 0.8, 0.5]);
    TAPH.orient(V(-0.5, 0.62, -0.6), V(-0.2, -0.55, -0.8)); TAPH.armDir(V(0.5, -0.6, 0.62));
    var HOLD_PALM = V(0.1, -0.45, -0.27), SURF = 0.133, HOVER = 0.36, TAP_REST = V(0.62, -0.95, 0.75), tip = V(0, 0, 0), pa = V(0, 0, 0), pb = V(0, 0, 0), tmp = V(0, 0, 0);
    function placeHold() { HOLDH.place(tmp.set(0, 0.3 * HOLDH.scale, 0).applyQuaternion(HOLDH.q).negate().add(HOLD_PALM)); }
    function keyAt(T, i, out) { var k = scr(T[i].x, T[i].y); return out.set(k.x, k.y, SURF); }
    /* recorrido de la punta del índice: de una tecla a la siguiente (levantando el dedo entre ellas) y bajando a la pantalla en cada pulsación */
    function driveTap(id, ta, active) {
      var T = SCRIPTS[id].taps, n = T.length, i, prev = -1;
      if (!active) { tip.copy(TAP_REST); TAPH.placeTip("indice", tip); return; }
      for (i = 0; i < n; i++) if (T[i].t <= ta) prev = i;
      if (prev < 0) { var k0 = smooth((ta - (T[0].t - 0.6)) / 0.5); keyAt(T, 0, pb); pb.z = SURF + HOVER; tip.lerpVectors(TAP_REST, pb, k0); }
      else if (prev === n - 1) { var k1 = smooth((ta - (T[prev].t + 0.15)) / 0.5); keyAt(T, prev, pa); pa.z = SURF + HOVER; tip.lerpVectors(pa, TAP_REST, k1); }
      else {
        var gap = T[prev + 1].t - T[prev].t, k = smooth((ta - T[prev].t - 0.06) / Math.max(0.1, gap - 0.14));
        keyAt(T, prev, pa); keyAt(T, prev + 1, pb); pa.z = pb.z = SURF + HOVER;
        if (gap > 1.4) { tmp.copy(pa).lerp(pb, 0.5).lerp(TAP_REST, 0.6); tip.copy(k < 0.5 ? pa : tmp).lerp(k < 0.5 ? tmp : pb, k < 0.5 ? k * 2 : k * 2 - 1); }
        else tip.lerpVectors(pa, pb, k);
      }
      var d = 1e9; for (i = 0; i < n; i++) d = Math.min(d, Math.abs(ta - T[i].t));
      tip.z = lerp(tip.z, SURF, 1 - smooth(d / 0.13));   // baja hasta la pantalla al pulsar
      TAPH.placeTip("indice", tip);
    }
    var poseH = newPose(X), poseC = newPose(X), poseW = newPose(X), euler = new THREE.Euler(), fwd = V(0, 0, 0), zoneId = "urbano", liveRef = null;
    /* práctica: un toque en la pantalla 3D (px, py en el canvas de 256 × 548) se convierte en la acción de ese botón o tecla */
    function near(px, py, x, y, r) { return Math.hypot(px - x, py - y) <= r; }
    function inBox(px, py, x0, y0, x1, y1) { return px >= x0 && px <= x1 && py >= y0 && py <= y1; }
    function hitScreen(px, py) {
      var id = topicId === "reconexion" ? "avion" : topicId, L = liveRef; if (!L) return;
      if (id === "sms") {
        if (near(px, py, 218, 274, 30)) return X.act("send");
        if (inBox(px, py, 212, 409, 250, 447)) return X.act("del");
        if (inBox(px, py, 54, 452, 202, 496)) return X.act("key", " ");
        for (var r = 0; r < 3; r++) {
          if (Math.abs(py - ROWY[r]) > 21) continue;
          var k = Math.round((px - ROWX0[r]) / 24); if (k >= 0 && k < ROWS[r].length && Math.abs(px - (ROWX0[r] + k * 24)) <= 12.5) return X.act("key", ROWS[r][k]);
        }
        return;
      }
      if (id === "cobertura" || id === "lugar") { if (inBox(px, py, 40, 392, 216, 470)) X.act("search"); return; }
      if (id === "avion") { if (inBox(px, py, 6, 176, 250, 236)) X.act("air"); return; }
      if (id === "red") { if (inBox(px, py, 6, 236, 250, 298)) X.act("net", 1); else if (inBox(px, py, 6, 102, 250, 166)) X.act("net", 0); return; }
      if (id === "llamadas") {
        if (L.call.step === 0 && inBox(px, py, 6, 104, 250, 168)) X.act("call");
        else if (L.call.step === 1 && near(px, py, 128, 472, 40)) X.act("hang");
        return;
      }
      if (id === "voz") {
        var st = L.voice.step;
        if (st === 0 && inBox(px, py, 90, 126, 166, 226)) return X.act("v-open");
        if (st === 1) { for (var i = 0; i < 12; i++) { if (near(px, py, 64 + (i % 3) * 64, 232 + Math.floor(i / 3) * 58, 28)) return X.act("v-digit", ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"][i]); } }
        if (st === 2 && near(px, py, 128, 478, 38)) return X.act("v-call");
        if (st === 3 && near(px, py, 128, 472, 40)) return X.act("v-stop");
      }
    }
    var mod = {
      root: root, pivot: V(0, 0, 0), dark: false, screenCanvas: cv, noBox: [hands],
      pickables: [ud.screen],
      onPick: function (type, p) {
        if (type !== "down" || !p.hit.uv) return;
        hitScreen(p.hit.uv.x * 256, (1 - p.hit.uv.y) * 548);
      },
      setContext: function (id, C3) { zoneId = id; HOLDH.setContext(C3); TAPH.setContext(C3); },
      cams: function (portrait, aspect, tn) {
        var d = Math.max(3.2 / (2 * tn * aspect), 4.6 / (2 * tn));
        return { hero: { p: V(0, 1.6, 6.6), l: V(0, 1.5, 0) }, close: portrait ? { p: V(0, 1.7, d), l: V(0, 0.8, 0) } : { p: V(0, 1.75, 5.2), l: V(0, 0.85, 0) } };
      },
      duration: function (id) { return SCRIPTS[id || topicId].A; },
      setTopic: function (id) { topicId = id; lastKey = ""; tapIdx = 0; },
      reset: function () { lastKey = ""; tapIdx = 0; },
      pose: {
        hero: function (t) { poseH.p.set(0, 1.55, 0); poseH.q.setFromEuler(euler.set(0.05, Math.sin(t * 0.8) * 0.55, 0)); poseH.s = 1.15; return poseH; },
        close: function (info) { poseC.p.set(0, 1.35, 0); poseC.q.setFromEuler(euler.set(-0.18 + Math.sin(info.t * 0.9) * 0.01, 0, 0)); poseC.s = 1; return poseC; },
        wide: function (info) {
          var raise = !info.character3D && topicId === "cobertura" ? (0.5 + 0.5 * Math.sin(info.t * 1.1)) * 0.3 * info.speakK : 0;
          var rk = topicId === "lugar" ? Math.min(1, info.raiseK || 0) : 0;   // «Buscar un lugar con mejor señal»: Mateo levanta el celular al llegar
          var near = topicId === "llamadas" || topicId === "cobertura";   // con el personaje 3D los dedos quedan sobre el borde del teléfono: así se ve agarrado
          if (info.character3D) poseW.p.set(info.wrist.x + (near ? 0.07 : lerp(0.15, 0.07, rk)), info.wrist.y + (near ? 0.02 : lerp(0.24, 0.02, rk)) + raise, info.wrist.z - 0.08);
          else poseW.p.set(info.wrist.x + 0.02, info.wrist.y + 0.1 + raise, info.wrist.z + .2);
          poseW.q.setFromEuler(euler.set(-0.1 - raise * 0.6, 0.22, Math.sin(info.t * 1.3) * 0.03 * info.speakK)); poseW.s = 0.3;
          /* con el personaje 3D, el teléfono se adelanta un poco (en la dirección de su pantalla) para que su espalda quede apoyada sobre los dedos, sin que
             estos lo atraviesen. Medido en la escena: Valeria 0,024 (0,064 en «Llamadas», con el teléfono junto a la cara); Mateo (manos más grandes) 0,046,
             y 0,074 en «Señal» (teléfono en alto) */
          if (info.character3D) poseW.p.add(fwd.set(0, 0, zoneId === "rural" ? (topicId === "cobertura" ? 0.074 : lerp(0.046, 0.074, rk)) : (topicId === "llamadas" ? 0.064 : 0.024)).applyQuaternion(poseW.q));
          return poseW;
        }
      },
      frame: function (info) {
        var st = info.stage, ta = st === "close" ? info.ta : (st === "wide" ? info.A : 0);
        practicing = !!info.practice; liveRef = info.live;
        hands.visible = st !== "hero" && !practicing && !(info.character3D && st === "wide"); hands.position.y = -2.6 * (1 - info.rise);
        var T = SCRIPTS[topicId].taps, nDone = 0; for (var ti = 0; ti < T.length; ti++) if (ta >= T[ti].t) nDone = ti + 1;
        if (st === "close" && nDone === tapIdx + 1 && window.FFAudio) window.FFAudio.key(T[nDone - 1].ch || "x");   // un sonido de tecla por cada pulsación del pulgar (si la escena salta, no suena)
        tapIdx = st === "hero" ? 0 : nDone;
        var kL = Math.max(0.001, info.leftK);
        [HOLDH, TAPH].forEach(function (h) { h.forearm.visible = info.armsK > 0; h.group.scale.setScalar(kL * h.scale); h.forearm.scale.setScalar(kL * h.scale); });
        hands.visible = hands.visible && info.leftK > 0.01;
        if (hands.visible) { placeHold(); driveTap(topicId, ta, st === "close"); }
        var L = info.live, nw = performance.now(), key = topicId + "|" + Math.round(ta * 12) + "|" + practicing + "|" + (practicing ? (L.call ? L.call.step + "|" + Math.floor((nw - L.call.at) / 250) : "") + "|" + (L.voice ? L.voice.n : "") + "|" + (nw - L.tapAt < 170 ? L.tapCh + L.tapAt : "") + "|" + Math.floor((nw - L.searchAt) / 250) : "") + "|" + (ta >= info.A - 0.001 ?L.airplane + "|" + L.sms.text + L.sms.sent + "|" + L.net + "|" + Math.floor((nw - L.netAt) / 300) + "|" + Math.floor((nw - L.searchAt) / 300) + "|" + Math.floor((nw - L.recAt) / 300) + "|" + (Math.floor(nw / 400) % 2) + "|" + (L.walk ? L.walk.sig + L.walk.bars + (L.walk.sig === "search" ? Math.floor(nw / 200) : "") : "") + "|" + (L.voice ? L.voice.step + "|" + Math.floor(window.FFVoice.elapsed(L.voice, nw) * 8) + "|" + Math.floor(nw / 450) % 2 : "") : 0);
        if (key !== lastKey) { lastKey = key; drawScreen(topicId, ta, info.live); }
      }
    };
    return mod;
  };

  /* ======================================================== RADIO ======================================================== */
  FFSeq.modules.radio = function (X) {
    var THREE = X.THREE, V = X.V, M = X.M, skin = X.skin, rbox = X.rbox;
    var glows = [], radio = M.buildRadio(glows), ud = radio.userData, dialMat = ud.dial.material;
    radio.position.set(0, -1.1, 0);
    var root = new THREE.Group(); root.add(radio);
    var K1 = V(0.42, -0.54, 0.64), K2 = V(1.0, -0.54, 0.64);   // centro de las perillas (cara frontal), con el origen en el centro del cuerpo de la radio
    var PIN = 0.31;

    /* manos (articuladas, ver makeHand): la izquierda sostiene la radio por el asa — palma sobre el asa y dedos cerrados a su alrededor —;
       la derecha toma la perilla en pinza (pulgar arriba e índice abajo, sobre el borde de la perilla) y gira la muñeca con ella.
       La mano entera se coloca para que las yemas queden en el borde de la perilla: los dedos y el antebrazo conservan su largo. */
    var hands = new THREE.Group(); root.add(hands);
    var HOLDR = makeHand(X, -1, { parent: hands, scale: 1.3 }), TUNE = makeHand(X, 1, { parent: hands, scale: 1.3 });
    HOLDR.pose({ indice: [1.35, 1.45, 0.9], medio: [1.35, 1.5, 0.9], anular: [1.4, 1.5, 0.85], menique: [1.45, 1.45, 0.8], pulgar: [0.2, 0.5, 0.4] }, [-0.35, 0.75, 0.6]);
    HOLDR.armDir(V(-0.35, -0.45, 1));
    TUNE.pose({ indice: [0.55, 0.6, 0.35], medio: [1.3, 1.4, 0.7], anular: [1.35, 1.4, 0.65], menique: [1.4, 1.35, 0.6], pulgar: [0.1, 0.35, 0.25] }, [-0.1, 0.75, 0.65]);
    TUNE.armDir(V(0.8, -0.4, 0.45));
    var HANDLE = V(-0.3, 1.47, 0), BAR_IN_FIST = V(0, 0.6, 0.22), tipT = V(0, 0, 0), tipI = V(0, 0, 0), mid = V(0, 0, 0), dloc = V(0, 0, 0), axisW = V(0, 0, 0), hint = V(-0.85, 0.05, -0.52), tgt = V(0, 0, 0), UP = V(0, 1, 0), ZA = V(0, 0, 1);
    function placeHold() {
      HOLDR.align(V(0, 1, 0), V(0, 0, -1), V(0, 0, 1), V(0, -1, 0));   // dedos hacia atrás por encima del asa, palma hacia abajo
      HOLDR.placeLocal(BAR_IN_FIST, HANDLE);
    }
    /* pinza sobre la perilla c, con la línea pulgar–índice girada `a` alrededor del eje de la perilla */
    function pinch(c, a) {
      TUNE.tipLocal("pulgar", tipT); TUNE.tipLocal("indice", tipI);
      dloc.copy(tipT).sub(tipI); mid.copy(tipT).add(tipI).multiplyScalar(0.5);
      TUNE.align(V(0, 1, 0), hint, V(1, 0, 0), UP);   // primero: dedos hacia la perilla desde la derecha, lado del pulgar hacia arriba
      axisW.copy(dloc).applyQuaternion(TUNE.q); axisW.z = 0; axisW.normalize().applyAxisAngle(ZA, a);   // la línea pulgar–índice, sobre el plano de la perilla
      TUNE.align(dloc, axisW, V(0, 1, 0), hint);
      TUNE.placeLocal(mid, tgt.set(c.x, c.y, 0.57));
    }
    /* en el plano completo: el puño que agarra el asa (la radio cuelga de la mano) */    var grip = new THREE.Group(); root.add(grip);
    var fist = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), skin); fist.scale.set(1.3, 0.75, 0.95); fist.position.set(0, 1.62, 0); grip.add(fist);
    var gthumb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skin); gthumb.position.set(0.1, 1.55, 0.36); grip.add(gthumb);

    var st = window.FFTuner ? window.FFTuner.state : { on: false, pos: 8, band: "AM" }, demoSet = { on: false, pos: -1 }, scriptDone = false;
    var knobMeshes = [ud.knobs[0].children[0], ud.knobs[1].children[0]], lampOn = new THREE.Color(0xffb627), lampOff = new THREE.Color(0x6a4a20);
    var th1 = 0, th2 = 0, kpos = V(0, 0, 0), poseH = newPose(X), poseC = newPose(X), poseW = newPose(X), euler = new THREE.Euler();
    var HANDLE_TOP = V(0, 1.53, 0), hx = V(0, 0, 0), hy = V(0, 1, 0), hz = V(0, 0, 0), hm = new THREE.Matrix4();   // parte de arriba del asa, en el espacio de la radio
    var mod = {
      root: root, pivot: V(0, 0, 0), dark: false, noBox: [hands, grip],
      setContext: function (id, C3) { HOLDR.setContext(C3); TUNE.setContext(C3); },
      /* el usuario puede girar la perilla de sintonía (arrastrar), encender con la perilla izquierda y cambiar la banda tocando AM o FM */
      pickables: [knobMeshes[0], knobMeshes[1], ud.bandPlane, ud.bandLamps[0], ud.bandLamps[1]],
      onPick: function (type, p, dx) {
        var F = window.FFTuner, o = p.hit.object; if (!F) return;
        if (type === "down") p.startPos = F.state.pos;
        if (o === knobMeshes[1]) { if (type === "move" && F.state.on) F.set({ pos: Math.max(0, Math.min(100, Math.round(p.startPos + dx * 0.4))) }, true); }
        else if (o === knobMeshes[0]) { if (type === "up" && !p.moved) F.set({ on: !F.state.on }, true); }
        else if (type === "up" && !p.moved) F.set({ band: o === ud.bandLamps[0] ? "AM" : o === ud.bandLamps[1] ? "FM" : (p.hit.uv && p.hit.uv.x < 0.5 ? "AM" : "FM") }, true);
      },
      cams: function (portrait, aspect, tn) {
        var d = Math.max(5.8 / (2 * tn * aspect), 3.8 / (2 * tn));
        return { hero: { p: V(0, 1.6, 6.6), l: V(0, 1.45, 0) }, close: portrait ? { p: V(0.3, 2.0, d), l: V(0.3, 0.9, 0) } : { p: V(0.5, 1.9, 5.9), l: V(0.35, 1.0, 0) } };
      },
      duration: function () { return 5.0; },
      reset: function () { demoSet.on = false; demoSet.pos = -1; scriptDone = false; if (window.FFTuner) window.FFTuner.reset(); },
      finish: function () { scriptDone = true; if (window.FFTuner) window.FFTuner.set({ on: true, band: window.FF.tuner.demo.band, pos: window.FF.tuner.demo.pos }); },
      pose: {
        hero: function (t) { poseH.p.set(0, 1.5, 0); poseH.q.setFromEuler(euler.set(0.12, Math.sin(t * 0.8) * 0.5, 0)); poseH.s = 0.9; return poseH; },
        close: function (info) { poseC.p.set(0.25, 1.3, 0); poseC.q.setFromEuler(euler.set(-0.12, -0.12 + Math.sin(info.t * 0.8) * 0.01, 0)); poseC.s = 1; return poseC; },
        wide: function (info) {
          var s = 0.32; poseW.s = s;
          /* con el personaje 3D la radio cuelga de la mano: el centro de la parte de arriba del asa (0, 1,53, 0 en la radio) va dentro del hueco
             de los dedos cerrados y la barra del asa sigue la línea de los nudillos; el cuerpo de la radio queda vertical, colgando por su peso */
          if (info.character3D && info.holdOk) {
            hx.copy(info.holdAxis); hx.y = 0; if (hx.lengthSq() < 1e-4) hx.set(1, 0, 0); hx.normalize(); if (hx.x < 0) hx.negate();
            hz.crossVectors(hx, hy.set(0, 1, 0)).normalize(); if (hz.z < 0) { hz.negate(); hx.negate(); }
            hm.makeBasis(hx, hy, hz); poseW.q.setFromRotationMatrix(hm);
            hz.set(0, -0.012, 0).add(HANDLE_TOP).multiplyScalar(s).applyQuaternion(poseW.q); poseW.p.copy(info.hold).sub(hz);
            poseW.p.y += Math.sin(info.t * 2.2) * 0.008 * info.speakK; return poseW;
          }
          poseW.p.set(info.wrist.x + (info.character3D ? 0.1 : 0), info.wrist.y - 1.53 * s - 0.04 + (info.character3D ? 0.3 : 0) + Math.sin(info.t * 2.2) * 0.02 * info.speakK, info.wrist.z + (info.character3D ? 0.3 : 0.2));   // con el personaje 3D el asa queda dentro de la mano cerrada
          poseW.q.setFromEuler(euler.set(0, 0.2, Math.sin(info.t * 1.3) * 0.05 * info.speakK)); return poseW;
        }
      },
      frame: function (info) {
        var s = info.stage, ta = info.ta, F = window.FFTuner, D = window.FF.tuner, pos, on, k;
        hands.visible = s !== "hero" && !info.practice; hands.position.y = -2.6 * (1 - info.rise);
        var kL = Math.max(0.001, info.leftK);
        [HOLDR, TUNE].forEach(function (h) { h.forearm.visible = info.armsK > 0; h.group.scale.setScalar(kL * h.scale); h.forearm.scale.setScalar(kL * h.scale); });
        hands.visible = hands.visible && info.leftK > 0.01;
        var gk = s === "wide" ? info.kOut : (info.fromWide ? 1 - info.kIn : 0); grip.scale.setScalar(Math.max(0.001, gk)); grip.visible = gk > 0.01 && !info.character3D;

        /* demostración: la mano derecha enciende la radio (perilla izquierda) y luego gira la de sintonía mientras la aguja recorre el dial */
        var knob = 2, th1v = th1;
        if (s === "close" && F && !info.practice) {
          if (ta < 0.8) { k = smooth(ta / 0.8); kpos.lerpVectors(K2, K1, k); knob = 1; }
          else if (ta < 1.5) { kpos.copy(K1); knob = 1; th1v = lerp(0, 0.9, smooth((ta - 0.8) / 0.7)); }
          else if (ta < 2.3) { k = smooth((ta - 1.5) / 0.8); kpos.lerpVectors(K1, K2, k); th1v = 0.9; knob = 1; }
          else { kpos.copy(K2); th1v = 0.9; }
          if (ta >= 1.2 && !demoSet.on) { demoSet.on = true; F.set({ on: true, band: "AM", pos: D.start.pos }); if (window.FFAudio) { window.FFAudio.click(true); window.FFAudio.radio({ on: true, pos: D.start.pos, band: "AM", clarity: F.clarity(), kind: "" }); } }
          if (ta >= 2.3) {
            pos = ta < 3.6 ? lerp(8, 70, smooth((ta - 2.3) / 1.3)) : ta < 4.6 ? lerp(70, D.demo.pos, smooth((ta - 3.6) / 1.0)) : D.demo.pos;
            pos = Math.round(pos); if (pos !== demoSet.pos) { var cb = F.clarity(); demoSet.pos = pos; F.set({ pos: pos }); var AU = window.FFAudio; if (AU) { AU.dial(pos); AU.radio({ on: true, pos: pos, band: "AM", clarity: F.clarity(), kind: "" }); if (cb < 0.75 && F.clarity() >= 0.75) AU.lock(); } }
          }
          th1 = th1v;
          if (ta >= info.A - 0.001) scriptDone = true;
        } else {
          if (s === "wide" && !scriptDone && F) { scriptDone = true; F.set({ on: true, band: D.demo.band, pos: D.demo.pos }); }
          kpos.copy(K2); th1 = st.on ? 0.9 : 0;
        }
        th2 = (st.pos - 8) / 100 * 4.2;
        ud.knobs[0].rotation.z = th1; ud.knobs[1].rotation.z = th2;
        ud.needle.position.x = 0.15 + st.pos * 0.011;
        var lit = st.on ? 1 : 0; dialMat.color.copy(dialMat.userData.base).multiplyScalar(0.4 + 0.6 * lit);
        ud.bandLamps[0].material.color.copy(st.band === "AM" ? lampOn : lampOff); ud.bandLamps[1].material.color.copy(st.band === "FM" ? lampOn : lampOff);
        placeHold(); pinch(kpos, 0.55 * Math.sin((knob === 1 ? th1 : th2) * 0.8));   // la muñeca acompaña el giro dentro de un rango natural
      }
    };
    return mod;
  };
})();


