import { useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sparkles, ExternalLink, Loader2, FileText,
  Copy, Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface Props {
  markdown: string
  isStreaming: boolean
  currentSection: string | null
  onOpenTrial?: (nctId: string) => void
}

// Match citation patterns: [NCTxxxxxxxx](nct:NCTxxxxxxxx), [PMID:12345](pmid:12345), [Drug: name](drug:name)
const CITATION_RE = /\[(NCT\d{8,})\]\(nct:[^)]+\)|\[(PMID:\d+)\]\(pmid:[^)]+\)|\[(Drug:\s*[^\]]+)\]\(drug:[^)]+\)/g

// Also match plain bracket citations as fallback: [NCT04380701], [PMID:12345], [Drug: osimertinib]
const PLAIN_CITATION_RE = /\[(NCT\d{8,})\](?!\()|\[(PMID:\d+)\](?!\()|\[(Drug:\s*[^\]]+)\](?!\()/g

function processCitations(text: string, onOpenTrial?: (nctId: string) => void): React.ReactNode[] {
  // First try markdown-style links, then plain brackets
  const combinedRe = new RegExp(
    `${CITATION_RE.source}|${PLAIN_CITATION_RE.source}`,
    'g'
  )

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = combinedRe.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    // Determine citation type
    const fullMatch = match[0]
    const nctId = match[1] || match[4] // markdown or plain NCT
    const pmid = match[2] || match[5]   // markdown or plain PMID
    const drug = match[3] || match[6]   // markdown or plain Drug

    if (nctId) {
      parts.push(
        <button
          key={`nct-${match.index}`}
          onClick={() => onOpenTrial?.(nctId)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium
                     bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 hover:border-sky-300
                     transition-colors cursor-pointer align-baseline"
          title={`View trial ${nctId}`}
        >
          {nctId}
          <ExternalLink className="w-2.5 h-2.5 inline" />
        </button>
      )
    } else if (pmid) {
      const pmidNum = pmid.replace('PMID:', '')
      parts.push(
        <a
          key={`pmid-${match.index}`}
          href={`https://pubmed.ncbi.nlm.nih.gov/${pmidNum}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium
                     bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 hover:border-amber-300
                     transition-colors align-baseline"
        >
          {pmid}
          <ExternalLink className="w-2.5 h-2.5 inline" />
        </a>
      )
    } else if (drug) {
      const drugName = drug.replace('Drug: ', '').replace('Drug:', '')
      parts.push(
        <span
          key={`drug-${match.index}`}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium
                     bg-emerald-50 text-emerald-700 border border-emerald-200 align-baseline"
        >
          {drugName}
        </span>
      )
    } else {
      parts.push(fullMatch)
    }

    lastIndex = match.index + fullMatch.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

export default function ReportContent({ markdown, isStreaming, currentSection, onOpenTrial }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [markdown])

  // Extract section headings from markdown for table of contents
  const sections = useMemo(() => {
    const headings: { id: string; title: string }[] = []
    const lines = markdown.split('\n')
    for (const line of lines) {
      const match = line.match(/^##\s+(.+)/)
      if (match) {
        const title = match[1].trim()
        headings.push({
          id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title,
        })
      }
    }
    return headings
  }, [markdown])

  // Custom renderers for react-markdown with citation processing
  const components = useMemo(() => ({
    h1: ({ children, ...props }: React.ComponentProps<'h1'>) => (
      <h1 className="text-xl font-bold text-stone-900 mb-4 mt-2 pb-2 border-b border-stone-200" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: React.ComponentProps<'h2'>) => {
      const text = typeof children === 'string' ? children : String(children)
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      return (
        <h2
          id={id}
          className="text-base font-bold text-stone-900 mt-6 mb-3 pb-1.5 border-b border-stone-100 scroll-mt-4"
          {...props}
        >
          {children}
        </h2>
      )
    },
    h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
      <h3 className="text-sm font-semibold text-stone-800 mt-4 mb-2" {...props}>{children}</h3>
    ),
    p: ({ children, ...props }: React.ComponentProps<'p'>) => {
      // Process text children for inline citations
      const processedChildren = typeof children === 'string'
        ? processCitations(children, onOpenTrial)
        : Array.isArray(children)
          ? children.map((child, i) =>
              typeof child === 'string'
                ? <span key={i}>{processCitations(child, onOpenTrial)}</span>
                : child
            )
          : children
      return (
        <p className="text-[13px] text-stone-700 leading-relaxed mb-3" {...props}>
          {processedChildren}
        </p>
      )
    },
    ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
      <ul className="list-disc list-outside ml-4 mb-3 space-y-1.5" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: React.ComponentProps<'ol'>) => (
      <ol className="list-decimal list-outside ml-4 mb-3 space-y-1.5" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: React.ComponentProps<'li'>) => {
      const processedChildren = typeof children === 'string'
        ? processCitations(children, onOpenTrial)
        : Array.isArray(children)
          ? children.map((child, i) =>
              typeof child === 'string'
                ? <span key={i}>{processCitations(child, onOpenTrial)}</span>
                : child
            )
          : children
      return (
        <li className="text-[13px] text-stone-700 leading-relaxed" {...props}>{processedChildren}</li>
      )
    },
    strong: ({ children, ...props }: React.ComponentProps<'strong'>) => (
      <strong className="font-semibold text-stone-900" {...props}>{children}</strong>
    ),
    em: ({ children, ...props }: React.ComponentProps<'em'>) => (
      <em className="italic text-stone-600" {...props}>{children}</em>
    ),
    blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
      <blockquote className="border-l-3 border-violet-300 pl-3 py-1 my-3 bg-violet-50/50 rounded-r" {...props}>
        {children}
      </blockquote>
    ),
    table: ({ children, ...props }: React.ComponentProps<'table'>) => (
      <div className="overflow-x-auto my-3 rounded-lg border border-stone-200">
        <table className="w-full text-xs" {...props}>{children}</table>
      </div>
    ),
    thead: ({ children, ...props }: React.ComponentProps<'thead'>) => (
      <thead className="bg-stone-50" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }: React.ComponentProps<'th'>) => (
      <th className="px-3 py-2 text-left font-semibold text-stone-700 border-b border-stone-200" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: React.ComponentProps<'td'>) => (
      <td className="px-3 py-2 text-stone-600 border-b border-stone-100" {...props}>{children}</td>
    ),
    hr: () => <hr className="my-4 border-stone-200" />,
    code: ({ children, className, ...props }: React.ComponentProps<'code'>) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return (
          <pre className="bg-stone-900 text-stone-100 rounded-lg p-3 my-3 overflow-x-auto text-xs">
            <code {...props}>{children}</code>
          </pre>
        )
      }
      return (
        <code className="bg-stone-100 text-stone-800 rounded px-1 py-0.5 text-[12px] font-mono" {...props}>
          {children}
        </code>
      )
    },
    a: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-600 hover:text-sky-700 underline underline-offset-2 decoration-sky-300"
        {...props}
      >
        {children}
      </a>
    ),
  }), [onOpenTrial])

  if (!markdown && !isStreaming) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <p className="text-sm text-stone-500">Report content will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mini section navigation + copy button */}
      {sections.length > 0 && (
        <div className="px-6 py-2 border-b border-stone-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1">
            {sections.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
                  currentSection?.toLowerCase().replace(/[^a-z0-9]+/g, '-') === s.id
                    ? 'bg-violet-100 text-violet-700 font-medium'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
          {markdown && !isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Main content */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-5 max-w-none prose-sm">
          <ReactMarkdown components={components}>
            {markdown}
          </ReactMarkdown>

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-flex items-center gap-1.5 mt-1">
              <span className="w-2 h-4 bg-violet-500 rounded-sm animate-pulse" />
              {currentSection && (
                <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-200 animate-pulse">
                  <Sparkles className="w-2.5 h-2.5 mr-1" />
                  Writing: {currentSection}
                </Badge>
              )}
            </span>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
