# RANDOM — Electronic Experience

Sitio oficial de **RANDOM**, con próximas fechas, line-ups, set times, ubicación y acceso a Instagram.

## Próximas fechas

- RANDOM #67 — viernes 21 de agosto de 2026 · Level Andorra
- RANDOM #68 — viernes 28 de agosto de 2026 · Level Andorra

Entrada libre y gratuita. Edifici Enland, km 0, Andorra la Vella.

## Publicación

El sitio es estático (HTML + CSS, sin build) y vive en `docs/`. El workflow de `.github/workflows/pages.yml` lo publica automáticamente desde la rama `main`.

## Desarrollo

No hace falta ninguna dependencia: se abre `docs/index.html` en el navegador. Para servirlo en local con rutas reales:

```bash
python3 -m http.server -d docs 8000
```

La tipografía es SF Pro vía la font stack del sistema (`-apple-system`), así que se ve exacta en Mac y iPhone y cae a Segoe UI / Roboto en Windows y Android.

Instagram: [@random.electronic](https://www.instagram.com/random.electronic/)
