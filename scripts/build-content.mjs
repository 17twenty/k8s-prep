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

/** Rail groupings. A companion handbook supplies its own, named after itself. */
const VOLUME = {
  supplemental: 'Supplemental',
  cookbook: 'The cookbook',
  beyond: 'Beyond the exam',
}

const NOISE = /^(appendix|appendices|quickstart|cheatsheet|md|the|and|for|a|an)$/i

/**
 * A leading number in the filename is an explicit running order —
 * `01-intro.md`, `02-pods.md`. It is a position, not part of the name, so it
 * does not reach the id. Documents without one fall back to being placed by
 * what they contain.
 */
function fileOrder(filename) {
  const m = filename.match(/^(\d+)[-_. ]/)
  return m ? Number(m[1]) : null
}

function deriveKey(filename, taken) {
  const words = filename
    .replace(/\.md$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !NOISE.test(w))
  let key = (words.map((w) => w[0]).join('') || 'doc').toLowerCase()
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

/**
 * `[CKAD] [DEV] [OPS] [PLATFORM] [DEEP DIVE]` markers the authors put in
 * headings. Taken from the end of the heading rather than matched against a
 * fixed list, so a document that invents a new marker still gets a clean title
 * — and a bracketed phrase inside a title is never mistaken for a tag.
 */
function takeTags(title) {
  const tags = []
  let cleaned = title.replace(/`/g, '').trim()

  for (;;) {
    const m = cleaned.match(/\s*\[([A-Z][A-Z ]{1,18})\]$/)
    if (!m) break
    tags.unshift(m[1].trim())
    cleaned = cleaned.slice(0, m.index).trim()
  }

  return { title: cleaned.replace(/\s+/g, ' ').trim(), tags }
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

  // the first drawn block is the teaching loop
  const diagram = body.match(/^```\w*\n([\s\S]*?)^```/m)?.[1]?.replace(/\n$/, '') ?? null

  return {
    // the opening statement of intent, before the bookkeeping starts
    intro: prose.filter((p) => !p.startsWith('Target:')).slice(0, 3).join(' '),
    target,
    diagram,
  }
}

/**
 * `- **[OPS]** - operating delivery systems`. Every document may define its own
 * markers, so the legend on the landing page is the union of all of them.
 */
function readLegend(body) {
  return [...body.matchAll(/^-\s*\*\*\[([A-Z][A-Z ]*)\]\*\*\s*[-–—]\s*(.+)$/gm)].map(
    ([, tag, meaning]) => {
      const text = meaning.trim().replace(/\.$/, '')
      // list items in the source, sentences on the page
      return { tag: tag.trim(), meaning: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` }
    },
  )
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
 * Structural facts about a document, read from its own headings.
 *
 * Note what is deliberately *not* decided here: whether a document is the
 * primary one. More than one document supplies `# Part ...` headings — the
 * cookbook and the GitOps handbook both do — so "has parts" cannot mean "is
 * the course". That is settled across the whole set in `assignRoles`.
 */
function classify(sections) {
  const head = takeTags(sections[0].heading).title
  const hasParts = sections.some((s) => /^Part\s+[IVXLC]+\b/.test(takeTags(s.heading).title))
  const ckad = sections.filter((s) => takeTags(s.heading).tags.includes('CKAD')).length

  const supplemental = head.match(/^Supplementa(?:l|ry)\s*[-–—:]\s*(.*)$/i)
  if (supplemental) return { kind: 'supplemental', title: supplemental[1], numeral: '0', hasParts, ckad }

  const appendix = head.match(/^Appendix\s*([A-Z])?\s*[-–—:]\s*(.*)$/i)
  if (appendix) return { kind: 'appendix', title: appendix[2], numeral: appendix[1] ?? null, hasParts, ckad }

  return { kind: 'standalone', title: head, numeral: null, hasParts, ckad }
}

/**
 * Decide what each document is *for*, now that we can see all of them.
 *
 * The primary text is the part-bearing document carrying the most `[CKAD]`
 * sections — this is a CKAD course, so that is what "the cookbook" means here.
 * Other part-bearing documents are companion handbooks: they keep their own
 * parts and get a volume of their own rather than being folded into the course.
 */
function assignRoles(documents) {
  const parted = documents.filter((d) => d.hasParts)
  const primary = parted.slice().sort((a, b) => b.ckad - a.ckad)[0]

  for (const doc of documents) {
    if (doc === primary) {
      doc.role = 'cookbook'
      doc.rank = 1
      doc.volume = VOLUME.cookbook
    } else if (doc.hasParts) {
      doc.role = 'series'
      doc.rank = 2
      doc.volume = doc.title
    } else if (doc.kind === 'supplemental') {
      doc.role = 'document'
      doc.rank = 0
      doc.volume = VOLUME.supplemental
    } else {
      doc.role = 'document'
      doc.rank = doc.kind === 'appendix' ? 3 : 4
      doc.volume = VOLUME.beyond
    }
  }
}

/** Give unlettered appendices the next free letter, for a scannable rail. */
function assignNumerals(documents) {
  const used = documents
    .filter((d) => d.role === 'document')
    .map((d) => d.numeral)
    .filter((l) => l && /^[A-Z]$/.test(l))
  let next = Math.max(...used.map((l) => l.charCodeAt(0)), 'A'.charCodeAt(0) - 1) + 1
  for (const doc of documents) {
    if (doc.rank === 3 && !doc.numeral) doc.numeral = String.fromCharCode(next++)
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
    return { file, sections, order: fileOrder(file), ...classify(sections) }
  })

assignRoles(documents)
documents.sort(
  (a, b) =>
    // an explicit filename number wins; otherwise place by what it contains
    (a.order ?? Infinity) - (b.order ?? Infinity) ||
    a.rank - b.rank ||
    (a.numeral ?? 'ZZ').localeCompare(b.numeral ?? 'ZZ') ||
    a.title.localeCompare(b.title),
)
assignNumerals(documents)

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
const legends = []
const seen = new Set()

for (const doc of documents) {
  const { sections, key } = doc
  let part = null
  // namespaced by document: more than one of them has an "Appendices" part
  const openPart = (meta) => {
    part = { id: `part-${key}-${slug(meta.title)}`, chapters: [], ...meta }
    parts.push(part)
    return part
  }

  const addChapter = (section, isHead) => {
    const stripped = takeTags(section.heading)
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
    if (seen.has(id)) id = `${key}-${slug(`${number ?? part.chapters.length} ${idBasis}`)}`
    seen.add(id)

    writeFileSync(join(OUT_CHAPTERS, `${id}.md`), `${body}\n`)

    // The part heading already shows this document's opening line; no need
    // for its Introduction chapter to repeat it underneath.
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

  const structured = doc.role === 'cookbook' || doc.role === 'series'
  const head = sections[0]

  // A document that supplies its own parts also supplies a preamble before the
  // first of them. The cookbook's becomes the landing page; a companion's
  // becomes the opening chapter of its first part, once that part exists.
  let pendingHead = null
  if (structured) {
    if (doc.role === 'cookbook') preamble = tidy(head.body)
    else pendingHead = head
  } else {
    openPart({
      title: doc.title,
      numeral: doc.numeral,
      volume: doc.volume,
      blurb: firstParagraph(tidy(head.body)),
    })
  }

  legends.push(...readLegend(tidy(head.body)))

  for (const section of sections.slice(structured ? 1 : 0)) {
    const title = takeTags(section.heading).title

    if (structured) {
      const pm = title.match(/^Part\s+([IVXLC]+)\s*[-–—]\s*(.*)$/)
      if (pm) {
        openPart({
          title: pm[2],
          numeral: pm[1],
          volume: doc.volume,
          blurb: firstParagraph(tidy(section.body)),
        })
        if (pendingHead) {
          addChapter(pendingHead, true)
          pendingHead = null
        }
        continue
      }
      if (/^Appendix\s+[A-Z]\b/.test(title) && part?.title !== 'Appendices') {
        openPart({
          title: 'Appendices',
          numeral: 'A',
          volume: doc.volume,
          blurb: 'Reference material to come back to once the labs are behind you.',
        })
      }
    }

    // a document with no `# Part` heading at all still needs somewhere to go
    if (!part) {
      openPart({ title: doc.title, numeral: doc.numeral, volume: doc.volume, blurb: '' })
    }

    addChapter(section, section === head)
  }
}

const intro = readPreamble(preamble)

const tagUse = new Map()
for (const part of parts) {
  for (const chapter of part.chapters) {
    for (const tag of chapter.tags) tagUse.set(tag, (tagUse.get(tag) ?? 0) + 1)
  }
}
const legend = [...new Map(legends.map((l) => [l.tag, l])).values()]
  .filter((l) => tagUse.has(l.tag))
  .sort((a, b) => tagUse.get(b.tag) - tagUse.get(a.tag))
const tagNames = [...tagUse.keys()].sort()

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

export type Tag = ${tagNames.map(esc).join(' | ')}
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
${legend.map((l) => `    { tag: ${esc(l.tag)}, meaning: ${esc(l.meaning)} },`).join('\n')}
  ] as { tag: Tag; meaning: string }[],
  /** the recurring teaching loop, drawn by the author */
  diagram: ${intro.diagram ? esc(intro.diagram) : 'null'},
}
`,
)

/**
 * What the source could do better.
 *
 * None of this stops a build — the pipeline is deliberately forgiving, because
 * the markdown is written by someone who is not thinking about our renderer.
 * But every item here is somewhere we are guessing, and a guess is somewhere
 * the page can be wrong. Run `npm run review` to get the detail.
 */
function review(documents, parts) {
  const detail = process.argv.includes('--report')
  const chapters = parts.flatMap((p) => p.chapters)
  const notes = []

  const bodies = documents.map((d) => ({
    doc: d,
    text: d.sections.map((s) => s.body).join('\n'),
  }))

  // 1. fences we have to guess about
  const fences = new Map()
  let ambiguousText = 0
  let looksYaml = 0
  let looksShell = 0
  for (const { text } of bodies) {
    for (const [, lang] of text.matchAll(/^```(\w*)$/gm)) {
      if (lang) fences.set(lang, (fences.get(lang) ?? 0) + 1)
    }
    for (const [, block] of text.matchAll(/^```text\n([\s\S]*?)^```/gm)) {
      ambiguousText++
      const t = block.trim()
      if (/^(apiVersion:|kind:\s*\w)/.test(t) || /^\s*(apiVersion|metadata|spec):\s*$/m.test(t)) looksYaml++
      else if (/^(kubectl|helm|docker|kind|cilium|argocd|curl|sudo|git|go |export )\s/.test(t)) looksShell++
    }
  }

  if (ambiguousText) {
    notes.push({
      title: `${ambiguousText} \`\`\`text blocks are classified by guesswork`,
      body: [
        'We decide diagram-vs-output by looking for |, v, +-- and -> characters.',
        'A dedicated fence for drawings would make it exact.',
        looksYaml ? `${looksYaml} of them look like YAML and render unhighlighted.` : null,
        looksShell ? `${looksShell} of them look like commands and render without a prompt or copy button.` : null,
      ].filter(Boolean),
    })
  }

  const shells = [...fences].filter(([l]) => ['bash', 'sh', 'shell', 'zsh', 'console'].includes(l))
  if (shells.length > 1) {
    notes.push({
      title: 'shell fences use more than one language tag',
      body: [shells.map(([l, n]) => `${l}: ${n}`).join(', ') + ' — picking one keeps them identical.'],
    })
  }

  // 2. per-chapter metadata we derive and often cannot
  const byDoc = new Map(documents.map((d) => [d.key, { notoc: 0, notags: 0, n: 0 }]))
  for (const c of chapters) {
    const stat = byDoc.get(c.id.split('-')[0])
    if (!stat) continue
    stat.n++
    if (!c.sections.length) stat.notoc++
    if (!c.tags.length) stat.notags++
  }
  const noToc = chapters.filter((c) => !c.sections.length).length
  const noTags = chapters.filter((c) => !c.tags.length).length

  if (noTags) {
    const worst = [...byDoc].filter(([, s]) => s.notags === s.n && s.n > 1)
    notes.push({
      title: `${noTags} of ${chapters.length} chapters carry no [TAG] marker`,
      body: [
        'Tags drive the flags on chapter headers and the syllabus.',
        worst.length
          ? `Entirely untagged: ${worst.map(([k, s]) => `${k} (${s.n} chapters)`).join(', ')}.`
          : null,
      ].filter(Boolean),
    })
  }

  if (noToc) {
    notes.push({
      title: `${noToc} of ${chapters.length} chapters have no \`##\` subheadings`,
      body: [
        'Those chapters get no on-this-page contents. A couple of ## headings in',
        'the longer ones would give readers somewhere to aim.',
      ],
    })
  }

  // 3. things that collide
  const titles = new Map()
  for (const c of chapters) titles.set(c.title, (titles.get(c.title) ?? 0) + 1)
  const dupes = [...titles].filter(([t, n]) => n > 1 && t !== 'Introduction')
  if (dupes.length) {
    notes.push({
      title: `${dupes.length} chapter titles appear in more than one document`,
      body: [dupes.map(([t, n]) => `"${t}" ×${n}`).join(', ') + ' — identical rows in the syllabus.'],
    })
  }

  const numbered = documents.filter((d) => d.order !== null)
  if (numbered.length && numbered.length !== documents.length) {
    notes.push({
      title: 'some documents have a number in the filename and some do not',
      body: [
        `numbered: ${numbered.map((d) => d.file).join(', ')}`,
        'Numbered files run first, in order; the rest are placed by what they contain.',
        'Number all of them or none of them to keep the running order obvious.',
      ],
    })
  }

  const unlettered = documents.filter((d) => d.kind === 'appendix' && !d.numeral)
  if (unlettered.length) {
    notes.push({
      title: 'an appendix has no letter',
      body: unlettered.map((d) => `${d.file} — we assign one, which moves if a real letter appears later.`),
    })
  }

  const long = chapters.filter((c) => c.minutes >= 35)
  if (long.length) {
    notes.push({
      title: `${long.length} chapter(s) run past 35 minutes`,
      body: long.map((c) => `${c.minutes} min — ${c.title}`),
    })
  }

  if (!notes.length) return
  if (!detail) {
    console.log(`\n${notes.length} content notes — run \`npm run review\` for detail.`)
    return
  }

  console.log('\n' + '─'.repeat(72))
  console.log('CONTENT REVIEW — suggestions for the source, nothing here is fatal')
  console.log('─'.repeat(72))
  for (const [i, note] of notes.entries()) {
    console.log(`\n${i + 1}. ${note.title}`)
    for (const line of note.body) console.log(`   ${line}`)
  }
  console.log()
}

const chapters = readdirSync(OUT_CHAPTERS).length
const minutes = parts.flatMap((p) => p.chapters).reduce((sum, c) => sum + c.minutes, 0)
console.log(
  `${documents.length} documents -> ${chapters} chapters, ${parts.length} parts, ` +
    `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
)
for (const doc of documents) {
  console.log(`  ${(doc.numeral ?? '-').padStart(2)}  ${doc.key.padEnd(5)} ${doc.file}`)
}

review(documents, parts)
