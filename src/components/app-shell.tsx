import { cn } from 'cn'
import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { NavRail } from '@/components/nav-rail'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { Tag } from '@/data/course'

const topNav = [
  { label: 'Method', to: '/#method' },
  { label: 'Syllabus', to: '/#syllabus' },
  { label: 'Prerequisites', to: '/#reference' },
]

export function AppShell({
  children,
  breadcrumb,
}: {
  children: ReactNode
  breadcrumb: { label: string; to?: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-abyss lg:block">
        <NavRail />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-rule bg-paper/85 px-4 backdrop-blur-md sm:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open chapters">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[19rem] border-abyss p-0">
              <SheetTitle className="sr-only">Course chapters</SheetTitle>
              <NavRail onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-2">
              {breadcrumb.map((crumb, i) => (
                <li
                  key={crumb.label}
                  className={cn(
                    'min-w-0 items-center gap-2',
                    // on a phone there is only room for where you actually are
                    i === breadcrumb.length - 1 ? 'flex' : 'hidden sm:flex',
                  )}
                >
                  {i > 0 && (
                    <span aria-hidden="true" className="hidden text-ink-3 sm:inline">
                      /
                    </span>
                  )}
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="type-label truncate text-ink-2 transition-colors hover:text-ink"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="type-label truncate text-ink">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div className="hidden items-center gap-6 md:flex">
            {topNav.map((item) => (
              <a
                key={item.label}
                href={item.to}
                className="type-label text-ink-2 transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

/** A labelled figure, set the way a chart labels a sounding. */
export function Sounding({
  label,
  value,
  note,
  className,
}: {
  label: string
  value: ReactNode
  note?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="type-label text-ink-3">{label}</div>
      <div className="type-figure mt-2 text-[1.5rem] leading-none text-ink">{value}</div>
      {note && <div className="mono mt-1.5 text-[0.65rem] text-ink-2">{note}</div>}
    </div>
  )
}

/** Exam tags, shaped like the flags they are named for. */
export function Flag({ children, tone = 'kilo' }: { children: ReactNode; tone?: 'kilo' | 'signal' | 'quiet' }) {
  return (
    <span
      className={cn(
        'type-label inline-flex h-[1.375rem] items-center px-2 pt-px',
        tone === 'kilo' && 'bg-kilo text-white',
        tone === 'signal' && 'bg-signal text-ink',
        tone === 'quiet' && 'border border-rule text-ink-2',
      )}
    >
      {children}
    </span>
  )
}

/**
 * One accent for the exam, one for the deep end, neutral for the rest — a
 * chapter marked [DEV] [OPS] [PLATFORM] should not look like a paint chart.
 * Unknown markers fall back rather than failing to compile, so a document that
 * invents one still renders.
 */
const TONES: Record<string, 'kilo' | 'signal' | 'quiet'> = {
  CKAD: 'kilo',
  'DEEP DIVE': 'signal',
}

export function TagFlag({ tag }: { tag: Tag }) {
  return <Flag tone={TONES[tag] ?? 'quiet'}>{tag}</Flag>
}

