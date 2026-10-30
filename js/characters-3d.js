/* Original GLB geometry/textures + lightweight rigid joints (the supplied files
   have no skeleton or animation clips). No baked lighting or PNG billboards. */
window.FFCharacters = (function () {
  "use strict";
  var files = { rural: "assets/models/rural/chicorural/chico_rural.glb", urbano: "assets/models/urbano/chicacaleña/chica_calena.glb" };
  function dispose(root) {
    var geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(function (o) { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { materials.add(m); Object.keys(m).forEach(function (k) { if (m[k] && m[k].isTexture) textures.add(m[k]); }); }); });
    geometries.forEach(function (g) { g.dispose(); }); materials.forEach(function (m) { m.dispose(); }); textures.forEach(function (t) { if (t.image && t.image.close) t.image.close(); t.dispose(); });
  }
  var Y = new THREE.Vector3(0, 1, 0);
  /* centro de un ojo en el mundo: si la malla tiene varias piezas (ojo + párpado), se toma la más pequeña, que es el ojo (igual que en js/home-chars.js) */
  function eyeCenter(m) {
    var g = m.geometry, p = g.attributes.position, idx = g.index ? g.index.array : null, n = p.count, par = new Int32Array(n), i;
    for (i = 0; i < n; i++) par[i] = i;
    function f(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    function u(a, b) { a = f(a); b = f(b); if (a !== b) par[a] = b; }
    if (idx) for (i = 0; i < idx.length; i += 3) { u(idx[i], idx[i + 1]); u(idx[i], idx[i + 2]); }
    var key = {}; for (i = 0; i < n; i++) { var k = p.getX(i).toFixed(4) + "," + p.getY(i).toFixed(4) + "," + p.getZ(i).toFixed(4); if (key[k] !== undefined) u(i, key[k]); else key[k] = i; }
    var groups = {}; for (i = 0; i < n; i++) { var rt = f(i); (groups[rt] = groups[rt] || []).push(i); }
    var best = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.length - b.length; })[0];
    var box = new THREE.Box3(), v = new THREE.Vector3();
    best.forEach(function (j) { box.expandByPoint(v.fromBufferAttribute(p, j)); });
    return box.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld);
  }
  /* hacia dónde mira el ojo: el promedio de las normales de su malla (la superficie de la cara en ese punto) */
  function eyeNormal(m, c, hc) {
    var nr = m.geometry.attributes.normal, sum = new THREE.Vector3(), v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    if (nr) for (var i = 0; i < nr.count; i++) sum.add(v.fromBufferAttribute(nr, i));
    if (!nr || sum.lengthSq() < 1e-6) return c.clone().sub(hc).normalize();
    sum.applyMatrix3(nm).normalize(); if (sum.z < 0) sum.negate(); return sum;
  }
  /* mano izquierda (la que sostiene el objeto): dirección del brazo, giro sobre su eje (para orientar la palma) y cuánto se cierran los dedos */
  var HOLD = {
    phone: { d: [.3, -.35, .8], roll: Math.PI, curl: 1.1 },             // los dedos quedan detrás del teléfono (no lo atraviesan ni tapan la pantalla); ver el apoyo en js/seq-modules.js
    llamadas: { d: [.55, .6, .3], roll: Math.PI, curl: 1.1 },           // el teléfono junto a la cabeza; la mano lo sostiene por detrás (antes lo agarraba por el borde y los dedos asomaban delante)
    cobertura: { d: [.45, .8, .35], roll: Math.PI, curl: 1.1 },         // el teléfono en alto, sostenido por detrás
    radio: { d: [.2, -1, .38], palm: [0, -.2, -1], curl: 1.55 },        // brazo colgando un poco adelantado, palma hacia atrás y dedos en gancho: el asa queda dentro de la mano
    torch: { d: [.3, -.35, .8], roll: 0, curl: 1.1 }                    // los dedos rodean el mango
  };
  /* ajustes por personaje. Valeria: su pantalón es muy ancho y con el brazo casi vertical la radio, que cuelga del asa bajo la mano, quedaba metida en el
     muslo (≈0,3 unidades). Con el brazo algo más adelantado la radio cuelga delante de la pierna, con un espacio visible, y el asa sigue dentro de la mano. */
  var HOLD_ZONE = { urbano: { radio: { d: [.22, -1, 1.05], palm: [0, -.2, -1], curl: 1.55 } } };  function load(zone, parent) {
    return new Promise(function (resolve, reject) {
      new THREE.GLTFLoader().load(files[zone], function (gltf) {
        // Both exports contain an unrelated second scene with a default cube.
        var model = gltf.scenes.find(function (s) { return s.name.indexOf("modelo") !== -1; }) || gltf.scene;
        gltf.scenes.forEach(function (s) { if (s !== model) dispose(s); });
        var holder = new THREE.Group(); holder.name = "Character3D_" + zone; holder.add(model);
        model.updateMatrixWorld(true);
        var head; model.traverse(function (o) { if (/Cabeza$/i.test(o.name)) head = o; });
        var bounds = new THREE.Box3().setFromObject(model), scale = 4.4 / (bounds.max.y - bounds.min.y);
        var cx = head ? head.getWorldPosition(new THREE.Vector3()).x : bounds.getCenter(new THREE.Vector3()).x;
        model.scale.multiplyScalar(scale); model.position.add(new THREE.Vector3(-cx * scale, -bounds.min.y * scale, 0));
        holder.updateMatrixWorld(true);
        var ramp = new THREE.DataTexture(new Uint8Array([65, 155, 255]), 3, 1, THREE.RedFormat);
        ramp.magFilter = ramp.minFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
        ramp.name = "Toon: sombra / medio tono / luz";
        var materials = new Map(), skin, shirt;
        function toon(source) {
          if (materials.has(source)) return materials.get(source);
          var m = new THREE.MeshToonMaterial({ color: source.color ? source.color.clone() : 0xffffff, map: source.map || null, gradientMap: ramp });
          ["alphaMap", "alphaTest", "opacity", "transparent", "side", "depthWrite", "normalMap", "normalMapType", "bumpMap", "bumpScale", "displacementMap", "displacementScale", "displacementBias", "aoMap", "aoMapIntensity", "emissiveMap", "emissiveIntensity"].forEach(function (key) { if (source[key] !== undefined) m[key] = source[key]; });
          if (source.normalScale) m.normalScale.copy(source.normalScale);
          if (source.emissive) m.emissive.copy(source.emissive);
          m.name = source.name; m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent;
          if (/Piel/i.test(m.name)) skin = m;
          if (/Camisa a cuadros|Blusa/i.test(m.name)) shirt = m;
          materials.set(source, m); return m;
        }
        model.traverse(function (o) { if (!o.isMesh) return; o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material); o.castShadow = o.receiveShadow = true; });
        materials.forEach(function (_, source) { source.dispose(); });
        // Reparent whole arm pieces around shoulder pivots, retaining their
        // world transforms, original geometry, UVs and texture references.
        function arm(side) {
          var candidates = [], handPieces = [];
          model.traverse(function (o) { var n = o.name.toLowerCase(); if (/brazo|manga|mano|puño|pulsera/.test(n) && n.indexOf(side) !== -1) candidates.push(o); if (n.indexOf("mano") !== -1 && n.indexOf(side) !== -1) handPieces.push(o); });
          var roots = candidates.filter(function (o) { var p = o.parent; while (p) { if (candidates.indexOf(p) !== -1) return false; p = p.parent; } return true; });
          if (!roots.length) return null;
          var box = new THREE.Box3(); roots.forEach(function (o) { box.union(new THREE.Box3().setFromObject(o)); });
          var positive = side === "izquierd", x = positive ? box.min.x + .04 : box.max.x - .04, y = (box.min.y + box.max.y) / 2;
          /* Articulación del hombro: dentro de la manga abullonada, a ¾ de su radio desde el extremo interior (no en ese extremo, que queda
             metido en el torso junto al cuello). Así, al bajar el brazo, la manga gira sobre sí misma y se queda a la altura del hombro,
             en vez de colgar desde el pecho y dejar el brazo saliendo a la altura de la cintura. */
          var sleeve = new THREE.Box3(); candidates.forEach(function (o) { if (/manga/i.test(o.name)) sleeve.union(new THREE.Box3().setFromObject(o)); });
          if (!sleeve.isEmpty()) { var R = (sleeve.max.y - sleeve.min.y) / 2; x = positive ? sleeve.min.x + .75 * R : sleeve.max.x - .75 * R; y = (sleeve.min.y + sleeve.max.y) / 2; }
          var pivot = new THREE.Group(); pivot.name = "Shoulder_" + side; pivot.position.set(x, y, 0); holder.add(pivot); holder.updateMatrixWorld(true);
          roots.forEach(function (o) { pivot.attach(o); });
          var hb = new THREE.Box3(); handPieces.forEach(function (o) { hb.union(new THREE.Box3().setFromObject(o)); });
          var grip = new THREE.Object3D(); grip.name = "Grip_" + side;
          var point = hb.isEmpty() ? box.getCenter(new THREE.Vector3()) : hb.getCenter(new THREE.Vector3());
          grip.position.copy(pivot.worldToLocal(point)); pivot.add(grip);
          /* cada dedo gira desde su nudillo (el extremo más cercano a la muñeca) para poder cerrar la mano sobre el objeto */
          var fingers = [];
          handPieces.forEach(function (o) {
            var b = new THREE.Box3().setFromObject(o), g = new THREE.Group();
            g.position.copy(pivot.worldToLocal(new THREE.Vector3(positive ? b.min.x : b.max.x, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)));
            pivot.add(g); g.attach(o); fingers.push({ g: g, thumb: /pulgar/i.test(o.name), base: new THREE.Quaternion() });
          });
          /* Mateo: sus dedos se abrían un poco en abanico. Cada dedo se alinea con el eje medio de los cuatro; la separación entre ellos queda
             como la del modelo, igual que en Valeria (≈3 veces el grosor del dedo; juntarlos más los hacía ver fusionados). En Valeria no se aplica. */
          if (zone === "rural") {
            holder.updateMatrixWorld(true);
            var axisOf = function (f) {   // eje principal del dedo y su centro, en el espacio del pivote del brazo
              var pts = [], c = new THREE.Vector3(), v = new THREE.Vector3(), cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ax = new THREE.Vector3(1, .3, .2);
              f.g.children.forEach(function (m) { var p = m.geometry.attributes.position; for (var i = 0; i < p.count; i += 2) { var w = pivot.worldToLocal(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)).clone(); pts.push(w); c.add(w); } });
              c.multiplyScalar(1 / pts.length);
              pts.forEach(function (q) { var d = [q.x - c.x, q.y - c.y, q.z - c.z]; for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) cov[a][b] += d[a] * d[b]; });
              for (var k = 0; k < 60; k++) ax.set(cov[0][0] * ax.x + cov[0][1] * ax.y + cov[0][2] * ax.z, cov[1][0] * ax.x + cov[1][1] * ax.y + cov[1][2] * ax.z, cov[2][0] * ax.x + cov[2][1] * ax.y + cov[2][2] * ax.z).normalize();
              if (ax.dot(c.clone().sub(f.g.position)) < 0) ax.negate();   // del nudillo hacia la punta
              return { ax: ax, c: c };
            };
            var fs4 = fingers.filter(function (f) { return !f.thumb; }), mean = new THREE.Vector3();
            fs4.forEach(function (f) { f.ax = axisOf(f).ax; mean.add(f.ax); }); mean.normalize();
            fs4.forEach(function (f) { f.base.setFromUnitVectors(f.ax, mean); });   // sin abanico
          }
          return { pivot: pivot, grip: grip, fingers: fingers, axis: new THREE.Vector3(positive ? 1 : -1, 0, 0), sign: positive ? 1 : -1 };
        }
        var left = arm("izquierd"), right = arm("derech"), headRest = head ? head.quaternion.clone() : null;
        /* postura de miedo (solo en el sismo, api.fear 0–1): el tronco, con los brazos y la cabeza, baja un poco y se inclina desde la cadera, y el pantalón
           se acorta desde el suelo, como si flexionara las rodillas (las piernas son piezas enteras, sin rodilla). Las zapatillas no cambian. Con fear = 0 todo
           queda exactamente como en el modelo. */
        var crouch = null;
        (function () {
          var body = null; model.traverse(function (o) { if (!body && o.children.length > 3) body = o; }); if (!body) return;
          var legs = [], upper = [];
          body.children.slice().forEach(function (o) { var n = o.name.toLowerCase(); if (/referencia/.test(n)) return; if (/pantal|pierna|jean|dobladillo/.test(n)) legs.push(o); else if (!/zapat|bota|calzado|suela/.test(n)) upper.push(o); });   // Valeria: pantalón; Mateo: jean y dobladillos (botas y suelas no se mueven)
          if (!legs.length || !upper.length) return;
          holder.updateMatrixWorld(true);
          var lb = new THREE.Box3(); legs.forEach(function (o) { lb.union(new THREE.Box3().setFromObject(o)); });
          var torso = new THREE.Group(); torso.name = "Torso_pivot"; torso.position.set(0, lb.max.y, 0); holder.add(torso);
          var hips = new THREE.Group(); hips.name = "Legs_pivot"; hips.position.set(0, lb.min.y, 0); holder.add(hips); holder.updateMatrixWorld(true);
          upper.forEach(function (o) { torso.attach(o); }); [left, right].forEach(function (a) { if (a) torso.attach(a.pivot); });
          legs.forEach(function (o) { hips.attach(o); });
          crouch = { torso: torso, hips: hips, y0: lb.max.y, legH: lb.max.y - lb.min.y };
        })();
        /* caminar (api.walk = { phase, k }): el modelo no trae esqueleto ni animaciones, así que cada pierna (pantalón, dobladillo, bota y suela de ese lado)
           se agrupa bajo una articulación en la cadera y gira hacia delante y hacia atrás, en sentidos opuestos. La pieza de la cadera (cruza el centro) y
           los bolsillos no se mueven. El brazo libre se balancea al revés que su pierna y el cuerpo baja exactamente lo que subirían los pies al girar la
           pierna, para que siempre pisen el suelo. Se arma la primera vez que se usa (Mateo, «Buscar un lugar con mejor señal»); en reposo no cambia nada. */
        var legRig = null;
        function buildLegs() {
          holder.updateMatrixWorld(true);
          /* medidas en el espacio del propio personaje (no del mundo): al empezar a caminar ya puede estar desplazado y girado */
          var toLocal = new THREE.Matrix4().copy(holder.matrixWorld).invert(), localBox = function (o) { return new THREE.Box3().setFromObject(o).applyMatrix4(toLocal); };
          var sides = { izquierd: [], derech: [] }, found = [];
          holder.traverse(function (o) {
            if (!o.isMesh) return; var n = o.name.toLowerCase();
            if (!/pierna|dobladillo|bota|suela|pantal|zapat/.test(n) || /bolsillo/.test(n)) return;
            var b = localBox(o), cx = (b.min.x + b.max.x) / 2; if (Math.abs(cx) < .08) return;
            found.push([o, cx > 0 ? "izquierd" : "derech"]);
          });
          found.forEach(function (f) { sides[f[1]].push(f[0]); });
          var legs = [];
          Object.keys(sides).forEach(function (k) {
            var parts = sides[k]; if (!parts.length) return;
            var b = new THREE.Box3(); parts.forEach(function (o) { b.union(localBox(o)); });
            var hip = new THREE.Group(); hip.name = "Hip_" + k; hip.position.set((b.min.x + b.max.x) / 2, b.max.y - .12, (b.min.z + b.max.z) / 2); holder.add(hip); holder.updateMatrixWorld(true);
            parts.forEach(function (o) { hip.attach(o); });
            legs.push({ g: hip, s: k === "izquierd" ? 1 : -1, L: hip.position.y });
          });
          return legs.length === 2 ? legs : [];
        }
        var dTmp = new THREE.Vector3();
        /* ojos de susto «> <» (solo en el sismo): dos trazos oscuros y gruesos en ángulo por ojo, con la punta hacia la nariz, pegados a la cara
           en el sitio de cada ojo original (que se oculta mientras se muestran) */
        var eyes = [], scared = [], happy = [], eyeMode = "normal", Z = new THREE.Vector3(0, 0, 1), domeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false });
        (function () {
          holder.updateMatrixWorld(true);
          holder.traverse(function (o) { if (o.isMesh && /(^|_)Ojo_/i.test(o.name)) eyes.push(o); });   // la cabeza ya cuelga del pivote del tronco
          if (!head || !eyes.length) return;
          var hc = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()), mat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
          var W = .2, H = .24, R = .03, L = Math.hypot(W, H / 2) + R * .6, up = new THREE.Vector3(0, 1, 0);
          var stroke = new THREE.CapsuleGeometry(R, L - 2 * R, 4, 10);
          eyes.forEach(function (eye) {
            var c = eyeCenter(eye), n = eyeNormal(eye, c, hc), dir = c.x < hc.x ? 1 : -1;   // ojo de la izquierda en pantalla: «>»; de la derecha: «<» (las puntas hacia la nariz)
            var x = new THREE.Vector3().crossVectors(up, n).normalize(), y = new THREE.Vector3().crossVectors(n, x);
            var g = new THREE.Group(); g.name = "Ojo_susto"; g.position.copy(c).addScaledVector(n, .035); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
            [1, -1].forEach(function (s) {   // trazo de arriba y de abajo, desde el extremo exterior hasta la punta
              var m = new THREE.Mesh(stroke, mat); m.position.set(0, s * H / 4, 0); m.rotation.z = Math.atan2(-s * H / 2, dir * W) - Math.PI / 2; g.add(m);
            });
            g.visible = false; eye.parent.attach(g); scared.push(g);
            /* ojos felices de la despedida: igual que en la portada (js/home-chars.js), medio círculo negro con el lado recto abajo, pegado a la cara */
            var r = .11 * (zone === "urbano" ? 1.13 : 1), dome = new THREE.Mesh(new THREE.CircleGeometry(r, 28, 0, Math.PI), domeMat);
            dome.name = "Ojo_feliz"; dome.position.copy(c).addScaledVector(n, .03).y -= r * .35; dome.quaternion.setFromUnitVectors(Z, n);
            dome.visible = false; eye.parent.attach(dome); happy.push(dome);
          });
        })();
        /* expresión: "normal" (ojos del modelo), "scared" (sismo) o "happy" (despedida). Solo cambia la visibilidad al pasar de una a otra. */
        function setEyes(mode) {
          if (mode === eyeMode) return; eyeMode = mode;
          eyes.forEach(function (e) { e.visible = mode === "normal"; }); scared.forEach(function (g) { g.visible = mode === "scared"; }); happy.forEach(function (d) { d.visible = mode === "happy"; });
        }
        parent.add(holder); var q = new THREE.Quaternion(), direction = new THREE.Vector3(), waveDir = new THREE.Vector3(), twist = new THREE.Quaternion(), palm = new THREE.Vector3(), want = new THREE.Vector3(), want2 = new THREE.Vector3(), fw = 0, last = null;
        var hfA = new THREE.Vector3(), hfB = new THREE.Vector3(), hfC = new THREE.Vector3(), hfBox = new THREE.Box3();
        var api = { root: holder, materials: Array.from(materials.values()), skin: skin, shirt: shirt, ready: true,
          update: function (time, topic, kind, reduce, speaking, opacity, farewell) {
            var t = reduce ? 0 : time, dt = last === null ? 0 : Math.max(0, Math.min(.1, time - last)); last = time;
            fw = reduce ? (farewell ? 1 : 0) : fw + ((farewell ? 1 : 0) - fw) * Math.min(1, dt * 2.6);
            /* sismo (kind "quake"): no sostiene nada, las manos quedan abiertas y relajadas; api.fear (0–1) añade la postura de miedo y los ojos «> <» */
            var quake = kind === "quake", free = kind === "none" || quake, fk = quake ? Math.max(0, Math.min(1, api.fear || 0)) : 0, fe = fk * fk * (3 - 2 * fk);
            /* caminar: piernas opuestas desde la cadera; swing (−1…1) mueve el brazo libre al revés que su pierna */
            var wlk = api.walk && api.walk.k > 0 ? api.walk : null, swing = 0;
            if (wlk && !legRig) legRig = buildLegs();
            if (legRig) {
              var amp = wlk ? .34 * wlk.k : 0, ph = wlk ? wlk.phase : 0, lift = 0;
              legRig.forEach(function (l) { var ang = -l.s * amp * Math.sin(ph); l.g.rotation.x = ang; lift = Math.max(lift, l.L * (1 - Math.cos(ang))); });
              holder.position.y = -lift; swing = wlk ? Math.sin(ph) * wlk.k : 0;
            }
            if (crouch) {   // baja ~16 % de la pierna, el tronco se inclina hacia delante (~12°) y un poco hacia un lado; el pantalón se acorta y se abre apenas
              var drop = .16 * crouch.legH * fe; crouch.torso.position.y = crouch.y0 - drop; crouch.torso.rotation.set(.21 * fe, .05 * swing, .06 * fe + .02 * swing);
              crouch.hips.scale.set(1 + .05 * fe, 1 - drop / crouch.legH, 1);
            }
            /* ojos: de susto en el sismo; felices en la despedida de cada recorrido (kind = objeto de la alternativa). La portada usa kind "none" y tiene sus propios ojos felices. */
            setEyes(fk > .35 ? "scared" : farewell && !free ? "happy" : "normal");
            [left, right].forEach(function (a) { if (!a) return;
              var roll = 0, curl = quake ? .14 : .35, wk = 0, palmTo = null, out = a.sign;   // out: +1 brazo izquierdo, -1 derecho (lado hacia fuera del cuerpo)
              /* qué brazo saluda: el derecho; sin objeto (portada) puede ser el izquierdo si api.waveSide = "left" */
              var waver = kind === "none" && api.waveSide === "left" ? left : right;
              if (a === left && !free) {
                var hk = topic === "llamadas" || topic === "cobertura" ? topic : kind === "radio" ? "radio" : kind === "torch" ? "torch" : "phone", h = (HOLD_ZONE[zone] && HOLD_ZONE[zone][hk]) || HOLD[hk];
                direction.set(h.d[0], h.d[1], h.d[2]); roll = h.roll || 0; curl = h.curl; if (h.palm) palmTo = want2.set(h.palm[0], h.palm[1], h.palm[2]);
                if (hk === "phone" && api.raiseK > 0) { var hr = HOLD.cobertura; direction.normalize().lerp(dTmp.set(hr.d[0], hr.d[1], hr.d[2]).normalize(), Math.min(1, api.raiseK)); }
              } else {
                direction.set(out * .22, -1, .1 + (a === right && speaking ? Math.sin(t * 1.3) * .06 : 0) + (a === left ? api.bagFwd : 0) + (a === right ? .45 : -.45) * swing);   // brazo relajado (el izquierdo, delante del bolso si lo hay)
                if (a === waver && fw > .001) {   // saludo: el brazo sube y la mano abierta se mece suavemente de lado a lado, con la palma hacia quien mira
                  var k = Math.max(0, Math.min(1, (fw - .3) / .7)); k = k * k * (3 - 2 * k);
                  direction.lerp(waveDir.set(out * (.7 + Math.sin(t * 3.6) * .13), .82 + Math.cos(t * 3.6) * .04, .36), k); curl = .35 * (1 - k) + .08 * k; wk = k;
                }
                if (fe > .001) {   // miedo: los brazos suben hacia la cabeza, por delante de la cara y por debajo de los ojos, con las palmas abiertas hacia fuera y un leve temblor
                  direction.normalize().lerp(waveDir.set(out * (.3 + Math.sin(t * 23 + out) * .025), .8 + Math.sin(t * 19) * .02, .55), fe); curl = curl * (1 - fe) + .1 * fe; wk = fe;
                }
              }
              direction.normalize(); a.pivot.quaternion.setFromUnitVectors(a.axis, direction);
              if (roll) a.pivot.quaternion.premultiply(twist.setFromAxisAngle(direction, roll * a.sign));
              if (wk || palmTo) {   // gira el brazo sobre su eje para que la palma (+z en reposo) mire hacia donde se pide (al saludar, a la cámara), sin cambiar hacia dónde apunta
                if (!palmTo) palmTo = want2.set(0, 0, 1);
                palm.set(0, 0, 1).applyQuaternion(a.pivot.quaternion); want.copy(palmTo).addScaledVector(direction, -palmTo.dot(direction)).normalize();
                var ang = Math.atan2(palm.clone().cross(want).dot(direction), palm.dot(want));
                a.pivot.quaternion.premultiply(twist.setFromAxisAngle(direction, ang * (wk || 1)));
              }
              /* giro extra de la mano sobre el eje del brazo cuando no sostiene nada (api.handTwist, por personaje): suelta → relax, saludando → wave */
              if (api.handTwist && !(a === left && !free)) {
                var tw = api.handTwist.relax * (1 - wk) + api.handTwist.wave * wk;
                if (tw) a.pivot.quaternion.premultiply(twist.setFromAxisAngle(direction, tw * a.sign));
              }
              a.fingers.forEach(function (f) { f.g.quaternion.setFromAxisAngle(Y, -a.sign * curl * (f.thumb ? .6 : 1)).multiply(f.base); });   // base: dedos juntos (Mateo)
            });            if (head) { q.setFromEuler(new THREE.Euler(Math.sin(t * 1.1) * .015 + .26 * fe, Math.sin(t * .65) * .035 * (1 - fe), Math.sin(t * 1.3) * .01)); head.quaternion.copy(headRest).multiply(q); }   // con miedo, la cabeza baja un poco
            api.materials.forEach(function (m) { var fading = opacity < .999; if (m.transparent !== (m.userData.baseTransparent || fading)) { m.transparent = m.userData.baseTransparent || fading; m.needsUpdate = true; } m.opacity = m.userData.baseOpacity * opacity; });
            holder.updateMatrixWorld(true);
          },
          wrist: function (out) { if (left) left.grip.getWorldPosition(out); else holder.getWorldPosition(out); return out; },
          /* hueco de la mano que sostiene (izquierda): el punto entre los nudillos y los dedos cerrados donde queda un asa, y la línea de los nudillos.
             Sirve para colgar un objeto de la mano (la radio por su asa) en vez de ponerlo con una distancia fija a la muñeca. */
          holdFrame: function (pos, axis) {
            if (!left) return false;
            var fs = left.fingers.filter(function (f) { return !f.thumb; }); if (fs.length < 2) return false;
            var kn = hfA.set(0, 0, 0), ce = hfB.set(0, 0, 0), bases = [];
            fs.forEach(function (f) { var p = f.g.getWorldPosition(new THREE.Vector3()); bases.push(p); kn.add(p); ce.add(hfBox.setFromObject(f.g).getCenter(hfC)); });
            kn.multiplyScalar(1 / fs.length); ce.multiplyScalar(1 / fs.length);
            pos.copy(kn).lerp(ce, 0.8);
            var a = bases[0], b = bases[1], d = 0;
            bases.forEach(function (p) { bases.forEach(function (q) { var dd = p.distanceToSquared(q); if (dd > d) { d = dd; a = p; b = q; } }); });
            axis.copy(b).sub(a).normalize();
            return true;
          },
          dispose: function () { holder.removeFromParent(); dispose(holder); }
        };
        /* Mateo lleva un bolso colgado a su izquierda: con el brazo izquierdo suelto (portada, sismo) la mano quedaba dentro del bolso.
           Ese brazo se adelanta lo justo para pasar por delante (medido en la escena). Sin bolso en ese lado, no cambia nada. */
        api.bagFwd = 0; holder.traverse(function (o) { if (o.isMesh && /bolso/i.test(o.name) && !/borde/i.test(o.name)) api.bagFwd = .5; });   // holder: las piezas del tronco ya cuelgan de su pivote
        holder.userData.api = api;
        /* mano suelta de Mateo: con el brazo adelantado (delante del bolso) la palma quedaba girada; se gira sobre el eje del brazo para que cuelgue
           como la de Valeria (medido: −0,35 rad). La mano que saluda ya mira igual que la de ella, en espejo */
        api.handTwist = zone === "rural" ? { relax: -.35, wave: 0 } : null;
        api.update(0, "sms", "phone", true, false, 0, false); resolve(api);
      }, undefined, reject);
    });
  }
  return { load: load, HOLD: HOLD, HOLD_ZONE: HOLD_ZONE };
})();
