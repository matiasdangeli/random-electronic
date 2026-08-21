# 003 — Hacer explícito el modo de movimiento reducido

- **Status**: DONE
- **Commit**: edc5067
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, 12–18 lines

## Problem

The main stylesheet collapses animation and transition durations under
`prefers-reduced-motion`, but it does not remove several transform-driven states:

```css
/* docs/styles.css:252-255 — current */
.button:hover,
.button:focus-visible {
  transform: translateY(-2px);
}
```

```css
/* docs/styles.css:1564-1575 — current */
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

The hero `breathe` keyframe still reaches a scaled state, and the main buttons,
refresh control, and archive hover can still move. A reduced-motion preference
should remove position and scale changes while preserving readable opacity, color,
and focus feedback.

## Target

Append explicit overrides to the existing reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  .hero-glow {
    animation: none;
    transform: none;
  }

  .button:hover,
  .button:focus-visible,
  .refresh:active,
  .archive-item:hover img {
    transform: none;
  }
}
```

Do not remove opacity or color feedback. Do not disable the FAQ plus rotation
manually; its existing reduced-motion rule already removes that transition.

## Repo conventions to follow

- `docs/carousel.js` already branches on `matchMedia` to remove autoplay, tilt,
  and float; `docs/gallery.js` adds `.gallery-reduced` for gallery hover. The CSS
  override should complete that same policy for the main page.
- Keep the existing global duration reset for non-transform transitions.

## Steps

1. In the existing `@media (prefers-reduced-motion: reduce)` block at the end of
   `docs/styles.css`, add the `.hero-glow` override with `animation: none` and
   `transform: none`.
2. Add the grouped transform override for `.button:hover`,
   `.button:focus-visible`, `.refresh:active`, and `.archive-item:hover img`.
3. Leave the normal-motion selectors unchanged.

## Boundaries

- Do NOT alter the visual treatment for users without reduced motion.
- Do NOT remove focus outlines, opacity changes, color changes, or accessible
  state changes.
- Do NOT change `docs/carousel.js`, `docs/gallery.js`, or page markup.
- If the cited reduced-motion block has drifted, stop and report instead of
  improvising.

## Verification

- **Mechanical**: `rg -n "hero-glow|archive-item:hover img|prefers-reduced-motion" docs/styles.css` must show the explicit overrides; `git diff --check` must pass.
- **Feel check**: with normal motion, confirm the hero breathe, button lift,
  refresh press, and archive hover remain unchanged.
- **Accessibility check**: in Chrome DevTools Rendering, enable “Emulate CSS
  prefers-reduced-motion: reduce”. Confirm the hero glow does not scale, buttons
  and archive cards do not move, while opacity/color/focus feedback remains.
- **Done when**: no transform or continuous scale movement remains in the listed
  states under reduced motion, and the carousel/gallery existing reduced-motion
  behavior still works.
