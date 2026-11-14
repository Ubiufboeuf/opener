import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import * as vscode from 'vscode'

export interface TranscodedAudio {
  uri: vscode.Uri
  dispose(): Promise<void>
}

/**
 * Fallback for formats/codecs unsupported by Chromium Webviews (notably AAC).
 * Uses the user's FFmpeg installation, never downloads anything.
 */
export async function transcodeToMp3(
  source: vscode.Uri,
  storage: vscode.Uri,
  signal: AbortSignal
): Promise<TranscodedAudio> {
  if (source.scheme !== 'file' || storage.scheme !== 'file') {
    throw new Error('La conversión requiere un archivo local.')
  }

  await vscode.workspace.fs.createDirectory(storage)
  const uri = vscode.Uri.joinPath(storage, `opener-${randomUUID()}.mp3`)

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-i', source.fsPath,
        '-map', '0:a:0', '-vn',
        '-codec:a', 'libmp3lame', '-b:a', '160k',
        uri.fsPath
      ], { windowsHide: true, signal })

      let errorOutput = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        errorOutput = (errorOutput + chunk).slice(-2048)
      })
      child.once('error', reject)
      child.once('close', code => {
        if (code === 0) resolve()
        else reject(new Error(errorOutput.trim() || `FFmpeg terminó con código ${code}.`))
      })
    })

    return {
      uri,
      dispose: () => rm(uri.fsPath, { force: true })
    }
  } catch (error) {
    await rm(uri.fsPath, { force: true }).catch(() => undefined)
    throw error
  }
}
