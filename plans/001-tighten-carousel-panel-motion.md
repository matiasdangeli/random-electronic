# 001 — Tensar el cambio de información del carrusel

- **Status**: DONE
- **Commit**: edc5067
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, 8 lines

## Problem

The event detail panel changes whenever the 3D carousel advances automatically or
after a drag. It currently fades with the weak built-in `ease` curve for 400ms:

```css
/* docs/styles.css:998-1008 — current */
.carousel-panels > .event-panel {
  padding: 0;
  grid-area: 1 / 1;
  opacity: 0;
  transition: opacity 400ms ease;
  visibility: hidden;
}
```

The panel is a repeated interactive state, not a long marketing reveal. The
400ms fade starts too slowly and makes the text feel detached from the flyer
movement.

## Target

Add a shared strong UI ease-out token beside the existing root design tokens and
use it for this panel transition:

```css
/* docs/styles.css:3-16 — target addition */
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}

/* docs/styles.css:998-1008 — target */
.carousel-panels > .event-panel {
  padding: 0;
  grid-area: 1 / 1;
  opacity: 0;
  transition: opacity 220ms var(--ease-out);
  visibility: hidden;
}
```

Do not add a second transform or alter the panel layout. Keep `visibility` and
`aria-hidden` behavior unchanged.

## Repo conventions to follow

- Motion currently lives in the static page stylesheets, especially
  `docs/styles.css`; do not add a dependency or a framework.
- The site already uses opacity-only transitions for the stacked panels. Preserve
  that architecture and change only the timing curve and duration.

## Steps

1. In `docs/styles.css`, add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` to
   the existing `:root` block without removing any current token.
2. Replace only `transition: opacity 400ms ease;` on
   `.carousel-panels > .event-panel` with
   `transition: opacity 220ms var(--ease-out);`.
3. Leave the `.carousel-panels > .event-panel[data-active]` selector and all
   carousel JavaScript state changes untouched.

## Boundaries

- Do NOT change `docs/carousel.js` in this plan.
- Do NOT change markup, panel content, visibility, or accessibility attributes.
- Do NOT add a new dependency.
- If the cited block has drifted from this commit, stop and report instead of
  improvising.

## Verification

- **Mechanical**: `rg -n "--ease-out|carousel-panels > \\.event-panel|opacity 220ms" docs/styles.css` must show the token and the new transition; `git diff --check` must pass.
- **Feel check**: open the home page, jump to `#fechas`, wait for an automatic
  change and drag the carousel. The date details should settle in about 220ms,
  start immediately, and remain readable without a slow washed-out fade.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, the existing global
  reduced-motion rule must still collapse this opacity transition.
- **Done when**: only the intended root token and panel transition change, and
  rapid carousel selection never leaves the wrong panel visible.
