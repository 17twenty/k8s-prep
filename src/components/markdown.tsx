import { cn } from 'cn'
import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/code'
import { slugify } from '@/lib/slug'

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

const components: Components = {
  h1: ({ children }) => (
    <h2 id={slugify(textOf(children))} className="type-display mt-16 scroll-mt-24 text-[1.75rem] [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[0.85em]">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2
      id={slugify(textOf(children))}
      className="type-display mt-14 scroll-mt-24 text-[1.5rem] first:mt-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[0.8em]"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={slugify(textOf(children))}
      className="mt-10 scroll-mt-24 text-[1.0625rem] font-semibold text-ink [&_code]:bg-transparent [&_code]:p-0"
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => <h4 className="mt-8 text-base font-semibold text-ink">{children}</h4>,

  p: ({ children }) => (
    <p className="mt-5 text-[1.0625rem] leading-[1.75] text-ink-2">{children}</p>
  ),

  a: ({ children, href }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noreferrer' : undefined}
      className="text-kilo underline decoration-kilo/30 underline-offset-[3px] transition-colors hover:decoration-kilo"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => <strong className="font-[650] text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  ul: ({ children }) => <ul className="mt-5 space-y-2.5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-5 space-y-2.5 [counter-reset:step]">{children}</ol>,
  li: ({ children, ...props }) => {
    const ordered = 'index' in props
    return (
      <li
        className={cn(
          'relative pl-6 text-[1.0625rem] leading-[1.7] text-ink-2',
          ordered
            ? 'mono-counter [counter-increment:step] before:absolute before:top-[0.45em] before:left-0 before:text-[0.7rem] before:text-ink-3 before:tabular-nums before:content-[counter(step)]'
            : "before:absolute before:top-[0.65em] before:left-0 before:size-1.5 before:bg-kilo before:content-['']",
        )}
      >
        {children}
      </li>
    )
  },

  /**
   * The author uses blockquotes for the single sentence he wants you to leave
   * with. Treat them as principles, not asides.
   */
  blockquote: ({ children }) => (
    <aside className="my-9 border-l-2 border-signal py-1 pl-6">
      <div className="type-display text-[1.1875rem] leading-[1.45] text-ink [&>p]:mt-0 [&>p+p]:mt-3 [&>p]:text-inherit">
        {children}
      </div>
    </aside>
  ),

  hr: () => <hr className="my-12 border-0 border-t border-rule" />,

  table: ({ children }) => (
    <div className="my-7 overflow-x-auto border border-rule">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-sheet">{children}</thead>,
  th: ({ children }) => (
    <th className="type-label border-b border-rule px-4 py-3 text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-rule px-4 py-3 align-top text-ink-2 last:border-r-0">
      {children}
    </td>
  ),

  pre: ({ children }) => {
    const child = Children.toArray(children).find(isValidElement) as
      | { props: { className?: string; children?: ReactNode } }
      | undefined
    const lang = child?.props.className?.match(/language-(\w+)/)?.[1] ?? 'text'
    return <CodeBlock code={textOf(child?.props.children)} lang={lang} />
  },

  code: ({ className, children }) =>
    className?.includes('language-') ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="mono rounded-[2px] bg-ink/[0.06] px-[0.3em] py-[0.15em] text-[0.8em] text-ink">
        {children}
      </code>
    ),
}

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
