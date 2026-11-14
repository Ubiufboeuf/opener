import * as vscode from 'vscode'
import { createPdfHtml } from './formats/pdf'

export class OpenerProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose() {} }
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel
  ): void {
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const documentFolder = vscode.Uri.joinPath(document.uri, '..')

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot, documentFolder]
    }

    panel.webview.html = createPdfHtml(
      panel.webview,
      mediaRoot,
      document.uri
    )
  }
}
