import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type FitMode = 'width' | 'height'

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`No se encontró el elemento #${id}`)
  return element as T
}

const scroller = get<HTMLElement>('scroller')
const pages = get<HTMLDivElement>('pages')
const status = get<HTMLDivElement>('status')
const pageInput = get<HTMLInputElement>('page')
const totalLabel = get<HTMLSpanElement>('total')
const zoomInput = get<HTMLInputElement>('zoom')
const previousButton = get<HTMLButtonElement>('previous')
const nextButton = get<HTMLButtonElement>('next')
const fitButton = get<HTMLButtonElement>('fit')
const fitLabel = get<HTMLSpanElement>('fit-label')
const fitIcon = get<HTMLSpanElement>('fit-icon')
const sidebar = get<HTMLElement>('sidebar')
const thumbnailList = get<HTMLElement>('thumbnails')
const toggleSidebarButton = get<HTMLButtonElement>('toggle-sidebar')

const pdfUri = document.body.dataset.pdfUri
const workerUri = document.body.dataset.workerUri

let pdf: PDFDocumentProxy | undefined
let zoom = 1
let rotation = 0
let currentPage = 1
let fitMode: FitMode | null = 'width'
let lastFitMode: FitMode = 'width'
let renderVersion = 0
let fitRequestVersion = 0
let activeRender: { cancel(): void; promise: Promise<void> } | undefined
let resizeFrame = 0
let thumbnailGeneration = 0
let thumbnailWorking = false
let thumbnailObserver: IntersectionObserver | undefined
const thumbnailButtons = new Map<number, HTMLButtonElement>()
let thumbnailQueue: Array<{ number: number; generation: number; rotation: number }> = []

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

function showStatus(message: string, error = false): void {
  status.textContent = message
  status.hidden = message.length === 0
  status.classList.toggle('error', error)
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  showStatus(`Error al abrir el PDF: ${message}`, true)
  console.error('Opener:', error)
}

function updateZoomLabel(): void {
  if (document.activeElement !== zoomInput) {
    zoomInput.value = `${Number((zoom * 100).toFixed(1))}%`
  }
}

function updatePageControls(): void {
  if (!pdf) return
  pageInput.value = String(currentPage)
  previousButton.disabled = currentPage === 1
  nextButton.disabled = currentPage === pdf.numPages
  updateThumbnailSelection()
}

function updateFitButton(): void {
  const active = fitMode !== null
  const current = fitMode ?? lastFitMode
  const next = active ? (current === 'width' ? 'height' : 'width') : current

  fitLabel.textContent = !active ? 'Ajustar' : current === 'width' ? 'Ancho' : 'Alto'
  fitIcon.classList.toggle('icon-arrows-horizontal', current === 'width')
  fitIcon.classList.toggle('icon-arrows-vertical', current === 'height')
  fitButton.setAttribute('aria-pressed', String(active))
  fitButton.title = active
    ? `Ajuste actual: ${current === 'width' ? 'ancho' : 'alto'}. Cambiar a ${next === 'width' ? 'ancho' : 'alto'}`
    : `Ajustar al ${next === 'width' ? 'ancho' : 'alto'}`
  fitButton.setAttribute('aria-label', fitButton.title)
}

/** Marca la miniatura activa y la mantiene a la vista sin desplazar el documento. */
function updateThumbnailSelection(): void {
  for (const [number, button] of thumbnailButtons) {
    const selected = number === currentPage
    button.classList.toggle('active', selected)
    if (selected) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }

  if (sidebar.hidden) return
  const button = thumbnailButtons.get(currentPage)
  if (!button) return

  const view = sidebar.getBoundingClientRect()
  const rect = button.getBoundingClientRect()
  if (rect.top < view.top + 36) sidebar.scrollTop -= view.top + 48 - rect.top
  else if (rect.bottom > view.bottom - 8) sidebar.scrollTop += rect.bottom - view.bottom + 18
}

/** Renderiza miniaturas pequeñas solo al entrar en la zona visible del sidebar. */
async function drainThumbnailQueue(): Promise<void> {
  if (thumbnailWorking) return
  thumbnailWorking = true

  try {
    while (thumbnailQueue.length) {
      const item = thumbnailQueue.shift()!
      if (item.generation !== thumbnailGeneration) continue
      const loadedPdf = pdf
      const button = thumbnailButtons.get(item.number)
      if (!loadedPdf || !button) continue

      const page = await loadedPdf.getPage(item.number)
      if (item.generation !== thumbnailGeneration) continue

      const original = page.getViewport({ scale: 1, rotation: item.rotation })
      const scale = Math.min(132 / original.width, 164 / original.height)
      const viewport = page.getViewport({ scale, rotation: item.rotation })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('Canvas 2D no está disponible para miniaturas')

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0]
      }).promise

      if (item.generation !== thumbnailGeneration) continue
      button.querySelector('.thumbnail-preview')?.replaceChildren(canvas)
    }
  } catch (error) {
    console.error('Opener: error generando una miniatura', error)
  } finally {
    thumbnailWorking = false
    if (thumbnailQueue.length) void drainThumbnailQueue()
  }
}

function createThumbnails(): void {
  if (!pdf) return

  ++thumbnailGeneration
  thumbnailQueue = []
  thumbnailObserver?.disconnect()
  thumbnailButtons.clear()
  thumbnailList.replaceChildren()
  const generation = thumbnailGeneration
  const thumbRotation = rotation

  thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      thumbnailObserver?.unobserve(entry.target)
      const number = Number((entry.target as HTMLElement).dataset.page)
      thumbnailQueue.push({ number, generation, rotation: thumbRotation })
    }
    void drainThumbnailQueue()
  }, { root: sidebar, rootMargin: '240px 0px' })

  const fragment = document.createDocumentFragment()
  for (let number = 1; number <= pdf.numPages; number++) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'thumbnail-button'
    button.dataset.page = String(number)
    button.setAttribute('aria-label', `Ir a la página ${number}`)

    const preview = document.createElement('span')
    preview.className = 'thumbnail-preview'
    const label = document.createElement('span')
    label.className = 'thumbnail-number'
    label.textContent = String(number)
    button.append(preview, label)
    button.addEventListener('click', () => jumpToPage(number))
    thumbnailButtons.set(number, button)
    fragment.append(button)
  }
  thumbnailList.append(fragment)
  updateThumbnailSelection()
  for (const button of thumbnailButtons.values()) thumbnailObserver.observe(button)
}

function setSidebarVisible(visible: boolean): void {
  sidebar.hidden = !visible
  toggleSidebarButton.setAttribute('aria-expanded', String(visible))
  const icon = toggleSidebarButton.querySelector('.icon')
  icon?.classList.toggle('icon-layout-sidebar-left-collapse', visible)
  icon?.classList.toggle('icon-layout-sidebar-left-expand', !visible)
  toggleSidebarButton.title = visible ? 'Ocultar miniaturas' : 'Mostrar miniaturas'
  toggleSidebarButton.setAttribute('aria-label', toggleSidebarButton.title)
  if (visible) updateThumbnailSelection()
  // El ResizeObserver de #scroller aplica el ajuste al área restante.
}

function jumpToPage(number: number, smooth = true): void {
  if (!pdf) return

  currentPage = clamp(Math.trunc(number), 1, pdf.numPages)
  updatePageControls()

  const section = pages.querySelector<HTMLElement>(`[data-page="${currentPage}"]`)
  if (!section) return

  // Coordenadas del contenido desplazable, sin depender del offsetParent.
  const offset = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  const top = scroller.scrollTop + offset - 18
  scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' })
}

function updateCurrentPage(): void {
  if (!pdf) return

  const viewport = scroller.getBoundingClientRect()
  let candidate = currentPage
  let mostVisible = 0

  for (const section of pages.querySelectorAll<HTMLElement>('.pdf-page')) {
    const rect = section.getBoundingClientRect()
    const visible = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top))
    if (visible > mostVisible) {
      mostVisible = visible
      candidate = Number(section.dataset.page)
    }
  }

  if (mostVisible > 0 && candidate !== currentPage) {
    currentPage = candidate
    updatePageControls()
  }
}

async function renderPages(focusPage = currentPage): Promise<void> {
  if (!pdf) return

  const version = ++renderVersion
  activeRender?.cancel()
  activeRender = undefined
  pages.replaceChildren()
  showStatus('Renderizando páginas…')

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    if (version !== renderVersion) return

    const viewport = page.getViewport({ scale: zoom, rotation })
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

    const section = document.createElement('section')
    section.className = 'pdf-page'
    section.dataset.page = String(number)
    section.setAttribute('aria-label', `Página ${number}`)

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width * pixelRatio)
    canvas.height = Math.ceil(viewport.height * pixelRatio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    section.append(canvas)
    pages.append(section)

    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas 2D no está disponible')

    activeRender = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
    })

    try {
      await activeRender.promise
    } catch (error) {
      if (version !== renderVersion) return // Render anterior cancelado por un cambio de zoom.
      throw error
    }

    if (version !== renderVersion) return
    activeRender = undefined
    page.cleanup()
  }

  if (version !== renderVersion) return
  showStatus('')
  jumpToPage(focusPage, false)
}

function rerender(): void {
  void renderPages(currentPage).catch(showError)
}

function setManualZoom(value: number): void {
  if (!pdf) return

  // Los botones de zoom manual desactivan el reajuste automático.
  fitMode = null
  ++fitRequestVersion
  updateFitButton()

  const nextZoom = clamp(Math.round(value * 1000) / 1000, 0.10, 6)
  if (Math.abs(nextZoom - zoom) < 0.0001) {
    updateZoomLabel()
    return
  }

  zoom = nextZoom
  updateZoomLabel()
  rerender()
}

function contentPadding(element: HTMLElement, axis: 'horizontal' | 'vertical'): number {
  const style = getComputedStyle(element)
  const names = axis === 'horizontal'
    ? [style.paddingLeft, style.paddingRight]
    : [style.paddingTop, style.paddingBottom]

  return names.reduce((sum, value) => sum + (parseFloat(value) || 0), 0)
}

async function calculateFitZoom(mode: FitMode): Promise<number> {
  if (!pdf) return zoom

  const page = await pdf.getPage(currentPage)
  const viewport = page.getViewport({ scale: 1, rotation })

  // `clientWidth`/`clientHeight` corresponden a la región visible del visor.
  // La barra de herramientas y paneles de Code OSS quedan FUERA de #scroller.
  const availableWidth = Math.max(1, scroller.clientWidth - contentPadding(pages, 'horizontal'))
  const availableHeight = Math.max(1, scroller.clientHeight - contentPadding(pages, 'vertical'))

  return clamp(
    mode === 'width' ? availableWidth / viewport.width : availableHeight / viewport.height,
    0.05,
    6
  )
}

async function applyFit(force = false): Promise<void> {
  if (!pdf || !fitMode) return

  const mode = fitMode
  const version = ++fitRequestVersion
  const nextZoom = await calculateFitZoom(mode)
  if (version !== fitRequestVersion || fitMode !== mode) return

  if (!force && Math.abs(nextZoom - zoom) < 0.001) return

  zoom = nextZoom
  updateZoomLabel()
  rerender()
}

toggleSidebarButton.addEventListener('click', () => setSidebarVisible(!sidebar.hidden))

let skipZoomCommit = false
zoomInput.addEventListener('focus', () => zoomInput.select())
zoomInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault()
    zoomInput.blur() // El blur confirma el valor.
  } else if (event.key === 'Escape') {
    event.preventDefault()
    skipZoomCommit = true
    zoomInput.blur()
  }
})
zoomInput.addEventListener('blur', () => {
  if (skipZoomCommit) {
    skipZoomCommit = false
    updateZoomLabel()
    return
  }

  const value = zoomInput.value.trim().replace(',', '.')
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(value)
  if (!match) {
    updateZoomLabel()
    return
  }

  const percent = Number(match[1])
  if (!Number.isFinite(percent) || percent <= 0) {
    updateZoomLabel()
    return
  }
  setManualZoom(percent / 100)
  updateZoomLabel()
})

previousButton.addEventListener('click', () => jumpToPage(currentPage - 1))
nextButton.addEventListener('click', () => jumpToPage(currentPage + 1))
get<HTMLButtonElement>('zoom-in').addEventListener('click', () => setManualZoom(zoom + 0.15))
get<HTMLButtonElement>('zoom-out').addEventListener('click', () => setManualZoom(zoom - 0.15))

fitButton.addEventListener('click', () => {
  fitMode = fitMode === 'width' ? 'height' : fitMode === 'height' ? 'width' : lastFitMode
  lastFitMode = fitMode
  updateFitButton()
  void applyFit(true).catch(showError)
})

get<HTMLButtonElement>('rotate').addEventListener('click', () => {
  rotation = (rotation + 90) % 360
  createThumbnails()
  if (fitMode) {
    void applyFit(true).catch(showError)
  } else {
    rerender()
  }
})

pageInput.addEventListener('change', () => jumpToPage(Number(pageInput.value) || 1))
pageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    jumpToPage(Number(pageInput.value) || 1)
    pageInput.blur()
  }
})

let scrollScheduled = false
scroller.addEventListener('scroll', () => {
  if (scrollScheduled) return
  scrollScheduled = true
  requestAnimationFrame(() => {
    scrollScheduled = false
    updateCurrentPage()
  })
})

// Si se redimensiona el editor o se abre/cierra una barra lateral, se reajusta.
const observer = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (fitMode) void applyFit().catch(showError)
  })
})

async function start(): Promise<void> {
  if (!pdfUri || !workerUri) throw new Error('Faltan las rutas del visor PDF')

  const workerResponse = await fetch(workerUri)
  if (!workerResponse.ok) throw new Error(`Worker PDF.js: HTTP ${workerResponse.status}`)

  // Webview/CSP: worker local cargado a través de blob:.
  const workerBlobUrl = URL.createObjectURL(await workerResponse.blob())
  const worker = new Worker(workerBlobUrl, { type: 'module' })
  GlobalWorkerOptions.workerPort = worker

  window.addEventListener('beforeunload', () => {
    ++renderVersion
    ++fitRequestVersion
    cancelAnimationFrame(resizeFrame)
    observer.disconnect()
    thumbnailObserver?.disconnect()
    thumbnailQueue = []
    ++thumbnailGeneration
    activeRender?.cancel()
    void pdf?.cleanup()
    worker.terminate()
    URL.revokeObjectURL(workerBlobUrl)
  }, { once: true })

  const pdfResponse = await fetch(pdfUri)
  if (!pdfResponse.ok) throw new Error(`Archivo PDF: HTTP ${pdfResponse.status}`)
  const data = new Uint8Array(await pdfResponse.arrayBuffer())

  pdf = await getDocument({ data }).promise
  totalLabel.textContent = `/ ${pdf.numPages}`
  pageInput.max = String(pdf.numPages)
  updatePageControls()

  // El primer ajuste calcula la escala con las dimensiones reales de #scroller.
  zoom = await calculateFitZoom(fitMode ?? lastFitMode)
  updateZoomLabel()
  updateFitButton()
  await renderPages(1)
  createThumbnails()

  observer.observe(scroller)
}

void start().catch(showError)
