import * as vscode from 'vscode'

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }

  return value.replace(/[&<>"']/g, char => entities[char])
}

function icon(name: string): string {
  return `<span class="icon icon-${name}" aria-hidden="true"></span>`
}

export function createPdfHtml(
  webview: vscode.Webview,
  mediaRoot: vscode.Uri,
  fileUri: vscode.Uri
): string {
  const resource = (file: string): string =>
    escapeHtml(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, file)).toString())

  const pdfUri = escapeHtml(webview.asWebviewUri(fileUri).toString())
  const workerUri = resource('pdf.worker.min.mjs')
  const scriptUri = resource('pdf.js')
  const cssUri = resource('pdf.css')

  const csp = [
    "default-src 'none'",
    `script-src ${webview.cspSource}`,
    `style-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} blob: data:`,
    `font-src ${webview.cspSource} blob: data:`,
    'worker-src blob:'
  ].join('; ')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <link rel="stylesheet" href="${cssUri}">
  <title>Opener</title>
</head>
<body data-pdf-uri="${pdfUri}" data-worker-uri="${workerUri}">
  <header class="toolbar" role="toolbar" aria-label="Controles PDF">
    <button id="toggle-sidebar" type="button" title="Ocultar miniaturas" aria-label="Ocultar miniaturas" aria-expanded="true" aria-controls="sidebar">${icon('layout-sidebar-left-collapse')}</button>
    <span class="brand">Opener</span>
    <span class="separator" aria-hidden="true"></span>
    <div class="tool-group">
      <button id="previous" type="button" title="Página anterior" aria-label="Página anterior">${icon('chevron-left')}</button>
      <input id="page" type="number" min="1" value="1" aria-label="Página actual">
      <span id="total">/ …</span>
      <button id="next" type="button" title="Página siguiente" aria-label="Página siguiente">${icon('chevron-right')}</button>
    </div>
    <span class="separator" aria-hidden="true"></span>
    <div class="tool-group">
      <button id="zoom-out" type="button" title="Alejar" aria-label="Alejar">${icon('minus')}</button>
      <input id="zoom" class="zoom-input" type="text" inputmode="decimal" value="100%" aria-label="Porcentaje de zoom" title="Escribir porcentaje de zoom y presionar Enter" autocomplete="off" spellcheck="false">
      <button id="zoom-in" type="button" title="Acercar" aria-label="Acercar">${icon('plus')}</button>
    </div>
    <div class="tool-group">
      <button id="fit" type="button" class="fit-button" title="Cambiar a ajuste al alto" aria-label="Ajuste: ancho; cambiar a alto" aria-pressed="true">
        <span id="fit-icon" class="icon icon-arrows-horizontal" aria-hidden="true"></span>
        <span id="fit-label">Ancho</span>
      </button>
      <button id="rotate" type="button" title="Rotar 90°" aria-label="Rotar 90 grados">${icon('rotate-clockwise')}</button>
    </div>
  </header>
  <div id="viewer" class="viewer">
    <aside id="sidebar" class="sidebar" aria-label="Miniaturas de páginas">
      <div class="sidebar-heading">Páginas</div>
      <nav id="thumbnails" class="thumbnails" aria-label="Ir a una página"></nav>
    </aside>
    <main id="scroller" aria-label="Documento PDF">
      <div id="pages"></div>
      <div id="status" role="status">Cargando PDF…</div>
    </main>
  </div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`
}
