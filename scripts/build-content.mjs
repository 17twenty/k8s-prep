/**
 * Transforms content/ into the course.
 *
 * The pipeline is two scripts with one job each, and only the first touches
 * the network:
 *
 *   sync-content.mjs   gist  ->  content/     mirrors the author's markdown
 *   build-content.mjs  content/ -> src/       derives everything the UI needs
 *
 * Output, all of it generated and none of it hand-maintained:
 *   src/content/chapters/<id>.md   one file per H1 section, lazy-loaded
 *   src/data/course.ts             metadata, totals and the course preamble
 *
 * Documents are discovered by reading the directory and classified by what
 * they contain — see `classify` — never by filename, which is not ours to
 * control. Edit the markdown, not the output.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'content')
const OUT_CHAPTERS = join(root, 'src/content/chapters')
const OUT_DATA = join(root, 'src/data/course.ts')

/**
 * Id prefixes, pinned only so that URLs already in the wild and progress
 * already saved in someone's cookie keep working. A new document does not
 * need an entry; it gets initials derived from its filename.
 */
const PINNED_KEYS = {
  'kind-quickstart.md': 'kind',
  'k8s-cheatsheet.md': 'ck',
  'kubeadm-appendix.md': 'c',
  'cillium-gateay-appendix.md': 'd',
}

const VOLUMES = ['Supplemental', 'The cookbook', 'Beyond the exam']

const NOISE = /^(appendix|appendices|quickstart|cheatsheet|md|the|and|for|a|an)$/i

function deriveKey(filename, taken) {
  const words = filename
    .replace(/\.md$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !NOISE.test(w))
  let key = (words.map((w) => w[0]).join('') || filename.slice(0, 3)).toLowerCase()
  let n = 2
  const base = key
  while (taken.has(key)) key = `${base}${n++}`
  taken.add(key)
  return key
}

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
      .replace(/[`*]/g, '')
      // leave `_` alone: it is far more often ip_forward than emphasis
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

/**
 * The cookbook's own preamble states its purpose, its target version, what the
 * `[CKAD]` markers mean, and draws the teaching loop the whole book follows.
 * Pull those out so the landing page quotes the author rather than a copy of
 * him that silently goes stale the next time he edits the gist.
 */
function readPreamble(body) {
  const prose = paragraphs(body)

  const target = body.match(/^\*\*Target:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null

  const legend = [...body.matchAll(/^-\s*\*\*\[([A-Z ]+)\]\*\*\s*[-–—]\s*(.+)$/gm)].map(
    ([, tag, meaning]) => ({
      tag,
      // list items in the source, sentences on the page
      meaning: `${meaning.trim().charAt(0).toUpperCase()}${meaning.trim().slice(1).replace(/\.$/, '')}.`,
    }),
  )

  // the first drawn block is the teaching loop
  const diagram = body.match(/^```\w*\n([\s\S]*?)^```/m)?.[1]?.replace(/\n$/, '') ?? null

  return {
    // the opening statement of intent, before the bookkeeping starts
    intro: prose.filter((p) => !p.startsWith('Target:')).slice(0, 3).join(' '),
    target,
    legend,
    diagram,
  }
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
  const runnable = [...body.matchAll(/^```(\w*)$/gm)].filter((f) =>
    ['bash', 'sh', 'shell', 'zsh', 'console', 'powershell'].includes(f[1]),
  ).length
  const prose = body.replace(/^```[\s\S]*?^```/gm, '')
  const words = prose.split(/\s+/).filter(Boolean).length
  const minutes = Math.max(2, Math.round(words / 180 + runnable * 1.1))
  return { minutes, runnable }
}

/**
 * What kind of document is this? Decided from its own headings.
 *  - it contains `# Part ...`            -> the core cookbook
 *  - it opens "Supplemental - ..."       -> front matter, runs first
 *  - it opens "Appendix X - ..."         -> runs after the cookbook, in letter order
 *  - anything else                       -> runs last, alphabetically
 */
function classify(sections) {
  const head = takeTags(sections[0].heading).title

  if (sections.some((s) => /^Part\s+[IVXLC]+\b/.test(takeTags(s.heading).title))) {
    return { rank: 1, role: 'cookbook', title: head, letter: null }
  }

  const supplemental = head.match(/^Supplementa(?:l|ry)\s*[-–—:]\s*(.*)$/i)
  if (supplemental) {
    return { rank: 0, role: 'document', title: supplemental[1], letter: '0' }
  }

  const appendix = head.match(/^Appendix\s*([A-Z])?\s*[-–—:]\s*(.*)$/i)
  if (appendix) {
    return { rank: 2, role: 'document', title: appendix[2], letter: appendix[1] ?? null }
  }

  return { rank: 3, role: 'document', title: head, letter: null }
}

/** Give unlettered appendices the next free letter, for a scannable rail. */
function assignLetters(documents) {
  const used = documents.map((d) => d.letter).filter((l) => l && /^[A-Z]$/.test(l))
  let next = Math.max(...used.map((l) => l.charCodeAt(0)), 'A'.charCodeAt(0) - 1) + 1
  for (const doc of documents) {
    if (doc.rank >= 2 && !doc.letter) doc.letter = String.fromCharCode(next++)
  }
}

// ---------------------------------------------------------------------------

rmSync(OUT_CHAPTERS, { recursive: true, force: true })
mkdirSync(OUT_CHAPTERS, { recursive: true })

// Discover every document, then let each one say where it belongs.
const documents = readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((file) => {
    const sections = splitH1(readFileSync(join(SRC, file), 'utf8'))
    if (!sections.length) throw new Error(`no H1 sections in ${file}`)
    return { file, sections, ...classify(sections) }
  })

documents.sort(
  (a, b) => a.rank - b.rank || (a.letter ?? 'ZZ').localeCompare(b.letter ?? 'ZZ') || a.title.localeCompare(b.title),
)
assignLetters(documents)

const keys = new Set()
for (const doc of documents) {
  doc.key = PINNED_KEYS[doc.file] ?? null
  if (doc.key) keys.add(doc.key)
}
for (const doc of documents) {
  if (!doc.key) doc.key = deriveKey(doc.file, keys)
}

const parts = []
let preamble = ''
const seen = new Set()

for (const doc of documents) {
  const { sections, key } = doc
  let part = null
  const openPart = (meta) => {
    part = { id: `part-${slug(meta.title)}`, chapters: [], ...meta }
    parts.push(part)
    return part
  }

  let start = 0
  const head = sections[0]

  if (doc.role === 'cookbook') {
    preamble = tidy(head.body)
    start = 1
  } else {
    // The document's own title becomes the part; its opening section becomes
    // that part's first chapter, so nothing in the source is dropped.
    openPart({
      title: doc.title,
      numeral: doc.letter,
      volume: VOLUMES[Math.min(doc.rank, VOLUMES.length - 1)],
      blurb: firstParagraph(tidy(head.body)),
    })
  }

  for (let i = start; i < sections.length; i++) {
    const section = sections[i]
    const stripped = takeTags(section.heading)

    if (doc.role === 'cookbook') {
      const pm = stripped.title.match(/^Part\s+([IVXLC]+)\s*[-–—]\s*(.*)$/)
      if (pm) {
        openPart({
          title: pm[2],
          numeral: pm[1],
          volume: VOLUMES[1],
          blurb: firstParagraph(tidy(section.body)),
        })
        continue
      }
      if (/^Appendix\s+[A-Z]\b/.test(stripped.title) && part?.title !== 'Appendices') {
        openPart({
          title: 'Appendices',
          numeral: 'A',
          volume: VOLUMES[1],
          blurb: 'The models worth carrying out of the cookbook, and where they sit on the exam.',
        })
      }
    }

    // only reached if a document has content before its first `# Part`
    if (!part) {
      openPart({
        title: doc.title,
        numeral: doc.letter,
        volume: VOLUMES[Math.min(doc.rank, VOLUMES.length - 1)],
        blurb: '',
      })
    }

    // The opening section is the document's introduction; the part heading
    // already carries its real name, so do not repeat it.
    const isHead = i === 0
    let { number, title } = takeNumber(stripped.title)
    // The id stays keyed to the document's real name — it is the URL, and it
    // is in people's cookies — even though the heading reads "Introduction".
    let idBasis = title
    if (isHead) {
      number = null
      title = 'Introduction'
      idBasis = doc.title
    }

    const body = tidy(section.body)
    const { minutes, runnable } = measure(body)

    let id = `${key}-${slug(idBasis)}`
    if (seen.has(id) && number) id = `${key}-${slug(`${number} ${idBasis}`)}`
    while (seen.has(id)) id = `${id}-x`
    seen.add(id)

    writeFileSync(join(OUT_CHAPTERS, `${id}.md`), `${body}\n`)

    // The part heading already shows this document's opening line; no need
    // for its Introduction chapter to repeat it verbatim underneath.
    const blurb = firstParagraph(body)

    part.chapters.push({
      id,
      number,
      title,
      tags: stripped.tags,
      blurb: isHead && blurb === part.blurb ? '' : blurb,
      minutes,
      kind: runnable > 0 ? 'lab' : 'brief',
      commands: runnable,
      sections: subheadings(body),
    })
  }
}

const intro = readPreamble(preamble)

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

export const flatChapters = parts.flatMap((part) =>
  part.chapters.map((chapter) => ({ ...chapter, part })),
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

/**
 * Lifted from the cookbook's own preamble so the landing page quotes the
 * author rather than a copy of him.
 */
export const intro = {
  statement: ${esc(intro.intro)},
  target: ${intro.target ? esc(intro.target) : 'null'},
  /** short form for the hero flag, e.g. "Kubernetes 1.35" */
  version: ${esc(intro.target?.match(/Kubernetes\s+[\d.]+/)?.[0] ?? 'Kubernetes')},
  legend: [
${intro.legend.map((l) => `    { tag: ${esc(l.tag)}, meaning: ${esc(l.meaning)} },`).join('\n')}
  ] as { tag: Tag; meaning: string }[],
  /** the recurring teaching loop, drawn by the author */
  diagram: ${intro.diagram ? esc(intro.diagram) : 'null'},
}
`,
)

const chapters = readdirSync(OUT_CHAPTERS).length
const minutes = parts.flatMap((p) => p.chapters).reduce((sum, c) => sum + c.minutes, 0)
console.log(
  `${documents.length} documents -> ${chapters} chapters, ${parts.length} parts, ` +
    `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
)
for (const doc of documents) {
  console.log(`  ${(doc.letter ?? '-').padStart(2)}  ${doc.key.padEnd(5)} ${doc.file}`)
}
