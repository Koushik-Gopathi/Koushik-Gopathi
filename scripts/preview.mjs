// Renders README.md through GitHub's own Markdown renderer and writes
// preview.html: the profile side by side in dark and light, before anything
// is pushed. Serve the repo folder (python -m http.server) and open it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const res = await fetch('https://api.github.com/markdown', {
  method: 'POST',
  headers: { 'User-Agent': 'profile-preview', Accept: 'text/html' },
  body: JSON.stringify({ text: md, mode: 'markdown' }),
})
if (!res.ok) throw new Error(`markdown API: ${res.status}`)
const html = await res.text()

// A browser picks <source> by the OS theme; force each column to its own.
const forTheme = mode => html
  .replace(/<source[^>]*>/g, '')
  .replace(/(assets\/[\w-]+)-dark\.svg/g, `$1-${mode}.svg`)
  .replace(/output\/snake-dark/g, `output/snake-${mode}`)

const col = mode => `<div class="col ${mode}"><article class="markdown-body box">${forTheme(mode)}</article></div>`
fs.writeFileSync(path.join(ROOT, 'preview.html'), `<!doctype html><meta charset="utf-8"><title>Profile preview</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-dark.css">
<style>
body{margin:0;display:flex;flex-wrap:wrap}
.col{flex:1 1 700px;padding:24px;min-width:0}
.dark{background:#0d1117}.light{background:#fff}
.box{max-width:880px;margin:auto;padding:24px;border-radius:6px;border:1px solid #30363d}
.light .box{border-color:#d0d7de;color:#1f2328;background:#fff;--fgColor-default:#1f2328;--bgColor-default:#fff;--borderColor-default:#d0d7de;--borderColor-muted:#d1d9e0;--bgColor-muted:#f6f8fa;--fgColor-accent:#0969da}
.markdown-body img{max-width:100%}
</style>${col('dark')}${col('light')}`)
console.log('wrote preview.html')
