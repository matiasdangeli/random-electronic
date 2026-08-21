# 005 — Evitar el relayout del set activo

- **Status**: DONE
- **Commit**: edc5067
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file, 4 lines

## Problem

The live schedule row changes horizontal padding when the active DJ set changes,
and the base rule explicitly animates that padding:

```css
/* docs/live.css:116-118 — current */
.schedule-row { transition:background 220ms ease,padding 220ms ease; }
.schedule-row.is-live { padding-right:12px; padding-left:12px; background:color-mix(in srgb,var(--accent) 9%,transparent); }
```

Animating padding forces layout and can shift the schedule contents when the
status updates. The live state should be visible without moving the grid.

## Target

Keep the row's normal padding fixed and animate only the background color with the
shared strong ease-out curve:

```css
.schedule-row {
  transition: background 180ms var(--ease-out);
}

.schedule-row.is-live {
  padding-right: 15px;
  padding-left: 15px;
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}
```

The `15px` values match the existing base `.schedule-row` padding in
`docs/styles.css:812-819`; they prevent the active state from changing layout.

## Repo conventions to follow

- `docs/live.css` is a lazy-loaded enhancement layered over `docs/styles.css`.
- The base schedule row already uses 15px vertical padding and 0 horizontal
  padding; the active state is the only place adding horizontal padding.
- Plan 001 adds `--ease-out` to the shared root tokens.

## Steps

1. In `docs/live.css`, replace the compressed `.schedule-row` transition with
   `transition: background 180ms var(--ease-out);`.
2. Replace the active row's horizontal padding values with `15px` on both sides.
3. Remove the animated `padding` property from the transition; keep the active
   background and live dot unchanged.

## Boundaries

- Do NOT change schedule markup, row typography, set timing logic, or the live dot.
- Do NOT add JavaScript or a dependency.
- This plan depends on `001-tighten-carousel-panel-motion.md` for `--ease-out`.
- If the cited rules have drifted, stop and report.

## Verification

- **Mechanical**: `rg -n -C 1 "schedule-row|transition" docs/live.css`; `git diff --check` must pass.
- **Feel check**: use the live schedule at a time when a set changes. The row
  should gain its background emphasis without horizontal text movement or a
  width/height shift.
- **Performance check**: in DevTools Performance, observe the live-state change;
  the update should not animate padding or trigger a visible layout cascade.
- **Done when**: the active row remains visually emphasized and all row geometry
  stays fixed before, during, and after the state change.
