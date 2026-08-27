# Conector de Mercado Pago para ChatGPT

Un servidor MCP que le da a ChatGPT acceso a una cuenta de Mercado Pago: mirar
lo que entró, buscar un pago puntual, resumir un período y generar links de
cobro. Corre como Worker de Cloudflare, aparte del Worker que publica el sitio.

Después de configurarlo se le puede preguntar en lenguaje normal:

> ¿cuánto entró en Mercado Pago la semana pasada?
> pasame los pagos de la fecha de RANDOM #70
> armame un link de pago de $12.000 para una entrada

## Qué puede hacer

| Herramienta | Qué hace |
| --- | --- |
| `ver_cuenta` | De qué cuenta se están leyendo los datos y si el token es de producción o de prueba |
| `ver_saldo` | Saldo disponible y total |
| `buscar_pagos` | Lista de pagos por fecha, estado, mail del pagador o referencia |
| `ver_pago` | El detalle completo de un pago, con comisiones y devoluciones |
| `resumen_de_ventas` | Total bruto, comisiones, neto, promedio, por día y por medio de pago |
| `crear_link_de_pago` | Genera un link de cobro de Checkout Pro |
| `ver_link_de_pago` | Estado de un link ya creado |
| `devolver_pago` | Devuelve plata. **Viene apagada** (ver más abajo) |
| `search` / `fetch` | Los mismos pagos, en el formato que pide el modo investigación de ChatGPT |

El link que devuelve `crear_link_de_pago` es exactamente el que espera el campo
`link` de `docs/tienda.json`: se puede pedir el link y pegarlo en el producto.

## Antes de empezar

- Una cuenta de Cloudflare. El plan gratuito alcanza y sobra.
- Una cuenta de Mercado Pago.
- Un plan de ChatGPT que permita agregar conectores propios (Plus, Pro o
  Business). En algunos planes hay que activar antes el modo desarrollador en
  Configuración.
- Node instalado, para correr `wrangler`.

## 1. Sacar el access token de Mercado Pago

1. Entrar a <https://www.mercadopago.com.ar/developers/panel> con la cuenta que
   se quiere conectar.
2. Crear una aplicación (o abrir una que ya exista). Tipo de solución: pagos
   online, Checkout Pro.
3. En **Credenciales de producción**, copiar el **Access Token**. Empieza con
   `APP_USR-`.

Ese token es la cuenta: quien lo tiene puede ver los movimientos y cobrar. No
va en ningún archivo del repositorio; se carga como secreto en el paso 3.

Para probar sin tocar plata real están las **credenciales de prueba**, cuyo
token empieza con `TEST-`. `ver_cuenta` avisa cuál de los dos está en uso.

## 2. Publicar el Worker

```bash
cd connectors/mercadopago
npx wrangler login
npx wrangler deploy
```

Al terminar, wrangler imprime la dirección. Va a ser algo así:

```
https://random-mercadopago.TU-SUBDOMINIO.workers.dev
```

Conviene abrirla en el navegador: si el deploy salió bien se ve una pantalla
que dice **Servidor MCP en pie** y muestra la dirección que hay que pegar en
ChatGPT.

## 3. Cargar los secretos

```bash
npx wrangler secret put MP_ACCESS_TOKEN     # el APP_USR-... del paso 1
npx wrangler secret put CONNECTOR_PASSWORD  # una contraseña inventada, larga
```

`CONNECTOR_PASSWORD` es lo único que separa la cuenta de Mercado Pago de
cualquiera que adivine la dirección del Worker. Que sea larga y que no se use
en ningún otro lado. Se escribe una sola vez, cuando ChatGPT conecta.

Los secretos se aplican solos, sin volver a deployar. Para confirmar que
quedaron cargados:

```bash
curl https://random-mercadopago.TU-SUBDOMINIO.workers.dev/health
```

Tiene que responder `"access_token": true` y `"contrasena": true`.

## 4. Agregar el conector en ChatGPT

En **Configuración → Conectores → Nuevo complemento**:

| Campo | Qué poner |
| --- | --- |
| Nombre | Mercado Pago |
| Descripción | Pagos y cobros de la cuenta |
| Conexión | **URL del servidor** |
| URL | `https://random-mercadopago.TU-SUBDOMINIO.workers.dev/mcp` |
| Autenticación | **OAuth** |

La `/mcp` del final no es opcional. No hace falta tocar "Configuración avanzada
de OAuth": ChatGPT la detecta solo leyendo el servidor.

Después hay que tildar **Entiendo y quiero continuar** y crear. ChatGPT abre una
ventana pidiendo la contraseña del conector: esa es `CONNECTOR_PASSWORD`. Con
eso queda conectado.

## 5. Probarlo

En un chat nuevo, con el conector activado:

> ¿de qué cuenta de Mercado Pago estás leyendo?

Tiene que contestar con el usuario y el país. Si eso funciona, el resto también.

## Devoluciones

`devolver_pago` mueve plata y no se puede deshacer, así que viene apagada. Un
modelo que se equivoca de ID, o un texto malicioso metido en la descripción de
un pago, no tienen que poder devolver nada.

Para habilitarla hay que cambiarla a mano en `wrangler.jsonc`:

```jsonc
"PERMITIR_DEVOLUCIONES": "true"
```

y volver a deployar. Mientras esté en `"false"`, la herramienta existe pero
responde que está deshabilitada.

## Qué protege qué

- **El access token de Mercado Pago** vive como secreto de Cloudflare. No está
  en el repositorio ni sale nunca del Worker: ChatGPT nunca lo ve.
- **La contraseña del conector** es la puerta. Se compara en tiempo constante,
  así que no se puede adivinar midiendo cuánto tarda.
- **Los tokens de ChatGPT** son JSON firmados con HMAC. No hay base de datos:
  cambiar `CONNECTOR_PASSWORD` invalida de una todos los tokens vivos, que es
  el botón de pánico si algo se filtra.
- **El código de autorización** vale cinco minutos y viaja atado a PKCE.
- El servidor **se niega a atender** si falta la contraseña, en vez de quedar
  abierto.
- Un `redirect_uri` que no sea `https` (o `localhost`) se rechaza al registrar.

Vale la pena tenerlo claro igual: cualquier cosa que ChatGPT lea de Mercado
Pago —la descripción de un pago, el nombre de quien pagó— es texto que escribió
otra persona. Por eso las herramientas que mueven plata están apagadas o piden
datos explícitos, y ninguna borra nada.

## Si algo no anda

**ChatGPT dice que no puede conectar con el servidor.** Abrir la dirección en el
navegador. Si no carga, el deploy no salió; si carga, revisar que la URL del
conector termine en `/mcp`.

**Pide la contraseña una y otra vez.** La contraseña no coincide con la que se
cargó. Volver a correr `npx wrangler secret put CONNECTOR_PASSWORD` y agregar el
conector de nuevo.

**"Mercado Pago rechazó el access token (401)".** El token venció, se regeneró
desde el panel, o se copió el de prueba creyendo que era el de producción.

**"Mercado Pago no autoriza esta operación (403)".** A la aplicación del panel
de Mercado Pago le falta un permiso. Suele pasar con el saldo en cuentas que no
tienen habilitado ese acceso.

**El resumen dice que sumó solo una parte.** El período tiene más de mil pagos.
Partirlo en rangos más cortos.

## Desarrollo

```bash
cd connectors/mercadopago
npm install
npm test          # 32 pruebas, sin tocar Mercado Pago ni desplegar nada
npm run dev       # servidor local en http://localhost:8787
```

Las pruebas reemplazan `fetch` por una API simulada, así que ejercitan el baile
completo de OAuth y todas las herramientas sin cuenta real y sin red.

Para probar el servidor MCP a mano, sin ChatGPT, sirve el inspector oficial:

```bash
npx @modelcontextprotocol/inspector
```

apuntándolo a `http://localhost:8787/mcp`.

## Cómo está armado

```
src/
  index.js        Rutas del Worker
  mcp.js          El protocolo MCP: initialize, tools/list, tools/call
  herramientas.js Las diez herramientas y sus descripciones
  mercadopago.js  Cliente de la API, traducción de errores, resumen de pagos
  oauth.js        El OAuth mínimo que necesita ChatGPT
  firmas.js       HMAC: códigos y tokens firmados, sin base de datos
  paginas.js      Las dos pantallas HTML
```

Sin dependencias en runtime: el protocolo MCP sobre HTTP es JSON-RPC en un POST
y no justifica un bundler en un repositorio que hoy no tiene ninguno.

Una aclaración sobre el OAuth, porque el nombre se presta a confusión: el OAuth
de acá **no** es el OAuth de Mercado Pago. Ese sirve para operar cuentas ajenas
y necesita una aplicación aprobada. Este conector opera la cuenta propia con su
access token, y el OAuth es solamente el idioma en que ChatGPT pide permiso para
hablar con el Worker.
