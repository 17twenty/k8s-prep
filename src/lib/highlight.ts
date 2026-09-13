/**
 * A small, deliberately limited highlighter for the two languages this course
 * actually contains: shell and YAML.
 *
 * Shiki would be a megabyte to render `kubectl get pods`. The colours here are
 * chart conventions rather than a ported editor theme — blue for water (flags,
 * keys), green for land (strings), red for hazards (variables, numbers).
 */

export type Token = { text: string; kind: TokenKind }
export type TokenKind =
  | 'plain'
  | 'cmd'
  | 'flag'
  | 'str'
  | 'var'
  | 'num'
  | 'cmt'
  | 'key'
  | 'punct'

const BASH =
  /(?<cmt>#[^\n]*)|(?<str>'[^']*'|"(?:[^"\\]|\\.)*")|(?<var>\$\{[^}]*\}|\$\([^)]*\)|\$[A-Za-z_]\w*)|(?<flag>--?[A-Za-z][\w-]*)|(?<punct>[|><&;]+|\\$)/g

const YAML =
  /(?<cmt>#[^\n]*)|(?<str>'[^']*'|"(?:[^"\\]|\\.)*")|(?<key>[\w.\-/]+(?=\s*:(?:\s|$)))|(?<num>\b\d+(?:\.\d+)?[A-Za-z%]*\b|\b(?:true|false|null|Always|Never|IfNotPresent)\b)|(?<punct>^\s*-(?=\s)|[:{}[\],])/gm

const GO_WORDS =
  'package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|var|const|type|struct|interface|map|chan|select|fallthrough'

const GO = new RegExp(
  [
    String.raw`(?<cmt>\/\/[^\n]*)`,
    // backtick strings carry the embedded YAML and JSON patches in this course
    String.raw`(?<str>\`[^\`]*\`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`,
    String.raw`(?<key>\b(?:${GO_WORDS})\b)`,
    String.raw`(?<num>\b(?:nil|true|false|iota|err)\b|\b\d+(?:\.\d+)?\b)`,
    String.raw`(?<cmd>\b[A-Za-z_]\w*(?=\())`,
    String.raw`(?<punct>[{}()[\].,;:=&*<>!+\-|]+)`,
  ].join('|'),
  'g',
)

const SHELLS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell'])

/** Words that start a command but are not the interesting part of it. */
const PREFIXES = new Set(['sudo', 'export', 'source', 'time', 'exec', 'command'])

function scan(input: string, re: RegExp): Token[] {
  const out: Token[] = []
  let last = 0
  re.lastIndex = 0
  for (let m = re.exec(input); m; m = re.exec(input)) {
    if (m.index > last) out.push({ text: input.slice(last, m.index), kind: 'plain' })
    const groups = m.groups ?? {}
    const kind = (Object.keys(groups).find((k) => groups[k] !== undefined) ?? 'plain') as TokenKind
    out.push({ text: m[0], kind })
    last = m.index + m[0].length
  }
  if (last < input.length) out.push({ text: input.slice(last), kind: 'plain' })
  return out
}

/**
 * Mark the first word of a shell line as the command, so `kubectl` reads as the
 * verb it is. Runs before the general scan so it wins over the flag rule.
 */
function shellLine(line: string): Token[] {
  const lead = line.match(/^(\s*)([A-Za-z_][\w./-]*)/)
  if (!lead || line.trimStart().startsWith('#')) return scan(line, BASH)

  const [, indent, word] = lead
  const rest = line.slice(lead[0].length)

  // `export FOO=bar` and friends: colour the keyword, not the assignment.
  if (PREFIXES.has(word)) {
    return [
      { text: indent, kind: 'plain' },
      { text: word, kind: 'cmd' },
      ...shellLine(rest),
    ]
  }
  // A bare `NAME=value` assignment is not a command.
  if (/^=/.test(rest)) return scan(line, BASH)

  return [
    { text: indent, kind: 'plain' },
    { text: word, kind: 'cmd' },
    ...scan(rest, BASH),
  ]
}

export function highlight(code: string, lang: string): Token[][] {
  const lines = code.replace(/\n$/, '').split('\n')
  if (lang === 'yaml') return lines.map((l) => scan(l, YAML))
  if (lang === 'go') return lines.map((l) => scan(l, GO))
  if (SHELLS.has(lang) || lang === 'dockerfile') {
    let inHeredoc: string | null = null
    return lines.map((line) => {
      if (inHeredoc !== null) {
        if (line.trim() === inHeredoc) inHeredoc = null
        return [{ text: line, kind: 'str' as const }]
      }
      const hd = line.match(/<<-?\s*'?([A-Za-z_]\w*)'?/)
      const tokens = shellLine(line)
      if (hd) inHeredoc = hd[1]
      return tokens
    })
  }
  return lines.map((l) => [{ text: l, kind: 'plain' as const }])
}

export function isShell(lang: string) {
  return SHELLS.has(lang)
}

/**
 * Shell blocks in the source are bare command lists. Work out where each
 * logical command starts so we can set a prompt against it, the way you would
 * actually see it in a terminal.
 */
export function promptLines(code: string): boolean[] {
  const lines = code.replace(/\n$/, '').split('\n')
  const flags: boolean[] = []
  let continuing = false
  let heredoc: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (heredoc !== null) {
      flags.push(false)
      if (trimmed === heredoc) heredoc = null
      continue
    }
    flags.push(!continuing && trimmed.length > 0)

    const hd = line.match(/<<-?\s*'?([A-Za-z_]\w*)'?/)
    if (hd) heredoc = hd[1]
    continuing = trimmed.endsWith('\\') || /(\||&&|\|\||;)$/.test(trimmed) || heredoc !== null
  }
  return flags
}

/**
 * Many `text` blocks in the source are ASCII diagrams rather than command
 * output. They deserve to be drawn as figures, not quoted as a terminal.
 */
export function looksLikeDiagram(code: string) {
  const lines = code.split('\n')
  const marks = lines.filter(
    (l) => /^\s*[|v^+]\s*$/.test(l) || l.includes('+--') || l.includes('-->') || l.includes('->'),
  ).length
  return marks > 0 && lines.length > 2
}
