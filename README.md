# RANDOM — Electronic Experience

Sitio oficial de **RANDOM**, con próximas fechas, line-ups, set times, ubicación, countdown, estado LIVE y acceso a Instagram.

Instagram: [@random.electronic](https://www.instagram.com/random.electronic/)

## Cargar una fecha

Las fechas viven en su propia ficha dentro de `docs/index.html`. `docs/agenda.js` arma solo el resto: orden, archivo, títulos, contadores, countdown, LIVE y botones de calendario.

Dentro de `<div class="carousel">`, se copia un `<article class="event" data-event>` y se cambian sus datos:

| Dato | Qué es |
| --- | --- |
| `data-edition` | Número de edición (`68`) |
| `data-date` | Día del flyer, `AAAA-MM-DD` |
| `data-venue` | Sala en corto (`LEVEL`) |
| `data-name` | Nombre visual de la edición (`TÉRMICA`) |
| `data-timezone` | Zona IANA de la sede (`Europe/Andorra`, `America/Argentina/Buenos_Aires`) |
| `data-start` | Opcional. Inicio explícito `AAAA-MM-DDTHH:MM` cuando no se puede deducir del flyer |
| `data-until` | Opcional. Fin/corte explícito `AAAA-MM-DDTHH:MM` |

Para compatibilidad con las fichas antiguas, si falta `data-timezone` el sitio usa `Europe/Andorra`; si la dirección contiene `Argentina`, usa `America/Argentina/Buenos_Aires`. En fechas nuevas conviene escribir siempre `data-timezone`.

Adentro de la ficha se cambian a mano el horario (`.event-meta`), la dirección (`.event-place`), los set times, el link de "cómo llegar" y los flyers (`assets/random-NN.webp` y, cuando existe, `assets/random-NN-set-times.webp`).

El título de la fecha y el `PRÓXIMA FECHA · RANDOM #NN` los escribe `docs/agenda.js`, así que no hay que mantenerlos a mano.

## Countdown y LIVE

La próxima edición controla un estado dinámico en el hero:

- **Antes de empezar:** muestra un countdown `07D · 11H · 32M · 08S`.
- **Durante la fecha:** cambia a `● LIVE NOW`.
- **Con set times explícitos:** muestra automáticamente el artista que está tocando y marca su fila en el line-up.
- **Entre sets:** cambia de artista sin recargar la página.
- **Al terminar:** la página se actualiza una vez para sacar esa edición del carrusel y bajarla al archivo.

Todos los cálculos se hacen con la zona horaria de la sede. La hora local del visitante no cambia el estado real del evento.

### De dónde salen inicio y fin

El orden de preferencia es:

1. Los horarios de `.schedule-row` cuando hay set times.
2. El rango explícito de `.event-meta`, por ejemplo `00:00 — 05:00`.
3. `data-start` / `data-until` cuando están definidos.
4. Como último fallback para el archivo, el sitio conserva el corte histórico de las 06:00 del día siguiente.

Si hay `data-until`, ese valor manda para decidir cuándo deja de mostrarse la edición.

## Añadir al calendario

Cuando una fecha tiene un horario explícito, `agenda.js` agrega automáticamente el botón `+ AÑADIR AL CALENDARIO`.

El botón genera un archivo `.ics` con el nombre de la edición, inicio y fin reales, dirección, artistas de los set times cuando existen y enlace a `randomelectronic.com`.

Las horas se exportan como instantes UTC calculados desde la zona horaria de la sede, de modo que iPhone, Mac, Google Calendar, Outlook y otros calendarios las muestran correctamente en la zona del usuario.

Si no hay un horario suficientemente explícito, el botón no aparece: no se inventan horas.

## Archivo automático

Cuando una fecha termina baja sola al archivo y queda chica y apagada. Las fichas viejas no se borran: son las que construyen el historial.

El formato del archivo es `#NN · NOMBRE`. El nombre sale de `data-name`.

El contador de ediciones representa la última edición ya terminada; las futuras no cuentan aunque estén cargadas en el HTML.

## Casos especiales

- **Evento de día:** usá el horario real en `.event-meta` y, si hace falta otro corte, `data-until`.
- **Otra ciudad o país:** cambiá `data-timezone`, `data-venue`, `.event-place` y el link de cómo llegar.
- **Sin horarios por DJ:** usá `class="schedule schedule--lineup"`; habrá countdown si existe un rango horario, pero no se mostrará un artista LIVE inventado.
- **Un solo flyer:** sacá la cara `flyer3d-face--back` y el desplegable `full-flyer`.
- **Entrada paga o condición distinta:** `.free-entry` es texto libre.
- **Color:** los modificadores de `.event` son opcionales.

## Publicación

El sitio es estático y vive en `docs/`. No tiene build ni dependencias.

- `index.html`: contenido de las ediciones.
- `styles.css`: estilos generales.
- `agenda.js`: agenda, countdown, LIVE, zonas horarias y calendario.
- `live.css`: estilos del countdown, LIVE y botón de calendario.
- `carousel.js`: carrusel 3D.

El workflow de GitHub Pages publica automáticamente en cada push a `main`.

## Desarrollo

```bash
python3 -m http.server -d docs 8000
```

Después abrir `http://localhost:8000`.
