import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Image from "@11ty/eleventy-img";

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, "docs", "gallery.json");
const GENERATED_PATH = path.join(ROOT, ".cache", "gallery.generated.json");
const OUTPUT_ROOT = path.join(ROOT, "docs", "assets", "gallery");

const WIDTHS = [480, 960, 1600, 2400];
const FORMATS = ["avif", "webp", "jpeg"];
const MAX_CONCURRENCY = 3;

function sourceForBuild(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "drive.google.com" && url.pathname === "/thumbnail") {
      url.searchParams.set("sz", "w2400");
    }
    return url.href;
  } catch {
    return value;
  }
}

function stablePhotoId(value) {
  try {
    const url = new URL(value);
    const driveId = url.searchParams.get("id");
    if (driveId) return driveId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  } catch {
    // Fall through to a stable hash for non-URL sources.
  }

  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sortByWidth(items = []) {
  return [...items].sort((a, b) => Number(a.width || 0) - Number(b.width || 0));
}

function srcset(items = []) {
  return sortByWidth(items)
    .map((item) => `${item.url} ${item.width}w`)
    .join(", ");
}

function largest(items = []) {
  const ordered = sortByWidth(items);
  return ordered.at(-1) || null;
}

function closestAtOrAbove(items = [], target = 960) {
  const ordered = sortByWidth(items);
  return ordered.find((item) => Number(item.width) >= target) || ordered.at(-1) || null;
}

async function optimizePhoto(photo, editionNumber) {
  const source = sourceForBuild(photo.src);
  const id = stablePhotoId(photo.src);
  const outputDir = path.join(OUTPUT_ROOT, String(editionNumber));
  const urlPath = `/assets/gallery/${editionNumber}/`;

  await mkdir(outputDir, { recursive: true });

  const metadata = await Image(source, {
    widths: WIDTHS,
    formats: FORMATS,
    outputDir,
    urlPath,
    fixOrientation: true,
    cacheOptions: {
      duration: "30d",
      directory: path.join(ROOT, ".cache", "eleventy-img"),
      removeUrlQueryParams: false,
    },
    sharpAvifOptions: {
      quality: 58,
      effort: 4,
    },
    sharpWebpOptions: {
      quality: 80,
    },
    sharpJpegOptions: {
      quality: 84,
      progressive: true,
    },
    filenameFormat(_hash, _src, width, format) {
      return `random-${editionNumber}-${id}-${width}w.${format}`;
    },
  });

  const avif = sortByWidth(metadata.avif);
  const webp = sortByWidth(metadata.webp);
  const jpeg = sortByWidth(metadata.jpeg);
  const fallback = largest(jpeg) || largest(webp) || largest(avif);

  if (!fallback) {
    throw new Error(`No se pudo generar ninguna variante para ${photo.src}`);
  }

  const gridWebp = closestAtOrAbove(webp, 960);
  const gridAvif = closestAtOrAbove(avif, 960);

  return {
    ...photo,
    source: photo.src,
    src: fallback.url,
    webp: gridWebp?.url || fallback.url,
    avif: gridAvif?.url || undefined,
    width: fallback.width,
    height: fallback.height,
    srcset: {
      avif: srcset(avif),
      webp: srcset(webp),
      jpeg: srcset(jpeg),
    },
  };
}

async function mapWithConcurrency(entries, concurrency, worker) {
  const results = new Map();
  let cursor = 0;

  async function run() {
    while (cursor < entries.length) {
      const current = entries[cursor];
      cursor += 1;
      const [key, value] = current;
      results.set(key, await worker(value));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => run()),
  );

  return results;
}

async function main() {
  const galleries = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
  const jobs = new Map();

  for (const [editionNumber, gallery] of Object.entries(galleries)) {
    for (const collectionName of ["photos", "all_photos"]) {
      const collection = gallery[collectionName];
      if (!Array.isArray(collection)) continue;

      for (const photo of collection) {
        if (!photo?.src || jobs.has(photo.src)) continue;
        jobs.set(photo.src, {
          editionNumber,
          photo,
        });
      }
    }
  }

  const optimized = await mapWithConcurrency(
    [...jobs.entries()],
    MAX_CONCURRENCY,
    ({ editionNumber, photo }) => optimizePhoto(photo, editionNumber),
  );

  const generated = {};
  for (const [editionNumber, gallery] of Object.entries(galleries)) {
    generated[editionNumber] = { ...gallery };

    for (const collectionName of ["photos", "all_photos"]) {
      const collection = gallery[collectionName];
      if (!Array.isArray(collection)) continue;
      generated[editionNumber][collectionName] = collection.map((photo) => {
        const result = optimized.get(photo.src);
        if (!result) throw new Error(`Falta variante optimizada para ${photo.src}`);
        return result;
      });
    }
  }

  await mkdir(path.dirname(GENERATED_PATH), { recursive: true });
  await writeFile(GENERATED_PATH, `${JSON.stringify(generated, null, 2)}\n`, "utf8");

  console.log(
    `Optimizadas ${optimized.size} fotos únicas en AVIF/WebP/JPEG para ${Object.keys(galleries).length} edición(es).`,
  );
}

await main();
