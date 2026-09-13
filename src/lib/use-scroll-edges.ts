import { useEffect, useState, type RefObject } from 'react'

type Edges = { atTop: boolean; atBottom: boolean; scrollable: boolean }

/**
 * Tracks whether a scroll container has content beyond its top and bottom
 * edges, so a fade or a control can stand in for a hidden scrollbar.
 *
 * Watches the *content* as well as the container, because the chapter rail
 * grows and shrinks as parts are expanded, not only when the window resizes.
 */
export function useScrollEdges(
  viewport: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
): Edges {
  const [edges, setEdges] = useState<Edges>({ atTop: true, atBottom: true, scrollable: false })

  useEffect(() => {
    const el = viewport.current
    if (!el) return

    const measure = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const slack = scrollHeight - clientHeight
      setEdges((prev) => {
        const next = {
          atTop: scrollTop <= 2,
          atBottom: scrollTop >= slack - 2,
          scrollable: slack > 2,
        }
        return prev.atTop === next.atTop &&
          prev.atBottom === next.atBottom &&
          prev.scrollable === next.scrollable
          ? prev
          : next
      })
    }

    measure()
    el.addEventListener('scroll', measure, { passive: true })

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (content.current) observer.observe(content.current)

    return () => {
      el.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [viewport, content])

  return edges
}
