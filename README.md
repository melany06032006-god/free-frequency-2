# Free Frequency

Experiencia web educativa sobre alternativas de comunicación cuando la conectividad falla. HTML + CSS + JS; los objetos y los escenarios usan Three.js (copia local, ver abajo).
Fuentes: Fraunces y DM Sans (Google Fonts, con alternativa del sistema).

## Cómo probarla
```bash
npm run dev
```
Abre la dirección que muestre la terminal (por defecto http://localhost:5190; si está ocupado usa el siguiente puerto libre).
Se recomienda usar el servidor: abrir `index.html` con doble clic puede funcionar, pero no está verificado.

## Estructura
**Portada** → **Elegir zona** → **Menú de la zona** (los tres objetos 3D) → **Recorrido de cada objeto** → **Preparación** (con **Fuentes y créditos**).

- **Dos zonas**: *Ruralidad — Cauca* (con Mateo; cobertura débil o inexistente) y *Urbanidad — Cali* (con Valeria; situación posterior a un sismo). Cada zona tiene su escenario 3D (`js/scenery.js`) y su propia explicación de cada objeto (`FF.zones[zona].items` en `js/data.js`): los textos no se repiten entre zonas.
- **Tres objetos** (y solo tres): teléfono celular, radio portátil AM/FM y linterna, con modelo 3D (`js/hub.js`, `js/seq-modules.js`).
  - Teléfono rural: SMS, buscar mejor señal y reconexión. Teléfono urbano: SMS breves, llamadas breves, modo avión y probar otra red (solo si el teléfono y el operador lo permiten).
  - Radio: una explicación por zona.
  - **Linterna: recorrido guiado de código Morse** (`FF.zones[zona].items.linterna.guide` en `js/data.js`; lógica en `js/sequence.js`, bloque «recorrido guiado»). Avanza por pasos que esperan al usuario: 1) la linterna 3D sola, que se enciende poco a poco, con el título «Una luz también puede comunicar»; 2) acercamiento a las manos y al pulgar, con el destello corto (punto, ≈0,2 s) y el largo (raya, ≈0,6 s) y sus indicadores; 3) la señal SOS (`... --- ...`) reproducida con la linterna y con cada punto o raya iluminándose a la vez (0,2 s entre símbolos, 0,6 s entre letras), más el texto de cada zona; 4) práctica: «Destello corto», «Destello largo», «Reproducir SOS», «Repetir», «Borrar» y «Continuar», o mantener presionado el interruptor de la linterna (clic, toque o Espacio/Enter) —se enciende al presionar y se apaga al soltar—, con un registro de lo que escribes que avisa si coincide con SOS (sin medir tiempos); 5) cuadro «¿Cómo ayuda?» y «Condiciones y límites». Durante los pasos 3 y 4 el deslizamiento y la rueda no cambian de escena. Con «reducir movimiento» la linterna no parpadea: solo se iluminan los indicadores.
- **Secuencia visual** (`js/sequence.js` + `js/seq-modules.js`), igual para todos los objetos: 1) objeto protagonista → 2) **práctica**: el objeto solo, grande y en el centro (sin manos), y el usuario lo usa directamente —toca la pantalla del teléfono (o escribe con su teclado), gira las perillas de la radio o mantiene presionado el interruptor de la linterna para formar SOS—; un panel pequeño abajo indica qué hacer y al terminar pregunta «Mmm… ¿quieres repetir la práctica?» (*Repetir práctica* / *Continuar*) → 3) personaje completo usándolo → 4) cuadro con *Cómo ayuda*, *Condiciones y límites* y el territorio (solo información: ya no tiene simuladores; trae «Repetir práctica»). La versión sin WebGL conserva los controles en el cuadro.
- **Zona rural, al entrar**: en lugar del sismo, una escena breve en la que Mateo mira a su alrededor, se angustia (manos a la cabeza) y aparece una nube «¡No tengo señal!» (`FF.nosignal` en `js/data.js`).
- **Escenario rural**: el pasto del modelo estaba 0,8 m por debajo de las casas y Mateo parecía flotar; al cargar, el pasto y el camino se ajustan a y = 0. Casas, montañas y camino usan el toon shader completo (contorno negro y escalones); los árboles conservan el toon suave.
- **Simulación del sismo** (solo al entrar a la zona urbana): ~5 s con cámara y suelo moviéndose de forma suave (±3 cm), edificios y postes que oscilan ~1°, luces que parpadean, objetos de la calle que vibran y el personaje encogido con una señal «!». Termina con un aviso «El movimiento terminó» y un botón para continuar con las explicaciones; se puede saltar. Con «reducir movimiento» no se mueve nada: se muestra la escena en reposo con los dos textos. No hay derrumbes ni daños en los edificios.
- **Interacciones** (ratón, teclado y táctil; nada real): simulador de SMS con campo de texto («Enviar (simulado)»), modo avión con reconexión ilustrativa, búsqueda de señal, cambio de red ilustrativo, radio con perillas que se arrastran, perilla de encendido, selector AM/FM (lámparas) y dial, y linterna que enciende y apaga iluminando el entorno. No se envían mensajes ni llamadas, ni se tocan ajustes del dispositivo.
- **Navegación**: barra inferior con Menú, anterior, progreso de la zona (3 alternativas) y siguiente; pestañas superiores; teclas ←/→. La rueda del ratón y el deslizamiento ya no cambian de alternativa. En el cuadro final, el botón amarillo lleva a la siguiente alternativa (reemplaza a «Finalizar recorrido»). En computador, el panel de la práctica va a la derecha y el objeto ocupa el centro, más grande; en celular, el panel va abajo. Cada gesto avanza **un solo paso** y hay una pausa de ~0,9 s entre pasos; tocar objetos 3D o el cuadro nunca cambia de escena. «Repetir el acercamiento», «Repetir secuencia» y los pasos de la barra de progreso permiten revisar cada etapa; la primera vez se ve la secuencia completa y al volver se muestra directo el plano completo.
- **Movimiento reducido**: sin transiciones; los cuatro pasos son planos fijos que se eligen con la barra de progreso. **Sin WebGL**: versión plana con el mismo cuadro y controles (sin acercamiento ni sismo).
- Archivos: `js/data.js` (contenido y fuentes), `js/app.js` (rutas, navegación), `js/components.js` (selector de zona y sección final), `js/hub.js` (menú 3D y modelos), `js/scenery.js` (escenarios), `js/sequence.js` (motor), `js/seq-modules.js` (objetos), `js/tuner.js` (sintonizador), `css/styles.css`.

## Sonido (`js/audio.js`)
Un módulo central con Web Audio API; todos los sonidos se sintetizan al momento (sin archivos, descargas ni dependencias). Se habilita con el primer clic, toque o tecla (o «Comenzar»). El botón del encabezado silencia o activa todo (efectos, radio y ambientes) y la preferencia se guarda como `ff-sound` = on/off en el navegador. Mezcla en tres buses (efectos, radio y ambiente) con un compresor/limitador antes del volumen general (0,9): los efectos van al frente, y el ambiente baja un instante cada vez que suena un efecto para que se oiga con claridad. Si Web Audio falla, todo sigue funcionando sin sonido.
- **Teléfono**: cada tecla suena al escribirla —y en la demostración, cada vez que el pulgar pulsa— (tono distinto por letra), borrar tiene otro sonido, enviar (simulado), modo avión (confirmación) y un aviso breve y neutro cuando aparece la «reconexión ilustrativa», sincronizado con el cambio de pantalla.
- **Radio**: clic de perilla y de las lámparas de banda, tic mecánico del dial, silbido de barrido de frecuencia que sigue al dial (también en la demostración), estática que sube o baja con la claridad de la señal simulada, tono limpio al encontrar una emisora de ejemplo y estática que vuelve al perderla; se calla sola a los ~4 s sin interacción y al apagar la radio. Suena al manipularla y durante su demostración en pantalla.
- **Linterna**: al hundir el botón de encendido suena un golpe mecánico grave, y al soltarlo un clic más agudo, sincronizados con la luz y con el pulgar (también cuando la linterna se enciende al empezar); en la demostración, el SOS y la práctica suena un clic por cada encendido y apagado (el SOS son 18 clics: 9 destellos). Volver a entrar a una escena es silencioso.
- **Sin sonido de fondo**: no hay música ni ambientes. Solo el retumbo breve del sismo (se desvanece solo; con «reducir movimiento» no suena).
- No hay audio en el menú, en la portada ni al cambiar de ruta, y `sceneStop()` detiene ambiente, radio y avisos pendientes al salir de una escena. La versión plana (sin WebGL) no tiene sonido en sus controles.

## Rutas
`#inicio`, `#zonas`, `#rural` y `#urbano` (menú de la zona), `#rural/telefono`, `#urbano/radio`, etc. (recorrido), `#preparacion`, `#fuentes`.

## Dependencia
`assets/vendor/three.min.js`: Three.js r149 (MIT, ver `assets/vendor/three.LICENSE.txt`), script clásico sin build.

## Interacción del menú de la zona
Un único cuadro informativo (texto HTML real, accesible) muestra el nombre y la explicación del objeto. Seleccionar nunca navega: el recorrido empieza solo con **«Comenzar recorrido»**.
- **Ratón:** el cursor muestra una vista previa; un clic selecciona. **Táctil:** un toque selecciona; el botón del cuadro abre el recorrido. **Teclado:** Tab, Enter y Escape.
- Textos del menú: `FF.menu` en `js/data.js`.

## Límites reales (qué es 3D y qué no)
- Son 3D reales y construidos en código: los tres objetos, el escenario rural, las manos y los antebrazos del primer plano (geometría sencilla y estilizada con pulgar articulado) y la luz de la linterna (un foco sin sombras).
- **Escenario urbano de Cali (Blender)**: `assets/models/urbano/escenario urbano/Escenario Urbano Free Frecuency.glb` (3,9 MB, 55 objetos: edificios, casas, iglesia, Gato de Tejada, trompetas, paradero, bus, taxi, postes, cables y árboles). Lo carga `js/scenery.js` con GLTFLoader una sola vez (empieza a descargarse al entrar a la zona) y cada escena usa una copia. Escala 1 unidad = 1 m; la chica queda en el carril cercano de la calle, frente al paradero (`CITY.at`). Los colores del modelo se pasan a material toon (el modelo no trae texturas). En el plano completo la cámara baja un poco y mira levemente hacia arriba para mostrar los edificios (`CITY.wide`). Si el archivo no carga, se usa la ciudad genérica de respaldo.
- **Los personajes completos siguen siendo ilustraciones planas** (Mateo y Valeria) sobre un plano 3D: no hay modelos 3D articulados disponibles en el proyecto. Se mueve el cuerpo entero (respirar, balanceo al explicar, encogerse y ladearse en el sismo); **no** hay parpadeo, mirada, expresión de sorpresa ni brazos que se muevan. En el plano completo se ve la mano 3D que sostiene el objeto a la altura de la muñeca de la ilustración. No caminan.
- El sintonizador es ilustrativo: no hay audio ni frecuencias ni emisoras reales.

## Recursos provisionales (reemplazables con el mismo nombre)
- Ilustraciones de zona: `assets/scenes/{cauca,cali}-back.svg` (miniaturas del selector y versión plana). Iconos: `assets/objects/*.svg`.
- Personajes: `assets/characters/cauca.png` (Mateo) y `cali.png` (Valeria); originales en `*-original.png`.

## Contenido y fuentes
Los textos son educativos y no reemplazan las indicaciones de las autoridades. La sección «Fuentes y créditos» (`#fuentes`) cita a UNGRD, SGC, MinTIC, CRC y Cruz Roja Colombiana; se consultaron resúmenes que las citan (detalle en la cabecera de `js/data.js`), así que conviene confirmar en sus sitios oficiales antes de publicar. No se citan frecuencias, alcances de radios ni garantías de conectividad.

## Revisión académica (octubre de 2026)

- **Idiomas (ES/EN):** botón `EN`/`ES` en la barra superior. El español es el original; `js/lang-en.js` trae el diccionario y `js/i18n.js` traduce la interfaz y los textos de los canvas. El idioma se guarda en `localStorage` (`ff-lang`) y la página se recarga al cambiarlo. Una frase sin traducción se muestra en español.
- **SMS:** icono propio, explicación inicial, por qué sirve con problemas de conectividad y tutorial paso a paso con simulador (nada real se envía).
- **Teléfono, modo avión y alternativas:** introducción en cada tema y resumen en el menú de la zona.
- **Morse:** explicación en el primer paso de la guía de la linterna.
- **Cali y Cauca:** sección «¿Por qué el Cauca y Cali?» en el selector de zonas, con fuentes en `#fuentes`.
- **Logo:** blanco en todas las vistas y dentro de la pantalla del teléfono.
- **Personajes:** halo blanco de los bordes eliminado en `assets/characters/cauca.png` y `cali.png` (siguen siendo ilustraciones planas).
- **Menú y radio:** barra superior sin solapes; en la tarjeta de la radio el sintonizador va arriba y la radio es más grande en el plano general.

## Personajes 3D, agarre y toon shader
- **Personajes:** en el plano completo son los modelos 3D de `assets/models` con los brazos rígidos originales (cada brazo gira entero desde el hombro, `js/characters-3d.js`). La articulación del hombro está dentro de la manga abullonada (a ¾ de su radio desde el extremo interior): así, al bajar el brazo, la manga queda a la altura del hombro y el brazo sale de ella. Cada dedo gira desde su nudillo para cerrar la mano sobre el objeto.
- **Agarre:** la tabla `HOLD` de `js/characters-3d.js` fija, por objeto, la dirección del brazo, el giro de la palma y cuánto se cierran los dedos; la posición de cada objeto respecto de la mano está en `pose.wide` de cada módulo (`js/seq-modules.js`): el teléfono queda con los dedos sobre su borde, la radio colgando del asa dentro de la mano y la linterna con los dedos alrededor del mango.
- **Despedida:** al pulsar «Finalizar recorrido» el personaje sigue sosteniendo el objeto con una mano y saluda con la otra (el brazo sube y se mueve de lado a lado; con «reducir movimiento» queda levantado y quieto).
- **Manos de los primeros planos (teléfono y radio):** `makeHand` en `js/seq-modules.js` construye una mano articulada al estilo del personaje: palma redondeada, cuatro dedos de tres falanges y pulgar de tres piezas, todas de largo fijo, y un antebrazo de largo fijo (manga a cuadros en el Cauca, brazo descubierto con pulsera en Cali). Para tocar algo se mueve la mano entera; nada se estira. Teléfono: la mano izquierda lo sostiene por detrás con los dedos alrededor del borde derecho y la derecha escribe con la punta del índice, que va de tecla en tecla. Radio: la izquierda sostiene el asa con el puño cerrado y la derecha toma la perilla en pinza (yemas del pulgar y del índice sobre el borde de la perilla) y gira la muñeca con ella. La linterna conserva sus manos anteriores.
- **Toon shader:** `js/toon-shader.js` porta `toon_shader_substance_painter_12_1_5.glsl` (copia de referencia en `assets/shaders/`) a Three.js y se aplica solo a los materiales de los tres objetos (teléfono, radio y linterna, también en el menú): contorno negro según N·V y tres escalones de luz según N·L (pleno, ×0.5, ×0.1 y negro). La luz es una dirección fija respecto a la cámara; no se usa «use_curvature» porque no hay mapa de curvatura.
- **Boletín de radio:** `assets/audio/radio-boletin.mp3` suena en la emisora informativa de ejemplo (`js/audio.js`, `bulEnsure`): más claro cuanto mejor está sintonizada, con estática y filtro de radio (más estrecho en AM). Sigue sonando mientras el dial quede en la emisora y se detiene al apagar la radio, alejar el dial, silenciar o salir de la escena. Para cambiarlo, reemplaza el archivo con el mismo nombre. Confirma que el audio tiene licencia libre antes de publicar.
