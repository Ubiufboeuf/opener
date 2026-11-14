import * as vscode from 'vscode'
import { OpenerProvider } from './opener'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'opener.preview',
      new OpenerProvider()
    )
  )
}