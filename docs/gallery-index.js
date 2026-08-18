const galleryRoot = document.querySelector("[data-gallery-index]");
const meta = document.querySelector("[data-gallery-meta]");
const grid = document.querySelector("[data-photo-gallery]");

function galleryPhotos(gallery) {
  return gallery?.all_photos || gallery?.photos || [];
}

function createPhotoItem(photo, editionNumber) {
  const link = document.createElement("a");
  link.className = "edition-gallery-item";
  link.href = photo.src;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.dataset.edition = String(editionNumber);
  link.setAttribute("aria-label", `Abrir foto de RANDOM #${editionNumber}`);

  const width = Number(photo.width || 0);
  const height = Number(photo.height || 0);
  if (width > 0 && height > 0) {
    link.dataset.pswpWidth = String(width);
    link.dataset.pswpHeight = String(height);
  } else {
    link.dataset.pswpWidth = "1";
    link.dataset.pswpHeight = "1";
    link.dataset.pswpAutoSize = "";
  }

  const picture = document.createElement("picture");
  if (photo.avif) {
    const source = document.createElement("source");
    source.type = "image/avif";
    source.srcset = photo.avif;
    picture.append(source);
  }

  const image = document.createElement("img");
  image.src = photo.webp || photo.src;
  image.alt = photo.alt || `RANDOM #${editionNumber}`;
  image.loading = "lazy";
  image.decoding = "async";
  if (width > 0 && height > 0) {
    image.width = width;
    image.height = height;
  }

  picture.append(image);
  link.append(picture);
  return link;
}

async function loadGallery() {
  if (!galleryRoot || !grid) return;

  try {
    const response = await fetch("/gallery.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`gallery.json: ${response.status}`);

    const galleries = await response.json();
    const editions = Object.entries(galleries).sort(
      ([a], [b]) => Number(b) - Number(a),
    );

    let photoCount = 0;
    const fragment = document.createDocumentFragment();

    editions.forEach(([editionNumber, gallery]) => {
      galleryPhotos(gallery).forEach((photo) => {
        photoCount += 1;
        fragment.append(createPhotoItem(photo, editionNumber));
      });
    });

    grid.replaceChildren(fragment);
    if (meta) {
      meta.textContent = `${photoCount} FOTOS · ${editions.length} EDICIONES`;
    }

    await import("/gallery.js?v=20260818-3");
  } catch (error) {
    console.error(error);
    galleryRoot.dataset.error = "true";
    const note = document.querySelector(".gallery-page-note");
    if (note) {
      note.textContent = "No pudimos cargar las fotos en este momento. Probá de nuevo en unos segundos.";
    }
  }
}

loadGallery();
