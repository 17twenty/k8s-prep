# Kubernetes for Application Developers

A runnable CKAD cookbook, rendered as a course app. Vite + React + Tailwind v4 +
shadcn/ui. Progress lives in a cookie, so there is no account and no backend.

```bash
npm install
npm run dev       # http://localhost:5173
npm run sync      # pull the latest markdown from the gist
npm run content   # regenerate chapters from content/
npm run review    # what the source could do better (never fatal)
npm run build     # runs `content` first
```

**Writing content?** See [AUTHORING.md](./AUTHORING.md) — conventions, both
authoring routes, and what each fence language renders as.

## The content pipeline

**`content/*.md` is the source of truth.** It is the author's markdown, fetched
verbatim from the gist. Nothing in `src/` should be hand-edited to change prose.

Two scripts, one job each. Only the first touches the network, which is why
`npm run build` does not depend on GitHub being reachable.

```
gist  --[ sync-content.mjs ]-->  content/  --[ build-content.mjs ]-->  src/
```

| Script | Does | Does not |
| --- | --- | --- |
| `sync-content.mjs` | mirror the gist into `content/` | parse anything |
| `build-content.mjs` | derive chapters and metadata | touch the network |

`npm run review` reports where the pipeline is *guessing* — ambiguous fences,
untagged chapters, colliding titles. Nothing it finds stops a build; the
markdown is written by someone who is not thinking about this renderer, and it
should stay that way. But every note is a place the page can be wrong, so it is
the list worth sending upstream.

Generated output, none of it hand-maintained:

```
src/content/chapters/<id>.md   one file per H1 section, lazy-loaded per route
src/data/course.ts             metadata, totals, and the cookbook's preamble
```

`npm run content` splits each document on `#` headings, groups them into parts,
and derives everything the UI needs:

| Derived | How |
| --- | --- |
| Document order & part grouping | see the classification table above — nothing keyed on filenames |
| Chapter number | the author's own `9a`, `C.14`, `D.3` — kept rather than renumbered |
| Tags | `[CKAD]`, `[DEV]`, `[DEEP DIVE]` lifted out of the heading |
| Blurb | first real paragraph, skipping ones that just run into a command block |
| Duration | words ÷ 180 plus a minute per runnable command block |
| On-this-page | the `##` headings inside the section |
| Landing page copy | the cookbook's preamble — its statement of intent, target version, `[CKAD]` legend and teaching-loop diagram are all extracted, so the hero quotes the author instead of a stale copy of him |

To add or edit material: change the markdown in `content/`, run `npm run content`,
done. Sidebar, syllabus, totals, prev/next and progress all follow.

### Re-syncing from the gist

```bash
npm run sync            # mirror content/ against the gist
npm run sync -- --dry   # show what would change first
npm run content         # then rebuild
```

`scripts/sync-content.mjs` asks the gist API for its file list, so **no filename
is hardcoded anywhere**. Add a document to the gist and it arrives; remove one
and it goes. Override the gist with `GIST_ID=...`, and set `GITHUB_TOKEN` if you
hit the anonymous rate limit.

It records what it fetched in `content/.synced.json` and will only ever delete
files on that list, so a locally authored document sitting alongside the synced
ones is never touched. The two routes in [AUTHORING.md](./AUTHORING.md) coexist.

### How a new document places itself

Documents are classified by what they contain, not what they are called:

| Signal in the document | Result |
| --- | --- |
| has `# Part ...` **and the most `[CKAD]` sections** | the core cookbook — supplies the landing page, volume *The cookbook* |
| has `# Part ...` otherwise | a companion handbook — keeps its own parts, gets a volume named after itself |
| opens `# Supplemental - ...` | front matter, runs first |
| opens `# Appendix C - ...` | runs after the companions, in letter order |
| opens `# Appendix - ...` with no letter | gets the next free letter automatically |
| anything else | runs last, alphabetically |

More than one document supplies `# Part` headings, so "has parts" cannot mean
"is the course". The primary text is the part-bearing document carrying the most
`[CKAD]` sections — this is a CKAD course, so that is what *the cookbook* means
here. Everything else with parts is a companion and keeps its own structure.

Tags are read from the **end** of a heading rather than matched against a fixed
list, so a document that invents a marker (`[OPS]`, `[PLATFORM]`) still gets a
clean title, contributes to the `Tag` union, and adds its own line to the legend
on the landing page. Unknown markers render with the neutral flag rather than
failing the build.

The document's title becomes the part; its opening section becomes that part's
first chapter, titled *Introduction*, so nothing in the source is dropped.
Appendices group under one **Beyond the exam** volume in the rail.

`PINNED_KEYS` in `scripts/build-content.mjs` is the one place a filename appears.
It fixes the id prefixes (`ck-`, `c-`, `d-`) so URLs already shared and progress
already saved keep working. **A new document does not need an entry** — it gets
initials derived from its filename (`multi-tenancy.md` → `mt-`).

Chapter ids are slugs of chapter titles, so renaming a chapter upstream does
change its URL. Completions for ids that no longer exist are pruned from the
cookie on load rather than accumulating forever.

## Code blocks

Every fence is routed by language and shape, because this cookbook contains four
genuinely different kinds of block:

| Fence | Rendered as |
| --- | --- |
| ` ```bash `, `sh`, `shell`, `zsh`, `console` | shell transcript, with a `$` worked out per *logical* command (backslash continuations and heredocs get no prompt) |
| ` ```yaml `, `go`, `json`, `dockerfile`, `toml` | listing: line numbers, a language tab, `tab-size: 2` |
| ` ```text ` containing `\|`, `v`, `+--` | **figure** — the ASCII diagrams are the best thing in here, so they are plate-mounted on chart paper |
| ` ```text ` otherwise | expected output; quiet, clearly not something you type |

Listings over 40 lines fold, with a *Show all N lines* control — the Go controller
in chapter 34 is 203 lines and would otherwise bury the prose explaining it. The
control is **in flow beneath the code, never absolutely positioned over it**;
position it over the block and it hides the last two lines in both states.

Copying goes through `src/lib/clipboard.ts`, not `navigator.clipboard` directly.
That API is undefined outside a secure context (any dev server reached over the
LAN rather than localhost) and rejects with `NotAllowedError` when the document
is unfocused or permission is refused — so it falls back to `execCommand`, and
restores the reader's text selection afterwards. The button reports failure
rather than doing nothing, and is visible at rest: an invisible 28px target
cannot be hit on touch, and missing it double-clicks the code underneath.

Highlighting is `src/lib/highlight.ts` — about a hundred and fifty lines for shell,
YAML and Go. Shiki would have been a megabyte to colour `kubectl get pods`.

Adding a language means adding a regex there and a set membership in
`code.tsx` (`LISTINGS`) or `highlight.ts` (`SHELLS`) — two lines. Anything
unrecognised still renders safely as output or, if it is drawn with `|` and
`+--`, as a figure.

## Where things are

| Path | What |
| --- | --- |
| `src/routes/overview.tsx` | Start page: hero, method, syllabus, prerequisites |
| `src/routes/chapter.tsx` | Chapter template, lazy body, on-this-page rail |
| `src/components/markdown.tsx` | markdown → design system |
| `src/components/code.tsx` | the four block treatments |
| `src/components/nav-rail.tsx` | collapsible parts grouped by volume |
| `src/lib/use-progress.tsx` | `useProgress()` — completion, resume point, totals |
| `src/index.css` | tokens, type scale, chart textures |

## One theme, on purpose

There is no dark mode and no `prefers-color-scheme` anywhere. The chart is
printed on paper; paper does not have a night mode. `:root` declares
`color-scheme: only light` so the browser also stops dressing *its own* widgets
— scrollbars, form controls — for an OS-level dark mode they would then clash
with. Scrollbars are restyled thin, in `--rule`, inset with a transparent border
so they sit correctly on paper, on sheet and inside code blocks.

The navigation rail hides its scrollbar entirely (`.no-scrollbar`) and carries
its own affordances instead, all driven by real scroll state
(`src/lib/use-scroll-edges.ts`):

- edge fades that appear only when there is content past that edge,
- a chevron that pages down on press and retires at the bottom,
- and the current chapter is scrolled into view on navigation — otherwise
  nothing tells you that the highlighted entry is D.25, eighty items down.

The rail scrolls, never the window. Reduced motion is respected.

## The design

Kubernetes is Greek for *helmsman*, and the vocabulary is maritime throughout —
manifests, ports, pods, helm, pilots. So the course is drawn as an admiralty
chart: chart-paper ground, marine ink, a deep-water navigation rail, and the
**Kilo** signal flag (blue hoist, yellow fly — the flag for the letter K) as the
only accent.

Three rules worth keeping if you extend it:

- **Width is a signal.** Archivo carries a `wdth` axis. Display type runs
  expanded (`.type-display`), chart labelling runs condensed (`.type-label`).
  Reach for width before reaching for another font.
- **Code is printed, not glowing.** Every other Kubernetes site renders a dark
  terminal; the inversion is the point, and a manifest is literally a cargo
  document.
- **Token colours are chart conventions.** Blue is water (flags, YAML keys),
  green is land (strings), red is a hazard (variables, numbers).
- **The reading column never moves.** 89 of the 122 chapters have no `##`
  headings, so the on-this-page list is *floated into the right margin*
  (`absolute left-full`, shown above 1600px) rather than given a grid column.
  Give it a column and the article jumps sideways on three quarters of the
  course. Article, heading and footer nav land on the same pixel everywhere.

## Progress cookie

`k8sprep.progress`, `SameSite=Lax`, one year, `Secure` over HTTPS:

```json
{ "done": ["ck-lab-setup"], "at": "ck-pods-the-unit-kubernetes-schedules", "since": 1730000000000 }
```

Read during the first render rather than in an effect — child effects run before
the provider's, so hydrating later silently drops the current chapter's `visit`
and then writes the empty default back over the cookie.
