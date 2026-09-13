/**
 * Turns the source cookbook markdown in content/ into
 *   - one markdown file per chapter in src/content/chapters/
 *   - a generated metadata module at src/data/course.ts
 *
 * Run with `npm run content` after editing anything in content/.
 * Nothing here is hand-maintained; edit the markdown, not the output.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'content')
const OUT_CHAPTERS = join(root, 'src/content/chapters')
const OUT_DATA = join(root, 'src/data/course.ts')
const OUT_PREAMBLE = join(root, 'src/content/preamble.md')

/** Reading order of the whole course. */
const SOURCES = [
  {
    key: 'kind',
    file: 'kind-quickstart.md',
    titleIsChapter: true,
    firstTitle: 'Run Kubernetes locally with kind',
    part: {
      title: 'Getting a cluster',
      numeral: '0',
      volume: 'Supplemental',
      blurb: 'A disposable Kubernetes lab on your own machine, so every later chapter has somewhere to run.',
    },
  },
  { key: 'ck', file: 'k8s-cheatsheet.md', autoParts: true, preamble: true },
  {
    key: 'c',
    file: 'kubeadm-appendix.md',
    titleIsChapter: true,
    part: {
      title: 'Appendix C — Kubernetes from parts',
      numeral: 'C',
      volume: 'CKA territory',
      blurb:
        'Build a cluster by hand with kubeadm, containerd and Cilium. Watch it not work yet, and find out why.',
    },
  },
  {
    key: 'd',
    file: 'cillium-gateay-appendix.md',
    titleIsChapter: true,
    part: {
      title: 'Appendix D — Cilium, eBPF and Gateway API',
      numeral: 'D',
      volume: 'Platform',
      blurb:
        'Follow a request from an HTTPRoute all the way down to eBPF, then observe it with Hubble.',
    },
  },
]

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[`'"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** `[CKAD] [DEV] [DEEP DIVE]` markers the author puts in headings. */
function takeTags(title) {
  const tags = []
  const cleaned = title
    .replace(/\[(CKAD|DEV|DEEP DIVE)\]/g, (_, t) => {
      tags.push(t)
      return ''
    })
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { title: cleaned, tags }
}

/** The author numbers sections; keep his numbering rather than inventing one. */
function takeNumber(title) {
  let m = title.match(/^(\d+[a-z]?)[.:]?\s+(.*)$/)
  if (m) return { number: m[1], title: m[2] }
  m = title.match(/^([A-Z]\.\d+)\s+(.*)$/)
  if (m) return { number: m[1], title: m[2] }
  m = title.match(/^Appendix\s+([A-Z])\s*[-–—]\s*(.*)$/)
  if (m) return { number: m[1], title: m[2] }
  return { number: null, title }
}

function splitH1(markdown) {
  const lines = markdown.split('\n')
  const sections = []
  let current = null
  let fenced = false

  for (const line of lines) {
    if (line.startsWith('```')) fenced = !fenced
    const m = !fenced && line.match(/^#\s+(.*)$/)
    if (m) {
      if (current) sections.push(current)
      current = { heading: m[1].trim(), body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  if (current) sections.push(current)
  return sections.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }))
}

/** Strip the `---` rules the author uses between sections; we draw our own. */
function tidy(body) {
  return body
    .replace(/\n---\s*$/g, '')
    .replace(/^\s*---\s*\n/, '')
    .trim()
}

/** Paragraphs of prose, in order, ignoring fences, headings and lists. */
function paragraphs(body) {
  const out = []
  let fenced = false
  let buf = []
  const flush = () => {
    if (buf.length) out.push(buf.join(' '))
    buf = []
  }
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced
      flush()
      continue
    }
    if (fenced) continue
    const t = line.trim()
    if (!t || /^(#{1,6}\s|[-*]\s|\d+\.\s|>|\||---)/.test(t)) {
      flush()
      continue
    }
    buf.push(t)
  }
  flush()
  return out.map((p) =>
    p
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_]/g, '')
      .trim(),
  )
}

/**
 * A blurb. Most sections open with a line that runs straight into a command
 * block ("Check:"), which tells the reader nothing — so skip those.
 */
function firstParagraph(body) {
  const candidates = paragraphs(body).slice(0, 4)
  let text =
    candidates.find((p) => !p.endsWith(':') && p.length >= 40) ??
    candidates.find((p) => !p.endsWith(':')) ??
    candidates[0] ??
    ''
  text = text.replace(/:$/, '.')
  if (text.length > 190) {
    const cut = text.slice(0, 190)
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '))
    text = stop > 90 ? cut.slice(0, stop + 1) : `${cut.replace(/\s\S*$/, '')}…`
  }
  return text
}

function subheadings(body) {
  const out = []
  let fenced = false
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced
    if (fenced) continue
    const m = line.match(/^##\s+(.*)$/)
    if (m) {
      const { title } = takeTags(m[1].trim())
      out.push({ id: slug(title), title })
    }
  }
  return out
}

function measure(body) {
  const fences = [...body.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)]
  const runnable = fences.filter((f) => ['bash', 'powershell'].includes(f[1])).length
  const prose = body.replace(/^```[\s\S]*?^```/gm, '')
  const words = prose.split(/\s+/).filter(Boolean).length
  const minutes = Math.max(2, Math.round(words / 180 + runnable * 1.1))
  return { minutes, runnable, hasYaml: fences.some((f) => f[1] === 'yaml') }
}

// ---------------------------------------------------------------------------

rmSync(OUT_CHAPTERS, { recursive: true, force: true })
mkdirSync(OUT_CHAPTERS, { recursive: true })

const parts = []
let preamble = ''
const seen = new Set()

for (const source of SOURCES) {
  const raw = readFileSync(join(SRC, source.file), 'utf8')
  const sections = splitH1(raw)
  if (!sections.length) throw new Error(`no H1 sections in ${source.file}`)

  let part = null
  const openPart = (meta) => {
    part = { id: `part-${slug(meta.title)}`, chapters: [], ...meta }
    parts.push(part)
    return part
  }

  let start = 0
  const head = sections[0]

  if (source.preamble) {
    preamble = tidy(head.body)
    start = 1
  } else if (source.titleIsChapter) {
    openPart({ ...source.part, volume: source.part.volume })
  }

  for (let i = start; i < sections.length; i++) {
    const section = sections[i]
    const stripped = takeTags(section.heading)

    if (source.autoParts) {
      const pm = stripped.title.match(/^Part\s+([IVXLC]+)\s*[-–—]\s*(.*)$/)
      if (pm) {
        openPart({
          title: pm[2],
          numeral: pm[1],
          volume: 'The cookbook',
          blurb: firstParagraph(tidy(section.body)),
        })
        continue
      }
      if (/^Appendix\s+[A-Z]\b/.test(stripped.title) && part?.title !== 'Appendices') {
        openPart({
          title: 'Appendices',
          numeral: 'A',
          volume: 'The cookbook',
          blurb: 'The models worth carrying out of the cookbook, and where they sit on the exam.',
        })
      }
    }

    if (!part) openPart({ ...source.part })

    let { number, title } = takeNumber(stripped.title)
    if (i === start && source.firstTitle) title = source.firstTitle
    const body = tidy(section.body)
    const { minutes, runnable, hasYaml } = measure(body)

    let id = `${source.key}-${slug(title)}`
    if (seen.has(id) && number) id = `${source.key}-${slug(`${number} ${title}`)}`
    while (seen.has(id)) id = `${id}-x`
    seen.add(id)

    writeFileSync(join(OUT_CHAPTERS, `${id}.md`), `${body}\n`)

    part.chapters.push({
      id,
      number,
      title,
      tags: stripped.tags,
      blurb: firstParagraph(body),
      minutes,
      kind: runnable > 0 ? 'lab' : 'brief',
      commands: runnable,
      hasYaml,
      sections: subheadings(body),
    })
  }
}

writeFileSync(OUT_PREAMBLE, `${preamble}\n`)

const esc = (s) => JSON.stringify(s)

const partsLiteral = parts
  .map(
    (p) => `  {
    id: ${esc(p.id)},
    title: ${esc(p.title)},
    volume: ${esc(p.volume)},${p.numeral ? `\n    numeral: ${esc(p.numeral)},` : ''}
    blurb: ${esc(p.blurb ?? '')},
    chapters: [
${p.chapters
  .map(
    (c) => `      {
        id: ${esc(c.id)},
        number: ${c.number ? esc(c.number) : 'null'},
        title: ${esc(c.title)},
        blurb: ${esc(c.blurb)},
        tags: [${c.tags.map(esc).join(', ')}],
        minutes: ${c.minutes},
        kind: ${esc(c.kind)},
        commands: ${c.commands},
        hasYaml: ${c.hasYaml},
        sections: [${c.sections.map((s) => `{ id: ${esc(s.id)}, title: ${esc(s.title)} }`).join(', ')}],
      },`,
  )
  .join('\n')}
    ],
  },`,
  )
  .join('\n')

writeFileSync(
  OUT_DATA,
  `/**
 * GENERATED by scripts/build-content.mjs — do not edit.
 * Source of truth is the markdown in content/. Run \`npm run content\`.
 */

export type Tag = 'CKAD' | 'DEV' | 'DEEP DIVE'
export type ChapterKind = 'brief' | 'lab'

export type Section = { id: string; title: string }

export type Chapter = {
  id: string
  /** the author's own section number, e.g. "9a" or "C.14" */
  number: string | null
  title: string
  blurb: string
  tags: Tag[]
  minutes: number
  kind: ChapterKind
  /** how many runnable command blocks the chapter contains */
  commands: number
  hasYaml: boolean
  sections: Section[]
}

export type Part = {
  id: string
  title: string
  volume: string
  numeral?: string
  blurb: string
  chapters: Chapter[]
}

export const parts: Part[] = [
${partsLiteral}
]

export const flatChapters = parts.flatMap((part, partIndex) =>
  part.chapters.map((chapter, indexInPart) => ({ ...chapter, part, partIndex, indexInPart })),
)

export type FlatChapter = (typeof flatChapters)[number]

const byId = new Map(flatChapters.map((c) => [c.id, c]))
const orderById = new Map(flatChapters.map((c, i) => [c.id, i]))

export function getChapter(id: string): FlatChapter | null {
  return byId.get(id) ?? null
}

export function neighbours(id: string) {
  const i = orderById.get(id)
  if (i === undefined) return { prev: null, next: null }
  return {
    prev: i > 0 ? flatChapters[i - 1] : null,
    next: i < flatChapters.length - 1 ? flatChapters[i + 1] : null,
  }
}

export const volumes = [...new Set(parts.map((p) => p.volume))]

export const totals = {
  parts: parts.length,
  chapters: flatChapters.length,
  minutes: flatChapters.reduce((sum, c) => sum + c.minutes, 0),
  labs: flatChapters.filter((c) => c.kind === 'lab').length,
  commands: flatChapters.reduce((sum, c) => sum + c.commands, 0),
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return \`\${m} min\`
  if (!m) return \`\${h} hr\`
  return \`\${h} hr \${m} min\`
}
`,
)

const counts = parts.map((p) => `  ${p.volume} / ${p.title}: ${p.chapters.length}`).join('\n')
console.log(
  `wrote ${readdirSync(OUT_CHAPTERS).length} chapters across ${parts.length} parts\n${counts}`,
)
