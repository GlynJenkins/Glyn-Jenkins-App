'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Loader2, PenLine, X } from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'
import type { SiteSignOffRow } from '@/lib/variations/load-site-signoff-queue'

function fmtMoney(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function SignOffModal({
  row,
  defaultAgentName,
  onClose,
  onSigned,
}: {
  row:              SiteSignOffRow
  defaultAgentName: string
  onClose:          () => void
  onSigned:         () => void
}) {
  const [name, setName] = useState(defaultAgentName)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [sigError, setSigError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    setSigError(null)
    if (!name.trim()) { setError('Enter the site agent name.'); return }
    if (!signatureBlob) { setSigError('Please sign above.'); return }

    startTransition(async () => {
      const fd = new FormData()
      fd.append('siteAgentName', name.trim())
      fd.append('signature', new File([signatureBlob], 'signature.png', { type: 'image/png' }))

      const res = await fetch(`/api/variations/developer/${row.id}/site-signoff`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Sign-off failed.'); return }
      onSigned()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Developer agent sign-off</p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">{row.reference}</h2>
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{row.description}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{fmtMoney(row.developerTotal)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Work is complete and costs were agreed. Hand the device to the developer&apos;s site agent to sign — then download the PDF and submit for payment.
          </p>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Site agent name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Site agent / contract manager"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-2 block">Signature</label>
            <SignaturePad
              onSigned={setSignatureBlob}
              onCleared={() => setSignatureBlob(null)}
              error={sigError ?? undefined}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            {busy ? 'Saving…' : 'Confirm sign-off'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeveloperAgentSignOffQueue({
  siteId,
  siteName,
  initialRows,
  defaultAgentName,
  backHref,
}: {
  siteId:           string
  siteName:         string
  initialRows:      SiteSignOffRow[]
  defaultAgentName: string
  backHref:         string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [activeRow, setActiveRow] = useState<SiteSignOffRow | null>(null)

  const pending = rows.filter((r) => r.readyForSignOff)
  const waiting = rows.filter((r) => !r.signed && !r.readyForSignOff)
  const signed  = rows.filter((r) => r.signed)

  const handleSigned = (id: string) => {
    setRows((prev) => prev.map((r) =>
      r.id === id
        ? { ...r, signed: true, readyForSignOff: false, siteAgentSignedAt: new Date().toISOString() }
        : r
    ))
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link href={backHref} className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300">
            ← Sign-off
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">{siteName}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {pending.length} ready to sign · {signed.length} signed
          </p>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto space-y-4">
        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-sm text-slate-600 font-medium">No developer variations on this site yet.</p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
                  Ready for sign-off ({pending.length})
                </h2>
                {pending.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setActiveRow(row)}
                    className="w-full text-left bg-white rounded-2xl border border-orange-200 shadow-sm p-4 hover:border-orange-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{row.reference}</p>
                        <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{row.description}</p>
                        <p className="text-xs text-green-700 mt-1">Work complete — developer cost agreed</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-slate-900 text-sm">{fmtMoney(row.developerTotal)}</p>
                        <span className="inline-flex mt-2 px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg">
                          Sign off
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </section>
            )}

            {waiting.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
                  Not ready yet ({waiting.length})
                </h2>
                {waiting.map((row) => (
                  <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 opacity-80">
                    <p className="font-bold text-slate-900">{row.reference}</p>
                    <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">{row.description}</p>
                    <p className="text-xs text-amber-700 mt-1">{row.blockedReason}</p>
                  </div>
                ))}
              </section>
            )}

            {signed.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
                  Signed — submit for payment ({signed.length})
                </h2>
                {signed.map((row) => (
                  <div key={row.id} className="bg-white rounded-2xl border border-green-100 shadow-sm p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{row.reference}</p>
                        <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">{row.description}</p>
                        <p className="text-xs text-green-700 mt-1">
                          {row.siteAgentName ?? 'Site agent'}
                          {row.siteAgentSignedAt ? ` · ${fmtDate(row.siteAgentSignedAt)}` : ''}
                        </p>
                        <Link
                          href={`/admin/variations/developer/${row.id}`}
                          className="inline-block mt-2 text-xs font-semibold text-orange-600 underline"
                        >
                          Download PDF & mark paid →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {activeRow && (
        <SignOffModal
          row={activeRow}
          defaultAgentName={defaultAgentName}
          onClose={() => setActiveRow(null)}
          onSigned={() => handleSigned(activeRow.id)}
        />
      )}
    </div>
  )
}
