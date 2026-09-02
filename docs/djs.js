/* El Instagram de cada DJ: suma su logo al final de la fila del line-up.

   La lista de abajo es lo único que se toca. El resto del sitio no cambia:
   los set times se siguen escribiendo igual en docs/index.html y las páginas
   de cada edición se siguen generando igual. Un DJ que no esté cargado acá
   queda como texto suelto, sin botón — nunca se inventa una cuenta.

   Los B2B se parten solos: "IVU SARACHU B2B FABRITZIO" busca las dos cuentas
   por separado y pone un logo por cada una, uno abajo del otro y en el mismo
   orden en que están escritos los nombres. */
(function () {
  "use strict";

  /* Nombre tal cual figura en el line-up → usuario de Instagram, sin arroba.
     Los acentos y los apóstrofes no importan para la búsqueda, así que
     "MATÍAS D’ANGELI" y "MATIAS D'ANGELI" encuentran la misma cuenta. */
  var CUENTAS = {
    "ASTOR LEVINSTEIN": "astorlevinstein",
    "AYRTON GALFRÉ": "ayrtongalfre",
    "CHAKI PEPA": "chakipepa",
    "DYLOM": "dylan.pebacini",
    "FABRITZIO": "fabritziodj",
    "FRANK MORAIS": "frankmoraismusic",
    "GASTOFF": "gaston.gastoff",
    "IVU SARACHU": "ivusarachu",
    "KNART": "knart.fd",
    "LUCKEN": "lucken_dj",
    "LUCAS ILLARRA": "lucas.illarra",
    "MRNO": "marianopontnau",
    "NICO RETAMAL": "ffuegoo_music",
    "SOFIA ROSSI": "pepitaroxx"
  };

  var GLYPH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/>' +
    '<circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none"/></svg>';

  function clave(nombre) {
    return String(nombre || "")
      .replace(/[’´`]/g, "'")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  var INDICE = {};
  Object.keys(CUENTAS).forEach(function (nombre) {
    INDICE[clave(nombre)] = CUENTAS[nombre];
  });

  function boton(nombre, usuario) {
    var enlace = document.createElement("a");
    enlace.className = "dj-follow";
    enlace.href = "https://www.instagram.com/" + usuario + "/";
    enlace.target = "_blank";
    enlace.rel = "noreferrer";
    /* El logo solo no dice a quién sigue: el nombre va igual para quien navega
       con lector de pantalla, y como globito al pasar el mouse. */
    enlace.setAttribute("aria-label", "Seguir a " + nombre + " en Instagram");
    enlace.title = nombre;
    enlace.innerHTML = GLYPH;
    return enlace;
  }

  function decorar(fila, nombre) {
    var partes = String(nombre.textContent || "").split(/\s+B2B\s+/i);
    var djs = partes
      .map(function (parte) { return parte.trim(); })
      .filter(function (parte) { return INDICE[clave(parte)]; });
    if (!djs.length) return false;

    var caja = document.createElement("div");
    caja.className = "dj-follows";
    djs.forEach(function (dj) {
      caja.appendChild(boton(dj, INDICE[clave(dj)]));
    });
    fila.appendChild(caja);
    return true;
  }

  function run() {
    /* Las dos formas que tiene un line-up en el sitio: las filas del panel de
       la home y la lista de la página de cada fecha. */
    var listas = document.querySelectorAll(".schedule, .edition-schedule ol");
    Array.prototype.forEach.call(listas, function (lista) {
      var puestos = 0;
      Array.prototype.forEach.call(lista.children, function (fila) {
        var nombre = fila.querySelector("strong");
        if (nombre && decorar(fila, nombre)) puestos += 1;
      });
      /* La marca es de la lista entera, no de la fila: con un solo botón
         puesto, toda la fecha pasa al mismo alto y a la misma grilla. */
      if (puestos) lista.classList.add("has-follow");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
