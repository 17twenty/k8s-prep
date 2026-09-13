# Project Knowledge

- 2026-09-12T15:32:31+10:00 ## k8s-prep — "Passage to Kubernetes" CKAD/CKA course app

Stack: Vite 8 + React + TS + Tailwind v4 (`@tailwindcss/vite`) + shadcn/ui (new CLI,
`npx shadcn init -b radix -p nova`; note it imports `cn` from the `cn` npm package,
not `@/lib/utils`). Router: `react-router` v7 (import from `react-router`, not `-dom`).
Fonts: `@fontsource-variable/archivo/wdth.css` + `martian-mono/wdth.css`.

Design concept: Kubernetes = Greek "helmsman"; the ecosystem vocabulary is maritime
(manifests, ports, pods, helm). So the UI is an **admiralty chart** — chart-paper
ground (`--paper #dce2df`), marine ink (`--ink #0f2f2d`), deep-water nav rail
(`--abyss #0b2422`), and the **Kilo signal flag** (blue `#1b4b86` + yellow `#e9b700`,
the flag for the letter K) as the only accent. Archivo's `wdth` axis carries the
register: `.type-display` expanded 112%, `.type-label` condensed 84% uppercase.
kubectl blocks are rendered as ink-on-paper, deliberately inverting the usual
dark-terminal treatment.

Single source of truth for the curriculum: `src/data/course.ts`. Sidebar, syllabus,
totals, prev/next all derive from it. Content is placeholder, marked `TODO —`.

### Gotcha: cookie progress store (`src/lib/use-progress.tsx`)
Two bugs found and fixed here; don't reintroduce them.
1. **Init state lazily** with `useState(loadProgress)`, NOT in an effect. Child
   effects run before the parent provider's, so `ChapterPage`'s `visit(id)` lands
   first and then gets clobbered by hydration — and the save effect fires with the
   empty default and wipes the cookie.
2. **The `update` reducer must return `prev` unchanged** when nothing changed.
   `visit` runs from an effect on every chapter render; returning a fresh object
   (e.g. via `{...value, since: ...}` unconditionally) spins an infinite render loop.
Persist in a `useEffect` keyed on `progress`, skipping the first run via a ref —
not inside the state updater (StrictMode double-invokes updaters).
- 2026-09-13T09:48:43+10:00 ## k8s-prep — real content pipeline (supersedes the placeholder `course.ts`)

Content now comes from the author's gist (4 markdown docs, ~122 H1 sections):
`content/*.md` is the **source of truth**; `scripts/build-content.mjs` (`npm run content`,
also run by `npm run build`) splits on H1 and emits:
- `src/content/chapters/<id>.md` — lazy-loaded via `import.meta.glob('...?raw')`, so
  each chapter is its own bundle chunk.
- `src/content/preamble.md`
- `src/data/course.ts` — **GENERATED, never hand-edit**.

Derived automatically: part grouping (`# Part VII - ...` opens a part), the author's own
chapter numbers (`9a`, `C.14`), `[CKAD]/[DEV]/[DEEP DIVE]` tags lifted from headings,
blurb (first paragraph that doesn't just run into a code fence), duration
(words/180 + 1.1 min per runnable command block ⇒ ~12.8 hr total), and `##` subheadings
for the on-this-page rail. Reading order = the `SOURCES` array.

### Code-fence routing (`src/components/code.tsx`)
The source tags every fence. Four distinct treatments, which is most of why it looks good:
- `bash` → shell transcript; `$` prompt computed per **logical** command via
  `promptLines()` (backslash continuations, heredocs and `|`/`&&` get no prompt).
- `yaml` → manifest sheet with line numbers.
- `text` + `looksLikeDiagram()` (contains `|`/`v`/`+--`/`->`) → **figure**, plate-mounted
  on chart paper. ~158 of the 326 text blocks are ASCII diagrams; they are the best
  thing in the content, so don't render them as terminal output.
- `text` otherwise → quiet "expected output" plaque.

Highlighter is hand-rolled in `src/lib/highlight.ts` (~100 lines, bash + yaml only).
Deliberately not Shiki — a megabyte to colour `kubectl get pods`. Token colours follow
chart conventions: blue = water (flags, YAML keys), green = land (strings),
rust = hazard (variables, numbers).

### Other decisions
- Routes are `lazy()` so react-markdown (~180KB) only loads on chapter pages.
- `slugify()` is duplicated in `src/lib/slug.ts` and the build script — they MUST match
  or the on-this-page anchors break.
- Rail: 122 chapters ⇒ parts are collapsible, grouped by `volume`
  (Supplemental / The cookbook / CKA territory / Platform), auto-opening the current part.
- Article prose column is 42rem; wider than that and Archivo runs past ~90ch.
- 2026-09-13T10:18:52+10:00 ## k8s-prep — chapter layout: the reading column must not move

**89 of 122 chapters have zero `##` subheadings**, so any layout that gives the
on-this-page TOC its own grid column makes the article jump sideways on three
quarters of the course. The original bug: `xl:grid-cols-[minmax(0,1fr)_13rem]`
with `article xl:justify-self-end` — when `OnThisPage` returned null the column
stayed, and the article was shoved hard against the right edge with a huge void
on the left.

Fix (`src/routes/chapter.tsx`): one centred wrapper `relative mx-auto max-w-[47rem]`
(= 42rem of text + `sm:px-10`), with the TOC floated out of flow into the right
margin: `absolute top-16 left-full w-52 pl-12 hidden min-[1600px]:block`, and a
`sticky top-24` nav inside it. 1600px is the point where the centred 47rem column
leaves ≥16rem of right margin once the 19rem rail is subtracted.

Verified article/h1/footer-nav left edge and width are pixel-identical across
0-, 9- and 18-section chapters at 1100/1400/1680px, and no h-overflow at 390/768/1024.

Related: the markdown container uses `pt-8 [&>*:first-child]:mt-0` — otherwise the
header's `pb-9` stacks with the first paragraph's `mt-5`.
