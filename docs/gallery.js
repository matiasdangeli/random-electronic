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

  var MANIFEST_URL = "fotos.json?v=20260818-3";
  var STYLES_URL = "gallery.css?v=20260818-6";
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
      '<figure class="lightbox-frame"><img alt="" decoding="async" /></figure>' +
      '<button class="lightbox-nav lightbox-nav--next" type="button" aria-label="Foto siguiente">›</button>' +
      '<p class="lightbox-meta"><span data-lightbox-title></span>' +
      '<button class="lightbox-save" type="button" data-lightbox-save>GUARDAR</button></p>';

    // Cuando la grande terminó de llegar, la miniatura de fondo ya no hace
    // falta: se saca para no tener dos imágenes ocupando memoria.
    var img = box.querySelector(".lightbox-frame img");
    img.addEventListener("load", function () { img.style.backgroundImage = ""; });

    box.querySelector("[data-lightbox-save]").addEventListener("click", savePhoto);
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
    if (index < 0 || index >= photos.length) return;
    var image = new Image();
    image.decoding = "async";
    image.src = photoUrl(photos[index]);
  }

  function showPhoto(index) {
    var photo = photos[index];
    lightboxIndex = index;

    var img = lightbox.querySelector(".lightbox-frame img");

    // Las medidas van como atributos, no como estilos: así la foto ocupa su
    // lugar exacto desde antes de bajarla y el visor no salta al terminar.
    if (photo.w && photo.h) {
      img.width = photo.w;
      img.height = photo.h;
    }
    img.style.backgroundColor = photo.color || "#111";
    img.style.backgroundImage = 'url("' + photoUrl(photo, "m") + '")';
    img.src = photoUrl(photo);
    img.alt = "Foto de RANDOM " + label(photo);
    if (img.complete) img.style.backgroundImage = "";

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

  function step(delta) {
    if (lightboxIndex < 0) return;
    var next = (lightboxIndex + delta + photos.length) % photos.length;
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

    var navLink = document.querySelector("[data-gallery-nav]");
    if (navLink) navLink.hidden = false;

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
        data.base = data.base || "assets/fotos/";
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
