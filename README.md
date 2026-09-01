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

Con "reducir movimiento" activado en el sistema, el carrusel se arma igual: mismo escenario, mismos flyers, se sigue pasando de fecha arrastrando y el flyer se da vuelta al tocarlo. Lo que se apaga es todo lo que se mueve sin que se lo pidan — el avance automático, la flotación, la inclinación que sigue al mouse — y los cambios pasan a ser instantáneos en vez de animados.

Para compartir en alta calidad, cada `<img>` puede sumar `data-share-src="assets/share/random-NN.jpg"`. Ese JPG se exporta a 1080 × 1920 y calidad 92: coincide con el formato Full HD de Stories y conserva detalle de sobra sin cargar el PNG de producción. El WebP liviano sigue siendo el que muestra la página.

Los archivos HD no se descargan al navegar: se preparan recién cuando la persona toca `COMPARTIR`. Primero aparece una vista previa propia con la cara elegida; cuando la imagen está lista, `COMPARTIR AHORA` muestra el panel nativo.

El título de la fecha y el `PRÓXIMA FECHA · RANDOM #NN` los escribe `docs/agenda.js`, así que no hay que mantenerlos a mano.

## El Instagram de cada DJ

Las cuentas viven en `docs/djs.js`, en la lista `CUENTAS`: el nombre tal cual figura en el line-up y el usuario de Instagram, sin arroba.

```js
var CUENTAS = {
  "AYRTON GALFRÉ": "ayrton.galfre",
  "SOFIA ROSSI": "sofia.rossi"
};
```

Con eso alcanza. Cada nombre del line-up que esté en la lista suma el logo de Instagram al final de la fila, tanto en la home como en la página de la fecha. Se carga una vez por DJ y vale para todas las fechas en las que toque.

- **Un DJ que no está en la lista** queda como texto suelto, sin botón. Nunca se inventa una cuenta.
- **Los B2B** se parten solos: `IVU SARACHU B2B FABRITZIO` busca las dos cuentas y pone un botón por cada una. Ahí el logo va acompañado del nombre —dos logos iguales seguidos no se distinguen— y los dos bajan abajo del nombre, que al costado le comen la columna.
- **Acentos y apóstrofes** no cambian nada: `MATÍAS D’ANGELI` y `MATIAS D'ANGELI` encuentran la misma cuenta.
- **La fila se rearma** cuando la fecha tiene cuentas cargadas: el nombre arriba, el horario abajo y el logo al fondo a la derecha, igual en el celular que en la computadora. Sin cuentas, el horario se queda en su columna de siempre.

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
2. El rango explícito de `.event-meta`, por ejemplo `00:00 – 05:00`.
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

El archivo es una tira horizontal con la barra escondida. Con el dedo se desliza solo; con mouse se arrastra, porque un mouse común no tiene rueda horizontal ni barra a la que agarrarse (`Shift` + rueda también sirve). Mientras hay algo a lo que correrse el cursor es una manito, y soltar después de arrastrar no destaca la tarjeta de abajo.

El formato del archivo es `#NN · NOMBRE`. El nombre sale de `data-name`.

El bloque de concepto muestra un contador vivo desde el 14 de abril de 2018 a las 23:59:59 de Argentina. La fecha y la zona horaria se configuran en `data-start` y `data-timezone`; años, meses y días se calculan como unidades calendario y no como aproximaciones.

Es un solo bloque a lo ancho de la sección, con la misma lógica visual que el countdown del hero: una línea de números y debajo sus unidades. Cada número y su palabra comparten columna y se centran entre sí, así que `08` queda exactamente sobre `AÑOS`. El tamaño del número manda: el resto se mide en `em`, y todo el bloque escala con un solo `clamp`.

## Galería de fotos

La galería vive en su propia página, `docs/galeria/`, y no en la home: es una
dirección para compartir —en la bio de Instagram, por ejemplo— y la home queda
para las fechas. El link `FOTOS` del menú lleva ahí.

`LAS NOCHES` muestra todas las fotos juntas: una sola grilla de miniaturas
cuadradas, sin dividir por fecha, y un visor a pantalla completa que se pasa
con el dedo, con las flechas o con el teclado.

La página es un archivo suelto que solo trae la cabecera, la sección vacía y
`gallery.js`; todo lo demás lo arma el script leyendo `/fotos.json`. Por eso
las rutas del manifiesto, los estilos y las fotos arrancan con `/`.

El manifiesto sigue agrupado por edición porque así se guardan los archivos,
pero la galería lo aplana en una sola tira, de la noche más nueva a la más
vieja y, dentro de cada noche, en el orden en que se sacaron. De qué fecha es
cada foto se ve al abrirla en el visor, siempre como fecha y nunca como número
de edición: así todas dicen lo mismo, incluidas las noches que todavía no
tienen ficha en el sitio.

La página no dice en ningún lado cuántas fotos hay: no es un dato que le sirva
a nadie. En su lugar va la invitación, `Buscate. Descargá. Compartí :)`, que se edita
en `gallery.js`.

`GUARDAR`, dentro del visor, cumple esa promesa. La foto se pasa por un lienzo
a JPG antes de entregarla, porque el teléfono lo guarda mejor que un WebP.
Donde el navegador sabe compartir archivos se abre el panel nativo —ahí está
"Guardar en Fotos"—; donde no, se descarga. Si el lienzo falla, se entrega el
WebP tal cual.

La sección no existe hasta que hay fotos. Con `docs/fotos.json` vacío no
aparece, no ocupa lugar y no se pide ni un byte de más: quien no baja hasta
ahí solo carga `gallery.js`, y `gallery.css` se pide recién cuando hay algo
para mostrar.

### Cargar las fotos de una fecha

1. Poner los originales en `fotos/NN/`, donde `NN` es el número de edición.
   Esa carpeta no se publica ni se sube al repositorio. Si la noche todavía no
   tiene ficha en `index.html`, la carpeta se llama con su fecha
   (`fotos/2025-08-09/`) y la galería la muestra por fecha en vez de por
   número: es preferible a inventarle una edición.
2. Opcional: `fotos/NN/credito.txt` con el nombre del fotógrafo, tal como
   tiene que aparecer en el visor (`@nombre`).
3. Correr el script y subir el resultado:

```bash
python3 scripts/prepare_photos.py
```

De cada foto salen tres archivos, para que cada pantalla baje solo lo que
muestra:

| Archivo | Qué es |
| --- | --- |
| `NOMBRE-s.webp` | miniatura cuadrada de 320 px, grilla en el teléfono |
| `NOMBRE-m.webp` | miniatura cuadrada de 640 px, pantallas retina y escritorio |
| `NOMBRE.webp` | foto completa de 1400 px, la que abre el visor |

Todo va a `docs/assets/fotos/NN/` y el script reescribe `docs/fotos.json`, que
es lo que lee la galería. El nombre, la fecha y la sala salen de la ficha de la
edición en `docs/index.html`: no se escriben dos veces.

El script no rehace lo que ya está hecho, así que agregar tres fotos a una
edición de cuarenta tarda lo que tardan esas tres. Con `--force` convierte todo
de nuevo. Si se borra una foto del origen, sus archivos se van del sitio en la
próxima corrida.

Necesita Pillow una sola vez: `pip3 install pillow`.

### Cuántas fotos

Las fotos quedan guardadas para siempre en el historial de Git, así que
conviene subir una selección y no el volcado entero de la cámara. Con unas 30
por fecha la edición se cuenta completa y pesa alrededor de 7 MB; el script
avisa cuando una edición pasa de 40.

Las fotos viven en el mismo repositorio que el resto del sitio porque es lo
más rápido: las sirve el CDN de GitHub Pages con Cloudflare adelante, sin
llamadas a otro dominio, sin token que caduque y sin nada que se rompa si un
servicio cambia de reglas. Si algún día son miles, lo único que hay que
cambiar es el campo `base` de `docs/fotos.json` para apuntar a otro origen: el
resto de la galería no se entera.

## Página 404

`docs/404.html` es la que se ve al entrar a una dirección que no existe.
GitHub Pages la sirve sola, sin configurar nada. Es una sola pantalla: el
símbolo, el número, una frase y dos botones para volver.

La frase cambia sola en cada visita —la fiesta se llama RANDOM— y la lista
está al final del archivo. Si el script no corre, se lee la que ya está
escrita en el HTML.

Lleva `noindex`: una página de error no tiene por qué aparecer en Google. Sus
rutas arrancan con `/` porque se sirve desde cualquier dirección rota,
incluidas las de `/ediciones/`, y una ruta relativa se rompería ahí.

## Preguntas frecuentes

Las cinco preguntas viven en `docs/index.html`, dentro de la sección
`#preguntas`. Son `<details>` nativos: abren y cierran sin una línea de
JavaScript, se manejan con el teclado y el buscador del navegador encuentra el
texto aunque estén cerradas.

Las respuestas se editan a mano. **Al cambiar una hay que cambiarla también en
el bloque `FAQPage` de datos estructurados**, arriba en el `<head>`: es el que
puede hacer que Google muestre las preguntas directamente en el resultado de
búsqueda, y tiene que decir exactamente lo mismo que la página.

## Tienda

`LAS NOCHES` tiene su equivalente en `TIENDA`: la sección no existe hasta que
`docs/tienda.json` trae productos. Vacío, no aparece, no ocupa lugar y no se
pide ni `shop.css`.

### El cobro

El sitio es estático: no hay servidor donde crear una orden ni donde esconder
una clave. Así que el pago no pasa por acá. Cada producto lleva un **link de
pago** que se genera desde el panel del proveedor —Mercado Pago, Wise, PayPal,
Stripe, el que sea— y el comprador termina la compra en la página de ese
proveedor, que es la que cobra con tarjeta.

Eso significa que la tienda **no** tiene carrito, ni control de stock, ni
confirmación automática de la venta. A cambio no hay ninguna credencial
publicada, que en un sitio estático es la única forma segura de cobrar.

Debajo del catálogo va el bloque de transferencia, con los alias y un botón
que los copia: escribir un alias a mano desde el teléfono es donde se pierde
la venta.

### Cargar un producto

Se agrega un objeto a `productos` en `docs/tienda.json`:

```json
{
  "id": "remera",
  "nombre": "REMERA RANDOM",
  "detalle": "Algodón pesado, negra, estampa al frente.",
  "precio": "€25",
  "imagen": "remera.webp",
  "talles": ["S", "M", "L", "XL"],
  "link": "https://link-de-pago-del-proveedor",
  "estado": "disponible"
}
```

| Campo | Qué es |
| --- | --- |
| `id` | Nombre corto interno, no se muestra |
| `nombre` | Cómo aparece en la tarjeta |
| `detalle` | Opcional. Una línea de descripción |
| `precio` | Texto libre, así sirve para `€25` y para `$25.000` |
| `imagen` | Opcional. Archivo dentro de `docs/assets/tienda/`, cuadrado y en WebP |
| `talles` | Opcional. Se muestran como texto |
| `link` | El link de pago. Sin él la tarjeta se muestra pero no vende |
| `estado` | `agotado` deja la tarjeta apagada y sin botón |

Los medios de transferencia van en `pago.medios`, y `pago.nota` con
`pago.contacto` son la línea de abajo con el enlace para escribir.

Como el pago se termina afuera, el talle o cualquier otra aclaración conviene
pedirlos en la nota, para que el comprador los mande al escribir.

## Casos especiales

- **Evento de día:** usá el horario real en `.event-meta` y, si hace falta otro corte, `data-until`.
- **Otra ciudad o país:** cambiá `data-timezone`, `data-venue`, `.event-place` y el link de cómo llegar.
- **Sin horarios por DJ:** usá `class="schedule schedule--lineup"`; habrá countdown si existe un rango horario, pero no se mostrará un artista LIVE inventado.
- **Un solo flyer:** sacá la cara `flyer3d-face--back`.
- **Entrada paga o condición distinta:** `.free-entry` es texto libre.
- **Color:** los modificadores de `.event` son opcionales.

## Publicación

El sitio es estático y vive en `docs/`. No tiene build ni dependencias.

Lo sirve un Worker de Cloudflare llamado `random-electronic`, con los archivos
de `docs/` adentro, atado a randomelectronic.com como dominio propio. El deploy
es a mano:

```bash
npx wrangler deploy
```

`wrangler.jsonc` guarda esa configuración. Importa una línea en particular:
`not_found_handling: "404-page"`, que es lo que hace que una dirección
inexistente muestre `docs/404.html` en vez de una página vacía.

El workflow de GitHub Pages sigue corriendo en cada push, pero el dominio ya no
mira ahí.

- `index.html`: contenido de las ediciones.
- `styles.css`: estilos generales.
- `agenda.js`: agenda, countdown, LIVE, zonas horarias y calendario.
- `djs.js`: el Instagram de cada DJ y los botones de seguir del line-up.
- `live.css`: estilos del countdown, LIVE y botón de calendario.
- `carousel.js`: carrusel 3D.
- `edition.css`: estilos de las páginas temporales de fechas activas.
- `gallery.js`: galería de fotos, miniaturas por tandas y visor.
- `gallery.css`: estilos de la galería, se piden solo si hay fotos.
- `fotos.json`: qué fotos hay en cada edición. Lo genera el script.
- `shop.js`: catálogo de la tienda y bloque de transferencia.
- `shop.css`: estilos de la tienda, se piden solo si hay productos.
- `tienda.json`: productos y medios de pago. Se edita a mano.
- `404.html`: página de dirección inexistente.
- `scripts/prepare_photos.py`: convierte las fotos originales y arma `fotos.json`.
- `scripts/generate_seo.py`: genera las URLs activas y `sitemap.xml` a partir de `index.html`.

Solo las fechas actuales o próximas tienen una URL `/ediciones/NN-nombre/` para datos estructurados `Event`. Las pasadas viven únicamente en el archivo interactivo de la home. `sitemap.xml` incluye la home y esas fechas activas; el workflow vuelve a generarlo antes de cada deploy.

Después de modificar una edición en `docs/index.html`, ejecutar `python3 scripts/generate_seo.py` antes de guardar los cambios.

## Panel de administración

`randomelectronic.com/admin` es un panel privado, separado del sitio público:
fechas, DJs, cachets pagados, y la caja de RANDOM (ver `RANDOM-Operations-OS-v1`
para el porqué). Solo entra quien tenga un passkey registrado — Face ID, Touch
ID o Windows Hello. No hay usuario ni contraseña.

El código vive en `src/` (`worker.js`, `db.js`, `webauthn.js`, `admin-ui.js`) y
lo sirve el mismo Worker `random-electronic`, agregado como `main` en
`wrangler.jsonc`. Cualquier ruta que no empiece con `/admin` sigue yendo a
`docs/` sin cambios.

Los datos viven en D1 (`random-electronic-admin`, binding `DB`), separados del
repositorio porque el repositorio es público. Antes de poder usar el panel:

```bash
# una sola vez, crea el esquema
wrangler d1 execute random-electronic-admin --remote --file=migrations/0001_init.sql

# una sola vez, la clave para registrar el primer Face ID / Touch ID
wrangler secret put BOOTSTRAP_SECRET

# publica el Worker con el panel adentro
npx wrangler deploy
```

La primera vez que se abre `/admin` sin ningún dispositivo registrado, pide
esa clave de arranque y registra el primer passkey. De ahí en adelante, la
clave ya no hace falta: desde el panel logueado se pueden agregar más
dispositivos (por ejemplo, sumar la Mac después del iPhone).

## Desarrollo

```bash
python3 scripts/generate_seo.py
python3 -m http.server -d docs 8000
```

Después abrir `http://localhost:8000`.
