# Opener

Visor de archivos para Code OSS / VS Code. Versión 0.0.3: PDF con scroll continuo, zoom editable, ajuste al ancho/alto del área visible y barra lateral de miniaturas.

## Integración con tu proyecto

1. Descomprimí `opener/` en `~/Dev/opener/` (hacé una copia de tu proyecto o guardá los cambios antes de reemplazar archivos).
2. Conservá tu `bun.lock` y ejecutá `bun install` para instalar las dependencias de `package.json`.
3. Corré `bun run typecheck` y `bun run build`.
4. Cerrá el Extension Development Host anterior y lanzá **Run Opener** (`F5`, o el panel Ejecutar y depurar).
5. Abrí un PDF. Opener está registrado como visor predeterminado para `*.pdf`.

## Nuevas funciones

- **Zoom:** escribí `125` o `125%` y presioná Enter o salí del input. También acepta decimales con punto o coma. Rango 10–600%; `Escape` descarta la edición.
- **Barra lateral:** botón de Tabler Icons a la izquierda de «Opener», muestra/oculta las miniaturas. Clic en una miniatura para ir a esa página; la activa se resalta automáticamente.
- **Miniaturas:** se renderizan de forma progresiva cuando entran en el área visible del panel, para reducir el trabajo inicial.
- **Ajustar:** alterna ancho ↔ alto del espacio visible de **#scroller**. Al ocultar o mostrar la barra lateral el zoom se recalcula automáticamente si el ajuste está activado.
- **Zoom manual:** `+`, `−` o escribir un porcentaje desactiva el reajuste automático hasta volver a pulsar «Ajustar».
- **Iconos:** exclusivamente SVG locales originales de `@tabler/icons`.

## Estructura

```text
src/
├── extension.ts
├── opener.ts
├── formats/pdf.ts
├── styles/pdf.css
└── webview/pdf.ts
scripts/build.mjs
.vscode/{launch,tasks}.json
```

El build genera `dist/extension.js` y `dist/webview/{pdf.js,pdf.css,pdf.worker.min.mjs,icons/*}`. La dependencia PDF.js y el worker se sirven localmente; los documentos no se envían a un servidor externo.

## Nota

Este MVP sigue renderizando todas las páginas principales de forma secuencial; las miniaturas sí se generan bajo demanda. En PDFs muy extensos, el renderizado principal puede tardar y es una mejora pendiente. También quedan pendientes texto seleccionable, búsqueda y enlaces PDF.

Si faltan recursos en Code OSS, comprobá `ls dist/webview/` y usá `Developer: Open Webview Developer Tools` para ver errores de carga.
