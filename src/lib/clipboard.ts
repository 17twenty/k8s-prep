/**
 * Copy to clipboard, for real.
 *
 * `navigator.clipboard.writeText` is the right API and the one that fails most
 * interestingly: it is undefined outside a secure context (any dev server
 * reached over the LAN rather than localhost), and it rejects with
 * NotAllowedError when the document is not focused or the permission is
 * refused. Falling back to the deprecated `execCommand` covers all of those.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the older path rather than failing silently
  }

  try {
    const previous = document.getSelection()
    const restore = previous && previous.rangeCount > 0 ? previous.getRangeAt(0) : null

    const staging = document.createElement('textarea')
    staging.value = text
    staging.setAttribute('readonly', '')
    staging.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none'
    document.body.append(staging)
    staging.select()
    staging.setSelectionRange(0, text.length)

    const ok = document.execCommand('copy')
    staging.remove()

    // execCommand hijacks the selection; give the reader theirs back
    if (restore) {
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(restore)
    }
    return ok
  } catch {
    return false
  }
}
