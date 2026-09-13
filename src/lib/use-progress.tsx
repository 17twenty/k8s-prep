import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { flatChapters } from '@/data/course'
import { clearProgress, emptyProgress, loadProgress, saveProgress, type Progress } from '@/lib/progress'

type ProgressApi = {
  progress: Progress
  isDone: (id: string) => boolean
  toggle: (id: string) => void
  complete: (id: string) => void
  visit: (id: string) => void
  reset: () => void
  /** 0–1 across every chapter in the course */
  fraction: number
  doneCount: number
  total: number
  /** where "Resume" should send you: last visited, else first unfinished */
  resumeId: string
  /** true once anything at all has been recorded */
  started: boolean
  /** minutes of material left, by the estimates in the curriculum */
  minutesLeft: number
}

const Ctx = createContext<ProgressApi | null>(null)

/**
 * Drop completions for chapters that no longer exist. The source cookbook is
 * edited upstream, so a chapter can be renamed or merged away between visits;
 * without this the cookie only ever grows.
 */
function prune(progress: Progress): Progress {
  const known = new Set(flatChapters.map((c) => c.id))
  const done = progress.done.filter((id) => known.has(id))
  const at = progress.at && known.has(progress.at) ? progress.at : null
  if (done.length === progress.done.length && at === progress.at) return progress
  return { ...progress, done, at }
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  // Read straight out of the cookie during the first render. Doing this in an
  // effect instead loses writes: child effects run before the parent's, so a
  // chapter's `visit` would land and then be overwritten by hydration.
  const [progress, setProgress] = useState<Progress>(() => prune(loadProgress()))
  const firstRender = useRef(true)

  // Persist as a side effect rather than inside the state updater, so React's
  // double-invoked updaters in StrictMode cannot write the cookie twice.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    saveProgress(progress)
  }, [progress])

  /**
   * Returning the previous object unchanged is load-bearing: `visit` runs from
   * an effect on every chapter render, and a fresh object each time would spin
   * the render loop forever.
   */
  const update = useCallback((next: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const value = next(prev)
      if (value === prev) return prev
      return { ...value, since: value.since ?? Date.now() }
    })
  }, [])

  const toggle = useCallback(
    (id: string) =>
      update((p) => ({
        ...p,
        done: p.done.includes(id) ? p.done.filter((d) => d !== id) : [...p.done, id],
      })),
    [update],
  )

  const complete = useCallback(
    (id: string) => update((p) => (p.done.includes(id) ? p : { ...p, done: [...p.done, id] })),
    [update],
  )

  const visit = useCallback(
    (id: string) => update((p) => (p.at === id ? p : { ...p, at: id })),
    [update],
  )

  const reset = useCallback(() => {
    clearProgress()
    setProgress(emptyProgress)
  }, [])

  const api = useMemo<ProgressApi>(() => {
    const doneSet = new Set(progress.done)
    const doneCount = flatChapters.filter((c) => doneSet.has(c.id)).length
    const firstUnfinished = flatChapters.find((c) => !doneSet.has(c.id))
    const minutesLeft = flatChapters
      .filter((c) => !doneSet.has(c.id))
      .reduce((sum, c) => sum + c.minutes, 0)

    return {
      progress,
      isDone: (id) => doneSet.has(id),
      toggle,
      complete,
      visit,
      reset,
      fraction: flatChapters.length ? doneCount / flatChapters.length : 0,
      doneCount,
      total: flatChapters.length,
      resumeId: progress.at ?? firstUnfinished?.id ?? flatChapters[0].id,
      started: progress.done.length > 0 || progress.at !== null,
      minutesLeft,
    }
  }, [progress, toggle, complete, visit, reset])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useProgress() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>')
  return ctx
}
