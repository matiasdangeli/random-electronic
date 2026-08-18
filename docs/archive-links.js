/* Conecta las tarjetas del archivo de la home con las páginas históricas. */
(function () {
  "use strict";

  function slugify(value) {
    return String(value || "random")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "random";
  }

  function connectArchiveCards(root) {
    var cards = (root || document).querySelectorAll(".archive-item .archive-link");

    Array.prototype.forEach.call(cards, function (card) {
      if (card.tagName === "A" || card.hasAttribute("data-archive-edition-link")) return;

      var label = card.querySelector(".archive-label");
      if (!label) return;

      var match = /^#(\d+)(?:\s*·\s*(.+))?$/.exec((label.textContent || "").trim());
      if (!match) return;

      var edition = match[1];
      var name = (match[2] || "RANDOM").trim();
      var link = document.createElement("a");

      link.className = card.className;
      link.href = "/ediciones/" + edition + "-" + slugify(name) + "/";
      link.setAttribute("data-archive-edition-link", "");
      link.setAttribute("aria-label", "Ver RANDOM #" + edition + (name ? " · " + name : ""));

      while (card.firstChild) link.appendChild(card.firstChild);
      card.replaceWith(link);
    });
  }

  function init() {
    connectArchiveCards(document);

    var grid = document.querySelector("[data-archive-grid]");
    if (!grid || typeof MutationObserver !== "function") return;

    var observer = new MutationObserver(function () {
      connectArchiveCards(grid);
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
