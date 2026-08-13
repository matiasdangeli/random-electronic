/*
 * Agenda automática de RANDOM.
 *
 * Cada fecha vive en el HTML como una ficha con sus datos (edición, día, sala,
 * dirección). Este script las lee y arma solo lo que cambia de una edición a
 * otra: ordena las que vienen de la más cercana a la más lejana, baja las que
 * ya pasaron al archivo, y escribe la chapa del hero, el título de la agenda,
 * los contadores y el año del pie.
 *
 * La idea es que el sitio sirva igual con una fecha, con dos o con ninguna:
 * se agrega o se borra una ficha y el resto se acomoda solo. Nada de "dos
 * viernes" ni de meses escritos a mano.
 *
 * Corre antes que carousel.js, así el carrusel solo ve las fechas que vienen.
 */

(function () {
  "use strict";

  var FIRST_YEAR = 2018; // año de inicio de RANDOM
  var ANNIVERSARY_MONTH = 3; // abril, en formato de Date() (enero = 0)
  var ANNIVERSARY_DAY = 14;
  var ENDS_HOUR = 6; // a las 06:00 del día siguiente la fecha ya pasó
  var MAX_HERO_DATES = 3; // más que esto en la chapa del hero no entra

  var DAYS = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
  var MONTHS = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
  ];
  var MONTHS_SHORT = [
    "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
    "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
  ];

  // "2026-08-21" o "2026-08-21T23:30", siempre en hora local: new Date() con
  // la fecha sola la toma como UTC y en Andorra adelantaría un día.
  function parseDate(value) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(value || "").trim());
    if (!parts) return null;
    return new Date(+parts[1], +parts[2] - 1, +parts[3], +(parts[4] || 0), +(parts[5] || 0));
  }

  function yearsSinceAnniversary(now) {
    var years = now.getFullYear() - FIRST_YEAR;
    var anniversary = new Date(now.getFullYear(), ANNIVERSARY_MONTH, ANNIVERSARY_DAY);
    if (now < anniversary) years -= 1;
    return Math.max(0, years);
  }

  function unique(list) {
    var seen = [];
    list.forEach(function (item) {
      if (item && seen.indexOf(item) === -1) seen.push(item);
    });
    return seen;
  }

  function text(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  // Escribe el texto y, si queda vacío, esconde el elemento: sirve para las
  // líneas que solo tienen sentido cuando hay fechas cargadas.
  function fill(selector, value) {
    var node = document.querySelector(selector);
    if (!node) return;
    node.textContent = value;
    if (value) node.removeAttribute("hidden");
    else node.setAttribute("hidden", "");
  }

  function toggle(selector, shown) {
    var node = document.querySelector(selector);
    if (!node) return;
    if (shown) node.removeAttribute("hidden");
    else node.setAttribute("hidden", "");
  }

  function read(el) {
    var date = parseDate(el.getAttribute("data-date"));
    var until = parseDate(el.getAttribute("data-until"));

    // Son fiestas de madrugada: la fecha del flyer es la noche que arranca, así
    // que sigue siendo "próxima" hasta que amanece el día siguiente.
    if (!until && date) {
      until = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, ENDS_HOUR);
    }

    return {
      el: el,
      date: date,
      until: until,
      edition: parseInt(el.getAttribute("data-edition"), 10) || 0,
      venue: (el.getAttribute("data-venue") || "").trim(),
      name: (el.getAttribute("data-name") || "").trim(),
    };
  }

  function eventTitle(date) {
    return DAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()];
  }

  function shortDate(date) {
    return date.getDate() + " " + MONTHS_SHORT[date.getMonth()] + " " + date.getFullYear();
  }

  // Ficha chica para el archivo: el flyer, el número de edición y la fecha.
  // Nada más: si tuviera line-up y botones volvería a competir con la agenda.
  function archiveCard(ev) {
    var item = document.createElement("li");
    item.className = "archive-item";

    var flyer = ev.el.querySelector(".flyer3d-face--front img");
    if (flyer) {
      var img = document.createElement("img");
      img.setAttribute("src", flyer.getAttribute("src"));
      img.setAttribute("alt", flyer.getAttribute("alt") || "");
      img.setAttribute("loading", "lazy");
      item.appendChild(img);
    }

    var label = document.createElement("p");
    label.className = "archive-label";
    label.textContent = [
      ev.edition ? "#" + ev.edition : "",
      ev.name,
    ].filter(Boolean).join(" · ");
    item.appendChild(label);

    item.addEventListener("click", function () {
      var selected = item.classList.contains("is-selected");
      Array.prototype.forEach.call(item.parentNode.children, function (other) {
        other.classList.remove("is-selected");
      });
      if (!selected) item.classList.add("is-selected");
    });

    return item;
  }

  // "AGOSTO 2026", "AGOSTO – SEPTIEMBRE 2026" o "DICIEMBRE 2026 – ENERO 2027".
  function monthRange(list) {
    var first = list[0].date;
    var last = list[list.length - 1].date;

    if (first.getFullYear() !== last.getFullYear()) {
      return MONTHS[first.getMonth()] + " " + first.getFullYear() +
        " – " + MONTHS[last.getMonth()] + " " + last.getFullYear();
    }
    if (first.getMonth() !== last.getMonth()) {
      return MONTHS[first.getMonth()] + " – " + MONTHS[last.getMonth()] + " " + first.getFullYear();
    }
    return MONTHS[first.getMonth()] + " " + first.getFullYear();
  }

  // Chapa del hero: "21 AGO · LEVEL", "21 + 28 AGO · LEVEL", "28 AGO + 4 SEP".
  function heroDates(list) {
    if (!list.length) return "";

    var shown = list.slice(0, MAX_HERO_DATES);
    var sameMonth = shown.every(function (ev) {
      return ev.date.getMonth() === shown[0].date.getMonth() &&
        ev.date.getFullYear() === shown[0].date.getFullYear();
    });

    var label = shown.map(function (ev) {
      return ev.date.getDate() + (sameMonth ? "" : " " + MONTHS_SHORT[ev.date.getMonth()]);
    }).join(" + ");

    if (sameMonth) label += " " + MONTHS_SHORT[shown[0].date.getMonth()];
    if (list.length > shown.length) label += " +" + (list.length - shown.length);

    // La sala solo se nombra si todas las fechas que vienen son en la misma.
    var venues = unique(list.map(function (ev) { return ev.venue; }));
    if (venues.length === 1) label += " · " + venues[0];

    return label;
  }

  function run() {
    var all = Array.prototype.map.call(document.querySelectorAll("[data-event]"), read);
    var now = new Date();

    var upcoming = all.filter(function (ev) {
      return ev.date && ev.until > now;
    }).sort(function (a, b) {
      return a.date - b.date;
    });

    // Las que ya pasaron bajan al archivo, chicas, y salen del carrusel; las
    // que vienen se reordenan por cercanía. Todo antes de que el carrusel las
    // levante, así solo se queda con las fechas por delante.
    var past = all.filter(function (ev) {
      return upcoming.indexOf(ev) === -1;
    }).sort(function (a, b) {
      return (b.date || 0) - (a.date || 0); // la más reciente primero
    });

    var grid = document.querySelector("[data-archive-grid]");
    past.forEach(function (ev) {
      if (grid) grid.appendChild(archiveCard(ev));
      if (ev.el.parentNode) ev.el.parentNode.removeChild(ev.el);
    });
    toggle("[data-archive]", past.length > 0);

    upcoming.forEach(function (ev) {
      if (ev.el.parentNode) ev.el.parentNode.appendChild(ev.el);
    });

    upcoming.forEach(function (ev, index) {
      var label = ev.el.querySelector("[data-event-label]");
      var title = ev.el.querySelector("[data-event-title]");
      if (label && ev.edition) {
        label.textContent = (index === 0 ? "PRÓXIMA FECHA · " : "") + "RANDOM #" + ev.edition;
      }
      if (title) title.textContent = eventTitle(ev.date);
    });

    fill("[data-next-dates]", heroDates(upcoming));
    text("[data-agenda-label]", upcoming.length ? "AGENDA / " + monthRange(upcoming) : "AGENDA");
    toggle("[data-carousel]", upcoming.length > 0);
    toggle("[data-agenda-empty]", upcoming.length === 0);

    // El contador representa la última edición que ya terminó. Las fechas
    // futuras no cuentan aunque ya estén cargadas en el HTML.
    var editions = document.querySelector("[data-stat-editions]");
    var completed = all.filter(function (ev) {
      return ev.date && ev.until && ev.until <= now;
    }).sort(function (a, b) {
      return (b.until - a.until) || (b.edition - a.edition);
    });
    if (editions) {
      editions.textContent = completed.length ? String(completed[0].edition) : "0";
    }

    // RANDOM cumple años cada 14 de abril, no el 1 de enero.
    text("[data-stat-years]", String(yearsSinceAnniversary(now)));
    text("[data-year]", String(now.getFullYear()));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
