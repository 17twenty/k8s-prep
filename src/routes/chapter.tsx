import { cn } from 'cn'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { AppShell, TagFlag } from '@/components/app-shell'
import { Markdown } from '@/components/markdown'
import { formatDuration, getChapter, neighbours } from '@/data/course'
import { useProgress } from '@/lib/use-progress'

const bodies = import.meta.glob('../content/chapters/*.md', { query: '?raw', import: 'default' })


function useChapterBody(id: string) {
  const [body, setBody] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let live = true
    setBody(null)
    setMissing(false)
    const load = bodies[`../content/chapters/${id}.md`]
    if (!load) {
      setMissing(true)
      return
    }
    load().then((text) => {
      if (live) setBody(text as string)
    })
    return () => {
      live = false
    }
  }, [id])

  return { body, missing }
}

/**
 * The in-page contents. Two thirds of these chapters have no subheadings at
 * all, so this is floated into the right margin rather than given a grid
 * column — the reading column must land in exactly the same place on every
 * chapter, whether or not there is a contents list to show.
 */
function OnThisPage({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    )
    for (const h of headings) observer.observe(h)
    return () => observer.disconnect()
  }, [sections])

  if (sections.length < 2) return null

  return (
    <nav aria-label="On this page" className="sticky top-24">
      <div className="type-label mb-4 text-ink-3">On this page</div>
      <ul className="space-y-2 border-l border-rule">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn(
                '-ml-px block border-l py-0.5 pl-4 text-[0.8125rem] leading-snug transition-colors',
                active === section.id
                  ? 'border-signal text-ink'
                  : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ChapterPage() {
  const { id = '' } = useParams()
  const chapter = getChapter(id)
  const { isDone, toggle, visit } = useProgress()
  const { body, missing } = useChapterBody(id)

  useEffect(() => {
    if (getChapter(id)) visit(id)
    window.scrollTo({ top: 0 })
  }, [id, visit])

  if (!chapter) return <Navigate to="/" replace />

  const { prev, next } = neighbours(chapter.id)
  const done = isDone(chapter.id)

  return (
    <AppShell
      breadcrumb={[
        { label: 'Kubernetes for Devs', to: '/' },
        { label: chapter.part.title },
        { label: chapter.title },
      ]}
    >
      <div className="relative mx-auto max-w-[47rem] px-6 py-12 sm:px-10 sm:py-16">
        <aside
          aria-hidden={chapter.sections.length < 2}
          className="absolute top-16 left-full hidden h-[calc(100%-8rem)] w-52 pl-12 min-[1600px]:block"
        >
          <OnThisPage sections={chapter.sections} />
        </aside>

        <article className="min-w-0">
          <header className="border-b border-rule pb-9">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="type-label text-ink-3">{chapter.part.title}</span>
              <span className="mono text-[0.65rem] text-ink-2">
                {formatDuration(chapter.minutes)}
              </span>
              {chapter.commands > 0 && (
                <span className="mono text-[0.65rem] text-ink-2">
                  {chapter.commands} commands
                </span>
              )}
              {chapter.tags.map((tag) => (
                <TagFlag key={tag} tag={tag} />
              ))}
            </div>

            <h1 className="type-display mt-6 flex gap-4 text-[clamp(1.875rem,4vw,3rem)]">
              {chapter.number && (
                <span className="mono shrink-0 pt-[0.45em] text-[0.9rem] text-signal tabular-nums">
                  {chapter.number}
                </span>
              )}
              <span className="text-balance">{chapter.title}</span>
            </h1>
          </header>

          <div className="pt-8 [&>*:first-child]:mt-0">
            {body !== null ? (
              <Markdown>{body}</Markdown>
            ) : missing ? (
              <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink-2">
                This chapter has no content file. Run{' '}
                <code className="mono text-kilo">npm run content</code> to rebuild from{' '}
                <code className="mono text-kilo">content/</code>.
              </p>
            ) : (
              <div aria-hidden="true" className="space-y-4">
                {[100, 92, 96, 64].map((w, i) => (
                  <div key={i} className="h-4 animate-pulse bg-ink/[0.06]" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
          </div>

          <footer className="mt-16 border-t border-rule pt-8">
            <button
              type="button"
              onClick={() => toggle(chapter.id)}
              aria-pressed={done}
              className={cn(
                'type-label inline-flex h-11 items-center gap-2.5 border px-5 transition-all duration-200',
                done
                  ? 'border-signal bg-signal text-ink'
                  : 'border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
              )}
            >
              <Check
                className={cn('size-4 transition-transform', done ? 'scale-100' : 'scale-0')}
                strokeWidth={3}
              />
              <span className={cn('transition-all', done ? '' : '-ml-6')}>
                {done ? 'Logged' : 'Mark complete'}
              </span>
            </button>

            <nav className="mt-10 grid gap-px border border-rule bg-rule sm:grid-cols-2">
              {prev ? (
                <Link
                  to={`/chapter/${prev.id}`}
                  className="group bg-paper p-5 transition-colors hover:bg-sheet"
                >
                  <span className="type-label flex items-center gap-2 text-ink-3">
                    <ArrowLeft className="size-3" /> Previous
                  </span>
                  <span className="mt-2 block text-[0.9375rem] font-semibold text-ink group-hover:text-kilo">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <Link to="/" className="group bg-paper p-5 transition-colors hover:bg-sheet">
                  <span className="type-label flex items-center gap-2 text-ink-3">
                    <ArrowLeft className="size-3" /> Back to
                  </span>
                  <span className="mt-2 block text-[0.9375rem] font-semibold text-ink group-hover:text-kilo">
                    Course overview
                  </span>
                </Link>
              )}

              {next && (
                <Link
                  to={`/chapter/${next.id}`}
                  className="group bg-paper p-5 text-right transition-colors hover:bg-sheet"
                >
                  <span className="type-label flex items-center justify-end gap-2 text-ink-3">
                    Next <ArrowRight className="size-3" />
                  </span>
                  <span className="mt-2 block text-[0.9375rem] font-semibold text-ink group-hover:text-kilo">
                    {next.title}
                  </span>
                </Link>
              )}
            </nav>
          </footer>
        </article>
      </div>
    </AppShell>
  )
}
