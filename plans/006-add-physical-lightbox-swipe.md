# 006 — Dar continuidad física al swipe del lightbox

- **Status**: DONE
- **Commit**: 4c30533
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 3 files, 130–190 lines

## Problem

The fullscreen gallery currently keeps one image node and replaces its source as
soon as a swipe crosses a fixed 60px threshold:

```js
/* docs/gallery.js:154-170 — current */
function setupSwipe(box) {
  var start = null;
  box.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
  });
  box.addEventListener("pointerup", function (e) {
    if (!start) return;
    var dx = e.clientX - start.x;
    var dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
  box.addEventListener("pointercancel", function () { start = null; });
}
```

```js
/* docs/gallery.js:274-281 — current */
function step(delta) {
  if (lightboxIndex < 0) return;
  var next = (lightboxIndex + delta + photos.length) % photos.length;
  while (shown <= next) showMore();
  showPhoto(next);
}
```

The image does not follow the finger, the adjacent image is never spatially
present, and release velocity is ignored. The result is an abrupt source swap
instead of a continuous gallery gesture.

The frame also contains only one image and has no motion styling:

```css
/* docs/gallery.css:165-183 — current */
.lightbox-frame {
  display: flex;
  min-width: 0;
  min-height: 0;
  margin: 0;
  align-items: center;
  justify-content: center;
}

.lightbox-frame img {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 100%;
  background-position: center;
  background-size: cover;
}
```

## Target

Build a no-dependency, two-image swipe transition that is physically continuous
and works for touch, mouse drag, arrow buttons, and keyboard arrows.

### Motion values

- On-screen directional movement: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Arrow/button/keyboard duration: `280ms`.
- Gesture completion duration:
  `clamp(180ms, remainingDistance / max(abs(velocity), 1.8), 280ms)`.
- Cancelled drag return: `180ms cubic-bezier(0.23, 1, 0.32, 1)`.
- Commit threshold: horizontal distance greater than
  `min(96px, frameWidth * 0.18)` OR release velocity greater than `0.45px/ms`.
- Axis lock: do not claim the gesture until movement exceeds `8px`; horizontal
  intent requires `abs(dx) > abs(dy) * 1.25`.
- Outgoing end state: translate one frame width opposite navigation direction,
  `scale(0.985)`, `opacity: 0.35`.
- Incoming start state: one frame width in the navigation direction,
  `scale(0.985)`, `opacity: 0.35`.
- Incoming end state: `translate3d(0, 0, 0) scale(1)`, `opacity: 1`.

### Direct manipulation

During a horizontal drag, mount the correct adjacent image immediately and make
both images follow the pointer. With `progress = min(abs(dx) / frameWidth, 1)`:

```js
currentX = dx;
incomingX = dx + direction * frameWidth;
currentScale = 1 - 0.015 * progress;
incomingScale = 0.985 + 0.015 * progress;
currentOpacity = 1 - 0.35 * progress;
incomingOpacity = 0.35 + 0.65 * progress;
```

If the drag reverses direction before release, remove the old preview and mount
the opposite adjacent image without changing `lightboxIndex`. Use pointer capture
so leaving the frame does not drop the gesture. Suppress the background click
generated after a real horizontal drag so the lightbox cannot close accidentally.

### Reduced motion

When `REDUCED` is true, do not translate or scale images. A committed navigation
uses an opacity-only crossfade for `160ms` with
`cubic-bezier(0.23, 1, 0.32, 1)`. A cancelled gesture resets immediately. Keep the
same distance/velocity decision so navigation remains predictable.

## Repo conventions to follow

- The gallery is plain JavaScript and CSS; do not add PhotoSwipe, GSAP, or any
  other dependency.
- Reuse the existing `REDUCED` media-query branch in `docs/gallery.js:27`.
- Reuse the existing strong UI easing token
  `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` from `docs/styles.css:4`.
- Keep the current medium-image background placeholder and adjacent-image
  preloading behavior from `showPhoto()` and `preload()`.
- Only `transform` and `opacity` may change during the transition.

## Steps

1. In `docs/gallery.js`, replace the single anonymous frame image with a
   `.lightbox-image` current image and add helpers that create/configure image
   nodes from a photo index. Every created image must preserve `width`, `height`,
   `alt`, `backgroundColor`, the `-m` placeholder, async decoding, and clearing
   `backgroundImage` on load.
2. Split the current `showPhoto()` responsibilities so image-node configuration
   is reusable and metadata/index updates happen exactly once per committed
   navigation. Opening the lightbox may still mount the first image immediately.
3. Replace `setupSwipe()` with pointer tracking on `.lightbox-frame`, including
   axis lock, pointer capture, exponentially smoothed velocity
   `velocity = velocity * 0.65 + sampleVelocity * 0.35`, adjacent preview mounting,
   direct transforms, velocity/distance commit, and animated cancel.
4. Replace `step(delta)` with one transition path shared by swipe release, arrow
   buttons, and keyboard arrows. Use `Element.animate()` for the two transforms
   and opacity values. If WAAPI is unavailable, fall back to the existing
   immediate `showPhoto(next)` behavior.
5. While one completion animation is running, retain at most the latest requested
   `delta` and run it after cleanup; do not create an unbounded queue. On finish,
   remove the outgoing node, normalize inline transform/opacity on the incoming
   node, promote it to current, update `lightboxIndex` and metadata, and preload
   its neighbors.
6. On `hideLightbox()`, cancel active animations, remove any incoming/outgoing
   temporary image, reset pointer state, and leave exactly one normalized current
   image for the next open.
7. In `docs/gallery.css`, change `.lightbox-frame` to a centered one-cell grid,
   add `overflow: hidden` and `touch-action: pan-y pinch-zoom`, stack both images
   in `grid-area: 1 / 1`, and apply `will-change: transform, opacity` only while
   the frame has an `.is-moving` class.
8. Bump `STYLES_URL` in `docs/gallery.js` from
   `/gallery.css?v=20260820-2` to `/gallery.css?v=20260821-1`, and bump the script
   URL in `docs/galeria/index.html` from `/gallery.js?v=20260820-3` to
   `/gallery.js?v=20260821-1` so Cloudflare cannot serve stale motion code.

## Boundaries

- Do NOT change gallery ordering, manifest loading, labels, save/share behavior,
  history handling, focus trapping, close behavior, or thumbnail loading.
- Do NOT animate width, height, margins, padding, top, left, or filters.
- Do NOT add a dependency or a second permanent full-resolution image.
- Do NOT change the lightbox visual design beyond the movement-related frame and
  image rules.
- A simple tap must not navigate. A vertical gesture must not navigate or close.
- If the cited code has drifted from commit `4c30533`, stop and report instead of
  improvising.

## Verification

- **Mechanical**:
  - `/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check docs/gallery.js`
  - `git diff --check`
  - `rg -n "20260821-1|0\.45|0\.65|0\.35|touch-action|is-moving|Element\.animate" docs/gallery.js docs/gallery.css docs/galeria/index.html`
- **Functional**:
  - Open `/galeria/`, open the first photo, swipe left and right, use both nav
    buttons, and use both arrow keys.
  - Confirm every method lands on the correct photo and wraps at both ends.
  - Reverse a drag before release; the opposite preview must replace the first
    preview without changing the current index.
  - Drag less than the threshold slowly; the current photo must return smoothly.
  - Flick less than the distance threshold faster than `0.45px/ms`; it must
    commit one photo and never skip two.
  - Spam an arrow key during movement; there must never be more than two image
    nodes in the frame and the latest request must run after cleanup.
  - Close during/after movement and reopen; one normalized image must remain and
    focus/history/save behavior must still work.
- **Feel check**:
  - At 10% playback, the outgoing and incoming photos must remain spatially
    connected with no black flash, double exposure, or layout jump.
  - On an actual iPhone, the image must feel attached to the finger and release
    naturally; vertical and pinch gestures must remain available.
  - With `prefers-reduced-motion: reduce`, confirm there is no translation or
    scale and only the 160ms opacity crossfade remains.
- **Done when**: all navigation methods share the same directional transition,
  a swipe is continuous from finger-down through settle, reduced motion is
  respected, and the console remains error-free.
