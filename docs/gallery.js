/*
 * Galería de fotos de RANDOM.
 *
 * Una sola tira, todas las noches mezcladas en orden, de la más nueva a la más
 * vieja. No se divide por fecha: la fecha de cada foto aparece en el visor,
 * cuando se la abre.
 *
 * La página no baja ni una foto hasta que alguien se acerca a la sección:
 * recién ahí pide fotos.json y, de ahí en más, solo bajan las miniaturas que
 * están a la vista. Las fotos grandes se piden de a una, cuando se abre el
 * visor, y se adelanta únicamente la siguiente y la anterior.
 *
 * Es una mejora progresiva: si el script no corre, o si todavía no hay fotos
 * cargadas, la sección queda escondida y el resto de la página no se entera.
 */

(function () {
  "use strict";

  // Las rutas arrancan con / porque esta galería se usa desde la home y desde
  // /galeria/: una ruta relativa se rompería en la segunda.
  var MANIFEST_URL = "/fotos.json?v=20260820-1";
  var STYLES_URL = "/gallery.css?v=20260826-2";
  var BATCH = 18; // miniaturas por tanda: alcanza para llenar la pantalla más grande
  var NEAR = "800px"; // cuánto antes de llegar a la sección se empieza a preparar todo

  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var section = document.querySelector("[data-gallery]");
  if (!section || !window.fetch) return;

  var data = null;
  var photos = []; // todas las fotos, de todas las noches, en una sola lista
  var shown = 0;
  var lightbox = null;
  var lightboxIndex = -1;
  var lastFocused = null; // a qué miniatura volver cuando se cierra el visor
  var pointerState = null;
  var activeTransition = null;
  var queuedDelta = null;
  var suppressFrameClick = false;

  // Los estilos de la galería viajan aparte y se piden recién cuando hay algo
  // que mostrar: mientras no haya fotos, la sección no le cuesta nada a la
  // página. Mismo criterio que live.css.
  function loadStyles() {
    if (document.querySelector("link[data-random-gallery-styles]")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLES_URL;
    link.setAttribute("data-random-gallery-styles", "");
    document.head.appendChild(link);
  }

  var MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
               "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

  function photoUrl(photo, size) {
    return data.base + photo.dir + "/" + photo.id + (size ? "-" + size : "") + ".webp";
  }

  // Cada foto se nombra por la noche en que se sacó, no por el número de
  // edición. Así todas dicen lo mismo, incluidas las noches que no tienen
  // ficha en el sitio, y no hay que mantener dos formatos.
  function label(photo) {
    var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(photo.date || "");
    if (partes) return +partes[3] + " " + MESES[+partes[2] - 1] + " " + partes[1];
    return "RANDOM";
  }

  /* --- Miniaturas ---------------------------------------------------------
     Cuadradas y recortadas: sin medir nada, el navegador ya sabe qué lugar
     ocupa cada una antes de bajarla, así la grilla no salta. El color de
     fondo es el color promedio de la foto, así el hueco no es un rectángulo
     gris mientras carga. */
  function thumb(photo, index) {
    var item = document.createElement("li");
    item.className = "gallery-item";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "gallery-shot";
    button.setAttribute("aria-label", "Abrir foto de RANDOM " + label(photo));

    var img = document.createElement("img");
    img.src = photoUrl(photo, "s");
    img.srcset = photoUrl(photo, "s") + " 320w, " + photoUrl(photo, "m") + " 640w";
    img.sizes = "(max-width: 700px) 33vw, (max-width: 1200px) 22vw, 230px";
    img.width = 320;
    img.height = 320;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    if (photo.color) img.style.background = photo.color;

    button.appendChild(img);
    button.addEventListener("click", function () { openLightbox(index); });
    item.appendChild(button);
    return item;
  }

  function grid() {
    return section.querySelector("[data-gallery-grid]");
  }

  // El resto de las fotos se monta de a tandas al bajar. Con cientos de fotos,
  // meter todos los nodos de una traba el scroll aunque las imágenes sean
  // livianas.
  function showMore() {
    if (shown >= photos.length) return;
    var target = grid();
    var fragment = document.createDocumentFragment();
    var limit = Math.min(shown + BATCH, photos.length);
    for (var i = shown; i < limit; i++) fragment.appendChild(thumb(photos[i], i));
    target.appendChild(fragment);
    shown = limit;
    section.querySelector("[data-gallery-sentinel]").hidden = shown >= photos.length;
  }

  /* --- Visor --------------------------------------------------------------
     La foto grande se pide recién acá. Mientras baja se ve la miniatura que ya
     estaba en caché estirada de fondo, así nunca hay un hueco negro. */
  function buildLightbox() {
    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Foto");
    box.hidden = true;
    box.innerHTML =
      '<button class="lightbox-close" type="button" aria-label="Cerrar">✕</button>' +
      '<button class="lightbox-nav lightbox-nav--prev" type="button" aria-label="Foto anterior">‹</button>' +
      '<figure class="lightbox-frame"></figure>' +
      '<button class="lightbox-nav lightbox-nav--next" type="button" aria-label="Foto siguiente">›</button>' +
      '<p class="lightbox-meta"><span data-lightbox-title></span>' +
      '<button class="lightbox-save" type="button" data-lightbox-save>GUARDAR</button></p>';

    box.querySelector("[data-lightbox-save]").addEventListener("click", savePhoto);
    box.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
    box.querySelector(".lightbox-nav--prev").addEventListener("click", function () { step(-1); });
    box.querySelector(".lightbox-nav--next").addEventListener("click", function () { step(1); });
    // Tocar el fondo cierra; tocar la foto o los botones, no.
    box.addEventListener("click", function (e) {
      if (suppressFrameClick) {
        suppressFrameClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target === box || (e.target.classList && e.target.classList.contains("lightbox-frame"))) closeLightbox();
    });

    // Sin esto, arrastrar la foto dispara el drag nativo y te llevás la imagen.
    box.addEventListener("dragstart", function (e) { e.preventDefault(); });

    setupSwipe(box.querySelector(".lightbox-frame"));
    document.body.appendChild(box);
    return box;
  }

  function normalizedIndex(index) {
    return (index + photos.length) % photos.length;
  }

  function normalizeImage(img) {
    if (!img) return;
    img.style.transform = "";
    img.style.opacity = "";
  }

  function configureImage(img, index) {
    var photo = photos[index];
    img.className = "lightbox-image";
    img.setAttribute("data-photo-index", String(index));
    img.decoding = "async";

    // Las medidas van como atributos, no como estilos: así la foto ocupa su
    // lugar exacto desde antes de bajarla y el visor no salta al terminar.
    if (photo.w && photo.h) {
      img.width = photo.w;
      img.height = photo.h;
    } else {
      img.removeAttribute("width");
      img.removeAttribute("height");
    }
    img.style.backgroundColor = photo.color || "#111";
    img.style.backgroundImage = 'url("' + photoUrl(photo, "m") + '")';
    img.src = photoUrl(photo);
    img.alt = "Foto de RANDOM " + label(photo);
    if (img.complete) img.style.backgroundImage = "";
    return img;
  }

  function createImage(index) {
    var img = document.createElement("img");
    img.addEventListener("load", function () { img.style.backgroundImage = ""; });
    return configureImage(img, index);
  }

  function currentImage() {
    return lightbox && lightbox.querySelector(".lightbox-image.is-current");
  }

  function updatePhotoState(index) {
    var photo = photos[index];
    lightboxIndex = index;

    // La fecha no divide la grilla, pero acá sí importa: es la única forma de
    // saber de qué noche es la foto que se está mirando.
    lightbox.querySelector("[data-lightbox-title]").textContent = label(photo);
    var save = lightbox.querySelector("[data-lightbox-save]");
    save.textContent = "GUARDAR";
    save.disabled = false;

    var single = photos.length < 2;
    lightbox.querySelector(".lightbox-nav--prev").hidden = single;
    lightbox.querySelector(".lightbox-nav--next").hidden = single;

    preload(index + 1);
    preload(index - 1);
  }

  function mountPreview(state, direction) {
    if (state.direction === direction && state.incoming && state.incoming.parentNode) return state.incoming;
    if (state.incoming && state.incoming.parentNode) state.incoming.parentNode.removeChild(state.incoming);
    state.direction = direction;
    state.nextIndex = normalizedIndex(lightboxIndex + direction);
    state.incoming = createImage(state.nextIndex);
    state.frame.appendChild(state.incoming);
    return state.incoming;
  }

  function drawDrag(state) {
    var width = state.width;
    var dx = state.dx;
    var direction = dx < 0 ? 1 : -1;
    var incoming = mountPreview(state, direction);
    var progress = Math.min(Math.abs(dx) / width, 1);
    var currentOpacity = 1 - 0.35 * progress;
    var incomingOpacity = 0.35 + 0.65 * progress;

    state.frame.classList.add("is-moving");
    if (REDUCED) {
      state.current.style.transform = "";
      incoming.style.transform = "";
    } else {
      state.current.style.transform = "translate3d(" + dx + "px, 0, 0) scale(" + (1 - 0.015 * progress) + ")";
      incoming.style.transform = "translate3d(" + (dx + direction * width) + "px, 0, 0) scale(" + (0.985 + 0.015 * progress) + ")";
    }
    state.current.style.opacity = String(currentOpacity);
    incoming.style.opacity = String(incomingOpacity);
  }

  function releasePointer(state) {
    if (!state || !state.frame || state.pointerId === null) return;
    if (state.frame.hasPointerCapture && state.frame.hasPointerCapture(state.pointerId)) {
      state.frame.releasePointerCapture(state.pointerId);
    }
  }

  function suppressDragClick() {
    suppressFrameClick = true;
    window.setTimeout(function () { suppressFrameClick = false; }, 450);
  }

  function settleCancelledDrag(state) {
    if (!state) return;
    var incoming = state.incoming;
    if (!incoming) {
      normalizeImage(state.current);
      state.frame.classList.remove("is-moving");
      return;
    }
    if (REDUCED || !window.Element || !Element.prototype.animate) {
      if (incoming.parentNode) incoming.parentNode.removeChild(incoming);
      normalizeImage(state.current);
      state.frame.classList.remove("is-moving");
      return;
    }

    var direction = state.direction || (state.dx < 0 ? 1 : -1);
    var outgoingAnimation = state.current.animate([
      { transform: state.current.style.transform, opacity: state.current.style.opacity },
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 }
    ], { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" });
    var incomingAnimation = incoming.animate([
      { transform: incoming.style.transform, opacity: incoming.style.opacity },
      { transform: "translate3d(" + (direction * state.width) + "px, 0, 0) scale(0.985)", opacity: 0.35 }
    ], { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" });

    var settle = {
      frame: state.frame,
      outgoing: state.current,
      incoming: incoming,
      animations: [outgoingAnimation, incomingAnimation],
      cancelled: false,
      commits: false
    };
    activeTransition = settle;
    Promise.all([
      outgoingAnimation.finished.catch(function () {}),
      incomingAnimation.finished.catch(function () {})
    ]).then(function () {
      if (activeTransition !== settle || settle.cancelled) return;
      outgoingAnimation.cancel();
      incomingAnimation.cancel();
      if (incoming.parentNode) incoming.parentNode.removeChild(incoming);
      normalizeImage(state.current);
      state.current.classList.add("is-current");
      state.frame.classList.remove("is-moving");
      activeTransition = null;
      var nextDelta = queuedDelta;
      queuedDelta = null;
      if (nextDelta !== null && !lightbox.hidden) animateNavigation(nextDelta);
    });
  }

  function setupSwipe(frame) {
    frame.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.isPrimary === false || activeTransition || lightboxIndex < 0 || photos.length < 2) return;
      var now = performance.now();
      pointerState = {
        frame: frame,
        current: currentImage(),
        incoming: null,
        nextIndex: -1,
        direction: 0,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastTime: now,
        dx: 0,
        dy: 0,
        velocity: 0,
        axis: null,
        width: Math.max(frame.getBoundingClientRect().width, 1)
      };
      if (frame.setPointerCapture) frame.setPointerCapture(e.pointerId);
    });

    frame.addEventListener("pointermove", function (e) {
      var state = pointerState;
      if (!state || e.pointerId !== state.pointerId) return;
      var now = performance.now();
      var elapsed = now - state.lastTime;
      if (elapsed > 0) {
        var sampleVelocity = (e.clientX - state.lastX) / elapsed;
        state.velocity = state.velocity * 0.65 + sampleVelocity * 0.35;
      }
      state.lastX = e.clientX;
      state.lastTime = now;
      state.dx = e.clientX - state.startX;
      state.dy = e.clientY - state.startY;

      if (!state.axis && Math.max(Math.abs(state.dx), Math.abs(state.dy)) > 8) {
        state.axis = Math.abs(state.dx) > Math.abs(state.dy) * 1.25 ? "horizontal" : "vertical";
      }
      if (state.axis !== "horizontal") return;
      e.preventDefault();
      drawDrag(state);
    });

    function finishPointer(e, cancelled) {
      var state = pointerState;
      if (!state || e.pointerId !== state.pointerId) return;
      pointerState = null;
      releasePointer(state);
      if (state.axis !== "horizontal") {
        if (state.axis === "vertical") suppressDragClick();
        return;
      }

      suppressDragClick();
      if (cancelled) {
        settleCancelledDrag(state);
        return;
      }

      var threshold = Math.min(96, state.width * 0.18);
      var commits = Math.abs(state.dx) > threshold || Math.abs(state.velocity) > 0.45;
      if (!commits) {
        settleCancelledDrag(state);
        return;
      }

      var intent = Math.abs(state.dx) > threshold ? state.dx : state.velocity;
      var direction = intent < 0 ? 1 : -1;
      mountPreview(state, direction);
      animateNavigation(direction, state);
    }

    frame.addEventListener("pointerup", function (e) { finishPointer(e, false); });
    frame.addEventListener("pointercancel", function (e) { finishPointer(e, true); });
    frame.addEventListener("lostpointercapture", function (e) {
      if (pointerState && e.pointerId === pointerState.pointerId) finishPointer(e, true);
    });
  }

  function preload(index) {
    if (index < 0 || index >= photos.length) return;
    var image = new Image();
    image.decoding = "async";
    image.src = photoUrl(photos[index]);
  }

  function showPhoto(index) {
    var frame = lightbox.querySelector(".lightbox-frame");
    var img = currentImage();
    Array.prototype.forEach.call(frame.querySelectorAll(".lightbox-image"), function (node) {
      if (node !== img) node.parentNode.removeChild(node);
    });
    if (!img) {
      img = createImage(index);
      frame.appendChild(img);
    } else {
      configureImage(img, index);
    }
    normalizeImage(img);
    img.classList.add("is-current");
    frame.classList.remove("is-moving");
    updatePhotoState(index);
  }

  /* --- Guardar ------------------------------------------------------------
     El teléfono guarda mejor un JPG que un WebP, así que la foto se pasa por
     un lienzo antes de entregarla. Donde el navegador sabe compartir archivos
     se abre el panel nativo —ahí está "Guardar en Fotos"—; donde no, se
     descarga. Si el lienzo falla, se entrega el WebP tal cual. */
  function aJpg(blob, nombre) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try {
          var lienzo = document.createElement("canvas");
          lienzo.width = img.naturalWidth;
          lienzo.height = img.naturalHeight;
          lienzo.getContext("2d").drawImage(img, 0, 0);
          lienzo.toBlob(function (jpg) {
            URL.revokeObjectURL(url);
            resolve(jpg ? new File([jpg], nombre + ".jpg", { type: "image/jpeg" })
                        : new File([blob], nombre + ".webp", { type: "image/webp" }));
          }, "image/jpeg", 0.92);
        } catch (error) {
          URL.revokeObjectURL(url);
          resolve(new File([blob], nombre + ".webp", { type: "image/webp" }));
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(new File([blob], nombre + ".webp", { type: "image/webp" }));
      };
      img.src = url;
    });
  }

  function savePhoto() {
    if (lightboxIndex < 0) return;
    var photo = photos[lightboxIndex];
    var boton = lightbox.querySelector("[data-lightbox-save]");
    boton.disabled = true;
    boton.textContent = "PREPARANDO";

    fetch(photoUrl(photo))
      .then(function (r) { return r.blob(); })
      .then(function (blob) { return aJpg(blob, "random-" + photo.id); })
      .then(function (archivo) {
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
          return navigator.share({ files: [archivo] }).then(function () { boton.textContent = "GUARDAR"; });
        }
        var url = URL.createObjectURL(archivo);
        var a = document.createElement("a");
        a.href = url;
        a.download = archivo.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        boton.textContent = "GUARDADA";
        setTimeout(function () { boton.textContent = "GUARDAR"; }, 2000);
      })
      .catch(function () { boton.textContent = "GUARDAR"; })
      .then(function () { boton.disabled = false; });
  }

  function finishTransition(state) {
    if (activeTransition !== state || state.cancelled) return;
    state.animations.forEach(function (animation) { animation.cancel(); });
    if (state.outgoing.parentNode) state.outgoing.parentNode.removeChild(state.outgoing);
    normalizeImage(state.incoming);
    state.incoming.classList.add("is-current");
    state.frame.classList.remove("is-moving");
    activeTransition = null;
    updatePhotoState(state.nextIndex);

    var nextDelta = queuedDelta;
    queuedDelta = null;
    if (nextDelta !== null && !lightbox.hidden) animateNavigation(nextDelta);
  }

  function animateNavigation(delta, dragState) {
    if (lightboxIndex < 0 || photos.length < 2) return;
    delta = delta < 0 ? -1 : 1;
    if (activeTransition) {
      queuedDelta = delta;
      return;
    }

    var frame = lightbox.querySelector(".lightbox-frame");
    var outgoing = currentImage();
    var next = normalizedIndex(lightboxIndex + delta);
    // Si todavía no estaba montada, que quede montada al cerrar: se vuelve al
    // mismo lugar de la grilla.
    while (shown <= next) showMore();

    var incoming = dragState && dragState.incoming && dragState.nextIndex === next
      ? dragState.incoming
      : createImage(next);
    Array.prototype.forEach.call(frame.querySelectorAll(".lightbox-image"), function (node) {
      if (node !== outgoing && node !== incoming) node.parentNode.removeChild(node);
    });
    if (!incoming.parentNode) frame.appendChild(incoming);
    frame.classList.add("is-moving");

    // Element.animate() keeps the two image nodes interruptible and avoids
    // layout work: only transform and opacity move.
    if (!window.Element || !Element.prototype.animate) {
      showPhoto(next);
      return;
    }

    var width = dragState ? dragState.width : Math.max(frame.getBoundingClientRect().width, 1);
    var velocity = dragState ? dragState.velocity : 0;
    var duration = 280;
    var easing = "cubic-bezier(0.32, 0.72, 0, 1)";
    var outgoingFrames;
    var incomingFrames;

    if (REDUCED) {
      duration = 160;
      easing = "cubic-bezier(0.23, 1, 0.32, 1)";
      normalizeImage(outgoing);
      normalizeImage(incoming);
      outgoingFrames = [{ opacity: 1 }, { opacity: 0 }];
      incomingFrames = [{ opacity: 0 }, { opacity: 1 }];
    } else {
      if (dragState) {
        var remainingDistance = Math.max(width - Math.min(Math.abs(dragState.dx), width), 0);
        duration = Math.max(180, Math.min(remainingDistance / Math.max(Math.abs(velocity), 1.8), 280));
      } else {
        outgoing.style.transform = "translate3d(0, 0, 0) scale(1)";
        outgoing.style.opacity = "1";
        incoming.style.transform = "translate3d(" + (delta * width) + "px, 0, 0) scale(0.985)";
        incoming.style.opacity = "0.35";
      }
      outgoingFrames = [
        { transform: outgoing.style.transform, opacity: outgoing.style.opacity },
        { transform: "translate3d(" + (-delta * width) + "px, 0, 0) scale(0.985)", opacity: 0.35 }
      ];
      incomingFrames = [
        { transform: incoming.style.transform, opacity: incoming.style.opacity },
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 }
      ];
    }

    outgoing.classList.remove("is-current");
    var outgoingAnimation = outgoing.animate(outgoingFrames, { duration: duration, easing: easing, fill: "both" });
    var incomingAnimation = incoming.animate(incomingFrames, { duration: duration, easing: easing, fill: "both" });
    var state = {
      frame: frame,
      outgoing: outgoing,
      incoming: incoming,
      nextIndex: next,
      animations: [outgoingAnimation, incomingAnimation],
      cancelled: false,
      commits: true
    };
    activeTransition = state;
    Promise.all([
      outgoingAnimation.finished.catch(function () {}),
      incomingAnimation.finished.catch(function () {})
    ]).then(function () { finishTransition(state); });
  }

  function step(delta) {
    animateNavigation(delta);
  }

  function onKey(e) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Tab") trapFocus(e);
  }

  function focusables() {
    return Array.prototype.filter.call(lightbox.querySelectorAll("button"), function (node) { return !node.hidden; });
  }

  function trapFocus(e) {
    var list = focusables();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openLightbox(index) {
    lastFocused = document.activeElement;
    if (!lightbox) lightbox = buildLightbox();
    lightbox.hidden = false;
    document.documentElement.classList.add("has-lightbox");
    document.addEventListener("keydown", onKey);
    showPhoto(index);
    lightbox.querySelector(".lightbox-close").focus();

    // En Android el botón "atrás" tiene que cerrar la foto, no sacarte de la
    // página. La entrada del historial es propia: no ensucia la URL.
    if (!history.state || !history.state.randomFoto) history.pushState({ randomFoto: true }, "");
  }

  function resetMotion() {
    queuedDelta = null;
    suppressFrameClick = false;
    var frame = lightbox && lightbox.querySelector(".lightbox-frame");
    var keep = currentImage();

    if (pointerState) {
      var pointer = pointerState;
      pointerState = null;
      releasePointer(pointer);
      if (pointer.incoming && pointer.incoming.parentNode) {
        pointer.incoming.parentNode.removeChild(pointer.incoming);
      }
      keep = pointer.current || keep;
    }

    if (activeTransition) {
      activeTransition.cancelled = true;
      activeTransition.animations.forEach(function (animation) { animation.cancel(); });
      if (activeTransition.incoming.parentNode) activeTransition.incoming.parentNode.removeChild(activeTransition.incoming);
      keep = activeTransition.outgoing || keep;
      activeTransition = null;
    }

    if (!frame) return;
    if (!keep && lightboxIndex >= 0) {
      keep = createImage(lightboxIndex);
      frame.appendChild(keep);
    }
    Array.prototype.forEach.call(frame.querySelectorAll(".lightbox-image"), function (node) {
      if (node !== keep) node.parentNode.removeChild(node);
    });
    if (keep) {
      normalizeImage(keep);
      keep.classList.add("is-current");
    }
    frame.classList.remove("is-moving");
  }

  function hideLightbox() {
    if (!lightbox || lightbox.hidden) return false;
    resetMotion();
    lightbox.hidden = true;
    lightboxIndex = -1;
    document.documentElement.classList.remove("has-lightbox");
    document.removeEventListener("keydown", onKey);
    // Al cerrar se vuelve a la miniatura desde la que se abrió: quien navega
    // con teclado no queda tirado arriba de todo.
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
    lastFocused = null;
    return true;
  }

  function closeLightbox() {
    if (!hideLightbox()) return;
    if (history.state && history.state.randomFoto) history.back();
  }

  window.addEventListener("popstate", function () { hideLightbox(); });

  // El manifiesto viene agrupado por edición porque así se guardan los
  // archivos, pero la galería lo aplana: una sola lista, de la noche más nueva
  // a la más vieja, y adentro de cada noche en el orden en que se sacaron.
  function flatten() {
    var lista = [];
    data.editions.forEach(function (edition) {
      edition.photos.forEach(function (photo) {
        lista.push({
          id: photo.id, w: photo.w, h: photo.h, color: photo.color,
          dir: edition.dir || String(edition.edition),
          edition: edition.edition, name: edition.name,
          date: edition.date, credit: edition.credit
        });
      });
    });
    return lista;
  }

  function credits() {
    var vistos = [];
    photos.forEach(function (photo) {
      if (photo.credit && vistos.indexOf(photo.credit) === -1) vistos.push(photo.credit);
    });
    return vistos;
  }

  function build() {
    loadStyles();

    var body = section.querySelector("[data-gallery-body]");

    var note = document.createElement("p");
    note.className = "gallery-note";
    var invitacion = document.createElement("span");
    invitacion.className = "gallery-invite";
    invitacion.textContent = "Buscate. Descargá. Compartí :)";
    note.appendChild(invitacion);
    var quienes = credits();
    if (quienes.length) {
      var firma = document.createElement("span");
      firma.className = "gallery-credit";
      firma.textContent = "FOTOS: " + quienes.join(" · ");
      note.appendChild(firma);
    }
    body.appendChild(note);

    var list = document.createElement("ul");
    list.className = "gallery-grid";
    list.setAttribute("data-gallery-grid", "");
    body.appendChild(list);

    var sentinel = document.createElement("div");
    sentinel.className = "gallery-sentinel";
    sentinel.setAttribute("data-gallery-sentinel", "");
    sentinel.setAttribute("aria-hidden", "true");
    body.appendChild(sentinel);

    section.hidden = false;
    showMore();

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) showMore();
      }, { rootMargin: "400px" }).observe(sentinel);
    } else {
      // Sin IntersectionObserver no hay tandas: se muestran todas de una.
      while (shown < photos.length) showMore();
    }
  }

  function load() {
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (manifest) {
        if (!manifest || !manifest.editions || !manifest.editions.length) return;
        data = manifest;
        data.base = data.base || "/assets/fotos/";
        data.editions = data.editions.filter(function (edition) { return edition.photos && edition.photos.length; });
        photos = flatten();
        if (!photos.length) return;
        build();
      })
      .catch(function () { /* Sin fotos la sección simplemente no aparece. */ });
  }

  // Nada de esto arranca hasta que la sección está cerca: quien no baja hasta
  // las fotos no paga ni un byte por ellas. El aviso lo da la línea invisible
  // que está justo antes, porque la sección arranca escondida y algo escondido
  // nunca llega a aparecer en pantalla.
  var anchor = document.querySelector("[data-gallery-anchor]") || section;
  if (window.IntersectionObserver) {
    var watcher = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      watcher.disconnect();
      load();
    }, { rootMargin: NEAR });
    watcher.observe(anchor);
  } else {
    load();
  }

  // El scroll suave del sitio pelea con el visor abierto; con "reducir
  // movimiento" el visor tampoco anima nada. Se marca acá para que el CSS lo
  // sepa sin volver a consultar la preferencia.
  if (REDUCED) document.documentElement.classList.add("gallery-reduced");
})();
