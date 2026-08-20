#!/usr/bin/env python3
"""Optimise event photos and build the manifest the gallery reads.

Originals live outside the published site, in fotos/<edition>/. This script
writes web-ready WebP derivatives into docs/assets/fotos/<edition>/ and
refreshes docs/fotos.json, which docs/gallery.js loads on demand.

Every photo produces three files, so each screen downloads only what it shows:

    <name>-s.webp   square thumbnail, 320 px   phone grid
    <name>-m.webp   square thumbnail, 640 px   retina and desktop grid
    <name>.webp     full photo, 1400 px long edge, opened in the viewer

Edition name, date and venue come from the event cards in docs/index.html, so
the cards remain the single editorial source of truth. The photographer credit
comes from an optional fotos/<edition>/credito.txt.

Conversions are incremental: a photo whose derivatives are already newer than
the original is left alone. Use --force to rebuild everything.

    python3 scripts/prepare_photos.py
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ModuleNotFoundError:  # pragma: no cover - depends on the machine
    sys.exit("Falta Pillow. Instalalo con:  pip3 install pillow")


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
INDEX = DOCS / "index.html"
MANIFEST = DOCS / "fotos.json"
OUTPUT_DIR = DOCS / "assets" / "fotos"
BASE_URL = "assets/fotos/"

FULL_EDGE = 1400
FULL_QUALITY = 78
THUMBS = (("m", 640, 72), ("s", 320, 70))
SOURCE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff"}
CREDIT_FILE = "credito.txt"
# Aviso, no límite: una edición se cuenta mejor con una selección corta, y el
# repositorio guarda para siempre todo lo que entra.
CURATION_HINT = 40


@dataclass
class Photo:
    identifier: str
    width: int
    height: int
    color: str


def natural_key(path: Path) -> tuple:
    return tuple(int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name))


def slugify(stem: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return slug or "foto"


def read_editions(source: str) -> dict[int, dict[str, str]]:
    """Pull edition number, name, date and venue out of the event cards."""
    source = re.sub(r"<!--.*?-->", "", source, flags=re.DOTALL)
    pattern = re.compile(r"<article\b(?P<attrs>[^>]*)\bdata-event\b(?P<after>[^>]*)>", re.DOTALL)
    editions: dict[int, dict[str, str]] = {}

    for match in pattern.finditer(source):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', match.group("attrs") + match.group("after")))
        if not attrs.get("data-edition"):
            continue
        editions[int(attrs["data-edition"])] = {
            "name": attrs.get("data-name", "").strip(),
            "date": attrs.get("data-date", "").strip(),
            "venue": attrs.get("data-venue", "").strip(),
        }

    return editions


def average_color(image: Image.Image) -> str:
    """One flat colour per photo: the grid fills the hole with it while the
    thumbnail travels, instead of flashing a grey rectangle."""
    pixel = image.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return "#{:02x}{:02x}{:02x}".format(*pixel)


def needs_rebuild(source: Path, targets: list[Path], force: bool) -> bool:
    if force:
        return True
    if any(not target.exists() for target in targets):
        return True
    return source.stat().st_mtime > min(target.stat().st_mtime for target in targets)


def convert(source: Path, folder: Path, identifier: str, force: bool) -> tuple[Photo, bool]:
    full = folder / f"{identifier}.webp"
    targets = [full] + [folder / f"{identifier}-{suffix}.webp" for suffix, _, _ in THUMBS]

    with Image.open(source) as opened:
        # El teléfono guarda la rotación en los metadatos: si no se aplica antes
        # de redimensionar, la foto sale acostada. Los metadatos no se copian:
        # ni la ubicación ni el modelo de cámara tienen por qué publicarse.
        image = ImageOps.exif_transpose(opened).convert("RGB")
        color = average_color(image)

        if needs_rebuild(source, targets, force):
            large = ImageOps.contain(image, (FULL_EDGE, FULL_EDGE), Image.Resampling.LANCZOS)
            large.save(full, "WEBP", quality=FULL_QUALITY, method=6)
            for suffix, size, quality in THUMBS:
                square = ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS)
                square.save(folder / f"{identifier}-{suffix}.webp", "WEBP", quality=quality, method=6)
            built = True
        else:
            built = False

    with Image.open(full) as saved:
        width, height = saved.size

    return Photo(identifier, width, height, color), built


def clean_orphans(folder: Path, keep: set[str]) -> int:
    """Drop derivatives whose original is no longer in the source folder."""
    removed = 0
    for file in folder.glob("*.webp"):
        identifier = re.sub(r"-(s|m)$", "", file.stem)
        if identifier not in keep:
            file.unlink()
            removed += 1
    return removed


def folder_weight(folder: Path) -> int:
    return sum(file.stat().st_size for file in folder.glob("*.webp"))


def build_edition(source_folder: Path, number: int | str, meta: dict[str, str], force: bool) -> dict | None:
    originals = sorted(
        (file for file in source_folder.iterdir() if file.is_file() and file.suffix.lower() in SOURCE_SUFFIXES),
        key=natural_key,
    )
    if not originals:
        print(f"  #{number}: sin fotos, se saltea")
        return None

    folder = OUTPUT_DIR / str(number)
    folder.mkdir(parents=True, exist_ok=True)

    photos: list[Photo] = []
    identifiers: set[str] = set()
    built = 0

    for original in originals:
        identifier = slugify(original.stem)
        candidate = identifier
        copy = 2
        while candidate in identifiers:
            candidate = f"{identifier}-{copy}"
            copy += 1
        identifiers.add(candidate)

        photo, was_built = convert(original, folder, candidate, force)
        photos.append(photo)
        built += 1 if was_built else 0

    removed = clean_orphans(folder, identifiers)
    weight = folder_weight(folder)
    note = f"  #{number}: {len(photos)} fotos · {weight / 1024 / 1024:.1f} MB"
    if built:
        note += f" · {built} convertidas"
    if removed:
        note += f" · {removed} archivos viejos borrados"
    print(note)
    if len(photos) > CURATION_HINT:
        print(f"     ojo: {len(photos)} fotos en una sola edición. Con una selección de {CURATION_HINT} se lee mejor y pesa menos.")

    credit_file = source_folder / CREDIT_FILE
    credit = credit_file.read_text(encoding="utf-8").strip() if credit_file.exists() else ""

    return {
        # "dir" es la carpeta donde viven los archivos; "edition" solo existe
        # cuando la noche tiene ficha en el sitio.
        "dir": str(number),
        "edition": number if isinstance(number, int) else None,
        "name": meta.get("name", ""),
        "date": meta.get("date", ""),
        "venue": meta.get("venue", ""),
        "credit": credit,
        "photos": [
            {"id": photo.identifier, "w": photo.width, "h": photo.height, "color": photo.color}
            for photo in photos
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara las fotos de la galería de RANDOM.")
    parser.add_argument("--src", default=str(ROOT / "fotos"), help="carpeta con las fotos originales (por defecto: fotos/)")
    parser.add_argument("--force", action="store_true", help="vuelve a convertir todo, aunque ya esté hecho")
    arguments = parser.parse_args()

    source_root = Path(arguments.src)
    if not source_root.is_dir():
        print(f"No existe {source_root}. Creá la carpeta y poné las fotos en fotos/<edición>/, por ejemplo fotos/69/.")
        return

    meta = read_editions(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else {}
    editions: list[dict] = []
    published: set[str] = set()

    print(f"Fotos de {source_root}")
    for folder in sorted(source_root.iterdir(), key=natural_key):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        # Dos formas de nombrar la carpeta: el número de edición cuando la fecha
        # ya está cargada en index.html, o la fecha de la noche (AAAA-MM-DD)
        # cuando todavía no tiene ficha. Así no hay que inventar números.
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", folder.name):
            edition = build_edition(folder, folder.name, {"date": folder.name}, arguments.force)
        else:
            match = re.match(r"(\d+)", folder.name)
            if not match:
                print(f"  {folder.name}: la carpeta tiene que llamarse como el número de edición o como la fecha, se saltea")
                continue
            number = int(match.group(1))
            edition = build_edition(folder, number, meta.get(number, {}), arguments.force)
        if edition:
            editions.append(edition)
            published.add(folder.name)

    # Ediciones cuyas fotos ya no están en el origen: se van también del sitio.
    if OUTPUT_DIR.exists():
        for folder in OUTPUT_DIR.iterdir():
            if folder.is_dir() and folder.name not in published:
                shutil.rmtree(folder)
                print(f"  #{folder.name}: ya no está en el origen, se borró del sitio")

    editions.sort(key=lambda item: (item.get("date", ""), item["dir"]), reverse=True)
    MANIFEST.write_text(
        json.dumps({"version": 1, "base": BASE_URL, "editions": editions}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    total = sum(len(edition["photos"]) for edition in editions)
    weight = folder_weight(OUTPUT_DIR) + sum(folder_weight(folder) for folder in OUTPUT_DIR.glob("*") if folder.is_dir())
    print(f"\n{total} fotos en {len(editions)} ediciones · {weight / 1024 / 1024:.1f} MB publicados")
    print(f"Manifiesto: {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
