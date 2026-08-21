# 004 — Aligerar el hover del archivo y la galería

- **Status**: DONE
- **Commit**: edc5067
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 2 files, 8–12 lines

## Problem

The archive and gallery animate saturation/brightness filters alongside opacity
and scale. These are repeated hover interactions over many image tiles:

```css
/* docs/styles.css:527-537 — current */
.archive-item img {
  opacity: 0.78;
  filter: saturate(0.35) brightness(0.72);
  transform: scale(1);
  transform-origin: center;
  transition: opacity 340ms ease, filter 340ms ease,
    transform 420ms cubic-bezier(0.22, 0.68, 0.28, 1);
}
```

```css
/* docs/gallery.css:78-84 — current */
.gallery-shot img {
  opacity: 0.88;
  transition: opacity 320ms ease, transform 420ms cubic-bezier(0.22, 0.68, 0.28, 1);
}
```

The audit rule for frequent UI is to animate `transform` and `opacity` only. The
current durations also make hover response slower than needed.

## Target

Use the existing `--ease-out` token from plan 001 and keep the filter states, but
stop interpolating the filter. Use a responsive 160ms transition for opacity and
transform:

```css
.archive-item img {
  transition: opacity 160ms var(--ease-out), transform 160ms var(--ease-out);
}

.gallery-shot img {
  transition: opacity 160ms var(--ease-out), transform 160ms var(--ease-out);
}
```

The filter may change at the same state boundary without being animated. Do not
replace the existing resting/selected/hover filter values in this plan.

## Repo conventions to follow

- Hover selectors are already gated by `@media (hover: hover)` for archive and
  gallery; preserve those guards.
- The site uses CSS-only image treatment and no motion dependency.
- Plan 001 adds `--ease-out`; do not create a second easing curve.

## Steps

1. In `docs/styles.css`, replace the archive image transition with the exact
   opacity/transform 160ms transition above and remove `filter` from the
   transition list.
2. In `docs/gallery.css`, replace the gallery image transition with the exact
   opacity/transform 160ms transition above.
3. Leave all filter values and hover selectors unchanged.

## Boundaries

- Do NOT change image dimensions, filters, opacity targets, or scale targets.
- Do NOT add markup, JavaScript, or dependencies.
- This plan depends on `001-tighten-carousel-panel-motion.md` for `--ease-out`.
- If the referenced rules have drifted, stop and report.

## Verification

- **Mechanical**: `rg -n -C 1 "archive-item img|gallery-shot img|transition" docs/styles.css docs/gallery.css`; `git diff --check` must pass.
- **Feel check**: move across archive cards and gallery thumbnails. Opacity and
  scale should respond immediately and settle in about 160ms; no visible lag or
  hover-induced layout shift should remain.
- **Performance check**: record a short Performance trace while sweeping across
  a row of cards; confirm the interaction is transform/opacity-led and does not
  produce a noticeable paint spike from filter interpolation.
- **Done when**: both surfaces keep their visual states while using only the two
  allowed animated properties.
