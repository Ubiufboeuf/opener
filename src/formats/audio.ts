import * as vscode from 'vscode'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] ?? char)
}

function icon(name: string): string {
  return `<span class="icon icon-${name}" aria-hidden="true"></span>`
}

export function createAudioHtml(
  webview: vscode.Webview,
  mediaRoot: vscode.Uri,
  fileUri: vscode.Uri
): string {
  const resource = (file: string): string =>
    escapeHtml(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, file)).toString())

  const audioUri = escapeHtml(webview.asWebviewUri(fileUri).toString())
  const filename = escapeHtml((fileUri.path.split('/').pop() ?? 'Audio'))
  const extension = escapeHtml(fileUri.path.split('.').pop()?.toLowerCase() ?? '')

  const csp = [
    "default-src 'none'",
    `script-src ${webview.cspSource}`,
    `style-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data: blob:`,
    `media-src ${webview.cspSource} blob:`,
    `font-src ${webview.cspSource}`
  ].join('; ')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <link rel="stylesheet" href="${resource('audio.css')}">
  <title>Opener Audio</title>
</head>
<body data-audio-uri="${audioUri}" data-extension="${extension}">
  <header class="toolbar"><span class="brand">Opener</span><span class="toolbar-label">Audio</span></header>
  <main class="player-shell" aria-label="Reproductor de audio">
    <section class="player-card">
      <div class="artwork" id="artwork">
        <span id="artwork-placeholder" class="artwork-placeholder">${icon('music')}</span>
        <img id="cover" alt="Carátula del álbum" hidden>
      </div>
      <div class="metadata">
        <h1 id="title" title="${filename}">${filename}</h1>
        <p id="artist" class="artist" hidden></p>
        <p id="album" class="album" hidden></p>
      </div>
      <div class="timeline">
        <input id="progress" type="range" min="0" max="1000" value="0" step="1" aria-label="Posición de reproducción">
        <div class="time-row"><span id="current-time">0:00</span><span id="duration">0:00</span></div>
      </div>
      <div class="controls">
        <button id="backward" type="button" title="Retroceder 10 segundos" aria-label="Retroceder 10 segundos"><span class="skip">-10</span></button>
        <button id="play" class="play" type="button" title="Reproducir" aria-label="Reproducir">${icon('player-play')}</button>
        <button id="forward" type="button" title="Avanzar 10 segundos" aria-label="Avanzar 10 segundos"><span class="skip">+10</span></button>
      </div>
      <div class="bottom-controls">
        <div class="volume-group">
          <button id="mute" type="button" title="Silenciar" aria-label="Silenciar">${icon('volume')}</button>
          <input id="volume" type="range" min="0" max="100" value="100" aria-label="Volumen">
        </div>
        <label class="speed-group" for="speed">Velocidad
          <select id="speed" aria-label="Velocidad de reproducción">
            <option value="0.75">0.75×</option>
            <option value="1" selected>1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      <p id="status" role="status" aria-live="polite"></p>
    </section>
  </main>
  <audio id="media" preload="metadata"></audio>
  <script type="module" src="${resource('audio.js')}"></script>
</body>
</html>`
}
