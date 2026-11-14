
import * as vscode from 'vscode'

export class OpenerProvider implements vscode.CustomReadonlyEditorProvider {
  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return {
      uri,
      dispose() {}
    }
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel
  ): void {
    panel.webview.options = {
      enableScripts: true
    }

    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Opener</title>
        </head>
        <body>
          <h2>Opener</h2>
          <p>File: ${this.escapeHtml(document.uri.path)}</p>
        </body>
      </html>
    `
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }

      return entities[char] ?? ''
    })
  }
}
