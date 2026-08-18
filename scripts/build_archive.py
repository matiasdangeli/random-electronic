#!/usr/bin/env python3
'''Build permanent edition pages and inject optional photo galleries.'''

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
            if not isinstance(photo, dict):
                raise RuntimeError(f"Foto {index} de #{number} inválida")
            for field in ("src", "webp", "width", "height", "alt"):
                if not photo.get(field):
                    raise RuntimeError(f"Foto {index} de #{number}: falta {field}")
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
            '    <script src="/archive-links.js?v=20260818-1" defer></script>\n  </body>',
            1,
        )
    return page


def render_gallery(edition: seo.Edition, gallery: dict) -> str:
    title = html.escape(str(gallery.get("title", "FOTOS")))
    eyebrow = html.escape(str(gallery.get("eyebrow", f"RANDOM #{edition.number}")))
    credit = str(gallery.get("credit", "")).strip()
    credit_html = (
        f'<p class="edition-gallery-credit">FOTOS · {html.escape(credit)}</p>'
        if credit else ""
    )

    items = []
    for photo in gallery["photos"]:
        src = html.escape(str(photo["src"]), quote=True)
        webp = html.escape(str(photo["webp"]), quote=True)
        avif = html.escape(str(photo.get("avif", "")), quote=True)
        alt = html.escape(str(photo["alt"]), quote=True)
        width = int(photo["width"])
        height = int(photo["height"])
        avif_source = (
            f'<source srcset="{avif}" type="image/avif" />'
            if avif else ""
        )
        items.append(
            f'<a class="edition-gallery-item" href="{src}" '
            f'data-pswp-width="{width}" data-pswp-height="{height}" '
            f'target="_blank" rel="noreferrer">'
            f'<picture>{avif_source}<img src="{webp}" alt="{alt}" '
            f'width="{width}" height="{height}" loading="lazy" decoding="async" /></picture>'
            "</a>"
        )

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
        {''.join(items)}
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
        '    <script src="/gallery.js?v=20260818-1" type="module"></script>\n  </body>',
        1,
    )
    return page


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

    print(
        f"Generadas {len(editions)} páginas permanentes, "
        f"{len(galleries)} galería(s) y sitemap.xml"
    )


if __name__ == "__main__":
    main()
