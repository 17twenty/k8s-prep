# Authoring

How to write content for this course app.

The short version: **write ordinary Markdown, put it in `content/`, run
`npm run content`.** Everything else on this page is about getting a better
result out of the same effort.

Nothing here is enforced. The pipeline is deliberately forgiving, because the
markdown should be readable on its own — in a gist, in an editor, on GitHub —
without knowing this renderer exists. Conventions buy you nicer output; ignoring
them costs you a little polish, never a build.

---

## Two ways to get content in

### A. From a gist

```bash
npm run sync            # mirror the gist into content/
npm run sync -- --dry   # preview first
npm run content         # rebuild the course
npm run dev
```

`sync` asks the gist API for its file list, so nothing is hardcoded: add a file
to the gist and it appears here; delete one and it goes.

Point it somewhere else with `GIST_ID`, and set `GITHUB_TOKEN` if you hit the
anonymous rate limit:

```bash
GIST_ID=abc123… npm run sync
```

### B. From a folder

Drop `.md` files straight into `content/` and build:

```bash
cp ~/writing/*.md content/
npm run content
npm run dev
```

That is the whole workflow. There is no registration step and no index file.

### Mixing the two

They coexist. `sync` records what it fetched in `content/.synced.json` and will
only ever delete files on that list, so your own documents are safe:

```
= kind-quickstart.md
M gitops-appendix.md      (updated from the gist)
· my-own-notes.md         (local, left alone)
```

---

## Running order

By default a document is placed by **what it contains**, not what it is called:

| The document's first heading | Where it lands |
| --- | --- |
| `# Supplemental - …` | first, before the course proper |
| has `# Part I - …` headings **and the most `[CKAD]` chapters** | the main course |
| has `# Part I - …` headings otherwise | a companion handbook, in its own section |
| `# Appendix C - …` | after the companions, in letter order |
| `# Appendix - …` (no letter) | same, and it is given the next free letter |
| anything else | last, alphabetically |

That works well for a set of documents written as a book. If you would rather
just say what order they go in, **put a number on the front of the filename**:

```
content/
  01-getting-started.md
  02-pods.md
  03-services.md
```

The number is a position only. It never appears in a URL or a title. Number all
of your files or none of them — a half-numbered folder is ambiguous, and
`npm run review` will say so.

---

## Structure inside a document

**Every `#` heading becomes a chapter.** That is the one rule worth internalising.

```markdown
# Kubernetes for Application Developers     <- document title (and preamble)

# Part I - Learn the Control Loop           <- groups the chapters that follow

# 0. Lab Setup [CKAD]                       <- a chapter
# 1. The Control Loop [CKAD] [DEV]          <- a chapter

# Appendix A - Mental Models                <- appendices group together
```

- The **first heading** is the document title. Its body is the preamble: for the
  main course that becomes the landing page, for a companion it becomes the
  opening chapter.
- `# Part …` headings group chapters. Optional — a document with no parts is
  just a flat list of chapters.
- **`## headings` inside a chapter become its "on this page" contents.** Two or
  more and a reader gets a navigation rail. Roughly two thirds of the current
  content has none, which is the single cheapest improvement available.

### Numbering

Whatever scheme you use is kept and displayed as-is — `0.`, `9a`, `C.14`, `D.3`.
Don't renumber for our benefit.

### Tags

Square-bracket markers at the **end** of a heading become flags on the page:

```markdown
# 12. Break a Service [CKAD] [DEV]
```

Any all-caps marker works — `[CKAD]`, `[DEV]`, `[OPS]`, `[PLATFORM]`,
`[DEEP DIVE]`, or one you invent. New ones are picked up automatically.

Define what yours mean near the top of the document and the landing page will
explain them for you:

```markdown
Sections are marked:

- **[CKAD]** - directly relevant to CKAD
- **[OPS]** - operating delivery systems
```

---

## Code blocks

**Always tag the fence.** It decides how the block is drawn, and it is the
difference between a command a reader can copy and a grey box they cannot.

| Fence | Rendered as |
| --- | --- |
| `bash` (also `sh`, `zsh`, `console`) | a terminal transcript with a `$` per command, and a copy button |
| `yaml`, `go`, `json`, `dockerfile`, `toml` | a listing with line numbers and a copy button |
| `diff` | red removals, green additions, no line numbers |
| `text` | expected output, or a **figure** if it looks like a drawing |

Two things worth knowing:

**Prompts are worked out, not typed.** Write plain commands — no `$`. Line
continuations and heredocs correctly get no prompt:

````markdown
```bash
kubectl run web-gate -n traffic --image=nginx \
  --port=80 --dry-run=client -o yaml > gate.yaml
```
````

**`text` is guessed at.** A block containing `|`, `v`, `+--` or `->` is treated
as a diagram and framed as a figure; anything else is treated as output. This is
right almost always, but if a block is really YAML or really a command, tag it
as such and it will render properly instead.

Listings over 40 lines fold automatically with a *Show all N lines* control, so
a long program does not bury the prose explaining it.

---

## What gets derived for you

You write the markdown; the pipeline works out the rest.

| Shown on the page | Where it comes from |
| --- | --- |
| Chapter blurb | the first real paragraph — one that isn't just `Check:` before a command |
| Duration | word count ÷ 180, plus a minute per runnable command block |
| *Lab* vs *Brief* | whether the chapter contains any commands |
| On-this-page | the `##` headings |
| Landing page copy | the main document's preamble, tag legend and first diagram |

So the **first paragraph of every chapter is doing double duty** — it is the
syllabus description too. One plain sentence of what the chapter is for beats a
line that runs straight into a code block.

---

## URLs and progress

A chapter's URL is a slug of its title:

```
# 20. Storage: Pod Lifetime vs Data Lifetime
    -> /chapter/ck-storage-pod-lifetime-vs-data-lifetime
```

**Renaming a chapter changes its URL.** Readers' progress is kept in a cookie
keyed on those ids, so a rename loses that chapter's tick — completions for ids
that no longer exist are quietly dropped. Reordering, re-tagging and rewriting
the body are all free; only the title matters.

Run `npm run content` and compare if you want to see what moved.

---

## Before you publish

```bash
npm run review
```

Reports where the pipeline had to guess: ambiguous `text` blocks, untagged
chapters, colliding titles, chapters with no contents list. None of it is fatal
and none of it blocks a build — it is a list of places the page could be better,
in rough order of how much it costs a reader.

---

## A minimal document

````markdown
# Appendix - Scratch Notes [DEV]

One paragraph saying what this is for. It becomes the section description.

# 1. The First Thing [DEV]

What this chapter is about, in a sentence. This becomes the blurb.

## Setting it up

```bash
kubectl create namespace scratch
```

Expected:

```text
namespace/scratch created
```

## How it fits together

```text
Client
  |
  v
Service
  |
  v
Pod
```
````

Save it in `content/`, run `npm run content`, and it is in the course.
