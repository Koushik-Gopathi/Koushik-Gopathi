// Builds every SVG on the profile, in a dark and a light version.
//
//   node scripts/build.mjs
//
// No dependencies. Live numbers (stars, forks, languages, contributions) come
// from GitHub when this runs; the refresh workflow runs it daily, so the files
// in assets/ are always static and nothing on the page depends on someone
// else's server being up. GITHUB_TOKEN is optional: it only lifts rate limits.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const OUT = path.join(ROOT, 'assets')
const USER = process.env.PROFILE_USER || 'Koushik-Gopathi'
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))
const FONTS = read('scripts/fonts.json')
const METRICS = read('scripts/metrics.json')
fs.mkdirSync(OUT, { recursive: true })

/* ------------------------------------------------------------------ TOKENS */
// One accent, used everywhere: the portfolio's signal red.
const RED = '#eb1926'
const THEMES = {
  dark: {
    fg: '#e6edf3', sub: '#8b949e', faint: 'rgba(240,246,252,.08)', line: '#30363d',
    card: '#0d1117', ring: 'rgba(240,246,252,.10)',
    levels: ['#161b22', '#4d1115', '#85141b', '#c01822', RED],
  },
  light: {
    fg: '#1f2328', sub: '#59636e', faint: 'rgba(31,35,40,.09)', line: '#d0d7de',
    card: '#ffffff', ring: 'rgba(31,35,40,.10)',
    levels: ['#ebedf0', '#fcd5d8', '#f79aa0', '#ef5a64', RED],
  },
}
const LANG_COLORS = { Dart: '#00B4AB', TypeScript: '#3178c6', Python: '#3572A5', JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#663399', 'C++': '#f34b7d' }
// Flutter scaffolds C++/CMake/Swift/Kotlin runners into every app. Counting
// them would claim languages that were generated, not written.
const LANG_EXCLUDE = new Set(['Shell', 'Makefile', 'Dockerfile', 'Batchfile', 'Procfile', 'PowerShell', 'CMake', 'C', 'C++', 'Swift', 'Objective-C', 'Kotlin', 'Ruby'])

/* ------------------------------------------------------------------- UTILS */
const FAM = { display: 'D', label: 'L', body: 'B', hand: 'H' }
const FALLBACK = { display: "'Arial Black',Helvetica,sans-serif", label: 'Helvetica,Arial,sans-serif', body: 'Helvetica,Arial,sans-serif', hand: "'Segoe Print',cursive" }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r1 = n => Math.round(n * 10) / 10
const fmt = n => n >= 1000 ? r1(n / 1000) + 'k' : String(n)

function measure(str, font, size, ls = 0) {
  const m = METRICS[font]
  let w = 0
  for (const ch of str) w += (m.w[ch] ?? m.w[' '] ?? 500) / m.upm * size
  return w + ls * Math.max(0, [...str].length - 1)
}
const text = (str, font, size, x, y, { fill, ls = 0, anchor = 'start', cls = '', delay, extra = '' } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}" class="${FAM[font]}${cls ? ' ' + cls : ''}" font-size="${size}" fill="${fill}"${ls ? ` letter-spacing="${ls}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${delay != null ? ` style="animation-delay:${r1(delay * 100) / 100}s"` : ''}${extra}>${esc(str)}</text>`

// Greedy word wrap against the real glyph widths.
function wrap(str, font, size, width, maxLines) {
  const lines = []
  let cur = ''
  for (const word of str.split(' ')) {
    const next = cur ? cur + ' ' + word : word
    if (measure(next, font, size) > width && cur) { lines.push(cur); cur = word } else cur = next
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[ ,.;:]*\S*$/, '…') }
  return lines
}

const MOTION = `
.up{animation:up .8s cubic-bezier(.2,.8,.2,1) both}
.fade{animation:fade .9s ease both}
.draw{stroke-dasharray:1;animation:draw 1.1s cubic-bezier(.6,0,.2,1) both}
@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`

function svg(w, h, body, { fonts = [], css = '', title }) {
  const faces = fonts.map(f => `@font-face{font-family:${FAM[f]};src:url(data:font/woff2;base64,${FONTS[f]}) format('woff2')}.${FAM[f]}{font-family:${FAM[f]},${FALLBACK[f]}}`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><style>${faces}${MOTION}${css}</style>${body}</svg>`
}
function write(name, build) {
  for (const [mode, t] of Object.entries(THEMES)) {
    const s = build(t, mode)
    fs.writeFileSync(path.join(OUT, `${name}-${mode}.svg`), s)
    if (mode === 'dark') console.log(`${name}`.padEnd(22), (s.length / 1024).toFixed(1).padStart(6), 'KB')
  }
}

/* -------------------------------------------------------------------- DATA */
async function gh(p) {
  const headers = { 'User-Agent': USER, Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com${p}`, { headers })
  if (!res.ok) throw new Error(`GitHub ${p}: ${res.status} ${await res.text()}`)
  return res.json()
}

// The public contribution calendar, the same one on the profile page. No token needed.
async function contributions() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { 'User-Agent': USER } })
  if (!res.ok) throw new Error(`contributions: ${res.status}`)
  const html = await res.text()
  const counts = {}
  for (const m of html.matchAll(/for="(contribution-day-component-\d+-\d+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = m[2].match(/^(\d[\d,]*) contribution/)
    counts[m[1]] = n ? Number(n[1].replace(/,/g, '')) : 0
  }
  const days = []
  for (const m of html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})" id="(contribution-day-component-(\d+)-(\d+))" data-level="(\d)"/g)) {
    days.push({ date: m[1], dow: +m[3], week: +m[4], level: +m[5], count: counts[m[2]] ?? 0 })
  }
  if (!days.length) throw new Error('contributions: calendar markup not found')
  return days.sort((a, b) => a.date.localeCompare(b.date))
}

function streaks(days) {
  let longest = 0, run = 0
  for (const d of days) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run) }
  // Today not being done yet should not break a live streak.
  let current = 0
  const rev = [...days].reverse()
  if (rev.length && rev[0].count === 0) rev.shift()
  for (const d of rev) { if (!d.count) break; current++ }
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0])
  return { total: days.reduce((s, d) => s + d.count, 0), active: days.filter(d => d.count).length, current, longest, busiest }
}

/* -------------------------------------------------------------- NAME BOARD */
function nameBoard(t) {
  const { cols, rows, grid, text: lines } = read('data/name-grid.json')
  const cell = 9, W = 1100, bx = (W - cols * cell) / 2, by = 46, H = by + rows * cell + 22
  const maxR = cell * 0.46
  let dots = ''
  grid.forEach((row, r) => {
    let g = ''
    row.forEach((v, c) => { if (v > 0.08) g += `<circle cx="${r1(bx + c * cell + cell / 2)}" cy="${r1(by + r * cell + cell / 2)}" r="${r1(Math.max(1.2, maxR * Math.sqrt(v)))}"/>` })
    if (g) dots += `<g class="row" style="animation-delay:${(r / rows * 2.5).toFixed(2)}s">${g}</g>`
  })
  const body = `<defs>
<pattern id="off" x="${bx}" y="${by}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse"><circle cx="${cell / 2}" cy="${cell / 2}" r="1.1" fill="${t.faint}"/></pattern>
<linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="lit"><use href="#dots"/></clipPath></defs>
${text('DEVELOPER  /  DESIGNER', 'label', 13, bx + 4, 24, { fill: t.sub, ls: 3, cls: 'up', delay: 0.1 })}
${text('PORTFOLIO  —  2026', 'label', 13, W - bx - 4, 24, { fill: t.sub, ls: 3, anchor: 'end', cls: 'up', delay: 0.2 })}
<rect x="${bx}" y="${by}" width="${cols * cell}" height="${rows * cell}" fill="url(#off)"/>
<g id="dots" fill="${RED}">${dots}</g>
<g clip-path="url(#lit)"><g class="glint"><rect x="-260" y="${by}" width="220" height="${rows * cell}" fill="url(#gl)" transform="skewX(-18)"/></g></g>`
  const css = `.row{animation:row .45s ease-out both}@keyframes row{from{opacity:0}to{opacity:1}}
.glint{animation:glint 7s cubic-bezier(.5,0,.3,1) 3s infinite}@keyframes glint{0%{transform:translateX(0)}22%,100%{transform:translateX(${W + 520}px)}}`
  return svg(W, H, body, { fonts: ['label'], css, title: lines.join(' ') })
}

/* ------------------------------------------------------------------ TYPING */
// Typed and erased on a loop. SMIL rather than CSS: discrete clip-width steps
// line up with the real glyph advances, so a proportional face types cleanly.
function typing(t) {
  const lines = ['student  ·  web & app developer', 'i design it, then i build it', 'currently building GhostMesh', 'learning Go & system design']
  const W = 1100, H = 58, size = 24, font = 'body', y = 37
  const TYPE = 0.065, ERASE = 0.028, HOLD = 1.7, GAP = 0.35
  const events = [] // [time, line, chars]
  let now = 0
  lines.forEach((l, i) => {
    const n = [...l].length
    for (let k = 0; k <= n; k++) events.push([now + k * TYPE, i, k])
    now += n * TYPE + HOLD
    for (let k = n - 1; k >= 0; k--) { now += ERASE; events.push([now, i, k]) }
    now += GAP
  })
  const T = now
  const x0 = lines.map(l => (W - measure(l, font, size)) / 2)
  const widths = lines.map(l => [...l].map((_, k) => measure(l.slice(0, k), font, size)).concat(measure(l, font, size)))
  const keyTimes = events.map(e => (e[0] / T).toFixed(4)).join(';')
  let body = ''
  lines.forEach((l, i) => {
    const vals = events.map(e => (e[1] === i ? r1(widths[i][e[2]] + (e[2] ? 2 : 0)) : 0)).join(';')
    body += `<clipPath id="c${i}"><rect x="${r1(x0[i])}" y="0" height="${H}" width="0"><animate attributeName="width" values="${vals}" keyTimes="${keyTimes}" dur="${r1(T)}s" calcMode="discrete" repeatCount="indefinite"/></rect></clipPath>`
    body += `<g clip-path="url(#c${i})">${text(l, font, size, x0[i], y, { fill: t.fg })}</g>`
  })
  const cx = events.map(e => `${r1(x0[e[1]] + widths[e[1]][e[2]] + 3)} 0`).join(';')
  body += `<rect class="caret" x="0" y="${y - 21}" width="3" height="26" fill="${RED}"><animateTransform attributeName="transform" type="translate" values="${cx}" keyTimes="${keyTimes}" dur="${r1(T)}s" calcMode="discrete" repeatCount="indefinite"/></rect>`
  const css = `.caret{animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}`
  return svg(W, H, body, { fonts: ['body'], css, title: lines.join('. ') })
}

/* ---------------------------------------------------------- SECTION HEADER */
function section(n, title, note) {
  return t => {
    const W = 1100, H = 70
    const tw = measure(title, 'display', 30, 2)
    let b = text(n, 'label', 14, 0, 44, { fill: RED, ls: 2, cls: 'up' })
    b += text(title, 'display', 30, 40, 48, { fill: t.fg, ls: 2, cls: 'up', delay: 0.08 })
    const nw = note ? measure(note, 'label', 12, 2) : 0
    b += `<path d="M${r1(56 + tw)} 38H${r1(W - (note ? nw + 18 : 0))}" stroke="${t.line}" stroke-width="1.5" pathLength="1" class="draw" style="animation-delay:.3s"/>`
    if (note) b += text(note, 'label', 12, W, 42, { fill: t.sub, ls: 2, anchor: 'end', cls: 'up', delay: 0.6 })
    return svg(W, H, b, { fonts: ['label', 'display'], title: `${n} ${title}` })
  }
}

/* ------------------------------------------------------------------- RADAR */
function radar({ title, subtitle, axes, values }) {
  return t => {
    const W = 540, H = 470, cx = 270, cy = 262, R = 128, n = axes.length
    const pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f] }
    const poly = f => axes.map((_, i) => pt(i, typeof f === 'function' ? f(i) : f).map(r1).join(',')).join(' ')
    let b = text(title, 'label', 14, 24, 40, { fill: RED, ls: 3, cls: 'up' })
    b += text(subtitle, 'body', 14, 24, 62, { fill: t.sub, cls: 'up', delay: 0.1 })
    for (const f of [0.25, 0.5, 0.75, 1]) b += `<polygon points="${poly(f)}" fill="none" stroke="${t.ring}" stroke-width="1"/>`
    axes.forEach((_, i) => { const [x, y] = pt(i, 1); b += `<line x1="${cx}" y1="${cy}" x2="${r1(x)}" y2="${r1(y)}" stroke="${t.ring}"/>` })
    const f = i => Math.max(0.04, axes[i].value / 100)
    b += `<g class="grow"><polygon points="${poly(f)}" fill="${RED}" fill-opacity=".16" stroke="${RED}" stroke-width="2" stroke-linejoin="round"/>`
    axes.forEach((_, i) => { const [x, y] = pt(i, f(i)); b += `<circle cx="${r1(x)}" cy="${r1(y)}" r="3.5" fill="${RED}"/>` })
    b += `</g>`
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 1.13)
      const dx = x - cx, anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end'
      const dy = y < cy - R * 0.9 ? -4 : y > cy + R * 0.9 ? 14 : 5
      b += text(a.label, 'label', 13, x, y + dy, { fill: t.fg, ls: 0.5, anchor, cls: 'up', delay: 0.5 + i * 0.05 })
      if (values) b += text(values[i], 'body', 12, x, y + dy + 16, { fill: t.sub, anchor, cls: 'up', delay: 0.55 + i * 0.05 })
    })
    const css = `.grow{transform-box:view-box;transform-origin:${cx}px ${cy}px;animation:grow 1.1s cubic-bezier(.2,.9,.25,1.15) .2s both}@keyframes grow{from{opacity:0;transform:scale(.2) rotate(-25deg)}to{opacity:1;transform:none}}`
    return svg(W, H, b, { fonts: ['label', 'body'], css, title: `${title}, ${subtitle}: ${axes.map((a, i) => `${a.label}${values ? ' ' + values[i] : ' ' + a.value}`).join(', ')}` })
  }
}

/* ---------------------------------------------------- ISOMETRIC CALENDAR */
function isoCalendar(days, st) {
  return t => {
    // Weeks run along u, weekdays along v: a flatter strip than true isometric,
    // so a year reads left to right instead of sliding off the corner.
    const W = 1100, H = 380, u = [10.4, 3.1], v = [-5.6, 7.2]
    const ox = 480, oy = 96
    const maxCount = Math.max(1, ...days.map(d => d.count))
    const shade = (hex, k) => {
      const n = parseInt(hex.slice(1), 16)
      return '#' + [16, 8, 0].map(sh => Math.round(((n >> sh) & 255) * k).toString(16).padStart(2, '0')).join('')
    }
    const depth = d => u[1] * d.week + v[1] * d.dow
    const cells = [...days].sort((a, b) => depth(a) - depth(b))
    let g = ''
    for (const d of cells) {
      const px = ox + d.week * u[0] + d.dow * v[0], py = oy + d.week * u[1] + d.dow * v[1]
      const h = d.count ? 6 + 46 * Math.sqrt(d.count / maxCount) : 1.5
      const c = t.levels[d.level]
      const gu = [u[0] * 0.84, u[1] * 0.84], gv = [v[0] * 0.84, v[1] * 0.84] // gap between cells
      const q = (x, y) => `${r1(x)} ${r1(y)}`
      const top = `M${q(px, py - h)}L${q(px + gu[0], py + gu[1] - h)}L${q(px + gu[0] + gv[0], py + gu[1] + gv[1] - h)}L${q(px + gv[0], py + gv[1] - h)}Z`
      const left = `M${q(px + gv[0], py + gv[1] - h)}L${q(px + gu[0] + gv[0], py + gu[1] + gv[1] - h)}v${r1(h)}L${q(px + gv[0], py + gv[1])}Z`
      const right = `M${q(px + gu[0], py + gu[1] - h)}L${q(px + gu[0] + gv[0], py + gu[1] + gv[1] - h)}v${r1(h)}L${q(px + gu[0], py + gu[1])}Z`
      g += `<g class="bar" style="animation-delay:${(0.3 + d.week * 0.022).toFixed(2)}s"><path d="${left}" fill="${shade(c, 0.78)}"/><path d="${right}" fill="${shade(c, 0.62)}"/><path d="${top}" fill="${c}"/></g>`
    }
    const month = new Date(st.busiest.date + 'T00:00:00Z').toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    let b = text('ACTIVITY', 'label', 14, 40, 64, { fill: RED, ls: 3, cls: 'up' })
    b += text('last 12 months', 'body', 14, 40, 86, { fill: t.sub, cls: 'up', delay: 0.05 })
    b += text(String(st.total), 'display', 64, 40, 170, { fill: t.fg, cls: 'up', delay: 0.15 })
    b += text('contributions', 'body', 18, 40, 198, { fill: t.sub, cls: 'up', delay: 0.2 })
    b += text(`busiest day · ${st.busiest.count} on ${month}`, 'body', 15, 40, 244, { fill: t.fg, cls: 'up', delay: 0.3 })
    b += text('less', 'body', 12, 40, 290, { fill: t.sub, cls: 'up', delay: 0.35 })
    t.levels.forEach((c, i) => { b += `<rect x="${72 + i * 18}" y="279" width="13" height="13" rx="2" fill="${c}" class="up" style="animation-delay:${(0.35 + i * 0.04).toFixed(2)}s"/>` })
    b += text('more', 'body', 12, 72 + 5 * 18 + 4, 290, { fill: t.sub, cls: 'up', delay: 0.55 })
    b += `<g>${g}</g>`
    const css = `.bar{animation:bar .7s cubic-bezier(.2,.9,.25,1) both}@keyframes bar{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}`
    return svg(W, H, b, { fonts: ['label', 'body', 'display'], css, title: `${st.total} contributions in the last 12 months` })
  }
}

/* -------------------------------------------------------------- STAT TILES */
// Digits roll into place like an odometer.
function statTiles(tiles) {
  return t => {
    const W = 1100, H = 150, n = tiles.length, tw = W / n, size = 40, lh = 48
    let b = '', defs = ''
    tiles.forEach((tile, i) => {
      const x = i * tw + 22
      if (i) b += `<line x1="${r1(i * tw)}" y1="34" x2="${r1(i * tw)}" y2="116" stroke="${t.line}"/>`
      b += text(tile.label, 'label', 11, x, 48, { fill: t.sub, ls: 2, cls: 'up', delay: i * 0.05 })
      let dx = x
      for (const [j, ch] of [...String(tile.value)].entries()) {
        const w = measure(ch, 'display', size)
        if (/\d/.test(ch)) {
          const id = `d${i}_${j}`
          defs += `<clipPath id="${id}"><rect x="${r1(dx - 2)}" y="${104 - lh + 8}" width="${r1(w + 4)}" height="${lh}"/></clipPath>`
          let strip = ''
          for (let k = 0; k <= +ch; k++) strip += text(String(k), 'display', size, dx, 104 + k * lh, { fill: k === +ch && tile.accent ? RED : t.fg })
          b += `<g clip-path="url(#${id})"><g class="roll" style="--to:${-ch * lh}px;animation-delay:${(0.2 + i * 0.08 + j * 0.06).toFixed(2)}s">${strip}</g></g>`
        } else b += text(ch, 'display', size, dx, 104, { fill: t.fg, cls: 'up', delay: 0.3 + i * 0.08 })
        dx += w
      }
      if (tile.unit) b += text(tile.unit, 'body', 14, dx + 6, 104, { fill: t.sub, cls: 'up', delay: 0.6 + i * 0.08 })
    })
    const css = `.roll{animation:roll 1.4s cubic-bezier(.3,.9,.2,1) both}@keyframes roll{from{transform:translateY(0)}to{transform:translateY(var(--to))}}
@media (prefers-reduced-motion:reduce){.roll{animation:none;transform:translateY(var(--to))}}`
    return svg(W, H, `<defs>${defs}</defs>${b}`, { fonts: ['label', 'body', 'display'], css, title: tiles.map(x => `${x.label}: ${x.value}${x.unit ? ' ' + x.unit : ''}`).join(', ') })
  }
}

/* ---------------------------------------------------------- PROJECT CARD */
const starPath = (x, y, r) => {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r
    d += (i ? 'L' : 'M') + r1(x + Math.cos(a) * rr) + ' ' + r1(y + Math.sin(a) * rr)
  }
  return d + 'Z'
}
const forkIcon = (x, y, c) => `<g fill="none" stroke="${c}" stroke-width="1.5"><circle cx="${x - 4}" cy="${y - 5}" r="2"/><circle cx="${x + 4}" cy="${y - 5}" r="2"/><circle cx="${x}" cy="${y + 6}" r="2"/><path d="M${x - 4} ${y - 3}v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2M${x} ${y + 1}v3"/></g>`

function projectCard(p, i) {
  return t => {
    const W = 540, H = 260
    let b = `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="12" fill="${t.card}" stroke="${t.line}" stroke-width="1.5"/>`
    b += `<rect x="28" y="0" width="44" height="3" fill="${RED}" class="fade"/>`
    b += text(String(i + 1).padStart(2, '0'), 'label', 13, 28, 44, { fill: RED, ls: 2, cls: 'up' })
    b += text(`${USER} / ${p.repo}`, 'body', 13, 64, 44, { fill: t.sub, cls: 'up', delay: 0.05 })
    b += text(p.title, 'display', 32, 28, 92, { fill: t.fg, ls: 1, cls: 'up', delay: 0.1 })
    wrap(p.description, 'body', 16, W - 60, 3).forEach((l, k) => { b += text(l, 'body', 16, 28, 128 + k * 23, { fill: t.sub, cls: 'up', delay: 0.2 + k * 0.05 }) })
    b += `<line x1="28" y1="208" x2="${W - 28}" y2="208" stroke="${t.line}"/>`
    let x = 28
    if (p.language) {
      b += `<circle cx="${x + 6}" cy="232" r="6" fill="${LANG_COLORS[p.language] || t.sub}" class="up" style="animation-delay:.35s"/>`
      b += text(p.language, 'body', 14, x + 18, 237, { fill: t.fg, cls: 'up', delay: 0.35 })
      x += 18 + measure(p.language, 'body', 14) + 22
    }
    b += `<path d="${starPath(x + 7, 231, 7)}" fill="none" stroke="${t.sub}" stroke-width="1.4" stroke-linejoin="round" class="up" style="animation-delay:.4s"/>`
    b += text(fmt(p.stars), 'body', 14, x + 20, 237, { fill: t.fg, cls: 'up', delay: 0.4 })
    x += 20 + measure(fmt(p.stars), 'body', 14) + 22
    b += `<g class="up" style="animation-delay:.45s">${forkIcon(x + 6, 231, t.sub)}</g>`
    b += text(fmt(p.forks), 'body', 14, x + 18, 237, { fill: t.fg, cls: 'up', delay: 0.45 })
    const cta = p.live ? 'LIVE' : 'REPO'
    b += text(cta, 'label', 12, W - 50, 237, { fill: RED, ls: 2, anchor: 'end', cls: 'up', delay: 0.5 })
    b += `<path d="M${W - 42} 238l12-12M${W - 38} 226h8v8" fill="none" stroke="${RED}" stroke-width="2" class="up" style="animation-delay:.5s"/>`
    return svg(W, H, b, { fonts: ['label', 'body', 'display'], title: `${p.title}: ${p.description}` })
  }
}

/* -------------------------------------------------------------------- MAIN */
const [user, repos, days] = await Promise.all([gh(`/users/${USER}`), gh(`/users/${USER}/repos?per_page=100&type=owner`), contributions()])
const own = repos.filter(r => !r.fork)
const langBytes = {}
for (const r of own) {
  const langs = await gh(`/repos/${USER}/${r.name}/languages`)
  for (const [k, v] of Object.entries(langs)) if (!LANG_EXCLUDE.has(k)) langBytes[k] = (langBytes[k] || 0) + v
}
const st = streaks(days)

write('name', nameBoard)
write('typing', typing)
write('head-hello', section('01', 'HELLO', 'WHO I AM'))
write('head-skills', section('02', 'SKILLS', 'OPINION VS. EVIDENCE'))
write('head-activity', section('03', 'ACTIVITY', 'REFRESHED DAILY'))
write('head-work', section('04', 'SELECTED WORK', 'CLICK A CARD'))

const skills = read('data/skills.json')
write('radar-skills', radar({ title: skills.title, subtitle: skills.subtitle, axes: skills.axes }))
const top = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 7)
const totalBytes = top.reduce((s, [, v]) => s + v, 0)
const maxBytes = top[0][1]
// A 0.4 power curve: raw bytes span orders of magnitude and would draw one spike.
write('radar-langs', radar({
  title: 'LANGUAGES', subtitle: 'measured from my public repos',
  axes: top.map(([k, v]) => ({ label: k, value: 100 * Math.pow(v / maxBytes, 0.4) })),
  values: top.map(([, v]) => `${Math.max(1, Math.round(100 * v / totalBytes))}%`),
}))

write('calendar', isoCalendar(days, st))
write('stats', statTiles([
  { label: 'CONTRIBUTIONS', value: st.total, accent: true },
  { label: 'ACTIVE DAYS', value: st.active },
  { label: 'LONGEST STREAK', value: st.longest, unit: st.longest === 1 ? 'day' : 'days' },
  { label: 'BEST DAY', value: st.busiest.count, unit: 'commits' },
  { label: 'PUBLIC REPOS', value: user.public_repos },
  { label: 'LANGUAGES', value: top.length },
]))

const byName = Object.fromEntries(own.map(r => [r.name, r]))
read('data/projects.json').projects.forEach((p, i) => {
  const r = byName[p.repo]
  if (!r) throw new Error(`projects.json: no public repo named ${p.repo}`)
  write(`card-${i + 1}`, projectCard({ ...p, language: r.language, stars: r.stargazers_count, forks: r.forks_count }, i))
})
console.log(`\n${st.total} contributions · streak ${st.current}/${st.longest} · ${own.length} repos · languages: ${top.map(([k]) => k).join(', ')}`)
