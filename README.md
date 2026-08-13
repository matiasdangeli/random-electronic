# RANDOM — Electronic Experience

Sitio oficial de **RANDOM**, con próximas fechas, line-ups, set times, ubicación y acceso a Instagram.

Instagram: [@random.electronic](https://www.instagram.com/random.electronic/)

## Cargar una fecha

Las fechas no están escritas en ningún lado más que en su propia ficha: el sitio
arma solo el resto (la chapa del hero, el mes de la agenda, el orden y los
contadores). Sirve igual con una fecha, con dos o con ninguna.

En `docs/index.html`, dentro de `<div class="carousel">`, se copia un
`<article class="event" data-event>` y se cambian sus datos:

| Dato           | Qué es                                                 |
| -------------- | ------------------------------------------------------ |
| `data-edition` | Número de edición (`68`)                               |
| `data-date`    | Día del flyer, `AAAA-MM-DD`                            |
| `data-venue`   | Sala en corto, para la chapa del hero (`LEVEL`)         |\n| `data-name`    | Nombre visual de la edición (`ACERO`)                 |
| `data-until`   | Opcional: hasta cuándo se muestra (`AAAA-MM-DDTHH:MM`) |

En el archivo de fiestas pasadas, el formato se muestra siempre como `#NN · NOMBRE · FECHA` (por ejemplo, `#61 · ACERO · 22 MAY 2026`). El nombre sale de `data-name`, que la sincronización toma del nombre del flyer principal.\n\nAdentro de la ficha se cambian a mano el horario (`.event-meta`), la dirección
(`.event-place`), los set times, el link de "cómo llegar" y los dos flyers
(`assets/random-NN.webp` y `assets/random-NN-set-times.webp`).

El título de la fecha (`VIERNES 28 AGOSTO`) y el `PRÓXIMA FECHA · RANDOM #NN`
los escribe `docs/agenda.js` a partir de `data-date` y `data-edition`, así que
no hay que tocarlos.

## Cuándo se cae una fecha

Cada fecha está en la agenda hasta las 06:00 del día siguiente al del flyer,
porque las fiestas son de madrugada. Después baja sola al archivo ("YA PASARON"),
donde queda chica y apagada: da contexto sin competirle a la que viene.

Por eso **las fichas viejas no se borran**: son las que arman el archivo. Se
ordena solo, de la más reciente a la más vieja. Si querés recortarlo, borrá la
ficha más vieja y sus dos flyers de `assets/`.

Si no queda ninguna fecha por delante, la agenda muestra un aviso con el link a
Instagram y el archivo sigue abajo.

Para una edición con otro horario se puede correr ese corte con `data-until`.

## Cuando la fecha no sigue el molde

No todas las ediciones son un viernes de madrugada en Level. Lo que ya apareció
y cómo se resuelve:

- **De día** (la #66 fue sábado 16:00–22:00): poné `data-until` con la hora real
  de cierre, si no el corte por defecto la deja un día de más en la agenda.
- **En otra sala u otro país** (la #64 fue en Colón, Buenos Aires): cambiá
  `data-venue`, la línea `.event-place` y el link de "cómo llegar". Nada de eso
  está fijo en el sitio.
- **Sin horarios por DJ**, solo line-up: usá `class="schedule schedule--lineup"`
  y filas con el nombre solo, sin el `<span>` de la hora.
- **Un solo flyer**, sin uno de set times: sacá la cara `flyer3d-face--back` y el
  desplegable `full-flyer`. El archivo usa solo el flyer de adelante.
- **Entrada paga o condiciones distintas**: `.free-entry` es texto libre, poné lo
  que diga el flyer y nada más.
- **Color**: `.event` ya trae un acento por defecto, así que una ficha sin
  modificador se ve bien. Los modificadores (`event--plasma`, `event--sunset`…)
  son opcionales, para acompañar el flyer mientras la fecha está por delante.

## Publicación

El sitio es estático y vive en `docs/`: `index.html`, `styles.css`, `agenda.js`
(arma la agenda) y `carousel.js` (el carrusel 3D de flyers). No tiene build ni
dependencias.

El workflow de `.github/workflows/pages.yml` publica `docs/` en GitHub Pages
automáticamente en cada push a `main`.

## Desarrollo

Alcanza con abrir `docs/index.html` en el navegador. Para que las rutas relativas
se comporten igual que en producción:

```bash
python3 -m http.server -d docs 8000
```

Y entrar a <http://localhost:8000>.
