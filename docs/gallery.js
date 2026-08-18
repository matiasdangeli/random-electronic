/*
 * Galería de fotos de RANDOM.
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

  var MANIFEST_URL = "fotos.json?v=20260818-1";
  var STYLES_URL = "gallery.css?v=20260818-1";
  var BATCH = 18; // miniaturas por tanda: alcanza para llenar la pantalla más grande
  var NEAR = "800px"; // cuánto antes de llegar a la sección se empieza a preparar todo

  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var section = document.querySelector("[data-gallery]");
  if (!section || !window.fetch) return;

  var data = null;
  var current = null; // edición que se está mirando
  var shown = 0; // miniaturas ya montadas de esa edición
  var lightbox = null;
  var lightboxIndex = -1;
  var lastFocused = null; // a qué miniatura volver cuando se cierra el visor

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

  function photoUrl(edition, photo, size) {
    return data.base + edition.edition + "/" + photo.id + (size ? "-" + size : "") + ".webp";
  }

  function editionLabel(edition) {
    return "#" + edition.edition + (edition.name ? " · " + edition.name : "");
  }

  function totalPhotos() {
    return data.editions.reduce(function (sum, edition) { return sum + edition.photos.length; }, 0);
  }

  /* --- Miniaturas ---------------------------------------------------------
     Cuadradas y recortadas: sin medir nada, el navegador ya sabe qué lugar
     ocupa cada una antes de bajarla, así la grilla no salta. El color de
     fondo es el color promedio de la foto, así el hueco no es un rectángulo
     gris mientras carga. */
  function thumb(edition, photo, index) {
    var item = document.createElement("li");
    item.className = "gallery-item";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "gallery-shot";
    button.setAttribute("aria-label", "Abrir foto " + (index + 1) + " de RANDOM " + editionLabel(edition));

    var img = document.createElement("img");
    img.src = photoUrl(edition, photo, "s");
    img.srcset = photoUrl(edition, photo, "s") + " 320w, " + photoUrl(edition, photo, "m") + " 640w";
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

  // El resto de las fotos se monta de a tandas al bajar. Con 200 fotos en una
  // edición, meter los 200 nodos de una traba el scroll aunque las imágenes
  // sean livianas.
  function showMore() {
    if (!current || shown >= current.photos.length) return;
    var target = grid();
    var fragment = document.createDocumentFragment();
    var limit = Math.min(shown + BATCH, current.photos.length);
    for (var i = shown; i < limit; i++) fragment.appendChild(thumb(current, current.photos[i], i));
    target.appendChild(fragment);
    shown = limit;
    section.querySelector("[data-gallery-sentinel]").hidden = shown >= current.photos.length;
  }

  function selectEdition(edition) {
    current = edition;
    shown = 0;
    grid().textContent = "";
    section.querySelector("[data-gallery-sentinel]").hidden = false;

    Array.prototype.forEach.call(section.querySelectorAll("[data-gallery-chip]"), function (chip) {
      var active = +chip.getAttribute("data-gallery-chip") === edition.edition;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var note = section.querySelector("[data-gallery-note]");
    var pieces = [edition.photos.length + (edition.photos.length === 1 ? " FOTO" : " FOTOS")];
    if (edition.venue) pieces.push(edition.venue);
    if (edition.credit) pieces.push("FOTOS: " + edition.credit);
    note.textContent = pieces.join(" · ");

    showMore();
  }

  function chips() {
    var strip = document.createElement("div");
    strip.className = "gallery-chips";
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Elegir edición");

    data.editions.forEach(function (edition) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "gallery-chip";
      chip.setAttribute("data-gallery-chip", edition.edition);
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = editionLabel(edition);
      chip.addEventListener("click", function () { selectEdition(edition); });
      strip.appendChild(chip);
    });

    return strip;
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
      '<figure class="lightbox-frame"><img alt="" decoding="async" /></figure>' +
      '<button class="lightbox-nav lightbox-nav--next" type="button" aria-label="Foto siguiente">›</button>' +
      '<p class="lightbox-meta"><span data-lightbox-title></span><span data-lightbox-count></span></p>';

    // Cuando la grande terminó de llegar, la miniatura de fondo ya no hace
    // falta: se saca para no tener dos imágenes ocupando memoria.
    var img = box.querySelector(".lightbox-frame img");
    img.addEventListener("load", function () { img.style.backgroundImage = ""; });

    box.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
    box.querySelector(".lightbox-nav--prev").addEventListener("click", function () { step(-1); });
    box.querySelector(".lightbox-nav--next").addEventListener("click", function () { step(1); });
    // Tocar el fondo cierra; tocar la foto o los botones, no.
    box.addEventListener("click", function (e) { if (e.target === box || e.target.className === "lightbox-frame") closeLightbox(); });

    // Sin esto, arrastrar la foto dispara el drag nativo y te llevás la imagen.
    box.addEventListener("dragstart", function (e) { e.preventDefault(); });

    setupSwipe(box);
    document.body.appendChild(box);
    return box;
  }

  function setupSwipe(box) {
    var start = null;
    box.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
    });
    box.addEventListener("pointerup", function (e) {
      if (!start) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      start = null;
      // Solo si el gesto fue claramente horizontal: si no, un scroll torcido
      // cambiaría de foto sin querer.
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    });
    box.addEventListener("pointercancel", function () { start = null; });
  }

  function preload(index) {
    if (!current || index < 0 || index >= current.photos.length) return;
    var image = new Image();
    image.decoding = "async";
    image.src = photoUrl(current, current.photos[index]);
  }

  function showPhoto(index) {
    var photo = current.photos[index];
    lightboxIndex = index;

    var img = lightbox.querySelector(".lightbox-frame img");

    // Las medidas van como atributos, no como estilos: así la foto ocupa su
    // lugar exacto desde antes de bajarla y el visor no salta al terminar.
    if (photo.w && photo.h) {
      img.width = photo.w;
      img.height = photo.h;
    }
    img.style.backgroundColor = photo.color || "#111";
    img.style.backgroundImage = 'url("' + photoUrl(current, photo, "m") + '")';
    img.src = photoUrl(current, photo);
    img.alt = "Foto de RANDOM " + editionLabel(current);
    if (img.complete) img.style.backgroundImage = "";

    lightbox.querySelector("[data-lightbox-title]").textContent = editionLabel(current);
    lightbox.querySelector("[data-lightbox-count]").textContent =
      String(index + 1).padStart(2, "0") + " / " + String(current.photos.length).padStart(2, "0");

    var single = current.photos.length < 2;
    lightbox.querySelector(".lightbox-nav--prev").hidden = single;
    lightbox.querySelector(".lightbox-nav--next").hidden = single;

    preload(index + 1);
    preload(index - 1);
  }

  function step(delta) {
    if (!current || lightboxIndex < 0) return;
    var next = (lightboxIndex + delta + current.photos.length) % current.photos.length;
    // Si todavía no estaba montada, que quede montada al cerrar: se vuelve al
    // mismo lugar de la grilla.
    while (shown <= next) showMore();
    showPhoto(next);
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

  function hideLightbox() {
    if (!lightbox || lightbox.hidden) return false;
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

  function build() {
    loadStyles();

    var body = section.querySelector("[data-gallery-body]");
    body.appendChild(chips());

    var note = document.createElement("p");
    note.className = "gallery-note";
    note.setAttribute("data-gallery-note", "");
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

    var count = section.querySelector("[data-gallery-count]");
    if (count) count.textContent = "GALERÍA · " + totalPhotos() + " FOTOS";

    var navLink = document.querySelector("[data-gallery-nav]");
    if (navLink) navLink.hidden = false;

    section.hidden = false;
    selectEdition(data.editions[0]);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) showMore();
      }, { rootMargin: "400px" }).observe(sentinel);
    } else {
      // Sin IntersectionObserver no hay tandas: se muestran todas de una.
      while (shown < current.photos.length) showMore();
    }
  }

  function load() {
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (manifest) {
        if (!manifest || !manifest.editions || !manifest.editions.length) return;
        data = manifest;
        data.base = data.base || "assets/fotos/";
        data.editions = data.editions.filter(function (edition) { return edition.photos && edition.photos.length; });
        if (!data.editions.length) return;
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
