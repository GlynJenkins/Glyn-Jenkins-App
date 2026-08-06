'use client'

import ReactMarkdown from 'react-markdown'
import { Download } from 'lucide-react'

type Props = {
  markdown: string
  pdfHref:  string
  /** Optional label override for the download button. */
  downloadLabel?: string
}

export default function GuideView({
  markdown,
  pdfHref,
  downloadLabel = 'Download PDF',
}: Props) {
  return (
    <div className="space-y-4">
      <a
        href={pdfHref}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto
                   px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white
                   text-sm font-semibold rounded-xl transition-colors"
      >
        <Download className="w-4 h-4" />
        {downloadLabel}
      </a>

      <article
        className="guide-prose bg-white rounded-2xl border border-gray-100 shadow-sm
                   px-4 py-5 sm:px-6 sm:py-6 text-sm text-slate-700 leading-relaxed"
      >
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-slate-900 mb-3 leading-snug">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-base font-semibold text-slate-900 mt-6 mb-2 first:mt-0">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1.5">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="mb-3 last:mb-0">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 mb-3 space-y-1.5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 mb-3 space-y-1.5">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="pl-0.5">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">{children}</strong>
            ),
            hr: () => <hr className="my-5 border-slate-200" />,
            a: ({ href, children }) => (
              <a href={href} className="text-orange-600 underline underline-offset-2 break-words">
                {children}
              </a>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  )
}
