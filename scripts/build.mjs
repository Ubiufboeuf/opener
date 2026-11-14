import { execFileSync } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const output = join('dist', 'webview')
const iconsDirectory = join(output, 'icons')

const icons = [
  // PDF
  'layout-sidebar-left-collapse',
  'layout-sidebar-left-expand',
  'chevron-left',
  'chevron-right',
  'minus',
  'plus',
  'arrows-horizontal',
  'arrows-vertical',
  'rotate-clockwise',
  // Audio
  'music',
  'player-play',
  'player-pause',
  'volume',
  'volume-off'
]

function build(...args) {
  execFileSync('bun', ['build', ...args], { stdio: 'inherit' })
}

build('src/extension.ts', '--target=node', '--format=cjs', '--external', 'vscode', '--outdir', 'dist')
build('src/webview/pdf.ts', '--target=browser', '--format=esm', '--outdir', output)
build('src/webview/audio.ts', '--target=browser', '--format=esm', '--outdir', output)

await mkdir(iconsDirectory, { recursive: true })
await Promise.all([
  copyFile('src/styles/pdf.css', join(output, 'pdf.css')),
  copyFile('src/styles/audio.css', join(output, 'audio.css')),
  copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', join(output, 'pdf.worker.min.mjs')),
  ...icons.map(name => copyFile(
    join('node_modules', '@tabler', 'icons', 'icons', 'outline', `${name}.svg`),
    join(iconsDirectory, `${name}.svg`)
  ))
])

console.log(`\nOpener listo: PDF + Audio (${icons.length} iconos Tabler)`)
