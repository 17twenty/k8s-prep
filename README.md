# Kubernetes for Application Developers

A runnable CKAD cookbook, rendered as a course app. Vite + React + Tailwind v4 +
shadcn/ui. Progress lives in a cookie, so there is no account and no backend.

```bash
npm install
npm run dev       # http://localhost:5173
npm run content   # regenerate chapters from content/
npm run build     # runs `content` first
```

## The content pipeline

**`content/*.md` is the source of truth.** It is the author's markdown, fetched
verbatim from the gist. Nothing in `src/` should be hand-edited to change prose.

```
content/*.md
     |
     |  scripts/build-content.mjs
     v
src/content/chapters/<id>.md   one file per H1 section, lazy-loaded per route
src/content/preamble.md        the cookbook's own introduction
src/data/course.ts             GENERATED metadata — do not edit
```

`npm run content` splits each document on `#` headings, groups them into parts,
and derives everything the UI needs:

| Derived | How |
| --- | --- |
| Part grouping | `# Part VII - ...` headings open a new part; the appendices get their own |
| Chapter number | the author's own `9a`, `C.14`, `D.3` — kept rather than renumbered |
| Tags | `[CKAD]`, `[DEV]`, `[DEEP DIVE]` lifted out of the heading |
| Blurb | first real paragraph, skipping ones that just run into a command block |
| Duration | words ÷ 180 plus a minute per runnable command block |
| On-this-page | the `##` headings inside the section |

To add or edit material: change the markdown in `content/`, run `npm run content`,
done. Sidebar, syllabus, totals, prev/next and progress all follow.

### Re-syncing from the gist

```bash
GIST=https://gist.githubusercontent.com/17twenty/197ed2df9dd7ed63b897464674519b1a/raw
for f in kind-quickstart.md k8s-cheatsheet.md kubeadm-appendix.md cillium-gateay-appendix.md; do
  curl -sSL "$GIST/$f" -o "content/$f"
done
npm run content
```

Reading order is set by `SOURCES` in `scripts/build-content.mjs`: kind quickstart,
then the cookbook, then Appendix C (kubeadm), then Appendix D (Cilium).

## Code blocks

Every fence is routed by language and shape, because this cookbook contains four
genuinely different kinds of block:

| Fence | Rendered as |
| --- | --- |
| ` ```bash ` | shell transcript, with a `$` worked out per *logical* command (backslash continuations and heredocs get no prompt) |
| ` ```yaml ` | manifest sheet with line numbers |
| ` ```text ` containing `\|`, `v`, `+--` | **figure** — the ASCII diagrams are the best thing in here, so they are plate-mounted on chart paper |
| ` ```text ` otherwise | expected output; quiet, clearly not something you type |

Highlighting is `src/lib/highlight.ts` — about a hundred lines for shell and YAML.
Shiki would have been a megabyte to colour `kubectl get pods`.

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
