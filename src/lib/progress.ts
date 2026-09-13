/**
 * Progress lives in a cookie so it survives across sessions without an account.
 * Kept deliberately small: cookies cap at ~4KB and get sent on every request.
 */

const COOKIE = 'k8sprep.progress'
const MAX_AGE = 60 * 60 * 24 * 365 // one year

export type Progress = {
  /** ids of chapters marked complete */
  done: string[]
  /** id of the last chapter opened, for "resume" */
  at: string | null
  /** epoch ms of first visit, so we can show "started on ..." */
  since: number | null
}

export const emptyProgress: Progress = { done: [], at: null, since: null }

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`
}

export function loadProgress(): Progress {
  const raw = readCookie(COOKIE)
  if (!raw) return emptyProgress
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Progress>
    return {
      done: Array.isArray(parsed.done) ? parsed.done.filter((d) => typeof d === 'string') : [],
      at: typeof parsed.at === 'string' ? parsed.at : null,
      since: typeof parsed.since === 'number' ? parsed.since : null,
    }
  } catch {
    return emptyProgress
  }
}

export function saveProgress(progress: Progress) {
  writeCookie(COOKIE, encodeURIComponent(JSON.stringify(progress)))
}

export function clearProgress() {
  writeCookie(COOKIE, '')
  document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
