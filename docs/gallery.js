import PhotoSwipeLightbox from "https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.js";

const galleries = document.querySelectorAll("[data-photo-gallery]");
const GALLERY_SIZES =
  "(max-width: 760px) 50vw, (max-width: 1484px) 33vw, 470px";

function absoluteUrl(value) {
  return new URL(value, window.location.href).href;
}

function fileNameFromUrl(value) {
  try {
    return new URL(value, window.location.href).pathname.split("/").pop() || "random-foto.webp";
  } catch {
    return "random-foto.webp";
  }
}

function probeUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (url.hostname === "drive.google.com" && url.pathname === "/thumbnail") {
      url.searchParams.set("sz", "w64");
    }
    return url.href;
  } catch {
    return value;
  }
}

function responsivePhotoMap(data) {
  const photos = new Map();

  Object.values(data || {}).forEach((gallery) => {
    [gallery?.photos, gallery?.all_photos].forEach((collection) => {
      if (!Array.isArray(collection)) return;
      collection.forEach((photo) => {
        if (!photo?.src || !photo?.srcset) return;
        photos.set(absoluteUrl(photo.src), photo);
      });
    });
  });

  return photos;
}

async function enhanceResponsiveImages() {
  if (!galleries.length) return;

  try {
    const response = await fetch("/gallery.json", { cache: "force-cache" });
    if (!response.ok) return;
    const photos = responsivePhotoMap(await response.json());
    if (!photos.size) return;

    galleries.forEach((gallery) => {
      gallery.querySelectorAll("a[data-pswp-width]").forEach((item) => {
        const photo = photos.get(absoluteUrl(item.href));
        if (!photo?.srcset) return;

        if (photo.srcset.jpeg) {
          item.dataset.pswpSrcset = photo.srcset.jpeg;
        }

        const img = item.querySelector("img");
        if (!img) return;

        if (photo.srcset.webp) {
          img.srcset = photo.srcset.webp;
          img.sizes = GALLERY_SIZES;
        }

        const avifSource = item.querySelector('source[type="image/avif"]');
        if (avifSource && photo.srcset.avif) {
          avifSource.srcset = photo.srcset.avif;
          avifSource.sizes = GALLERY_SIZES;
        }
      });
    });
  } catch {
    // El HTML ya contiene una imagen optimizada de respaldo.
  }
}

function prepareAutoSize(item) {
  if (!item.hasAttribute("data-pswp-auto-size")) return Promise.resolve();
  const img = item.querySelector("img");
  if (!img) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = (width, height) => {
      if (done) return;
      done = true;
      const ratio = width > 0 && height > 0 ? height / width : 1067 / 1600;
      item.dataset.pswpWidth = "1600";
      item.dataset.pswpHeight = String(Math.max(1, Math.round(1600 * ratio)));
      resolve();
    };

    const probe = new Image();
    probe.onload = () => finish(probe.naturalWidth, probe.naturalHeight);
    probe.onerror = () => finish(1600, 1067);
    probe.src = probeUrl(img.currentSrc || img.src);
    window.setTimeout(() => finish(1600, 1067), 2500);
  });
}

async function prepareGallery(gallery) {
  const autoItems = Array.from(gallery.querySelectorAll("[data-pswp-auto-size]"));
  await Promise.all(autoItems.map(prepareAutoSize));
}

const responsiveImagesReady = enhanceResponsiveImages();

async function initGallery(gallery) {
  await responsiveImagesReady;
  await prepareGallery(gallery);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children: "a[data-pswp-width]",
    pswpModule: () =>
      import("https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.js"),
    showHideAnimationType: reduceMotion ? "none" : "fade",
    bgOpacity: 0.97,
    paddingFn: (viewportSize) => ({
      top: viewportSize.x < 700 ? 52 : 44,
      bottom: viewportSize.x < 700 ? 52 : 44,
      left: viewportSize.x < 700 ? 10 : 44,
      right: viewportSize.x < 700 ? 10 : 44,
    }),
  });

  lightbox.on("uiRegister", () => {
    lightbox.pswp.ui.registerElement({
      name: "download-button",
      order: 8,
      isButton: true,
      tagName: "a",
      title: "Descargar foto",
      ariaLabel: "Descargar foto",
      html:
        '<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">' +
        '<path d="M15 4h2v15l5-5 1.4 1.4L16 23l-7.4-7.6L10 14l5 5V4Zm-7 21h16v2H8v-2Z"/>' +
        "</svg>",
      onInit: (el, pswp) => {
        el.setAttribute("download", "");
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
        const update = () => {
          if (pswp.currSlide) el.href = pswp.currSlide.data.src;
        };
        pswp.on("change", update);
        update();
      },
    });

    if (typeof navigator.share === "function") {
      lightbox.pswp.ui.registerElement({
        name: "share-button",
        order: 9,
        isButton: true,
        title: "Compartir foto",
        ariaLabel: "Compartir foto",
        html:
          '<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">' +
          '<path d="M17 4.6 23.4 11 22 12.4l-4-4V21h-2V8.4l-4 4L10.6 11 17 4.6ZM8 16h5v2H9v9h16v-9h-4v-2h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V17a1 1 0 0 1 1-1Z"/>' +
          "</svg>",
        onClick: async (_event, _el, pswp) => {
          const slide = pswp.currSlide;
          if (!slide) return;
          const src = absoluteUrl(slide.data.src);

          try {
            const response = await fetch(src, { cache: "force-cache" });
            if (!response.ok) throw new Error("image");
            const blob = await response.blob();
            const file = new File([blob], fileNameFromUrl(src), {
              type: blob.type || "image/webp",
            });

            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file] });
              return;
            }
          } catch (error) {
            if (error && error.name === "AbortError") return;
          }

          try {
            await navigator.share({
              title: document.title,
              url: src,
            });
          } catch (error) {
            if (error && error.name !== "AbortError") {
              window.open(src, "_blank", "noopener,noreferrer");
            }
          }
        },
      });
    }
  });

  lightbox.init();
}

galleries.forEach((gallery) => {
  initGallery(gallery);
});
