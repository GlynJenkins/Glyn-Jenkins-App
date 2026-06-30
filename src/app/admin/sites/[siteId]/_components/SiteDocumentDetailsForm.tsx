'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, FileText, Loader2 } from 'lucide-react'

type Props = {
  siteId: string
  initial: {
    document_address:   string
    developer_name:     string
    developer_contact:  string
    surveyor_name:      string
    document_reference: string
  }
}

export default function SiteDocumentDetailsForm({ siteId, initial }: Props) {
  const router = useRouter()
  const [documentAddress,  setDocumentAddress]  = useState(initial.document_address)
  const [developerName,    setDeveloperName]    = useState(initial.developer_name)
  const [developerContact, setDeveloperContact] = useState(initial.developer_contact)
  const [surveyorName,     setSurveyorName]     = useState(initial.surveyor_name)
  const [documentRef,      setDocumentRef]      = useState(initial.document_reference)

  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    startTransition] = useTransition()

  const inputCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white'

  const handleSave = () => {
    setSuccess(false)
    setError(null)

    startTransition(async () => {
      const res = await fetch(`/api/admin/sites/${siteId}/documents`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          document_address:   documentAddress.trim() || null,
          developer_name:     developerName.trim() || null,
          developer_contact:  developerContact.trim() || null,
          surveyor_name:      surveyorName.trim() || null,
          document_reference: documentRef.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? 'Failed to save.')
      else {
        setSuccess(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-orange-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">Document details</h2>
          <p className="text-xs text-slate-500">
            Used on variation PDFs and QA inspections for this site
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Developer / client name</label>
        <input
          value={developerName}
          onChange={(e) => { setDeveloperName(e.target.value); setSuccess(false) }}
          className={inputCls}
          placeholder="e.g. Persimmon Homes"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Developer contact</label>
        <input
          value={developerContact}
          onChange={(e) => { setDeveloperContact(e.target.value); setSuccess(false) }}
          className={inputCls}
          placeholder="Contact name, email or phone"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Site address (for documents)</label>
        <textarea
          value={documentAddress}
          onChange={(e) => { setDocumentAddress(e.target.value); setSuccess(false) }}
          rows={3}
          className={`${inputCls} resize-y min-h-[88px]`}
          placeholder={'Site address as it should appear on PDFs\n(may differ from the site name in the app)'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Surveyor name</label>
          <input
            value={surveyorName}
            onChange={(e) => { setSurveyorName(e.target.value); setSuccess(false) }}
            className={inputCls}
            placeholder="Surveyor on site"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Site / contract reference</label>
          <input
            value={documentRef}
            onChange={(e) => { setDocumentRef(e.target.value); setSuccess(false) }}
            className={inputCls}
            placeholder="Contract or site ref"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle className="w-4 h-4 shrink-0" />Document details saved.
        </div>
      )}

      <button
        disabled={busy}
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {busy ? 'Saving…' : 'Save document details'}
      </button>
    </div>
  )
}
