# RANDOM motion plans

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | Tensar el cambio de información del carrusel | MEDIUM | DONE |
| 002 | Dar inercia al gesto del carrusel | MEDIUM | DONE |
| 003 | Hacer explícito el modo de movimiento reducido | MEDIUM | DONE |
| 004 | Aligerar el hover del archivo y la galería | MEDIUM | DONE |
| 005 | Evitar el relayout del set activo | MEDIUM | DONE |

## Recommended execution order

1. **001** — establishes the shared `--ease-out` token and tightens the most
   visible repeated state change.
2. **003** — closes the accessibility gap without changing normal-motion output.
3. **002** — improves the primary tactile interaction; verify on a real touch
   device or pointer emulation.
4. **004** — reduces frequent image-hover paint work after the shared token exists.
5. **005** — removes layout animation from the live schedule.

Plans 004 and 005 depend on the `--ease-out` token introduced by 001. Plan 002
is behaviorally independent but should be feel-checked after 001 so the card and
panel transitions are judged together.

## Scope

These plans cover the five selected corrective findings from the motion audit.
They do not yet implement the additive lightbox and FAQ reveal opportunities.
