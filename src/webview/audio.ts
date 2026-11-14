export {}

interface AudioMetadataMessage {
  type: 'metadata'
  title: string
  artist: string | null
  album: string | null
  duration: number | null
  cover: string | null
}

interface FallbackReadyMessage {
  type: 'fallback-ready'
  uri: string
}

interface FallbackErrorMessage {
  type: 'fallback-error'
  message: string
}

type HostMessage = AudioMetadataMessage | FallbackReadyMessage | FallbackErrorMessage

declare const acquireVsCodeApi: () => {
  postMessage(message: { type: 'ready' | 'fallback' }): void
}

const vscode = acquireVsCodeApi()
const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element: ${id}`)
  return element as T
}

const media = get<HTMLAudioElement>('media')
const artwork = get<HTMLDivElement>('artwork')
const cover = get<HTMLImageElement>('cover')
const placeholder = get<HTMLElement>('artwork-placeholder')
const title = get<HTMLHeadingElement>('title')
const artist = get<HTMLParagraphElement>('artist')
const album = get<HTMLParagraphElement>('album')
const progress = get<HTMLInputElement>('progress')
const currentTime = get<HTMLSpanElement>('current-time')
const duration = get<HTMLSpanElement>('duration')
const play = get<HTMLButtonElement>('play')
const backward = get<HTMLButtonElement>('backward')
const forward = get<HTMLButtonElement>('forward')
const mute = get<HTMLButtonElement>('mute')
const volume = get<HTMLInputElement>('volume')
const speed = get<HTMLSelectElement>('speed')
const status = get<HTMLParagraphElement>('status')

let fallbackRequested = false
let usingFallback = false
let knownDuration: number | null = null

const icons = {
  play: '<span class="icon icon-player-play" aria-hidden="true"></span>',
  pause: '<span class="icon icon-player-pause" aria-hidden="true"></span>',
  volume: '<span class="icon icon-volume" aria-hidden="true"></span>',
  muted: '<span class="icon icon-volume-off" aria-hidden="true"></span>'
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

function setStatus(message: string): void {
  status.textContent = message
  status.hidden = !message
}

function getDuration(): number {
  return Number.isFinite(media.duration) ? media.duration : knownDuration ?? 0
}

function updateProgress(): void {
  const total = getDuration()
  currentTime.textContent = formatTime(media.currentTime)
  duration.textContent = formatTime(total)
  progress.value = total > 0 ? String(Math.round(media.currentTime / total * 1000)) : '0'
  progress.style.setProperty('--progress', `${Number(progress.value) / 10}%`)
}

function updatePlayButton(): void {
  const playing = !media.paused && !media.ended
  play.innerHTML = playing ? icons.pause : icons.play
  play.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir')
  play.title = playing ? 'Pausar' : 'Reproducir'
}

function updateVolume(): void {
  const silent = media.muted || media.volume === 0
  mute.innerHTML = silent ? icons.muted : icons.volume
  mute.title = silent ? 'Activar sonido' : 'Silenciar'
  mute.setAttribute('aria-label', mute.title)
  volume.value = String(Math.round(media.volume * 100))
  volume.style.setProperty('--progress', `${Number(volume.value)}%`)
}

function requestFallback(): void {
  if (fallbackRequested || usingFallback) {
    if (usingFallback) setStatus('Este archivo no pudo reproducirse, incluso después de convertirlo.')
    return
  }
  fallbackRequested = true
  setStatus('El códec no es compatible. Convirtiendo con FFmpeg…')
  vscode.postMessage({ type: 'fallback' })
}

play.addEventListener('click', () => {
  if (media.paused) {
    void media.play().catch(() => {
      // The error event handles unsupported codecs; keep other playback errors visible.
      if (media.error) requestFallback()
      else setStatus('No se pudo iniciar la reproducción.')
    })
  } else {
    media.pause()
  }
})

backward.addEventListener('click', () => {
  media.currentTime = Math.max(0, media.currentTime - 10)
})

forward.addEventListener('click', () => {
  media.currentTime = Math.min(getDuration() || Infinity, media.currentTime + 10)
})

progress.addEventListener('input', () => {
  const total = getDuration()
  if (total > 0) media.currentTime = total * Number(progress.value) / 1000
  updateProgress()
})

mute.addEventListener('click', () => {
  media.muted = !media.muted
  updateVolume()
})

volume.addEventListener('input', () => {
  media.volume = Number(volume.value) / 100
  media.muted = false
  updateVolume()
})

speed.addEventListener('change', () => {
  media.playbackRate = Number(speed.value)
})

media.addEventListener('loadedmetadata', () => {
  setStatus('')
  updateProgress()
})
media.addEventListener('timeupdate', updateProgress)
media.addEventListener('durationchange', updateProgress)
media.addEventListener('play', updatePlayButton)
media.addEventListener('pause', updatePlayButton)
media.addEventListener('ended', updatePlayButton)
media.addEventListener('volumechange', updateVolume)
media.addEventListener('error', requestFallback)

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (message.type === 'metadata') {
    title.textContent = message.title
    title.title = message.title
    artist.textContent = message.artist ?? ''
    artist.hidden = !message.artist
    album.textContent = message.album ?? ''
    album.hidden = !message.album
    knownDuration = message.duration
    updateProgress()

    if (message.cover && /^data:image\/(?:jpeg|jpg|png|gif|webp);base64,/i.test(message.cover)) {
      cover.src = message.cover
      cover.hidden = false
      placeholder.hidden = true
      artwork.classList.add('has-cover')
      cover.onerror = () => {
        cover.hidden = true
        placeholder.hidden = false
        artwork.classList.remove('has-cover')
      }
    }
  }

  if (message.type === 'fallback-ready') {
    usingFallback = true
    fallbackRequested = false
    setStatus('')
    media.src = message.uri
    media.load()
    updateProgress()
  }

  if (message.type === 'fallback-error') setStatus(message.message)
})

const sourceUri = document.body.dataset.audioUri
const ext = document.body.dataset.extension?.toLowerCase()

if (sourceUri) {
  media.src = sourceUri
  media.load()
  // VS Code Webviews do not include AAC decoding support on all systems.
  if (ext === 'aac' || ext === 'm4a') {
    const mime = ext === 'aac' ? 'audio/aac' : 'audio/mp4'
    if (!media.canPlayType(mime)) requestFallback()
  }
} else {
  setStatus('No se encontró el archivo de audio.')
}

updatePlayButton()
updateVolume()
updateProgress()
vscode.postMessage({ type: 'ready' })
