/* Agenda automática de RANDOM: orden, archivo, countdown, LIVE y calendario. */
(function () {
  "use strict";

  var FIRST_YEAR = 2018;
  var ANNIVERSARY_MONTH = 3;
  var ANNIVERSARY_DAY = 14;
  var ENDS_HOUR = 6;
  var NIGHT_CUTOFF_MINUTES = 8 * 60;
  var DEFAULT_TIMEZONE = "Europe/Andorra";
  var SITE_URL = "https://randomelectronic.com/";
  var DAYS = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
  var MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  var formatterCache = {};
  var shareFileCache = new Map();

  function loadLiveStyles() {
    if (document.querySelector('link[data-random-live-styles]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "live.css?v=20260814-1";
    link.setAttribute("data-random-live-styles", "");
    document.head.appendChild(link);
  }

  function parseWall(value) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(value || "").trim());
    if (!parts) return null;
    return { year:+parts[1], month:+parts[2], day:+parts[3], hour:+(parts[4] || 0), minute:+(parts[5] || 0), second:0 };
  }

  function formatterFor(timeZone) {
    if (!formatterCache[timeZone]) {
      formatterCache[timeZone] = new Intl.DateTimeFormat("en-CA", {
        timeZone:timeZone, year:"numeric", month:"2-digit", day:"2-digit",
        hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
      });
    }
    return formatterCache[timeZone];
  }

  function validTimeZone(timeZone) {
    try { formatterFor(timeZone).format(new Date()); return true; }
    catch (error) { return false; }
  }

  function zonedParts(date, timeZone) {
    var out = {};
    formatterFor(timeZone).formatToParts(date).forEach(function (part) {
      if (part.type !== "literal") out[part.type] = +part.value;
    });
    return { year:out.year, month:out.month, day:out.day, hour:out.hour, minute:out.minute, second:out.second };
  }

  function wallToInstant(parts, timeZone) {
    if (!parts) return null;
    var wanted = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
    var instant = new Date(wanted);
    for (var i = 0; i < 4; i += 1) {
      var seen = zonedParts(instant, timeZone);
      var observed = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
      var correction = wanted - observed;
      if (!correction) break;
      instant = new Date(instant.getTime() + correction);
    }
    return instant;
  }

  function addMinutes(dateParts, minutes) {
    var date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, minutes, 0));
    return { year:date.getUTCFullYear(), month:date.getUTCMonth()+1, day:date.getUTCDate(), hour:date.getUTCHours(), minute:date.getUTCMinutes(), second:0 };
  }

  function parseTimeRange(value) {
    var match = /(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/.exec(String(value || ""));
    if (!match) return null;
    var start = (+match[1] * 60) + +match[2];
    var end = (+match[3] * 60) + +match[4];
    if (start < 0 || start >= 1440 || end < 0 || end >= 1440) return null;
    return { start:start, end:end };
  }

  /*
   * En RANDOM la fecha del flyer nombra la noche social, no siempre el día civil.
   * Ejemplo: “SÁBADO 4 · 00:00” significa la noche del sábado, o sea domingo 5
   * a las 00:00 técnicamente. Si el primer horario explícito está entre 00:00 y
   * 07:59, desplazamos el reloj al día siguiente. Horarios de día/tarde/noche
   * como 10:00, 16:00 o 23:00 siguen perteneciendo al día escrito en el flyer.
   */
  function nightOffsetForRange(range) {
    return range && range.start < NIGHT_CUTOFF_MINUTES ? 1440 : 0;
  }

  function guessTimeZone(el) {
    var explicit = (el.getAttribute("data-timezone") || "").trim();
    if (explicit && validTimeZone(explicit)) return explicit;
    var place = el.querySelector(".event-place");
    if (place && /argentina/i.test(place.textContent || "")) return "America/Argentina/Buenos_Aires";
    return DEFAULT_TIMEZONE;
  }

  function rangeInstants(dateParts, range, timeZone, baseOffset) {
    if (!dateParts || !range) return null;
    var startMinutes = range.start + (baseOffset || 0);
    var endMinutes = range.end + (baseOffset || 0);
    while (endMinutes <= startMinutes) endMinutes += 1440;
    return {
      start:wallToInstant(addMinutes(dateParts, startMinutes), timeZone),
      end:wallToInstant(addMinutes(dateParts, endMinutes), timeZone)
    };
  }

  function firstSetRange(el) {
    var first = el.querySelector(".schedule:not(.schedule--lineup) .schedule-row span");
    return first ? parseTimeRange(first.textContent) : null;
  }

  function readSetTimes(el, dateParts, timeZone, baseOffset) {
    if (!dateParts) return [];
    var rows = Array.prototype.slice.call(el.querySelectorAll(".schedule:not(.schedule--lineup) .schedule-row"));
    var sets = [], dayOffset = baseOffset || 0, previousStart = -1;
    rows.forEach(function (row) {
      var time = row.querySelector("span");
      var artist = row.querySelector("strong");
      var range = time && parseTimeRange(time.textContent);
      if (!range || !artist) return;

      var startMinutes = range.start + dayOffset;
      while (previousStart >= 0 && startMinutes < previousStart) {
        dayOffset += 1440;
        startMinutes = range.start + dayOffset;
      }
      var endMinutes = range.end + dayOffset;
      while (endMinutes <= startMinutes) endMinutes += 1440;

      sets.push({
        row:row,
        artist:(artist.textContent || "").trim(),
        start:wallToInstant(addMinutes(dateParts, startMinutes), timeZone),
        end:wallToInstant(addMinutes(dateParts, endMinutes), timeZone)
      });
      previousStart = startMinutes;
    });
    return sets;
  }

  function yearsSinceAnniversary(now) {
    var years = now.getFullYear() - FIRST_YEAR;
    var anniversary = new Date(now.getFullYear(), ANNIVERSARY_MONTH, ANNIVERSARY_DAY);
    if (now < anniversary) years -= 1;
    return Math.max(0, years);
  }

  function text(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function toggle(selector, shown) {
    var node = document.querySelector(selector);
    if (!node) return;
    if (shown) node.removeAttribute("hidden"); else node.setAttribute("hidden", "");
  }

  function read(el) {
    var dateParts = parseWall(el.getAttribute("data-date"));
    var timeZone = guessTimeZone(el);
    var card = el.querySelector("[data-card]");
    var panel = el.querySelector("[data-panel]");
    var meta = panel && panel.querySelector(".event-meta");
    var metaRange = meta && parseTimeRange(meta.textContent);
    var setRange = firstSetRange(el);
    var baseOffset = nightOffsetForRange(setRange || metaRange);
    var sets = readSetTimes(el, dateParts, timeZone, baseOffset);
    var metaWindow = rangeInstants(dateParts, metaRange, timeZone, nightOffsetForRange(metaRange));
    var dataStart = parseWall(el.getAttribute("data-start"));
    var dataUntil = parseWall(el.getAttribute("data-until"));

    /* data-start/data-until son fechas civiles explícitas y nunca se desplazan. */
    var startAt = sets.length ? sets[0].start :
      (dataStart ? wallToInstant(dataStart, timeZone) :
        (metaWindow ? metaWindow.start : null));

    var until = dataUntil ? wallToInstant(dataUntil, timeZone) : null;
    if (!until && sets.length) until = sets[sets.length - 1].end;
    if (!until && metaWindow) until = metaWindow.end;
    /* Solo fallback de archivo para fichas antiguas sin horario explícito. */
    if (!until && dateParts) until = wallToInstant(addMinutes(dateParts, 1440 + ENDS_HOUR * 60), timeZone);

    var calendarStart = null, calendarEnd = null;
    if (sets.length) { calendarStart = sets[0].start; calendarEnd = sets[sets.length - 1].end; }
    else if (metaWindow) { calendarStart = metaWindow.start; calendarEnd = metaWindow.end; }
    else if (dataStart && dataUntil) { calendarStart = wallToInstant(dataStart, timeZone); calendarEnd = wallToInstant(dataUntil, timeZone); }

    return {
      el:el, card:card, panel:panel, dateParts:dateParts, startAt:startAt, until:until,
      calendarStart:calendarStart, calendarEnd:calendarEnd, sets:sets, timeZone:timeZone,
      edition:parseInt(el.getAttribute("data-edition"), 10) || 0,
      venue:(el.getAttribute("data-venue") || "").trim(), name:(el.getAttribute("data-name") || "").trim()
    };
  }

  function eventTitle(parts) {
    var date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
    return DAYS[date.getUTCDay()] + " " + parts.day + " " + MONTHS[parts.month - 1];
  }

  function archiveDateValue(ev) {
    if (!ev.dateParts) return 0;
    return Date.UTC(ev.dateParts.year, ev.dateParts.month - 1, ev.dateParts.day);
  }

  function archiveCard(ev) {
    var item = document.createElement("li");
    item.className = "archive-item";
    var button = document.createElement("button");
    button.type = "button";
    button.className = "archive-link";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Destacar RANDOM #" + ev.edition + (ev.name ? " · " + ev.name : ""));
    var flyer = ev.el.querySelector(".flyer3d-face--front img");
    if (flyer) {
      var img = document.createElement("img");
      img.src = flyer.getAttribute("src"); img.alt = flyer.getAttribute("alt") || ""; img.loading = "lazy";
      button.appendChild(img);
    }
    var label = document.createElement("span");
    label.className = "archive-label";
    label.textContent = (ev.edition ? "#" + ev.edition : "") + (ev.name ? " · " + ev.name : "");
    button.appendChild(label);
    button.addEventListener("click", function () {
      var selected = item.classList.contains("is-selected");
      Array.prototype.forEach.call(item.parentNode.children, function (other) {
        other.classList.remove("is-selected");
        other.classList.remove("is-dimmed");
        var otherButton = other.querySelector(".archive-link[aria-pressed]");
        if (otherButton) otherButton.setAttribute("aria-pressed", "false");
      });
      if (!selected) {
        item.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
        Array.prototype.forEach.call(item.parentNode.children, function (other) {
          if (other !== item && !other.classList.contains("archive-item--more")) other.classList.add("is-dimmed");
        });
      }
    });
    item.appendChild(button);
    return item;
  }

  function archiveMoreCard() {
    var item = document.createElement("li");
    item.className = "archive-item archive-item--more";
    item.innerHTML = '<a class="archive-more" href="#contacto" aria-label="Ir a contacto y seguir la historia de RANDOM"><strong>SEGUÍ LA HISTORIA</strong><span aria-hidden="true">↓</span></a>';
    return item;
  }

  function monthRange(list) {
    var first = list[0].dateParts, last = list[list.length - 1].dateParts;
    if (first.year !== last.year) return MONTHS[first.month-1] + " " + first.year + " – " + MONTHS[last.month-1] + " " + last.year;
    if (first.month !== last.month) return MONTHS[first.month-1] + " – " + MONTHS[last.month-1] + " " + first.year;
    return MONTHS[first.month-1] + " " + first.year;
  }

  function pad(number) { return String(number).padStart(2, "0"); }

  function countdownText(milliseconds) {
    var seconds = Math.max(0, Math.floor(milliseconds / 1000));
    var days = Math.floor(seconds / 86400); seconds -= days * 86400;
    var hours = Math.floor(seconds / 3600); seconds -= hours * 3600;
    var minutes = Math.floor(seconds / 60); seconds -= minutes * 60;
    return pad(days) + "D · " + pad(hours) + "H · " + pad(minutes) + "M · " + pad(seconds) + "S";
  }

  function setupHeroStatus() {
    var hero = document.querySelector(".hero-content");
    var actions = document.querySelector(".hero-actions");
    if (!hero || !actions) return null;
    var status = document.createElement("div");
    status.className = "event-status";
    status.hidden = true;
    status.innerHTML = '<p class="event-status-label" data-event-status-label></p><p class="event-countdown" data-event-countdown></p><div class="event-live" data-event-live hidden><span class="event-live-badge">● AHORA EN RANDOM</span><strong data-event-live-artist></strong></div>';
    hero.insertBefore(status, actions);
    return status;
  }

  function setHidden(node, hidden) { if (node) node.hidden = hidden; }

  function applyEditionTheme(event) {
    var theme = event && event.edition ? String(event.edition) : "";
    if (document.body.getAttribute("data-edition-theme") !== theme) {
      if (theme) document.body.setAttribute("data-edition-theme", theme);
      else document.body.removeAttribute("data-edition-theme");
    }
  }

  function contextualEventLabel(prefix, ev) {
    return prefix + " · #" + ev.edition + (ev.name ? " · " + ev.name : "");
  }

  function updateEventLabels(events, active, next) {
    events.forEach(function (ev) {
      var label = ev.panel && ev.panel.querySelector("[data-event-label]");
      if (!label || !ev.edition) return;
      if (active === ev) label.textContent = contextualEventLabel("● AHORA EN RANDOM", ev);
      else if (!active && next === ev) label.textContent = contextualEventLabel("LA PRÓXIMA", ev);
      else label.textContent = "RANDOM #" + ev.edition;
    });
  }

  function updateDynamicState(events, status, state) {
    var now = new Date();
    if (state.reloadAt && now >= state.reloadAt && !state.reloading) {
      state.reloading = true; window.location.reload(); return;
    }

    events.forEach(function (ev) { ev.sets.forEach(function (set) { set.row.classList.remove("is-live"); }); });
    var active = events.filter(function (ev) { return ev.startAt && ev.until && now >= ev.startAt && now < ev.until; }).sort(function (a,b){ return a.startAt-b.startAt; })[0] || null;
    var next = events.filter(function (ev) { return ev.startAt && ev.startAt > now; }).sort(function (a,b){ return a.startAt-b.startAt; })[0] || null;
    updateEventLabels(events, active, next);
    applyEditionTheme(active || next);
    if (!status) return;

    var label = status.querySelector("[data-event-status-label]");
    var countdown = status.querySelector("[data-event-countdown]");
    var live = status.querySelector("[data-event-live]");
    var liveArtist = status.querySelector("[data-event-live-artist]");

    if (active) {
      var currentSet = active.sets.filter(function (set) { return now >= set.start && now < set.end; })[0] || null;
      if (currentSet) currentSet.row.classList.add("is-live");
      if (label) label.textContent = "RANDOM #" + active.edition + (active.name ? " · " + active.name : "");
      if (liveArtist) liveArtist.textContent = currentSet ? currentSet.artist : (active.name || "RANDOM #" + active.edition);
      setHidden(countdown, true); setHidden(live, false); setHidden(status, false); return;
    }
    if (next) {
      if (label) label.textContent = contextualEventLabel("LA PRÓXIMA", next);
      if (countdown) countdown.textContent = countdownText(next.startAt - now);
      setHidden(countdown, false); setHidden(live, true); setHidden(status, false); return;
    }
    setHidden(status, true);
  }

  function icsEscape(value) {
    return String(value || "").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  }

  function icsUTC(date) {
    return date.getUTCFullYear() + pad(date.getUTCMonth()+1) + pad(date.getUTCDate()) + "T" + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + "Z";
  }

  function calendarFilename(ev) {
    var name = (ev.name || "event").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return "random-" + ev.edition + (name ? "-" + name : "") + ".ics";
  }

  function calendarDetails(ev) {
    var place = ev.panel && ev.panel.querySelector(".event-place");
    return {
      location:place ? place.textContent.trim() : "",
      description:ev.sets.length ? "Set times: " + ev.sets.map(function (set) { return set.artist; }).join(" · ") : "RANDOM Electronic Experience",
      summary:"RANDOM #" + ev.edition + (ev.name ? " · " + ev.name : "")
    };
  }

  function downloadCalendar(ev) {
    var details = calendarDetails(ev);
    var lines = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//RANDOM//Electronic Experience//ES","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",
      "UID:random-" + ev.edition + "-" + ev.dateParts.year + pad(ev.dateParts.month) + pad(ev.dateParts.day) + "@randomelectronic.com",
      "DTSTAMP:" + icsUTC(new Date()),"DTSTART:" + icsUTC(ev.calendarStart),"DTEND:" + icsUTC(ev.calendarEnd),
      "SUMMARY:" + icsEscape(details.summary),"LOCATION:" + icsEscape(details.location),"DESCRIPTION:" + icsEscape(details.description),"URL:" + SITE_URL,
      "END:VEVENT","END:VCALENDAR",""
    ];
    var blob = new Blob([lines.join("\r\n")], { type:"text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a"); link.href = url; link.download = calendarFilename(ev);
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function googleCalendarUrl(ev) {
    var details = calendarDetails(ev);
    var params = new URLSearchParams();
    params.set("action", "TEMPLATE");
    params.set("text", details.summary);
    params.set("dates", icsUTC(ev.calendarStart) + "/" + icsUTC(ev.calendarEnd));
    params.set("details", details.description + "\n\n" + SITE_URL);
    params.set("location", details.location);
    params.set("ctz", ev.timeZone);
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  function isiOS() {
    var ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  /*
   * iPhone/iPad: el .ics abre el flujo nativo que ya funciona bien.
   * Android y escritorio: Google Calendar abre el evento listo para guardar,
   * evitando que el navegador se limite a descargar un archivo .ics.
   */
  function openCalendar(ev) {
    if (isiOS()) {
      downloadCalendar(ev);
      return;
    }
    window.open(googleCalendarUrl(ev), "_blank", "noopener,noreferrer");
  }

  function installCalendarButton(ev) {
    if (!ev.panel || !ev.calendarStart || !ev.calendarEnd) return;
    var actions = ev.panel.querySelector(".event-actions");
    if (!actions || actions.querySelector("[data-calendar-button]")) return;
    var button = document.createElement("button");
    button.type = "button"; button.className = "button button--calendar"; button.setAttribute("data-calendar-button", "");
    button.textContent = "+ AÑADIR AL CALENDARIO";
    button.addEventListener("click", function () { openCalendar(ev); });
    actions.insertBefore(button, actions.querySelector(".free-entry") || null);
  }

  function shareFace(ev) {
    var wantsBack = ev.el.getAttribute("data-flyer-face") === "back";
    var back = ev.card && ev.card.querySelector(".flyer3d-face--back img");
    return wantsBack && back ? "back" : "front";
  }

  function shareImage(ev) {
    var selector = shareFace(ev) === "back" ? ".flyer3d-face--back img" : ".flyer3d-face--front img";
    return ev.card && (ev.card.querySelector(selector) || ev.card.querySelector(".flyer3d-face--front img"));
  }

  function shareSource(image) {
    return image && (image.getAttribute("data-share-src") || image.currentSrc || image.getAttribute("src"));
  }

  function shareSlug(value) {
    return String(value || "random").toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function extensionFor(type, source) {
    if (type === "image/png") return "png";
    if (type === "image/jpeg") return "jpg";
    if (type === "image/webp") return "webp";
    var match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(source || "");
    return match ? match[1].toLowerCase() : "png";
  }

  function shareFilename(ev, face, type, source) {
    var suffix = face === "back" ? "-set-times" : "";
    return "random-" + ev.edition + "-" + shareSlug(ev.name) + suffix + "." + extensionFor(type, source);
  }

  function fileFromSource(source, ev, face) {
    var cached = shareFileCache.get(source);
    if (cached) return cached;

    var pending = fetch(source, { cache:"force-cache" }).then(function (response) {
      if (!response.ok) throw new Error("No se pudo cargar el flyer (" + response.status + ")");
      return response.blob();
    }).then(function (blob) {
      if (!/^image\//.test(blob.type || "")) throw new Error("El archivo del flyer no es una imagen");
      return new File([blob], shareFilename(ev, face, blob.type, source), { type:blob.type, lastModified:Date.now() });
    }).catch(function (error) {
      shareFileCache.delete(source);
      throw error;
    });

    shareFileCache.set(source, pending);
    return pending;
  }

  function prepareShareFile(ev) {
    var image = shareImage(ev);
    if (!image) return Promise.reject(new Error("No se encontró el flyer"));
    var face = shareFace(ev);
    var source = shareSource(image);
    var fallback = image.currentSrc || image.getAttribute("src");
    if (!source) return Promise.reject(new Error("El flyer no tiene archivo asociado"));

    return fileFromSource(source, ev, face).catch(function (error) {
      if (!fallback || fallback === source) throw error;
      return fileFromSource(fallback, ev, face);
    });
  }

  function shareTitle(ev) {
    return "RANDOM #" + ev.edition + (ev.name ? " · " + ev.name : "");
  }

  function setShareStatus(button, message) {
    var status = button.parentNode && button.parentNode.querySelector("[data-share-status]");
    if (status) status.textContent = message || "";
  }

  function resetShareButton(button) {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = 'COMPARTIR <span aria-hidden="true">↗</span>';
  }

  function readyShareButton(button) {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = 'COMPARTIR AHORA <span aria-hidden="true">↗</span>';
  }

  function downloadShareFile(file, button) {
    var url = URL.createObjectURL(file);
    var link = document.createElement("a");
    link.href = url; link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    setShareStatus(button, "Flyer descargado. Ya podés abrirlo en Instagram.");
  }

  function canShareFile(file) {
    if (typeof navigator.share !== "function") return false;
    if (typeof navigator.canShare !== "function") return true;
    try { return navigator.canShare({ files:[file] }); }
    catch (error) { return false; }
  }

  function sharePreparedFile(ev, file, button) {
    if (!canShareFile(file)) {
      downloadShareFile(file, button);
      resetShareButton(button);
      return Promise.resolve();
    }

    if (navigator.userActivation && !navigator.userActivation.isActive) {
      readyShareButton(button);
      setShareStatus(button, "Flyer listo. Tocá Compartir ahora para abrir las opciones.");
      return Promise.resolve();
    }

    return navigator.share({ title:shareTitle(ev), files:[file] }).then(function () {
      resetShareButton(button);
      setShareStatus(button, "Flyer compartido.");
    }).catch(function (error) {
      if (error && error.name === "AbortError") {
        resetShareButton(button);
        return;
      }
      if (error && error.name === "NotAllowedError") {
        readyShareButton(button);
        setShareStatus(button, "Flyer listo. Tocá Compartir ahora para abrir las opciones.");
        return;
      }
      downloadShareFile(file, button);
      resetShareButton(button);
    });
  }

  function updateShareLabel(ev) {
    if (!ev.panel) return;
    var button = ev.panel.querySelector("[data-share-button]");
    if (!button) return;
    var content = shareFace(ev) === "back" ? "el line-up" : "el flyer";
    button.setAttribute("aria-label", "Compartir " + content + " de " + shareTitle(ev));
  }

  function installShareButton(ev) {
    if (!ev.panel || !shareImage(ev)) return;
    var actions = ev.panel.querySelector(".event-actions");
    if (!actions || actions.querySelector("[data-share-button]")) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "button button--share";
    button.setAttribute("data-share-button", "");
    resetShareButton(button);

    var status = document.createElement("span");
    status.className = "sr-only";
    status.setAttribute("data-share-status", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    button.addEventListener("click", function () {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "PREPARANDO…";
      setShareStatus(button, "Preparando el flyer en alta calidad.");
      prepareShareFile(ev).then(function (file) {
        return sharePreparedFile(ev, file, button);
      }).catch(function () {
        resetShareButton(button);
        setShareStatus(button, "No se pudo preparar el flyer. Probá de nuevo.");
      });
    });

    actions.insertBefore(button, actions.querySelector(".free-entry") || null);
    actions.appendChild(status);
    updateShareLabel(ev);
  }

  function setupShareState(events) {
    if (!events.length) return;

    function eventFromElement(element) {
      return events.filter(function (ev) { return ev.el === element; })[0] || null;
    }

    document.addEventListener("random:event-active", function (event) {
      var next = event.detail && eventFromElement(event.detail.event);
      if (!next) return;
      updateShareLabel(next);
    });

    document.addEventListener("random:flyer-face-change", function (event) {
      var changed = event.detail && eventFromElement(event.detail.event);
      if (!changed) return;
      updateShareLabel(changed);
    });
  }

  function run() {
    loadLiveStyles();
    var all = Array.prototype.map.call(document.querySelectorAll("[data-event]"), read);
    var now = new Date();
    var upcoming = all.filter(function (ev) { return ev.dateParts && ev.until && ev.until > now; }).sort(function (a,b){ return (a.startAt||a.until)-(b.startAt||b.until); });
    var past = all.filter(function (ev) { return upcoming.indexOf(ev) === -1; }).sort(function (a,b){
      return (archiveDateValue(b) - archiveDateValue(a)) || (b.edition - a.edition);
    });

    var grid = document.querySelector("[data-archive-grid]");
    past.forEach(function (ev) { if (ev.dateParts && grid) grid.appendChild(archiveCard(ev)); if (ev.el.parentNode) ev.el.parentNode.removeChild(ev.el); });
    if (grid && past.some(function (ev) { return !!ev.dateParts; })) grid.appendChild(archiveMoreCard());
    toggle("[data-archive]", past.some(function (ev) { return !!ev.dateParts; }));
    upcoming.forEach(function (ev) { if (ev.el.parentNode) ev.el.parentNode.appendChild(ev.el); });
    upcoming.forEach(function (ev,index) {
      var label = ev.panel && ev.panel.querySelector("[data-event-label]");
      var title = ev.panel && ev.panel.querySelector("[data-event-title]");
      if (label && ev.edition) label.textContent = index === 0 ? contextualEventLabel("LA PRÓXIMA", ev) : "RANDOM #" + ev.edition;
      if (title && ev.dateParts) title.textContent = eventTitle(ev.dateParts);
      installCalendarButton(ev);
      installShareButton(ev);
    });
    setupShareState(upcoming);

    text("[data-agenda-label]", upcoming.length ? "AGENDA / " + monthRange(upcoming) : "AGENDA");
    toggle("[data-carousel]", upcoming.length > 0);
    toggle("[data-agenda-empty]", upcoming.length === 0);

    var editions = document.querySelector("[data-stat-editions]");
    var completed = all.filter(function (ev) { return ev.dateParts && ev.until && ev.until <= now; }).sort(function (a,b){ return (b.until-a.until)||(b.edition-a.edition); });
    if (editions) editions.textContent = completed.length ? String(completed[0].edition) : "0";
    text("[data-stat-years]", String(yearsSinceAnniversary(now)));
    text("[data-year]", String(now.getFullYear()));

    var status = setupHeroStatus();
    var state = { reloadAt:upcoming.length ? upcoming[0].until : null, reloading:false };
    updateDynamicState(upcoming, status, state);
    window.setInterval(function () { updateDynamicState(upcoming, status, state); }, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
