# 002 — Dar inercia al gesto del carrusel

- **Status**: DONE
- **Commit**: edc5067
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 1 file, 35–55 lines

## Problem

The carousel follows the pointer directly while dragging, then settles to the
nearest card with a fixed damping value. A fast swipe and a slow short drag are
treated almost the same after release:

```js
/* docs/carousel.js:22-24 — current */
var SEEK_DAMP = 0.055; // qué tan rápido acomoda al soltar o al tocar un punto
```

```js
/* docs/carousel.js:367-386 — current */
stage.addEventListener("pointermove", function (e) {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) > 6) drag.moved = true;
  progress = drag.from + (drag.x - e.clientX) / (cardW + GAP);
});

function endDrag(e) {
  if (!drag) return;
  var wasTapOnCard = !drag.moved && drag.onCard;
  drag = null;
  stage.classList.remove("is-dragging");
  // ...
  seekTo(((Math.round(progress) % count) + count) % count);
}
```

This is a gesture-driven interaction and should carry velocity when interrupted,
then settle with a subtle spring-like response rather than a fixed-distance snap.

## Target

Keep the existing requestAnimationFrame renderer and no-dependency architecture,
but track horizontal velocity during the pointer gesture and use it to choose
the projected card on release. The settle must remain subtle and bounded:

- Treat the release as an Apple-style spring feel equivalent to
  `{ type: "spring", duration: 0.5, bounce: 0.2 }`.
- Use the measured velocity only to project the nearest target; clamp the
  projection so one flick cannot skip more than one additional card.
- Keep the existing `SEEK_DAMP` settle loop as the numerical settling mechanism
  unless a bounded equivalent is required by the implementation.
- A tap on the front card must still flip it and must not seek.
- `prefers-reduced-motion` must continue to jump directly to the target.

Suggested state shape:

```js
drag = {
  x: e.clientX,
  from: progress,
  moved: false,
  velocity: 0,
  lastX: e.clientX,
  lastTime: performance.now(),
  onCard: /* existing test */
};
```

The executor may choose an equivalent implementation, but it must preserve the
bounded one-card projection, tap behavior, pointer capture, and reduced-motion
branch.

## Repo conventions to follow

- `docs/carousel.js` already owns all carousel state and uses one
  `requestAnimationFrame` loop; extend that state instead of adding a second
  animation loop.
- The current `seekTo(index)` shortest-path logic at lines 157–164 is the source
  of truth for circular target selection.
- No animation library or new dependency is allowed.

## Steps

1. Extend the `drag` state in `docs/carousel.js` with the last pointer position,
   last timestamp, and a velocity value initialized to zero.
2. In `pointermove`, calculate horizontal velocity from the current event and
   previous sample, ignoring samples with zero or negative elapsed time. Update
   the stored sample after calculating it.
3. In `endDrag`, preserve the existing tap-on-front-card early return. For a
   real drag, project the release by the measured velocity, clamp the projection
   to at most one extra card, round to the nearest circular index, and pass that
   index through `seekTo`.
4. Preserve `pointercancel`, pointer capture release, the `is-dragging` class,
   and the `REDUCED` branch that makes seeking immediate.
5. Keep the existing `SEEK_DAMP` loop unless the implementation needs a bounded
   equivalent; do not introduce visible bounce beyond `bounce: 0.2`.

## Boundaries

- Do NOT change card layout, 3D transforms, autoplay speed, or flip behavior.
- Do NOT add a dependency or a second rAF loop.
- Do NOT change the `seekTo` shortest-path algorithm unless required to pass the
  projected target through it.
- If the cited handlers have drifted, stop and report instead of improvising.

## Verification

- **Mechanical**: `node --check docs/carousel.js` must pass; `git diff --check`
  must pass.
- **Feel check**: on a touch-capable device or Chrome pointer emulation, drag a
  short distance slowly and release, then perform a fast flick. The fast flick
  should carry naturally toward the next card, never skip more than one extra
  card, and settle without a hard stop or visible oscillation.
- **Interruptibility**: begin a drag, reverse direction before release, and
  confirm the target follows the final velocity rather than the initial gesture.
- **Reduced motion**: enable `prefers-reduced-motion: reduce`; dragging should
  still work but settle immediately with no float, tilt, or autoplay.
- **Done when**: taps flip, drags seek, fast swipes feel distinct from slow drags,
  and no console errors appear.
