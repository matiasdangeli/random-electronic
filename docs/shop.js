/*
 * Tienda de RANDOM.
 *
 * Misma idea que la galería: la sección no existe hasta que hay algo que
 * vender. Con docs/tienda.json vacío no aparece, no ocupa lugar y no se pide
 * ni el CSS. Cuando alguien se le acerca, se lee el manifiesto y se arma.
 *
 * El cobro no pasa por acá. Cada producto lleva un link de pago que el
 * proveedor —Mercado Pago, Wise, PayPal, el que sea— genera desde su panel,
 * y el comprador termina la compra en la página de ese proveedor. Es a
 * propósito: un sitio estático no tiene dónde esconder una clave, así que
 * acá no hay ninguna.
 */

(function () {
  "use strict";

  var MANIFEST_URL = "tienda.json?v=20260818-1";
  var STYLES_URL = "shop.css?v=20260818-1";
  var NEAR = "800px";

  var section = document.querySelector("[data-shop]");
  if (!section || !window.fetch) return;

  var data = null;

  function loadStyles() {
    if (document.querySelector("link[data-random-shop-styles]")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLES_URL;
    link.setAttribute("data-random-shop-styles", "");
    document.head.appendChild(link);
  }

  function agotado(product) {
    return String(product.estado || "").toLowerCase() === "agotado";
  }

  function card(product) {
    var item = document.createElement("li");
    item.className = "shop-item" + (agotado(product) ? " is-out" : "");

    if (product.imagen) {
      var figure = document.createElement("div");
      figure.className = "shop-shot";
      var img = document.createElement("img");
      img.src = (data.base || "") + product.imagen;
      img.alt = product.nombre || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 800;
      img.height = 800;
      figure.appendChild(img);
      item.appendChild(figure);
    }

    var name = document.createElement("h3");
    name.className = "shop-name";
    name.textContent = product.nombre || "";
    item.appendChild(name);

    if (product.detalle) {
      var detail = document.createElement("p");
      detail.className = "shop-detail";
      detail.textContent = product.detalle;
      item.appendChild(detail);
    }

    if (product.talles && product.talles.length) {
      var sizes = document.createElement("p");
      sizes.className = "shop-sizes";
      sizes.textContent = "TALLES · " + product.talles.join(" · ");
      item.appendChild(sizes);
    }

    var foot = document.createElement("div");
    foot.className = "shop-foot";

    var price = document.createElement("span");
    price.className = "shop-price";
    price.textContent = product.precio || "";
    foot.appendChild(price);

    if (agotado(product)) {
      var out = document.createElement("span");
      out.className = "shop-out";
      out.textContent = "AGOTADO";
      foot.appendChild(out);
    } else if (product.link) {
      // El pago se termina en la página del proveedor, que es otro sitio: se
      // abre en una pestaña nueva para no perder la fecha que estaba mirando.
      var buy = document.createElement("a");
      buy.className = "button button--light shop-buy";
      buy.href = product.link;
      buy.target = "_blank";
      buy.rel = "noreferrer";
      buy.setAttribute("aria-label", "Comprar " + (product.nombre || "") + ", se abre en otra pestaña");
      buy.innerHTML = "COMPRAR <span aria-hidden=\"true\">↗</span>";
      foot.appendChild(buy);
    }

    item.appendChild(foot);
    return item;
  }

  /* --- Transferencia -------------------------------------------------------
     Para quien prefiere mandar la plata directo. El botón copia el alias,
     porque escribirlo a mano desde el teléfono es donde se pierde la venta. */
  function copyRow(medio) {
    var row = document.createElement("li");
    row.className = "pay-row";

    var name = document.createElement("span");
    name.className = "pay-name";
    name.textContent = medio.nombre || "";

    var value = document.createElement("code");
    value.className = "pay-value";
    value.textContent = medio.detalle || "";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "pay-copy";
    button.textContent = "COPIAR";
    button.setAttribute("aria-label", "Copiar " + (medio.nombre || "") + ": " + (medio.detalle || ""));
    button.addEventListener("click", function () {
      var texto = medio.detalle || "";
      function avisar(ok) {
        button.textContent = ok ? "COPIADO" : "COPIALO A MANO";
        button.classList.toggle("is-done", ok);
        setTimeout(function () {
          button.textContent = "COPIAR";
          button.classList.remove("is-done");
        }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(function () { avisar(true); }, function () { avisar(false); });
      } else {
        avisar(false);
      }
    });

    row.appendChild(name);
    row.appendChild(value);
    row.appendChild(button);
    return row;
  }

  function payBlock(pago) {
    var box = document.createElement("div");
    box.className = "pay";

    var title = document.createElement("p");
    title.className = "eyebrow";
    title.textContent = "O POR TRANSFERENCIA";
    box.appendChild(title);

    var list = document.createElement("ul");
    list.className = "pay-list";
    (pago.medios || []).forEach(function (medio) {
      if (medio && medio.detalle) list.appendChild(copyRow(medio));
    });
    box.appendChild(list);

    if (pago.nota) {
      var note = document.createElement("p");
      note.className = "pay-note";
      note.textContent = pago.nota;
      if (pago.contacto) {
        var link = document.createElement("a");
        link.href = pago.contacto;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "ESCRIBINOS ↗";
        link.className = "pay-link";
        note.appendChild(document.createTextNode(" "));
        note.appendChild(link);
      }
      box.appendChild(note);
    }

    return box;
  }

  function build() {
    loadStyles();

    var body = section.querySelector("[data-shop-body]");

    var list = document.createElement("ul");
    list.className = "shop-grid";
    data.productos.forEach(function (product) { list.appendChild(card(product)); });
    body.appendChild(list);

    var pago = data.pago || {};
    if (pago.medios && pago.medios.length) body.appendChild(payBlock(pago));

    var navLink = document.querySelector("[data-shop-nav]");
    if (navLink) navLink.hidden = false;

    section.hidden = false;
  }

  function load() {
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (manifest) {
        if (!manifest || !manifest.productos || !manifest.productos.length) return;
        data = manifest;
        data.base = data.base || "assets/tienda/";
        build();
      })
      .catch(function () { /* Sin productos la tienda simplemente no aparece. */ });
  }

  var anchor = document.querySelector("[data-shop-anchor]") || section;
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
})();

/* FAQ: el contenido se mantiene centralizado acá para no tocar el diseño ni el
   comportamiento nativo del acordeón. */
(function () {
  "use strict";

  var FAQ = [
    {
      question: "¿Dónde y cuándo es la próxima edición?",
      answer: "Cada edición tiene su propia fecha, horario y ubicación. Encontrás toda la información actualizada en esta web y en nuestro Instagram."
    },
    {
      question: "¿Qué música suena en RANDOM?",
      answer: "Solo música electrónica, con distintos artistas y estilos en cada edición."
    },
    {
      question: "¿Tengo que reservar o simplemente puedo ir?",
      answer: "No necesitás comprar entrada. Si alguna edición requiere reserva o tiene una condición especial de acceso, lo vamos a informar previamente."
    },
    {
      question: "¿Hay dress code o algún requisito para entrar?",
      answer: "No hay dress code. Vení como quieras. Solo respetá las condiciones de acceso del lugar donde se realiza cada edición."
    }
  ];

  var list = document.querySelector(".faq-list");
  if (list) {
    list.textContent = "";
    FAQ.forEach(function (item) {
      var details = document.createElement("details");
      details.className = "faq-item";

      var summary = document.createElement("summary");
      summary.textContent = item.question;

      var answer = document.createElement("p");
      answer.textContent = item.answer;

      details.appendChild(summary);
      details.appendChild(answer);
      list.appendChild(details);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('script[type="application/ld+json"]'), function (script) {
    try {
      var data = JSON.parse(script.textContent);
      if (data["@type"] !== "FAQPage") return;
      data.mainEntity = FAQ.map(function (item) {
        return {
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer
          }
        };
      });
      script.textContent = JSON.stringify(data);
    } catch (error) {
      // Si otro bloque JSON-LD no se puede parsear, no afecta la página.
    }
  });
})();
