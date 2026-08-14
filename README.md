# RANDOM — Electronic Experience

Sitio oficial de **RANDOM**, con próximas fechas, line-ups, set times, ubicación, countdown, estado LIVE y acceso a Instagram.

Instagram: [@random.electronic](https://www.instagram.com/random.electronic/)

## Cargar una fecha

Las fechas viven en su propia ficha dentro de `docs/index.html`. `docs/agenda.js` arma solo el resto: orden, archivo, títulos, contadores, countdown, LIVE y botones de calendario.

Dentro de `<div class="carousel">`, se copia un `<article class="event" data-event>` y se cambian sus datos:

| Dato | Qué es |
| --- | --- |
| `data-edition` | Número de edición (`68`) |
| `data-date` | Día que figura en el flyer, `AAAA-MM-DD` |
| `data-venue` | Sala en corto (`LEVEL`) |
| `data-name` | Nombre visual de la edición (`TÉRMICA`) |
| `data-timezone` | Zona IANA de la sede (`Europe/Andorra`, `America/Argentina/Buenos_Aires`) |
| `data-start` | Opcional. Inicio civil explícito `AAAA-MM-DDTHH:MM` cuando no se puede deducir del flyer |
| `data-until` | Opcional. Fin/corte civil explícito `AAAA-MM-DDTHH:MM` |

Para compatibilidad con las fichas antiguas, si falta `data-timezone` el sitio usa `Europe/Andorra`; si la dirección contiene `Argentina`, usa `America/Argentina/Buenos_Aires`. En fechas nuevas conviene escribir siempre `data-timezone`.

Adentro de la ficha se cambian a mano el horario (`.event-meta`), la dirección (`.event-place`), los set times, el link de "cómo llegar" y los flyers (`assets/random-NN.webp` y, cuando existe, `assets/random-NN-set-times.webp`). El carrusel no crea botones para girar ni para elegir ediciones: se recorre arrastrando y el flyer central se da vuelta al tocarlo.

Para compartir en alta calidad, cada `<img>` puede sumar `data-share-src="assets/share/random-NN.jpg"`. Ese JPG se exporta a 1080 × 1920 y calidad 92: coincide con el formato Full HD de Stories y conserva detalle de sobra sin cargar el PNG de producción. El WebP liviano sigue siendo el que muestra la página.

Los archivos HD no se descargan al navegar: se preparan recién cuando la persona toca `COMPARTIR`. Primero aparece una vista previa propia con la cara elegida; cuando la imagen está lista, `COMPARTIR AHORA` muestra el panel nativo.

El título de la fecha y el `PRÓXIMA FECHA · RANDOM #NN` los escribe `docs/agenda.js`, así que no hay que mantenerlos a mano.

## La fecha del flyer y la madrugada

En RANDOM, `data-date` representa **la noche que anuncia el flyer**, no necesariamente el día civil de cada hora.

Ejemplo: si el flyer dice `SÁBADO 4` y el evento empieza `00:00`, RANDOM interpreta ese comienzo como **domingo 5 a las 00:00**. La web sigue mostrando `SÁBADO 4`, porque esa es la fecha comunicada de la edición, pero internamente usa el instante civil correcto.

La regla se aplica automáticamente cuando el primer horario explícito está entre `00:00` y `07:59`. Horarios como `10:00`, `16:00` o `23:00` permanecen en el mismo día indicado por el flyer. Si una programación empieza antes de medianoche y continúa después, los sets posteriores avanzan al día siguiente de forma normal.

Esta semántica es única para todo el sistema y alimenta:

- countdown;
- `● LIVE NOW`;
- DJ que está tocando;
- cambio automático entre sets;
- momento en que la edición pasa al archivo;
- inicio y fin que se envían al calendario.

`data-start` y `data-until`, cuando se escriben con fecha y hora completas, son fechas civiles explícitas y no reciben este desplazamiento automático.

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

Si no existe un horario suficientemente explícito, la ficha puede archivarse mediante el fallback histórico, pero no se inventan countdown, LIVE ni horario de calendario.

Si hay `data-until`, ese valor manda para decidir cuándo deja de mostrarse la edición.

## Añadir al calendario

Cuando una fecha tiene un horario explícito, `agenda.js` agrega automáticamente el botón `+ AÑADIR AL CALENDARIO`.

- En **iPhone/iPad**, el sitio mantiene el archivo `.ics`, porque abre correctamente el flujo nativo del calendario.
- En **Android y escritorio**, abre Google Calendar con el evento ya rellenado, evitando que el navegador se limite a descargar un `.ics`.

En ambos casos se usan el nombre de la edición, el inicio y fin civiles reales, la dirección, los artistas de los set times cuando existen y el enlace a `randomelectronic.com`.

Las horas se calculan desde la zona horaria de la sede y se convierten al instante correcto antes de enviarlas al calendario.

Si no hay un horario suficientemente explícito, el botón no aparece: no se inventan horas.

## Compartir flyer

Cada próxima fecha agrega `COMPARTIR` en el mismo bloque que ubicación y calendario. Abre una vista previa grande de la cara que se está viendo —frente o set times— mientras prepara la imagen HD optimizada. Desde ahí, `COMPARTIR AHORA` envía únicamente esa imagen al panel nativo; cuando el navegador no admite archivos compartidos, descarga el mismo archivo.

Safari no permite que una web defina la miniatura de la cabecera del panel nativo; la vista previa propia garantiza que el flyer se vea antes de abrirlo.

Los JPG sociales viven en `docs/assets/share/` y solo se preparan al tocar `COMPARTIR`. No reemplazan los WebP del carrusel ni frenan la carga inicial del sitio.

## Archivo automático

Cuando una fecha termina baja sola al archivo y queda chica y apagada. Al tocarla se agranda, recupera color y luz al 100%; un segundo toque desactiva el destaque. El archivo no navega a páginas separadas.

El formato del archivo es `#NN · NOMBRE`. El nombre sale de `data-name`.

El bloque de concepto muestra un contador vivo desde el 14 de abril de 2018 a las 23:59:59 de Argentina. La fecha y la zona horaria se configuran en `data-start` y `data-timezone`; años, meses y días se calculan como unidades calendario y no como aproximaciones.

## Casos especiales

- **Evento de día:** usá el horario real en `.event-meta` y, si hace falta otro corte, `data-until`.
- **Otra ciudad o país:** cambiá `data-timezone`, `data-venue`, `.event-place` y el link de cómo llegar.
- **Sin horarios por DJ:** usá `class="schedule schedule--lineup"`; habrá countdown si existe un rango horario, pero no se mostrará un artista LIVE inventado.
- **Un solo flyer:** sacá la cara `flyer3d-face--back`.
- **Entrada paga o condición distinta:** `.free-entry` es texto libre.
- **Color:** los modificadores de `.event` son opcionales.

## Publicación

El sitio es estático y vive en `docs/`. No tiene build ni dependencias.

- `index.html`: contenido de las ediciones.
- `styles.css`: estilos generales.
- `agenda.js`: agenda, countdown, LIVE, zonas horarias y calendario.
- `live.css`: estilos del countdown, LIVE y botón de calendario.
- `carousel.js`: carrusel 3D.
- `edition.css`: estilos de las páginas temporales de fechas activas.
- `scripts/generate_seo.py`: genera las URLs activas y `sitemap.xml` a partir de `index.html`.

Solo las fechas actuales o próximas tienen una URL `/ediciones/NN-nombre/` para datos estructurados `Event`. Las pasadas viven únicamente en el archivo interactivo de la home. `sitemap.xml` incluye la home y esas fechas activas; el workflow vuelve a generarlo antes de cada deploy.

Después de modificar una edición en `docs/index.html`, ejecutar `python3 scripts/generate_seo.py` antes de guardar los cambios.

## Desarrollo

```bash
python3 scripts/generate_seo.py
python3 -m http.server -d docs 8000
```

Después abrir `http://localhost:8000`.
