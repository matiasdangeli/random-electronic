import PhotoSwipeLightbox from "https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.js";

const galleries = document.querySelectorAll("[data-photo-gallery]");

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

galleries.forEach((gallery) => {
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
});
