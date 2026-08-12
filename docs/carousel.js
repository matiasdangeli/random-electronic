/*
 * Carrusel 3D de flyers de RANDOM.
 *
 * Tambor horizontal: los flyers están en fila y se deslizan de derecha a
 * izquierda, rotando hacia atrás al salir, con una pausa magnética al pasar
 * por el centro. Tienen grosor real (capas apiladas en Z) y se inclinan
 * siguiendo el mouse con inercia. La info de la fecha no se mueve: queda
 * siempre en el mismo lugar y cambia de contenido según el flyer centrado.
 *
 * Es una mejora progresiva: el HTML ya trae las fechas como lista normal y
 * este script las reacomoda. Si no corre, o si el usuario pidió menos
 * movimiento, la lista queda tal cual.
 */

(function () {
  "use strict";

  var SPEED = 0.0016; // avance por frame a 60fps: una fecha cada ~10s
  var GAP = 36; // separación entre flyer centrado y el de al lado
  var PEEK = -55; // cuánto se esconde el flyer al llegar al borde
  var DEPTH = 1350; // debe coincidir con el perspective del CSS
  var TILT_X = 12; // inclinación máxima con el mouse (grados)
  var TILT_Y = 15;
  var DAMP = 0.08; // inercia del mouse: cuánto persigue al cursor por frame
  var EDGES = [-0.73, 0, 0.73]; // capas intermedias que dan el grosor
  var FLOAT_Y = 11; // cuánto sube y baja flotando (px)
  var FLOAT_TILT = 1.6; // cuánto se bambolea mientras flota (grados)
  var FLIP_DAMP = 0.11; // velocidad con la que se da vuelta

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function init(root) {
    var events = Array.prototype.slice.call(root.querySelectorAll("[data-event]"));
    var cards = events.map(function (ev) {
      return ev.querySelector("[data-card]");
    });
    var panels = events.map(function (ev) {
      return ev.querySelector("[data-panel]");
    });
    if (!cards.length || cards.indexOf(null) !== -1) return;

    var count = cards.length;

    // Armado del escenario: los flyers pasan a una capa 3D y los detalles a un
    // bloque apilado debajo.
    var stage = document.createElement("div");
    stage.className = "carousel-stage";
    var space = document.createElement("div");
    space.className = "carousel-space";
    stage.appendChild(space);

    var panelBox = document.createElement("div");
    panelBox.className = "carousel-panels";

    var nav = document.createElement("div");
    nav.className = "carousel-nav";

    // Dar vuelta el flyer: además de tocarlo, un botón que se ve y va con
    // teclado. El texto se actualiza en updateFlipButton().
    var flipButton = document.createElement("button");
    flipButton.type = "button";
    flipButton.className = "carousel-flip";
    flipButton.appendChild(document.createTextNode("VER SET TIMES "));
    var flipIcon = document.createElement("span");
    flipIcon.setAttribute("aria-hidden", "true");
    flipIcon.textContent = "↻";
    flipButton.appendChild(flipIcon);
    flipButton.addEventListener("click", function () {
      if (activeIndex >= 0) toggleFlip(activeIndex);
    });
    nav.appendChild(flipButton);

    cards.forEach(function (card) {
      EDGES.forEach(function (z) {
        var edge = document.createElement("div");
        edge.className = "flyer3d-edge";
        edge.setAttribute("aria-hidden", "true");
        edge.style.transform = "translateZ(" + z + "px)";
        // Los cantos van detrás de la cara frontal pero delante de la trasera.
        card.insertBefore(edge, card.lastElementChild);
      });
      space.appendChild(card);
    });

    var dots = panels.map(function (panel, i) {
      panelBox.appendChild(panel);

      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      var title = panel.querySelector("h3");
      dot.setAttribute(
        "aria-label",
        "Ver " + (title ? title.textContent.trim() : "fecha " + (i + 1))
      );
      dot.addEventListener("click", function () {
        seekTo(i);
      });
      if (count > 1) nav.appendChild(dot);
      return dot;
    });

    root.appendChild(stage);
    root.appendChild(panelBox);
    root.appendChild(nav);
    root.classList.add("is-3d");

    // -- estado ------------------------------------------------------------
    var progress = 0;
    var seeking = null; // destino cuando tocan un punto de la navegación
    var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    var cardW = 300;
    var cardH = 533;
    var stageH = 620;
    var stageW = 1200;
    var activeIndex = -1;
    var hovering = false;
    var visible = true;
    var drag = null;
    var lastTime = 0;
    var frame = 0;
    var clock = 0; // segundos desde que arrancó, para la flotación

    // Giro de cada flyer para ver el reverso: destino en grados y valor actual.
    var flips = cards.map(function () {
      return { target: 0, current: 0 };
    });

    function resize() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;

      // El flyer centrado está en z=400, así que la perspectiva lo agranda:
      // hay que medir el tamaño ya aumentado para que entre en el escenario.
      var zoom = DEPTH / (DEPTH - 400);

      stageW = stage.getBoundingClientRect().width || vw;

      // Cuánto del ancho del escenario puede ocupar el flyer del medio. Con
      // lugar de sobra se deja aire para ver los que entran y salen; en el
      // celular no hay margen para eso y conviene que se vea grande.
      var share = stageW < 700 ? 0.86 : 0.56;

      stageH = clamp(vh * 0.82, 480, 860);
      var maxH = (stageH - 48) / zoom;
      var maxW = (stageW * share) / zoom / 0.5625;

      cardH = clamp(Math.min(maxH, maxW), 200, 620);
      cardW = cardH * 0.5625; // los flyers son 9:16

      root.style.setProperty("--card-w", Math.round(cardW) + "px");
      root.style.setProperty("--card-h", Math.round(cardH) + "px");
      root.style.setProperty("--stage-h", Math.round(stageH) + "px");
    }

    function seekTo(index) {
      // Ir por el camino más corto hacia esa fecha.
      var current = progress;
      var target = index;
      while (target - current > count / 2) target -= count;
      while (current - target > count / 2) target += count;
      seeking = target;
    }

    function toggleFlip(index) {
      var flip = flips[index];
      flip.target = flip.target === 0 ? 180 : 0;
      // Cualquier otro que haya quedado dado vuelta se endereza.
      flips.forEach(function (other, i) {
        if (i !== index) other.target = 0;
      });
      updateFlipButton();
    }

    function updateFlipButton() {
      var vuelto = activeIndex >= 0 && flips[activeIndex].target !== 0;
      flipButton.firstChild.nodeValue = vuelto ? "VER FLYER " : "VER SET TIMES ";
      flipButton.setAttribute("aria-pressed", vuelto ? "true" : "false");
    }

    function setActive(index) {
      if (index === activeIndex) return;
      if (activeIndex >= 0) flips[activeIndex].target = 0;
      activeIndex = index;
      panels.forEach(function (panel, i) {
        if (i === index) {
          panel.setAttribute("data-active", "");
          panel.removeAttribute("aria-hidden");
        } else {
          panel.removeAttribute("data-active");
          panel.setAttribute("aria-hidden", "true");
        }
      });
      dots.forEach(function (dot, i) {
        dot.setAttribute("aria-current", i === index ? "true" : "false");
      });
      updateFlipButton();
    }

    function layout() {
      // Paso magnético: se demora en el centro y después acelera.
      var rounded = Math.round(progress);
      var diff = progress - rounded;
      var eased = Math.sign(diff) * Math.pow(Math.abs(diff) * 2, 4.2) / 2;
      var virtual = rounded + eased;
      var half = count / 2;

      for (var i = 0; i < count; i++) {
        var card = cards[i];

        // Representación circular única en [-half, half) — con dos flyers, un
        // intervalo cerrado haría saltar la carta entre arriba y abajo.
        var offset = i - virtual;
        while (offset >= half) offset -= count;
        while (offset < -half) offset += count;

        var abs = Math.abs(offset);
        var sign = Math.sign(offset);

        if (abs > 3) {
          card.style.visibility = "hidden";
          continue;
        }
        card.style.visibility = "visible";

        // Distancia horizontal: el que viene espera a la derecha y sale por la
        // izquierda. En cada tramo se interpola con smoothstep, igual que en
        // el eje vertical, pero midiendo contra el ancho del escenario.
        var x;
        var z;
        var rot;

        if (abs <= 1) {
          var t1 = smoothstep(abs);
          x = sign * t1 * (cardW + GAP);
          z = 400 + t1 * (220 - 400);
          rot = t1 * 132;
        } else if (abs <= 2) {
          var t2 = smoothstep(abs - 1);
          var scale2 = DEPTH / (DEPTH + 60);
          var xEdge = (stageW / 2 - PEEK) / scale2 - cardW / 2;
          x = sign * ((cardW + GAP) + t2 * (xEdge - (cardW + GAP)));
          z = 220 + t2 * (-60 - 220);
          rot = 132 + t2 * (175 - 132);
        } else {
          var t3 = smoothstep(Math.min(abs - 2, 1));
          var scaleA = DEPTH / (DEPTH + 60);
          var xA = (stageW / 2 - PEEK) / scaleA - cardW / 2;
          var scaleB = DEPTH / (DEPTH + 250);
          var xB = (stageW / 2 + 100) / scaleB + cardW / 2;
          x = sign * (xA + t3 * (xB - xA));
          z = -60 + t3 * (-250 + 60);
          rot = 175 + t3 * (195 - 175);
        }

        // El parallax solo afecta al flyer que está al frente.
        var center = Math.max(0, 1 - abs);
        var rotX = -mouse.y * TILT_X * center;
        var rotY = sign * rot + flips[i].current + mouse.x * TILT_Y * center;

        // Flotación: sube y baja y se bambolea, desfasado por flyer para que no
        // se muevan todos igual.
        var floatY = Math.sin(clock * 0.62 + i * 1.9) * FLOAT_Y;
        var floatZ = Math.sin(clock * 0.44 + i * 2.7) * FLOAT_TILT;
        var floatX = Math.cos(clock * 0.51 + i * 1.3) * FLOAT_TILT * 0.7;

        card.style.zIndex = String(Math.round(z));
        card.style.transform =
          "translateX(" + x.toFixed(2) + "px) translateY(" + floatY.toFixed(2) + "px) " +
          "translateZ(" + z.toFixed(2) + "px) " +
          "rotateY(" + rotY.toFixed(2) + "deg) " +
          "rotateX(" + (rotX + floatX).toFixed(2) + "deg) " +
          "rotateZ(" + (-3 + floatZ).toFixed(2) + "deg)";

        // Solo el que está al frente y sin girar se puede tocar.
        card.classList.toggle("is-front", abs < 0.5);
      }

      setActive(((rounded % count) + count) % count);
    }

    function tick(now) {
      frame = requestAnimationFrame(tick);

      // Normalizado a 60fps para que no corra al doble en pantallas de 120Hz.
      var delta = lastTime ? clamp((now - lastTime) / 16.667, 0, 3) : 1;
      lastTime = now;
      clock += (delta * 16.667) / 1000;

      var flipping = false;
      for (var i = 0; i < flips.length; i++) {
        var flip = flips[i];
        flip.current += (flip.target - flip.current) * FLIP_DAMP * delta;
        if (Math.abs(flip.target - flip.current) < 0.05) flip.current = flip.target;
        if (flip.target !== 0 || flip.current !== 0) flipping = true;
      }

      if (seeking !== null) {
        progress += (seeking - progress) * 0.09 * delta;
        if (Math.abs(seeking - progress) < 0.002) {
          progress = seeking;
          seeking = null;
        }
      } else if (!hovering && !drag && !flipping && visible && !document.hidden) {
        // Con un flyer dado vuelta la fila se queda quieta: si no, se iría
        // rotando y quedaría mostrando la cara equivocada.
        progress += SPEED * delta;
      }

      mouse.x += (mouse.tx - mouse.x) * DAMP * delta;
      mouse.y += (mouse.ty - mouse.y) * DAMP * delta;

      layout();
    }

    // -- interacción -------------------------------------------------------
    window.addEventListener("mousemove", function (e) {
      mouse.tx = clamp((e.clientX - window.innerWidth / 2) / (window.innerWidth / 2), -1, 1);
      mouse.ty = clamp((e.clientY - window.innerHeight / 2) / (window.innerHeight / 2), -1, 1);
    });

    document.addEventListener("mouseleave", function () {
      mouse.tx = 0;
      mouse.ty = 0;
    });

    stage.addEventListener("mouseenter", function () {
      hovering = true;
    });

    stage.addEventListener("mouseleave", function () {
      hovering = false;
    });

    stage.addEventListener("pointerdown", function (e) {
      drag = {
        x: e.clientX,
        from: progress,
        moved: false,
        // Si apretaron sobre el flyer del frente, un toque sin arrastre lo da
        // vuelta en vez de mover la fila.
        onCard: !!(e.target.closest && e.target.closest(".flyer3d.is-front")),
      };
      seeking = null;
      stage.classList.add("is-dragging");
      stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) > 6) drag.moved = true;
      // Arrastrar hacia la izquierda adelanta, como empujar la fila con el dedo.
      progress = drag.from + (drag.x - e.clientX) / (cardW + GAP);
    });

    function endDrag(e) {
      if (!drag) return;
      var wasTapOnCard = !drag.moved && drag.onCard;
      drag = null;
      stage.classList.remove("is-dragging");
      if (e && e.pointerId !== undefined && stage.hasPointerCapture(e.pointerId)) {
        stage.releasePointerCapture(e.pointerId);
      }
      if (wasTapOnCard && activeIndex >= 0) {
        toggleFlip(activeIndex);
        return;
      }
      seekTo(((Math.round(progress) % count) + count) % count);
    }

    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", resize);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          visible = entries[0].isIntersecting;
        },
        { threshold: 0.05 }
      ).observe(stage);
    }

    resize();
    setActive(0);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    // Respetar "reducir movimiento": la lista de fechas ya es legible sin esto.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (!("requestAnimationFrame" in window) || !CSS.supports("transform-style", "preserve-3d")) {
      return;
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-carousel]"), init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
