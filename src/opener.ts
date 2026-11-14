import * as vscode from 'vscode'
import { extname } from 'node:path'
import { readAudioMetadata } from './audio/metadata'
import { transcodeToMp3, type TranscodedAudio } from './audio/transcode'
import { createAudioHtml } from './formats/audio'
import { createPdfHtml } from './formats/pdf'

const AUDIO_EXTENSIONS = new Set(['.aac', '.m4a', '.mp3', '.wav', '.ogg', '.opus', '.flac'])

interface AudioWebviewMessage {
  type: 'ready' | 'fallback'
}

export class OpenerProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose() {} }
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
    const documentFolder = vscode.Uri.joinPath(document.uri, '..')
    const extension = extname(document.uri.path).toLowerCase()
    const isAudio = AUDIO_EXTENSIONS.has(extension)

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot, documentFolder, this.context.globalStorageUri]
    }

    if (!isAudio) {
      panel.webview.html = createPdfHtml(panel.webview, mediaRoot, document.uri)
      return
    }

    let disposed = false
    let converting = false
    let transcoded: TranscodedAudio | undefined
    const abortController = new AbortController()

    panel.onDidDispose(() => {
      disposed = true
      abortController.abort()
      if (transcoded) void transcoded.dispose()
    })

    panel.webview.onDidReceiveMessage(async (message: AudioWebviewMessage) => {
      if (disposed || !message || typeof message !== 'object') return

      if (message.type === 'ready') {
        const details = await readAudioMetadata(document.uri)
        if (!disposed) await panel.webview.postMessage(details)
        return
      }

      if (message.type !== 'fallback' || converting || transcoded) return
      converting = true

      try {
        transcoded = await transcodeToMp3(
          document.uri,
          this.context.globalStorageUri,
          abortController.signal
        )
        if (disposed) {
          await transcoded.dispose()
          return
        }
        await panel.webview.postMessage({
          type: 'fallback-ready',
          uri: panel.webview.asWebviewUri(transcoded.uri).toString()
        })
      } catch (error) {
        if (disposed) return
        const message = error instanceof Error && 'code' in error && error.code === 'ENOENT'
          ? 'Este códec no está soportado por el visor. Instalá FFmpeg para convertirlo automáticamente.'
          : `No se pudo reproducir ni convertir el audio: ${error instanceof Error ? error.message : String(error)}`
        await panel.webview.postMessage({ type: 'fallback-error', message })
      } finally {
        converting = false
      }
    })

    panel.webview.html = createAudioHtml(panel.webview, mediaRoot, document.uri)
  }
}
