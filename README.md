# Dashboard Pro

PWA de gestion financiera personal construida con HTML, CSS y JavaScript Vanilla.

## Estructura

- `index.html`: shell principal y hojas modales.
- `css/styles.css`: sistema visual, responsive, tema claro y oscuro.
- `js/app.js`: orquestacion, eventos, CRUD y sesion.
- `js/data.js`: estado base, muestras, calculos y persistencia local.
- `js/firebase-service.js`: integracion con un proyecto Firebase nuevo.
- `js/pdf.js`: exportacion profesional a PDF con jsPDF y autoTable.
- `js/config/firebase-config.js`: credenciales vacias para este proyecto.
- `manifest.webmanifest` y `sw.js`: soporte PWA.

## Firebase nuevo

Este proyecto NO usa la base de datos anterior.

1. Crea un proyecto Firebase nuevo.
2. Activa Authentication con email y password.
3. Activa Realtime Database.
4. Copia las credenciales al archivo `js/config/firebase-config.js`.

## Ejecucion

Sirve la carpeta con `localhost` para probar PWA, service worker e instalacion.

## Nota

Si no configuras Firebase, la app funciona en modo local con backup, restore y exportacion PDF.
