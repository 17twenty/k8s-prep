/**
 * Mirrors the source gist into content/. This is the only script that touches
 * the network, and the only one that writes to content/ — it does no parsing
 * and knows nothing about chapters. `build-content.mjs` picks up from there.
 *
 * The file list comes from the gist API rather than being hardcoded, so a new
 * appendix arrives by existing, and one deleted upstream is deleted here.
 * Deliberately not wired into `npm run build`: a build should not depend on
 * GitHub being reachable.
 *
 *   npm run sync           # then `npm run content`
 *   npm run sync -- --dry  # show what would change
 *
 * GIST_ID overrides the source. GITHUB_TOKEN lifts the anonymous rate limit.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GIST_ID = process.env.GIST_ID ?? '197ed2df9dd7ed63b897464674519b1a'
const MANIFEST = '.synced.json'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'content')
const dry = process.argv.includes('--dry')

const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  headers: {
    Accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  },
})
if (!res.ok) {
  throw new Error(`gist ${GIST_ID}: ${res.status} ${res.statusText}`)
}

const gist = await res.json()
if (!gist.files) throw new Error(`gist ${GIST_ID}: response contained no file list`)
const files = Object.values(gist.files).filter((f) => f.filename.endsWith('.md'))
if (!files.length) throw new Error('gist contains no markdown files')

mkdirSync(dir, { recursive: true })

/**
 * Which files this script is responsible for.
 *
 * Only files it fetched previously may be deleted. Anything else in content/ is
 * someone's own writing — the two authoring routes are meant to coexist, and a
 * sync must never eat a locally authored document.
 */
const manifestPath = join(dir, MANIFEST)
const owned = new Set(
  existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? [] : [],
)
const onDisk = new Set(readdirSync(dir).filter((f) => f.endsWith('.md')))
const local = [...onDisk].filter((f) => !owned.has(f) && !files.some((g) => g.filename === f))

let changed = 0
const fetched = []

for (const file of files) {
  // `content` is truncated for large files, so always read the raw URL
  const body = await fetch(file.raw_url).then((r) => {
    if (!r.ok) throw new Error(`${file.filename}: ${r.status}`)
    return r.text()
  })

  const path = join(dir, file.filename)
  const before = onDisk.has(file.filename) ? readFileSync(path, 'utf8') : null
  fetched.push(file.filename)

  if (before === body) {
    console.log(`  = ${file.filename}`)
    continue
  }
  changed++
  console.log(`  ${before === null ? '+' : 'M'} ${file.filename}  (${body.length} bytes)`)
  if (!dry) writeFileSync(path, body)
}

for (const orphan of owned) {
  if (fetched.includes(orphan) || !onDisk.has(orphan)) continue
  changed++
  console.log(`  - ${orphan}  (no longer in the gist)`)
  if (!dry) rmSync(join(dir, orphan))
}

for (const file of local) {
  console.log(`  · ${file}  (local, left alone)`)
}

if (!dry) {
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ gist: GIST_ID, syncedAt: new Date().toISOString(), files: fetched.sort() }, null, 2)}\n`,
  )
}

console.log(
  dry
    ? `\n${changed} file(s) would change. Drop --dry to apply.`
    : changed
      ? `\n${changed} file(s) updated — now run \`npm run content\`.`
      : '\nAlready up to date.',
)
