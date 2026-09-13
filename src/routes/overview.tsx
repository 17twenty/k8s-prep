import { cn } from 'cn'
import { ArrowUpRight, Check, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { AppShell, Flag, Sounding } from '@/components/app-shell'
import { CompassRose, DepthContours } from '@/components/chart-marks'
import { FigureBlock } from '@/components/code'
import { flatChapters, formatDuration, getChapter, parts, totals, type Tag } from '@/data/course'
import { useProgress } from '@/lib/use-progress'

const tagTone: Record<Tag, 'kilo' | 'signal' | 'quiet'> = {
  CKAD: 'kilo',
  DEV: 'quiet',
  'DEEP DIVE': 'signal',
}

const tagMeaning: [Tag, string][] = [
  ['CKAD', 'Directly relevant to the exam.'],
  ['DEV', 'Practical application developer knowledge.'],
  ['DEEP DIVE', 'Controllers, operators and platform engineering.'],
]

/** The spine of the whole cookbook, quoted from its own preamble. */
const TEACHING_LOOP = `problem
  |
  v
mental model
  |
  v
small experiment
  |
  v
observe Kubernetes
  |
  v
change one thing
  |
  v
observe the consequence
  |
  v
break an assumption
  |
  v
explain why`

export function Overview() {
  const { started, resumeId, doneCount, total, fraction, minutesLeft, isDone, reset } = useProgress()
  const resume = getChapter(resumeId)
  const first = flatChapters[0]
  const ckadCount = flatChapters.filter((c) => c.tags.includes('CKAD')).length

  return (
    <AppShell breadcrumb={[{ label: 'Kubernetes for Devs' }, { label: 'Overview' }]}>
      {/* ---------------------------------------------------------------- */}
      {/* The chart title block                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="chart-grid relative overflow-hidden border-b border-rule">
        <div className="tooth pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply" />
        <DepthContours className="pointer-events-none absolute inset-x-0 top-6 h-64 w-full text-ink/15" />
        <CompassRose className="pointer-events-none absolute top-4 -right-24 hidden size-[30rem] text-ink/30 xl:block 2xl:-right-12 2xl:size-[34rem]" />

        <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-14 sm:px-10 sm:pt-24 sm:pb-20">
          <div className="rise flex items-center gap-2" style={{ '--d': '0ms' } as React.CSSProperties}>
            <Flag tone="kilo">CKAD</Flag>
            <Flag tone="quiet">Kubernetes 1.35</Flag>
          </div>

          <h1
            className="rise type-display mt-7 max-w-[15ch] text-[clamp(2.5rem,6.5vw,5rem)]"
            style={{ '--d': '70ms' } as React.CSSProperties}
          >
            Kubernetes for Application Developers
          </h1>

          <p
            className="rise mt-7 max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink-2 sm:text-lg"
            style={{ '--d': '140ms' } as React.CSSProperties}
          >
            A runnable cookbook for CKAD candidates. The goal is not to memorise YAML — it is to build
            a mental model, use the API deliberately, observe what the control plane did, break things
            on purpose, and work out why they broke.
          </p>

          <div
            className="rise mt-9 flex flex-wrap items-center gap-3"
            style={{ '--d': '210ms' } as React.CSSProperties}
          >
            <Link
              to={`/chapter/${started ? resumeId : first.id}`}
              className="type-label inline-flex h-11 items-center bg-ink px-6 text-paper transition-colors hover:bg-kilo-deep"
            >
              {started ? 'Resume the passage' : 'Begin the passage'}
            </Link>

            {started && resume ? (
              <p className="text-sm text-ink-2">
                Last open:{' '}
                <Link
                  to={`/chapter/${resume.id}`}
                  className="text-kilo underline-offset-4 hover:underline"
                >
                  {resume.title}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-ink-2">
                Starts with <span className="text-ink">{first.title}</span> —{' '}
                {formatDuration(first.minutes)}
              </p>
            )}
          </div>

          {/* Charts carry a title block: scale, projection, soundings. So does this. */}
          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-y-8 border-t border-ink/25 pt-7 sm:grid-cols-4 sm:divide-x sm:divide-rule">
            <Sounding label="Chapters" value={totals.chapters} note={`across ${totals.parts} parts`} />
            <Sounding
              label="Hands on"
              value={totals.labs}
              note={`${totals.commands} command blocks`}
              className="sm:pl-7"
            />
            <Sounding
              label="Total time"
              value={formatDuration(totals.minutes)}
              note="reading and typing"
              className="sm:pl-7"
            />
            <Sounding
              label="CKAD marked"
              value={ckadCount}
              note="chapters on the exam"
              className="sm:pl-7"
            />
          </dl>

          {started && (
            <div className="rise mt-10 flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-3 border border-rule bg-sheet/70 px-5 py-4">
              <span className="type-label text-ink-3">Position fix</span>
              <span className="mono text-[0.75rem] text-ink">
                {doneCount} of {total} logged — {Math.round(fraction * 100)}%
              </span>
              <span className="mono text-[0.75rem] text-ink-2">
                {formatDuration(minutesLeft)} remaining
              </span>
              <button
                type="button"
                onClick={reset}
                className="mono ml-auto inline-flex items-center gap-1.5 text-[0.7rem] text-ink-2 underline-offset-4 transition-colors hover:text-destructive hover:underline"
              >
                <RotateCcw className="size-3" />
                Clear log
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The method                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section id="method" className="border-b border-rule bg-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-16">
          <div>
            <h2 className="type-display text-[clamp(1.75rem,3vw,2.5rem)] text-balance">
              Every chapter ends at a prompt
            </h2>
            <p className="mt-5 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-2">
              The cookbook is cumulative: the same Deployment, Service and client Pod are reused so
              that later concepts explain earlier behaviour rather than arriving as unrelated YAML
              fragments. Where a section does not need every step of the loop, it does not force one.
            </p>

            <dl className="mt-9 space-y-5 border-t border-rule pt-7">
              {tagMeaning.map(([tag, meaning]) => (
                <div key={tag} className="flex gap-4">
                  <dt className="w-[5.5rem] shrink-0 pt-px">
                    <Flag tone={tagTone[tag]}>{tag}</Flag>
                  </dt>
                  <dd className="text-sm leading-relaxed text-ink-2">{meaning}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-9 max-w-[58ch] text-sm leading-relaxed text-ink-2">
              Two appendices go past the exam: building a cluster by hand with kubeadm, then following
              a request through Cilium, eBPF and the Gateway API. That is CKA and platform territory,
              and it is marked as such.
            </p>
          </div>

          <div>
            <div className="type-label mb-4 text-ink-3">The recurring teaching loop</div>
            <FigureBlock code={TEACHING_LOOP} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The syllabus                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section id="syllabus" className="bg-sheet/50">
        <div className="mx-auto max-w-6xl px-6 pt-16 sm:px-10 sm:pt-20">
          <h2 className="type-display text-[clamp(1.75rem,3vw,2.5rem)]">The route</h2>
          <p className="mt-4 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-2">
            Organised for understanding rather than mirroring the exam outline chapter for chapter.
            Appendix B maps it back onto the CKAD domains when you want to check coverage.
          </p>
        </div>

        {parts.map((part, partIndex) => {
          const partMinutes = part.chapters.reduce((sum, c) => sum + c.minutes, 0)
          const partDone = part.chapters.filter((c) => isDone(c.id)).length
          return (
            <div key={part.id} className="border-t border-rule first:mt-12">
              <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16">
                <div className="lg:sticky lg:top-24 lg:self-start">
                  <div className="flex items-baseline gap-3">
                    <span className="mono text-[0.7rem] text-signal">
                      {part.numeral ?? String(partIndex + 1).padStart(2, '0')}
                    </span>
                    <span className="type-label text-ink-3">{part.volume}</span>
                  </div>
                  <h3 className="type-display mt-3 text-[1.5rem] text-balance">{part.title}</h3>
                  <p className="mono mt-2 text-[0.65rem] text-ink-2">
                    {part.chapters.length} chapters · {formatDuration(partMinutes)}
                    {partDone > 0 && <span className="text-signal"> · {partDone} logged</span>}
                  </p>
                  {part.blurb && (
                    <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-ink-2">
                      {part.blurb}
                    </p>
                  )}
                </div>

                <ol className="divide-y divide-rule border-y border-rule">
                  {part.chapters.map((chapter) => {
                    const done = isDone(chapter.id)
                    return (
                      <li key={chapter.id}>
                        <Link
                          to={`/chapter/${chapter.id}`}
                          className="group grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 py-5 transition-colors hover:bg-paper"
                        >
                          <span
                            className={cn(
                              'mono mt-0.5 flex h-5 items-center justify-end text-[0.7rem] tabular-nums',
                              done ? 'text-signal' : 'text-ink-3',
                            )}
                          >
                            {done ? <Check className="size-3.5" strokeWidth={2.5} /> : chapter.number}
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <h4
                                className={cn(
                                  'text-[0.9375rem] font-semibold transition-colors group-hover:text-kilo',
                                  done ? 'text-ink-2' : 'text-ink',
                                )}
                              >
                                {chapter.title}
                              </h4>
                              {chapter.tags.map((tag) => (
                                <Flag key={tag} tone={tagTone[tag]}>
                                  {tag}
                                </Flag>
                              ))}
                              <span className="mono ml-auto shrink-0 text-[0.65rem] text-ink-3">
                                {chapter.minutes} min
                              </span>
                              <ArrowUpRight className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                            {chapter.blurb && (
                              <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-ink-2">
                                {chapter.blurb}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>
          )
        })}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Provisions                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section id="reference" className="rail-grid border-t border-abyss bg-abyss text-foam">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
            <div>
              <h2 className="type-display text-[clamp(1.75rem,3vw,2.5rem)] text-balance text-foam">
                Before you cast off
              </h2>
              <p className="mt-5 max-w-[42ch] text-[0.9375rem] leading-relaxed text-foam/65">
                The first part gets you a disposable cluster with kind. Everything after it assumes
                you have one open in another terminal.
              </p>
              <Link
                to={`/chapter/${started ? resumeId : first.id}`}
                className="type-label mt-8 inline-flex h-11 items-center bg-signal px-6 text-abyss transition-colors hover:bg-signal/85"
              >
                {started ? 'Resume the passage' : 'Begin the passage'}
              </Link>
            </div>

            <ol className="grid gap-px bg-abyss-rule sm:grid-cols-2">
              {[
                { title: 'Docker', detail: 'kind runs Kubernetes nodes as containers on your machine.' },
                { title: 'kubectl', detail: 'The client for the API you will spend the whole course talking to.' },
                { title: 'kind', detail: 'Kubernetes IN Docker. Disposable, and that is the point.' },
                { title: 'A second terminal', detail: 'Half the exercises watch one thing while changing another.' },
              ].map((item, i) => (
                <li key={item.title} className="bg-abyss p-6">
                  <div className="mono text-[0.65rem] text-signal/80">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 className="mt-3 text-[0.9375rem] font-semibold text-foam">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foam/60">{item.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
