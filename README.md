# RANDOM — Electronic Experience

Sitio oficial de **RANDOM**, con próximas fechas, line-ups, set times, ubicación y acceso a Instagram.

Instagram: [@random.electronic](https://www.instagram.com/random.electronic/)

## Cargar una fecha

Las fechas no están escritas en ningún lado más que en su propia ficha: el sitio
arma solo el resto (la chapa del hero, el mes de la agenda, la dirección de
arriba, el orden y los contadores). Sirve igual con una fecha, con dos o con
ninguna.

En `docs/index.html`, dentro de `<div class="carousel">`, se copia un
`<article class="event" data-event>` y se cambian sus datos:

| Dato           | Qué es                                                 |
| -------------- | ------------------------------------------------------ |
| `data-edition` | Número de edición (`68`)                               |
| `data-date`    | Día del flyer, `AAAA-MM-DD`                            |
| `data-venue`   | Sala en corto, para la chapa del hero (`LEVEL`)         |
| `data-until`   | Opcional: hasta cuándo se muestra (`AAAA-MM-DDTHH:MM`) |

Adentro de la ficha se cambian a mano el horario (`.event-meta`), la dirección
(`.event-place`), los set times, el link de "cómo llegar" y los dos flyers
(`assets/random-NN.webp` y `assets/random-NN-set-times.webp`).

El título de la fecha (`VIERNES 28 AGOSTO`) y el `PRÓXIMA FECHA · RANDOM #NN`
los escribe `docs/agenda.js` a partir de `data-date` y `data-edition`, así que
no hay que tocarlos.

## Cuándo se cae una fecha

Cada fecha se muestra hasta las 06:00 del día siguiente al del flyer, porque las
fiestas son de madrugada. Después desaparece sola: no hace falta borrar la
ficha, aunque conviene limpiarlas de vez en cuando. Si no queda ninguna fecha
por delante, la agenda muestra un aviso con el link a Instagram.

Para una edición con otro horario se puede correr ese corte con `data-until`.

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
