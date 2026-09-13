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
- 2026-09-13T12:48:59+10:00 ## k8s-prep — theming is single-mode by design; rail scrollbar is hidden

**No dark mode, deliberately.** No `prefers-color-scheme` anywhere, no `.dark` token
block, `.dark` variant never applied. Verified: body bg/fg identical under emulated
light and dark. `:root` sets `color-scheme: only light` so the browser stops styling
*its own* widgets (scrollbars, form controls) for an OS dark mode — that was the one
remaining leak, since `colorScheme` computed as `normal` before.

Global scrollbars restyled thin in `--rule` with
`background-clip: padding-box; border: 3px solid transparent` — the inset trick means
one rule works on paper, on sheet, and inside horizontally-scrolling code blocks.
Don't go back to a solid `border: 3px solid var(--paper)`; it mismatches everywhere
that isn't the page background.

**Nav rail hides its scrollbar** (`.no-scrollbar` utility: `scrollbar-width: none` +
`::-webkit-scrollbar{display:none}`) and replaces it with real affordances driven by
`src/lib/use-scroll-edges.ts` (`useScrollEdges(viewport, content)`):
- top/bottom gradient fades, shown only when there is content past that edge;
- a ChevronDown button that pages down 80% of viewport height and retires at the
  bottom (`tabIndex -1` + `pointer-events-none` when hidden);
- on `currentId` change, the active link is scrolled into view via rAF + manual
  `scrollTop` arithmetic on the rail — NOT `scrollIntoView`, which also scrolls the
  window.

The hook must observe the *content* wrapper, not just the scroll container: the rail
grows/shrinks when parts expand, which a container-only ResizeObserver misses.

Verified: 0px scrollbar gutter, no scrollbar pixels at the rail edge, deep chapter
(D.25) auto-revealed, chevron retires at bottom, works in the mobile Sheet, and
reduced-motion gets an instant jump instead of a smooth scroll.
- 2026-09-13T13:55:02+10:00 ## k8s-prep — content discovery is filename-free (gist can gain/lose documents)

`npm run sync` (`scripts/sync-content.mjs`) hits the **gist API**
(`api.github.com/gists/$GIST_ID`, default `197ed2df9dd7ed63b897464674519b1a`,
override via env; `GITHUB_TOKEN` for rate limits) and mirrors every `*.md` into
`content/` — adding new files, updating changed ones, deleting orphans. Always fetch
`raw_url`, never `file.content` (truncated for big files). `--dry` previews.
Build does NOT run sync (no network in build).

`scripts/build-content.mjs` **discovers** `content/*.md` and classifies each document
by its own headings, not its filename:
- contains `# Part [IVX]+ - ...` → the core cookbook (rank 1, preamble + auto parts)
- opens `# Supplemental - ...`   → rank 0
- opens `# Appendix X - ...`     → rank 2, ordered by letter
- opens `# Appendix - ...` (no letter) → rank 2, **auto-assigned the next free letter**
- otherwise → rank 3, alphabetical

Volumes collapsed to three: `Supplemental` / `The cookbook` / `Beyond the exam`
(was five bespoke labels; appendices now share one volume so new ones just slot in).
A document's title becomes the **part**; its opening section becomes that part's first
chapter titled **"Introduction"** — but the chapter **id stays keyed to the document
title** (`idBasis`), because the id is the URL and is in users' cookies.

`PINNED_KEYS` is the only place filenames appear — it pins id prefixes
(`kind-`, `ck-`, `c-`, `d-`) for URL/progress stability. New docs need no entry;
`deriveKey()` makes initials from the filename (`multi-tenancy.md` → `mt`).

`prune()` in `use-progress.tsx` drops completions for ids that no longer exist —
the upstream cookbook gets edited, so chapters get renamed/merged and the cookie
would otherwise only grow.

Sept 2026 sync: gained `multi-tenancy.md` (→ Appendix **E**, key `mt`, 12 chapters);
cookbook 9a merged into 9 and ch23 retitled. 122 → 134 chapters, 13 hr 22 min.
Only 2 ids moved, both genuine upstream renames.
- 2026-09-13T14:01:32+10:00 ## k8s-prep — the two content scripts have one job each (keep it that way)

```
gist --[ sync-content.mjs ]--> content/ --[ build-content.mjs ]--> src/
```
`sync` = network mirror only, no parsing. `build` = derivation only, no network.
`npm run build` runs `content` but NOT `sync`, on purpose: a build must not depend
on GitHub being reachable.

### Review (Sept 2026) — findings worth not regressing
- **`src/content/preamble.md` was dead output**: generated every build, imported by
  nothing, while `overview.tsx` hand-copied four things out of it (lede, "Kubernetes
  1.35", the `[CKAD]` legend, 20 lines of teaching-loop ASCII). All would drift on the
  next gist edit. Fixed: `readPreamble()` extracts `intro = { statement, target,
  version, legend, diagram }` into `course.ts`; `preamble.md` no longer written.
  **If you add landing-page copy that exists in the source, extract it — don't retype it.**
- Removed genuinely unused generated fields: `hasYaml` (135 entries), `volumes`
  export, `indexInPart`/`partIndex` on flatChapters. Only these are consumed:
  `parts`, `flatChapters`, `getChapter`, `neighbours`, `totals`, `formatDuration`,
  `intro`, types `Part`/`Tag`.
- `paragraphs()` used to strip `_` as emphasis, corrupting identifiers like
  `ip_forward` in blurbs. Now strips only `` ` `` and `*`.
- Head chapters ("Introduction") were repeating their part's blurb verbatim; now
  blanked when identical.
- Hardcoded "Two appendices go past the exam" was already wrong after Appendix E
  landed — now derived from `parts.filter(p => p.volume === 'Beyond the exam')`.

Still hand-written editorial (acceptable, but it can drift): the four "Before you
cast off" prerequisite cards in `overview.tsx`.
