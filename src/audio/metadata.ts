import * as vscode from 'vscode'
import { parseFile, selectCover } from 'music-metadata'

export interface AudioMetadata {
  type: 'metadata'
  title: string
  artist: string | null
  album: string | null
  duration: number | null
  cover: string | null
}

const MAX_COVER_BYTES = 6 * 1024 * 1024

export async function readAudioMetadata(uri: vscode.Uri): Promise<AudioMetadata> {
  const name = (uri.path.split('/').pop() ?? 'Audio')
  const fallback: AudioMetadata = {
    type: 'metadata',
    title: name.replace(/\.[^./]+$/, ''),
    artist: null,
    album: null,
    duration: null,
    cover: null
  }

  // parseFile reads only the necessary parts of the file, without copying the entire track.
  if (uri.scheme !== 'file') return fallback

  try {
    const metadata = await parseFile(uri.fsPath)
    const picture = selectCover(metadata.common.picture)

    let cover: string | null = null
    if (picture && picture.data.byteLength <= MAX_COVER_BYTES) {
      const mime = /^image\/(?:png|jpeg|jpg|gif|webp)$/i.test(picture.format)
        ? picture.format
        : 'image/jpeg'
      cover = `data:${mime};base64,${Buffer.from(picture.data).toString('base64')}`
    }

    return {
      type: 'metadata',
      title: metadata.common.title || fallback.title,
      artist: metadata.common.artist || null,
      album: metadata.common.album || null,
      duration: Number.isFinite(metadata.format.duration) ? metadata.format.duration ?? null : null,
      cover
    }
  } catch (error) {
    console.warn('[Opener] No se pudieron leer los metadatos:', error)
    return fallback
  }
}
