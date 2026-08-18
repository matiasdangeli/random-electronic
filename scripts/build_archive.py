#!/usr/bin/env python3
'''Build permanent edition pages and photo galleries.'''

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
sys.path.insert(0, str(ROOT / "scripts"))

import generate_seo as seo  # noqa: E402

GALLERY_DATA = DOCS / "gallery.json"
GALLERY_DIR = DOCS / "galeria"


def validate_photo(photo: dict, index: int, number: int, collection: str) -> None:
    if not isinstance(photo, dict):
        raise RuntimeError(f"Foto {index} de #{number} en {collection} inválida")
    for field in ("src", "webp", "alt"):
        if not photo.get(field):
            raise RuntimeError(f"Foto {index} de #{number} en {collection}: falta {field}")
    for field in ("width", "height"):
        if field in photo and int(photo[field]) <= 0:
            raise RuntimeError(f"Foto {index} de #{number} en {collection}: {field} inválido")


def load_galleries() -> dict[int, dict]:
    if not GALLERY_DATA.exists():
        return {}
    raw = json.loads(GALLERY_DATA.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise RuntimeError("docs/gallery.json debe ser un objeto")

    galleries: dict[int, dict] = {}
    for key, value in raw.items():
        try:
            number = int(key)
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"Edición inválida en gallery.json: {key!r}") from error

        if not isinstance(value, dict):
            raise RuntimeError(f"La galería #{number} debe ser un objeto")
        photos = value.get("photos")
        if not isinstance(photos, list) or not photos:
            raise RuntimeError(f"La galería #{number} no tiene fotos")

        for index, photo in enumerate(photos, start=1):
            validate_photo(photo, index, number, "photos")

        all_photos = value.get("all_photos")
        if all_photos is not None:
            if not isinstance(all_photos, list) or not all_photos:
                raise RuntimeError(f"La galería general de #{number} no tiene fotos")
            for index, photo in enumerate(all_photos, start=1):
                validate_photo(photo, index, number, "all_photos")

        galleries[number] = value

    return galleries


def inject_archive_navigation(page: str) -> str:
    """Make past-edition cards on the homepage navigate to permanent pages."""
    if "archive-links.css" not in page:
        page = page.replace(
            "  </head>",
            '    <link rel="stylesheet" href="/archive-links.css?v=20260818-1" />\n  </head>',
            1,
        )

    if "archive-links.js" not in page:
        page = page.replace(
            "  </body>",
            '    <script src="/archive-links.js?v=20260818-2" defer></script>\n  </body>',
            1,
        )
    return page


def render_photo_item(photo: dict, edition_number: int | None = None) -> str:
    src = html.escape(str(photo["src"]), quote=True)
    webp = html.escape(str(photo["webp"]), quote=True)
    avif = html.escape(str(photo.get("avif", "")), quote=True)
    alt = html.escape(str(photo["alt"]), quote=True)
    width = int(photo.get("width") or 0)
    height = int(photo.get("height") or 0)
    has_size = width > 0 and height > 0
    avif_source = (
        f'<source srcset="{avif}" type="image/avif" />'
        if avif else ""
    )
    edition_attr = f' data-edition="{edition_number}"' if edition_number else ""
    edition_label = f" de RANDOM #{edition_number}" if edition_number else ""
    if has_size:
        size_data = f'data-pswp-width="{width}" data-pswp-height="{height}"'
        image_size = f'width="{width}" height="{height}" '
    else:
        size_data = 'data-pswp-width="1" data-pswp-height="1" data-pswp-auto-size'
        image_size = ""

    return (
        f'<a class="edition-gallery-item" href="{src}" {size_data}{edition_attr} '
        f'aria-label="Abrir foto{edition_label}" target="_blank" rel="noreferrer">'
        f'<picture>{avif_source}<img src="{webp}" alt="{alt}" '
        f'{image_size}loading="lazy" decoding="async" /></picture>'
        "</a>"
    )


def render_gallery(edition: seo.Edition, gallery: dict) -> str:
    title = html.escape(str(gallery.get("title", "FOTOS")))
    eyebrow = html.escape(str(gallery.get("eyebrow", f"RANDOM #{edition.number}")))
    credit = str(gallery.get("credit", "")).strip()
    credit_html = (
        f'<p class="edition-gallery-credit">FOTOS · {html.escape(credit)}</p>'
        if credit else ""
    )
    items = "".join(render_photo_item(photo, edition.number) for photo in gallery["photos"])

    return f'''
    <section class="edition-gallery" aria-labelledby="fotos">
      <div class="edition-gallery-head">
        <div>
          <p class="edition-gallery-kicker">{eyebrow}</p>
          <h2 id="fotos">{title}</h2>
        </div>
        {credit_html}
      </div>
      <div class="edition-gallery-grid" data-photo-gallery>
        {items}
      </div>
    </section>
'''


def inject_gallery(page: str, edition: seo.Edition, gallery: dict) -> str:
    gallery_html = render_gallery(edition, gallery)

    if "photoswipe.css" not in page:
        page = page.replace(
            '    <link rel="stylesheet" href="/edition.css" />',
            '    <link rel="stylesheet" href="/edition.css?v=20260818-1" />\n'
            '    <link rel="stylesheet" href="/gallery.css?v=20260818-1" />\n'
            '    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.css" />',
            1,
        )

    page = page.replace("    <footer>", gallery_html + "\n    <footer>", 1)
    page = page.replace(
        "  </body>",
        '    <script src="/gallery.js?v=20260818-2" type="module"></script>\n  </body>',
        1,
    )
    return page


def gallery_photos(gallery: dict) -> list[dict]:
    return gallery.get("all_photos") or gallery["photos"]


def render_general_gallery(galleries: dict[int, dict]) -> str:
    ordered = sorted(galleries.items(), key=lambda item: item[0], reverse=True)
    photos = [
        (number, photo)
        for number, gallery in ordered
        for photo in gallery_photos(gallery)
    ]
    items = "".join(render_photo_item(photo, number) for number, photo in photos)
    photo_count = len(photos)
    edition_count = len(galleries)
    gallery_url = f"{seo.SITE_URL.rstrip('/')}/galeria/"
    description = "Galería general de RANDOM: fotos de todas las ediciones disponibles en un solo archivo visual."
    og_image = html.escape(str(photos[0][1]["src"]), quote=True) if photos else f"{seo.SITE_URL}/assets/random-wordmark-tight.png"

    return f'''<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#070707" />
    <meta name="description" content="{html.escape(description, quote=True)}" />
    <link rel="canonical" href="{gallery_url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RANDOM" />
    <meta property="og:url" content="{gallery_url}" />
    <meta property="og:title" content="GALERÍA — RANDOM" />
    <meta property="og:description" content="{html.escape(description, quote=True)}" />
    <meta property="og:image" content="{og_image}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/assets/favicon.ico" sizes="16x16 32x32 48x48" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" />
    <link rel="stylesheet" href="/edition.css?v=20260818-1" />
    <link rel="stylesheet" href="/gallery.css?v=20260818-1" />
    <link rel="stylesheet" href="/gallery-index.css?v=20260818-1" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.css" />
    <title>GALERÍA — RANDOM</title>
  </head>
  <body>
    <a class="skip-link" href="#contenido">SALTAR AL CONTENIDO</a>
    <header class="edition-header">
      <a href="/" aria-label="RANDOM, inicio"><img src="/assets/random-wordmark-tight.png" alt="RANDOM" width="1454" height="610" /></a>
      <a href="/">VOLVER A RANDOM</a>
    </header>
    <main id="contenido" class="gallery-page">
      <header class="gallery-page-hero">
        <div>
          <p class="gallery-page-kicker">RANDOM · DESDE 2018</p>
          <h1>GALERÍA</h1>
        </div>
        <p class="gallery-page-meta">{photo_count} FOTOS · {edition_count} EDICIONES</p>
      </header>
      <p class="gallery-page-note">Todas las fotos disponibles de RANDOM, juntas en un solo archivo.</p>
      <div class="edition-gallery-grid gallery-page-grid" data-photo-gallery>
        {items}
      </div>
    </main>
    <footer><img src="/assets/random-symbol.png" alt="" width="1500" height="1500" /><span>RANDOM · DESDE 2018</span></footer>
    <script src="/gallery.js?v=20260818-2" type="module"></script>
  </body>
</html>
'''


def write_general_gallery(galleries: dict[int, dict]) -> int:
    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    page = render_general_gallery(galleries)
    (GALLERY_DIR / "index.html").write_text(page, encoding="utf-8")
    return sum(len(gallery_photos(gallery)) for gallery in galleries.values())


def add_gallery_to_sitemap() -> None:
    sitemap_path = DOCS / "sitemap.xml"
    sitemap = sitemap_path.read_text(encoding="utf-8")
    gallery_url = f"{seo.SITE_URL.rstrip('/')}/galeria/"
    entry = f"  <url><loc>{html.escape(gallery_url)}</loc></url>\n"
    if gallery_url not in sitemap:
        sitemap = sitemap.replace("</urlset>", entry + "</urlset>", 1)
        sitemap_path.write_text(sitemap, encoding="utf-8")


def main() -> None:
    source = seo.INDEX.read_text(encoding="utf-8")
    editions = seo.parse_editions(source)
    galleries = load_galleries()
    by_number = {edition.number: edition for edition in editions}

    unknown = sorted(set(galleries) - set(by_number))
    if unknown:
        raise RuntimeError(
            "Hay galerías sin edición en index.html: "
            + ", ".join(f"#{number}" for number in unknown)
        )

    # La home conserva su HTML editorial original en el repo. En el artefacto
    # publicado agregamos solamente la navegación del archivo histórico.
    seo.INDEX.write_text(inject_archive_navigation(source), encoding="utf-8")

    # Reutilizamos el generador existente, pero le pasamos todas las ediciones:
    # así las URLs históricas dejan de desaparecer cuando termina una fecha.
    seo.write_pages(editions)
    seo.write_sitemap(editions)

    for number, gallery in galleries.items():
        edition = by_number[number]
        page_path = seo.EDITIONS_DIR / edition.slug / "index.html"
        page = page_path.read_text(encoding="utf-8")
        page_path.write_text(
            inject_gallery(page, edition, gallery),
            encoding="utf-8",
        )

    photo_count = write_general_gallery(galleries)
    add_gallery_to_sitemap()

    print(
        f"Generadas {len(editions)} páginas permanentes, "
        f"{len(galleries)} galería(s), {photo_count} fotos en /galeria/ y sitemap.xml"
    )


if __name__ == "__main__":
    main()
