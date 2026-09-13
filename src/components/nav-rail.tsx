import { cn } from 'cn'
import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { formatDuration, parts, totals, type Part } from '@/data/course'
import { useProgress } from '@/lib/use-progress'

function Burgee({ className }: { className?: string }) {
  // The Kilo flag — the international signal for the letter K. Blue hoist,
  // yellow fly. Also, conveniently, "I wish to communicate with you".
  return (
    <svg viewBox="0 0 32 22" className={className} aria-hidden="true">
      <rect width="16" height="22" fill="var(--kilo)" />
      <rect x="16" width="16" height="22" fill="var(--signal)" />
    </svg>
  )
}

function PartGroup({
  part,
  index,
  currentId,
  onNavigate,
}: {
  part: Part
  index: number
  currentId: string | null
  onNavigate?: () => void
}) {
  const { isDone } = useProgress()
  const holdsCurrent = part.chapters.some((c) => c.id === currentId)
  const [open, setOpen] = useState(holdsCurrent)

  useEffect(() => {
    if (holdsCurrent) setOpen(true)
  }, [holdsCurrent])

  const done = part.chapters.filter((c) => isDone(c.id)).length
  const complete = done === part.chapters.length
  const id = `rail-${part.id}`

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="group flex w-full items-center gap-2 py-1.5 text-left"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-3 shrink-0 text-foam/35 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
        <span className="mono text-[0.65rem] text-signal/80">
          {part.numeral ?? String(index + 1).padStart(2, '0')}
        </span>
        <h3
          className={cn(
            'type-label flex-1 truncate transition-colors',
            holdsCurrent ? 'text-foam' : 'text-foam/50 group-hover:text-foam/80',
          )}
        >
          {part.title}
        </h3>
        <span
          className={cn(
            'mono shrink-0 text-[0.6rem] tabular-nums',
            complete ? 'text-signal' : 'text-foam/30',
          )}
        >
          {done}/{part.chapters.length}
        </span>
      </button>

      {open && (
        <ul id={id} className="relative mt-1 mb-3 ml-[0.875rem] border-l border-abyss-rule">
          {part.chapters.map((chapter) => {
            const chapterDone = isDone(chapter.id)
            const current = chapter.id === currentId
            return (
              <li key={chapter.id} className="relative">
                <NavLink
                  to={`/chapter/${chapter.id}`}
                  onClick={onNavigate}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex items-start gap-2 py-[0.3125rem] pr-2 pl-4 text-[0.8125rem] leading-snug transition-colors',
                    current
                      ? 'text-signal'
                      : chapterDone
                        ? 'text-foam/50 hover:text-foam'
                        : 'text-foam/80 hover:text-foam',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-[0.625rem] left-0 size-[7px] -translate-x-1/2 rounded-full border transition-all',
                      current
                        ? 'scale-125 border-signal bg-signal'
                        : chapterDone
                          ? 'border-foam/45 bg-foam/45'
                          : 'border-abyss-rule bg-abyss',
                    )}
                  />
                  {chapter.number && (
                    <span className="mono shrink-0 pt-px text-[0.6rem] text-foam/35 tabular-nums">
                      {chapter.number}
                    </span>
                  )}
                  <span className="flex-1">{chapter.title}</span>
                  {chapterDone && (
                    <Check
                      className="mt-0.5 size-3 shrink-0 text-signal/70"
                      strokeWidth={2.5}
                      aria-label="Complete"
                    />
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function NavRail({ onNavigate }: { onNavigate?: () => void }) {
  const { doneCount, total, fraction, minutesLeft } = useProgress()
  const { pathname } = useLocation()
  const currentId = pathname.startsWith('/chapter/') ? pathname.slice('/chapter/'.length) : null

  const grouped = useMemo(() => {
    const out: { volume: string; parts: { part: Part; index: number }[] }[] = []
    parts.forEach((part, index) => {
      const last = out.at(-1)
      if (last?.volume === part.volume) last.parts.push({ part, index })
      else out.push({ volume: part.volume, parts: [{ part, index }] })
    })
    return out
  }, [])

  return (
    <div className="flex h-full flex-col bg-abyss text-foam">
      <div className="rail-grid border-b border-abyss-rule px-5 py-5">
        <NavLink
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-sm outline-offset-4"
        >
          <Burgee className="h-4 w-6 shrink-0 shadow-[0_1px_0_rgba(0,0,0,0.4)]" />
          <span className="type-label text-foam/90">Kubernetes for Devs</span>
        </NavLink>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="type-figure text-[1.375rem] leading-none text-foam">
              {doneCount}
              <span className="text-foam/35">/{total}</span>
            </span>
            <span className="mono text-[0.65rem] text-foam/50">
              {formatDuration(minutesLeft)} left
            </span>
          </div>

          {/* A depth gauge, marked in quarters like a sounding pole. */}
          <div className="relative mt-3 h-1.5 bg-foam/12">
            <div
              className="h-full bg-signal transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(fraction * 100, fraction > 0 ? 1.5 : 0)}%` }}
            />
            {[25, 50, 75].map((mark) => (
              <span
                key={mark}
                aria-hidden="true"
                className="absolute top-0 h-full w-px bg-abyss"
                style={{ left: `${mark}%` }}
              />
            ))}
          </div>
          <p className="sr-only">
            {doneCount} of {total} chapters complete, {Math.round(fraction * 100)} percent.
          </p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-5 py-5" aria-label="Course chapters">
        {grouped.map((group, gi) => (
          <div key={group.volume} className={cn(gi > 0 && 'mt-6 border-t border-abyss-rule pt-5')}>
            <div className="type-label mb-2 text-signal/55">{group.volume}</div>
            {group.parts.map(({ part, index }) => (
              <PartGroup
                key={part.id}
                part={part}
                index={index}
                currentId={currentId}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-abyss-rule px-5 py-3.5">
        <p className="mono text-[0.65rem] leading-relaxed text-foam/40">
          {totals.chapters} chapters · {formatDuration(totals.minutes)}
          <br />
          Progress is stored in a cookie on this device.
        </p>
      </div>
    </div>
  )
}
