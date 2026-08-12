/*
 * Agenda automática de RANDOM.
 *
 * Cada fecha vive en el HTML como una ficha con sus datos (edición, día, sala,
 * dirección). Este script las lee y arma solo lo que cambia de una edición a
 * otra: saca las que ya pasaron, ordena las que vienen de la más cercana a la
 * más lejana, y escribe la chapa del hero, el título de la agenda, la
 * dirección de arriba, los contadores y el año del pie.
 *
 * La idea es que el sitio sirva igual con una fecha, con dos o con ninguna:
 * se agrega o se borra una ficha y el resto se acomoda solo. Nada de "dos
 * viernes" ni de meses escritos a mano.
 *
 * Corre antes que carousel.js, así el carrusel solo ve las fechas que vienen.
 */

(function () {
  "use strict";

  var FIRST_YEAR = 2018; // primera edición de RANDOM, para los años que lleva
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

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
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
    var place = el.querySelector(".event-place");

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
      place: place ? place.textContent.trim() : "",
    };
  }

  function eventTitle(date) {
    return DAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()];
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

    // Las que ya pasaron salen del DOM y las que quedan se reordenan por
    // cercanía, todo antes de que el carrusel las levante.
    all.forEach(function (ev) {
      if (upcoming.indexOf(ev) === -1 && ev.el.parentNode) ev.el.parentNode.removeChild(ev.el);
    });
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
    fill("[data-agenda-places]", unique(upcoming.map(function (ev) { return ev.place; })).join(" / "));
    text("[data-agenda-label]", upcoming.length ? "AGENDA / " + monthRange(upcoming) : "AGENDA");
    toggle("[data-carousel]", upcoming.length > 0);
    toggle("[data-agenda-empty]", upcoming.length === 0);

    // El fondo del hero es el flyer de la próxima fecha.
    var flyer = upcoming.length && upcoming[0].el.querySelector(".flyer3d-face--front img");
    if (flyer) {
      document.documentElement.style.setProperty("--hero-flyer", 'url("' + flyer.getAttribute("src") + '")');
    }

    // El contador de ediciones nunca baja: el HTML trae el piso y el script lo
    // sube si hay una edición más alta cargada.
    var editions = document.querySelector("[data-stat-editions]");
    var highest = all.reduce(function (top, ev) {
      return Math.max(top, ev.edition);
    }, 0);
    if (editions && highest > (parseInt(editions.textContent, 10) || 0)) {
      editions.textContent = pad2(highest);
    }

    text("[data-stat-years]", pad2(now.getFullYear() - FIRST_YEAR));
    text("[data-year]", String(now.getFullYear()));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
