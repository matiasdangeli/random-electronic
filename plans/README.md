# RANDOM motion plans

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | Tensar el cambio de información del carrusel | MEDIUM | DONE |
| 002 | Dar inercia al gesto del carrusel | MEDIUM | DONE |
| 003 | Hacer explícito el modo de movimiento reducido | MEDIUM | DONE |
| 004 | Aligerar el hover del archivo y la galería | MEDIUM | DONE |
| 005 | Evitar el relayout del set activo | MEDIUM | DONE |
| 006 | Dar continuidad física al swipe del lightbox | HIGH | DONE |

## Recommended execution order

Plans 001–005 are complete. Execute **006** next; it is behaviorally independent
and reuses the easing and reduced-motion conventions already introduced by the
completed plans.

## Scope

Plan 006 implements the previously deferred lightbox motion opportunity. The FAQ
reveal opportunity remains intentionally out of scope.
