#!/usr/bin/env python3
"""Generate crawlable pages for active RANDOM dates and the XML sitemap.

The event cards in docs/index.html remain the editorial source of truth. This
script publishes only current or upcoming dates. Past editions stay in the
interactive archive on the homepage instead of becoming separate pages.
"""

from __future__ import annotations

import html
import json
import re
import shutil
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
INDEX = DOCS / "index.html"
EDITIONS_DIR = DOCS / "ediciones"
SITE_URL = "https://randomelectronic.com"
ORGANIZATION_ID = f"{SITE_URL}/#organization"
MONTHS = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]
DAYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"]


@dataclass
class Edition:
    number: int
    name: str
    date: str
    venue: str
    timezone: str
    start: datetime | None
    end: datetime | None
    title: str
    meta: str
    place: str
    flyer: str
    map_url: str
    entry: str
    schedule: list[tuple[str, str]]

    @property
    def slug(self) -> str:
        normalized = unicodedata.normalize("NFD", self.name.lower())
        ascii_name = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
        clean_name = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
        return f"{self.number}-{clean_name or 'random'}"

    @property
    def url(self) -> str:
        return f"{SITE_URL}/ediciones/{self.slug}/"


def attributes(source: str) -> dict[str, str]:
    return dict(re.findall(r'([\w-]+)="([^"]*)"', source))


def text_content(source: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", source)
    return " ".join(html.unescape(without_tags).split())


def first_match(pattern: str, source: str, default: str = "") -> str:
    match = re.search(pattern, source, re.DOTALL | re.IGNORECASE)
    return text_content(match.group(1)) if match else default


def parse_time_range(meta: str) -> tuple[int, int] | None:
    match = re.search(r"(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})", meta)
    if not match:
        return None
    start = int(match.group(1)) * 60 + int(match.group(2))
    end = int(match.group(3)) * 60 + int(match.group(4))
    return start, end


def wall_datetime(day: datetime, minutes: int, timezone: str) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=ZoneInfo(timezone)) + timedelta(minutes=minutes)


def event_window(attrs: dict[str, str], meta: str, place: str) -> tuple[str, datetime | None, datetime | None]:
    timezone = attrs.get("data-timezone") or (
        "America/Argentina/Buenos_Aires" if "argentina" in place.lower() else "Europe/Andorra"
    )
    day = datetime.strptime(attrs["data-date"], "%Y-%m-%d")

    if attrs.get("data-start") and attrs.get("data-until"):
        start = datetime.fromisoformat(attrs["data-start"]).replace(tzinfo=ZoneInfo(timezone))
        end = datetime.fromisoformat(attrs["data-until"]).replace(tzinfo=ZoneInfo(timezone))
        return timezone, start, end

    time_range = parse_time_range(meta)
    if not time_range:
        return timezone, None, None

    start_minutes, end_minutes = time_range
    # The flyer names the social night. A 00:00–07:59 start belongs to the
    # following civil day, matching docs/agenda.js.
    if start_minutes < 8 * 60:
        start_minutes += 24 * 60
        end_minutes += 24 * 60
    elif end_minutes <= start_minutes:
        end_minutes += 24 * 60

    return timezone, wall_datetime(day, start_minutes, timezone), wall_datetime(day, end_minutes, timezone)


def parse_editions(source: str) -> list[Edition]:
    editions: list[Edition] = []
    source = re.sub(r"<!--.*?-->", "", source, flags=re.DOTALL)
    event_pattern = re.compile(r"<article\b(?P<attrs>[^>]*)\bdata-event\b(?P<after>[^>]*)>(?P<body>.*?)</article>", re.DOTALL)

    for match in event_pattern.finditer(source):
        attrs = attributes(match.group("attrs") + match.group("after"))
        body = match.group("body")
        if not attrs.get("data-edition") or not attrs.get("data-date"):
            continue

        images = [attributes(tag).get("src", "") for tag in re.findall(r"<img\b[^>]*>", body)]
        flyer = next((src for src in images if src and "set-times" not in src), images[0] if images else "")
        meta = first_match(r'<p\s+class="event-meta"[^>]*>(.*?)</p>', body)
        place = first_match(r'<p\s+class="event-place"[^>]*>(.*?)</p>', body)
        entry = first_match(r'<span\s+class="free-entry"[^>]*>(.*?)</span>', body)
        title = first_match(r'<h3[^>]*data-event-title[^>]*>(.*?)</h3>', body)
        map_match = re.search(r'<a\b[^>]*class="[^"]*button--solid[^"]*"[^>]*href="([^"]+)"', body)
        map_url = html.unescape(map_match.group(1)) if map_match else ""
        schedule: list[tuple[str, str]] = []
        for row in re.findall(r'<div\s+class="schedule-row"[^>]*>(.*?)</div>', body, re.DOTALL):
            time = first_match(r"<span[^>]*>(.*?)</span>", row)
            artist = first_match(r"<strong[^>]*>(.*?)</strong>", row)
            if artist:
                schedule.append((time, artist))

        date_value = attrs["data-date"]
        date_object = datetime.strptime(date_value, "%Y-%m-%d")
        if not title:
            title = f"{DAYS[date_object.weekday()]} {date_object.day} {MONTHS[date_object.month - 1]}"
        timezone, start, end = event_window(attrs, meta, place)
        editions.append(
            Edition(
                number=int(attrs["data-edition"]),
                name=attrs.get("data-name", "RANDOM").strip(),
                date=date_value,
                venue=attrs.get("data-venue", "").strip(),
                timezone=timezone,
                start=start,
                end=end,
                title=title,
                meta=meta,
                place=place,
                flyer=flyer,
                map_url=map_url,
                entry=entry,
                schedule=schedule,
            )
        )

    if not editions:
        raise RuntimeError("No se encontraron ediciones en docs/index.html")
    numbers = [edition.number for edition in editions]
    if len(numbers) != len(set(numbers)):
        raise RuntimeError("Hay números de edición duplicados")
    return sorted(editions, key=lambda edition: edition.number)


def organization_schema() -> dict[str, object]:
    return {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        "name": "RANDOM",
        "url": f"{SITE_URL}/",
        "logo": f"{SITE_URL}/assets/random-symbol.png",
        "foundingDate": "2018",
        "email": "randomelectromusic@gmail.com",
        "sameAs": ["https://www.instagram.com/random.electronic/"],
    }


def event_schema(edition: Edition) -> dict[str, object]:
    performers = [
        {"@type": "PerformingGroup", "name": artist}
        for _, artist in edition.schedule
    ]
    schema: dict[str, object] = {
        "@type": "Event",
        "@id": f"{edition.url}#event",
        "name": f"RANDOM #{edition.number} · {edition.name}",
        "url": edition.url,
        "image": [f"{SITE_URL}/{edition.flyer}"],
        "description": edition_description(edition),
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": "https://schema.org/EventScheduled",
        "startDate": edition.start.isoformat() if edition.start else edition.date,
        "location": {
            "@type": "Place",
            "name": edition.venue or edition.place,
            "address": edition.place,
        },
        "organizer": {"@id": ORGANIZATION_ID},
    }
    if edition.end:
        schema["endDate"] = edition.end.isoformat()
    if performers:
        schema["performer"] = performers
    if "gratuit" in edition.entry.lower() or "libre" in edition.entry.lower():
        schema["isAccessibleForFree"] = True
    return schema


def edition_description(edition: Edition) -> str:
    artists = " · ".join(artist for _, artist in edition.schedule)
    year = datetime.strptime(edition.date, "%Y-%m-%d").year
    description = f"RANDOM #{edition.number} · {edition.name}. {edition.title} {year}"
    if edition.venue:
        description += f" en {edition.venue}"
    if artists:
        description += f". Line-up: {artists}"
    return description + "."


def render_schedule(edition: Edition) -> str:
    if not edition.schedule:
        return ""
    rows = []
    for time, artist in edition.schedule:
        time_html = f"<span>{html.escape(time)}</span>" if time else "<span>LINE-UP</span>"
        rows.append(f"<li>{time_html}<strong>{html.escape(artist)}</strong></li>")
    return '<section class="edition-schedule" aria-labelledby="lineup"><h2 id="lineup">LINE-UP</h2><ol>' + "".join(rows) + "</ol></section>"


def render_page(edition: Edition) -> str:
    schema = {
        "@context": "https://schema.org",
        "@graph": [organization_schema(), event_schema(edition)],
    }
    description = edition_description(edition)
    image_url = f"{SITE_URL}/{edition.flyer}"
    year = datetime.strptime(edition.date, "%Y-%m-%d").year
    page_title = f"RANDOM #{edition.number} · {edition.name} — {edition.title.split(' ', 1)[-1].title()} {year}"
    actions = []
    if edition.map_url:
        actions.append(f'<a class="edition-button edition-button--primary" href="{html.escape(edition.map_url, quote=True)}" target="_blank" rel="noreferrer">CÓMO LLEGAR <span>→</span></a>')
    actions.append('<a class="edition-button" href="/#fechas">PRÓXIMAS FECHAS <span>→</span></a>')
    schedule_html = f"        {render_schedule(edition)}\n" if edition.schedule else ""
    entry_html = f'        <p class="edition-entry">{html.escape(edition.entry)}</p>\n' if edition.entry else ""
    meta = " · ".join(part for part in [edition.meta, edition.place] if part)
    schema_json = json.dumps(schema, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    return f'''<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#070707" />
    <meta name="description" content="{html.escape(description, quote=True)}" />
    <link rel="canonical" href="{edition.url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RANDOM" />
    <meta property="og:url" content="{edition.url}" />
    <meta property="og:title" content="{html.escape(page_title, quote=True)}" />
    <meta property="og:description" content="{html.escape(description, quote=True)}" />
    <meta property="og:image" content="{image_url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/assets/favicon.ico" sizes="16x16 32x32 48x48" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@300..800&display=swap" />
    <link rel="stylesheet" href="/edition.css?v=20260826-1" />
    <script type="application/ld+json">{schema_json}</script>
    <title>{html.escape(page_title)}</title>
  </head>
  <body>
    <a class="skip-link" href="#contenido">SALTAR AL CONTENIDO</a>
    <header class="edition-header">
      <a href="/" aria-label="RANDOM, inicio"><img src="/assets/random-wordmark-tight.png" alt="RANDOM" width="1454" height="610" /></a>
      <a href="/#fechas">PRÓXIMAS FECHAS</a>
    </header>
    <main id="contenido" class="edition-page">
      <div class="edition-flyer">
        <img src="/{html.escape(edition.flyer)}" alt="Flyer de RANDOM #{edition.number} · {html.escape(edition.name)}" />
      </div>
      <article class="edition-content">
        <p class="edition-kicker">RANDOM #{edition.number}</p>
        <h1>{html.escape(edition.name)}</h1>
        <p class="edition-date">{html.escape(edition.title)} · {year}</p>
        <p class="edition-meta">{html.escape(meta)}</p>
{schedule_html}        <div class="edition-actions">{''.join(actions)}</div>
{entry_html}      </article>
    </main>
    <footer><img src="/assets/random-symbol.png" alt="" width="1500" height="1500" /><span>RANDOM · DESDE 2018</span></footer>
  </body>
</html>
'''


def write_pages(editions: list[Edition]) -> None:
    if EDITIONS_DIR.exists():
        shutil.rmtree(EDITIONS_DIR)
    EDITIONS_DIR.mkdir(parents=True)
    for edition in editions:
        destination = EDITIONS_DIR / edition.slug
        destination.mkdir()
        (destination / "index.html").write_text(render_page(edition), encoding="utf-8")


def write_sitemap(editions: list[Edition]) -> None:
    urls = [f"{SITE_URL}/", f"{SITE_URL}/galeria/"] + [edition.url for edition in editions]
    entries = "\n".join(f"  <url><loc>{html.escape(url)}</loc></url>" for url in urls)
    sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{entries}
</urlset>
'''
    (DOCS / "sitemap.xml").write_text(sitemap, encoding="utf-8")


def is_current_or_upcoming(edition: Edition, now_utc: datetime) -> bool:
    if edition.end:
        return edition.end.astimezone(ZoneInfo("UTC")) > now_utc
    local_today = now_utc.astimezone(ZoneInfo(edition.timezone)).date()
    return datetime.strptime(edition.date, "%Y-%m-%d").date() >= local_today


def main() -> None:
    editions = parse_editions(INDEX.read_text(encoding="utf-8"))
    now_utc = datetime.now(ZoneInfo("UTC"))
    active_editions = [edition for edition in editions if is_current_or_upcoming(edition, now_utc)]
    write_pages(active_editions)
    write_sitemap(active_editions)
    print(f"Generadas {len(active_editions)} páginas activas y sitemap.xml")


if __name__ == "__main__":
    main()
