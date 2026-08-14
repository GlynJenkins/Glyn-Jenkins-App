'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle, CheckCircle2, ChevronRight, Loader2, X,
} from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'
import { blobToDataUrl, formatWorkerRole } from '@/lib/toolbox-talks/helpers'

type Template = { id: string; title: string; description: string }
type Worker = { id: string; first_name: string; surname: string; role: string }
type Attendee = {
  id: string
  workerId: string | null
  workerName: string
  workerRole: string | null
  signaturePath: string | null
  signedAt: string | null
}
type Talk = {
  id: string
  siteId: string
  siteName?: string
  title: string
  description: string
  status: string
  conductedByName: string
  conductedByRole: string | null
  attendees: Attendee[]
  managerSigned?: boolean
  amendmentCount?: number
}

type Step = 1 | 2 | 3 | 4 | 5

const ROLE_TABS = [
  'all',
  'bricklayer',
  'labourer',
  'apprentice',
  'foreman',
  'jetwasher',
] as const

type Props = {
  siteId: string
  siteName: string
  workers: Worker[]
  templates: Template[]
  initialTalk: Talk | null
  managerName: string
  /** Opening a completed talk to amend wording / add attendees. */
  amendMode?: boolean
}

export default function ToolboxTalkWizard({
  siteId,
  siteName,
  workers,
  templates: initialTemplates,
  initialTalk,
  managerName,
  amendMode = false,
}: Props) {
  const router = useRouter()
  const isAmend = amendMode || initialTalk?.status === 'amending' || initialTalk?.status === 'completed'

  const [step, setStep] = useState<Step>(() => {
    if (amendMode) return 1
    if (initialTalk) return initialTalk.status === 'completed' ? 5 : 3
    return 1
  })
  const [templates, setTemplates] = useState(initialTemplates)

  const [title, setTitle] = useState(initialTalk?.title ?? '')
  const [description, setDescription] = useState(initialTalk?.description ?? '')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)

  const lockedWorkerIds = useMemo(() => {
    if (!isAmend || !initialTalk) return new Set<string>()
    // Existing attendees on a completed/amending talk cannot be removed
    return new Set(
      initialTalk.attendees.map((a) => a.workerId).filter(Boolean) as string[],
    )
  }, [isAmend, initialTalk])

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialTalk?.attendees.map((a) => a.workerId).filter(Boolean) as string[]),
  )
  const [search, setSearch] = useState('')
  const [roleTab, setRoleTab] = useState<(typeof ROLE_TABS)[number]>('all')

  const [talk, setTalk] = useState<Talk | null>(
    initialTalk && initialTalk.status !== 'completed' ? initialTalk : (amendMode ? initialTalk : initialTalk),
  )
  const [signingId, setSigningId] = useState<string | null>(null)
  const [sigBlob, setSigBlob] = useState<Blob | null>(null)
  const [managerBlob, setManagerBlob] = useState<Blob | null>(null)
  const [managerSigned, setManagerSigned] = useState(
    !!initialTalk?.managerSigned && !amendMode && initialTalk?.status !== 'amending',
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return workers.filter((w) => {
      if (roleTab !== 'all' && w.role !== roleTab) return false
      if (!q) return true
      return `${w.first_name} ${w.surname}`.toLowerCase().includes(q)
        || w.surname.toLowerCase().includes(q)
    })
  }, [workers, search, roleTab])

  const signedCount = talk?.attendees.filter((a) => a.signaturePath || a.signedAt).length ?? 0
  const totalAttendees = talk?.attendees.length ?? 0
  const unsignedAttendees = talk?.attendees.filter((a) => !(a.signaturePath || a.signedAt)) ?? []
  const unsignedCount = unsignedAttendees.length
  const signingList = isAmend && talk
    ? talk.attendees.filter((a) => !(a.signaturePath || a.signedAt))
    : (talk?.attendees ?? [])

  useEffect(() => {
    if (!initialTalk) return
    if (amendMode) {
      setTalk(initialTalk)
      setManagerSigned(false)
      setStep(1)
      return
    }
    setTalk(initialTalk)
    setStep(initialTalk.status === 'completed' ? 5 : 3)
  }, [initialTalk, amendMode])

  const toggleWorker = (id: string) => {
    if (lockedWorkerIds.has(id)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const warnIfRemovingSigned = (): boolean => {
    if (!talk || isAmend) return true
    const removingSigned = talk.attendees.filter(
      (a) => a.workerId && !selected.has(a.workerId) && (a.signaturePath || a.signedAt),
    )
    if (removingSigned.length === 0) return true
    const names = removingSigned.map((a) => a.workerName).join(', ')
    return window.confirm(
      `${names} ${removingSigned.length === 1 ? 'has' : 'have'} already signed — removing them will discard their signature. Continue?`,
    )
  }

  const saveDraft = async () => {
    if (!warnIfRemovingSigned()) return
    setBusy(true)
    setError(null)
    try {
      if (talk) {
        const res = await fetch(`/api/admin/toolbox-talks/${talk.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            attendees: [...selected],
            ...(isAmend ? { amend: true } : {}),
          }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error ?? 'Could not update talk.')
        setTalk({ ...json.talk, siteName })
        setManagerSigned(!!json.talk.managerSigned)
        setStep(3)
      } else {
        const res = await fetch('/api/admin/toolbox-talks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            title: title.trim(),
            description: description.trim(),
            attendees: [...selected],
            saveAsTemplate,
          }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error ?? 'Could not create talk.')
        setTalk({ ...json.talk, siteName })
        if (saveAsTemplate) {
          const tRes = await fetch('/api/admin/toolbox-talk-templates')
          const tJson = await tRes.json().catch(() => null)
          if (tRes.ok && tJson?.templates) setTemplates(tJson.templates)
        }
        setStep(3)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save talk.')
    } finally {
      setBusy(false)
    }
  }

  const deleteDraft = async () => {
    if (!talk || talk.status !== 'draft') return
    const ok = window.confirm(
      'Delete this draft talk? Any signatures captured will be discarded.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/toolbox-talks/${talk.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not delete draft.')
      router.push(`/admin/toolbox-talks?siteId=${siteId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete draft.')
      setBusy(false)
    }
  }

  const saveSignature = async (attendeeId: string, blob: Blob) => {
    if (!talk) return
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await blobToDataUrl(blob)
      const res = await fetch(`/api/admin/toolbox-talks/${talk.id}/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId, dataUrl }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save signature.')

      if (attendeeId === 'manager') {
        setManagerSigned(true)
        setManagerBlob(null)
      } else {
        setTalk((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            attendees: prev.attendees.map((a) =>
              a.id === attendeeId
                ? { ...a, signaturePath: json.path ?? 'signed', signedAt: json.signedAt ?? new Date().toISOString() }
                : a,
            ),
          }
        })
        setSigningId(null)
        setSigBlob(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save signature.')
    } finally {
      setBusy(false)
    }
  }

  const completeTalk = async () => {
    if (!talk) return
    if (unsignedCount > 0 && !isAmend) {
      const ok = window.confirm(
        `${unsignedCount} attendee${unsignedCount === 1 ? " hasn't" : "s haven't"} signed — they'll be marked "Did not sign" on the record. Continue?`,
      )
      if (!ok) return
    }
    if (isAmend && unsignedCount > 0) {
      const ok = window.confirm(
        `${unsignedCount} new attendee${unsignedCount === 1 ? " hasn't" : "s haven't"} signed yet. Continue anyway?`,
      )
      if (!ok) return
    }
    setBusy(true)
    setError(null)
    try {
      if (!managerSigned) {
        if (!managerBlob) {
          setError('Please sign before completing the talk.')
          setBusy(false)
          return
        }
        const dataUrl = await blobToDataUrl(managerBlob)
        const sigRes = await fetch(`/api/admin/toolbox-talks/${talk.id}/signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendeeId: 'manager', dataUrl }),
        })
        const sigJson = await sigRes.json().catch(() => null)
        if (!sigRes.ok) throw new Error(sigJson?.error ?? 'Could not save manager signature.')
        setManagerSigned(true)
      }

      const res = await fetch(`/api/admin/toolbox-talks/${talk.id}/complete`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not complete talk.')
      setStep(5)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete talk.')
    } finally {
      setBusy(false)
    }
  }

  const downloadPdf = async () => {
    if (!talk) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/toolbox-talks/${talk.id}/pdf`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'PDF not ready.')
      const a = document.createElement('a')
      a.href = json.url
      a.download = json.filename ?? 'toolbox-talk.pdf'
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download PDF.')
    } finally {
      setBusy(false)
    }
  }

  if (signingId && talk) {
    const attendee = talk.attendees.find((a) => a.id === signingId)
    if (!attendee) return null
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
        <div className="px-4 pt-12 pb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-orange-400 text-xs font-semibold uppercase tracking-widest">Pass the phone</p>
            <h2 className="text-white font-bold text-lg">{attendee.workerName}</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Signed {signedCount} of {totalAttendees}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setSigningId(null); setSigBlob(null) }}
            className="p-2 rounded-xl bg-slate-800 text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 bg-gray-50 rounded-t-3xl px-4 pt-5 pb-8 overflow-y-auto space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            <strong>{attendee.workerName}</strong> — sign below to confirm you attended this toolbox talk
            and understood its contents.
          </p>
          <SignaturePad onSigned={setSigBlob} onCleared={() => setSigBlob(null)} />
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />{error}
            </p>
          )}
          <button
            type="button"
            disabled={!sigBlob || busy}
            onClick={() => sigBlob && saveSignature(attendee.id, sigBlob)}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300
                       text-white font-semibold rounded-xl"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirm signature'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {step < 5 && (
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full ${step >= n ? 'bg-orange-500' : 'bg-slate-200'}`}
            />
          ))}
        </div>
      )}

      {isAmend && step < 5 && (
        <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Amending a completed talk — existing attendees and signatures stay; you can fix wording and add people.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {step === 1 && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">{isAmend ? 'Amend topic' : 'Topic'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pick a saved topic or write a new one</p>
          </div>

          {templates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Templates</p>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTitle(t.title); setDescription(t.description) }}
                    className="text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-orange-300
                               hover:bg-orange-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Working at Height"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none
                         focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              What is this talk about?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder="Key points covered in the talk…"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none
                         focus:ring-2 focus:ring-orange-400 resize-y"
            />
          </div>
          {!isAmend && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="accent-orange-500"
              />
              Save as template for next time
            </label>
          )}
          <button
            type="button"
            disabled={!title.trim() || !description.trim()}
            onClick={() => setStep(2)}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200
                       disabled:text-gray-400 text-white font-semibold rounded-xl"
          >
            Next — Attendees
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Attendees</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAmend ? 'Existing attendees are locked — add anyone who was missed' : siteName}
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-800">
              {selected.size} selected
            </span>
          </div>

          {selected.size > 0 && (
            <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2 border-b border-gray-100">
              {workers.filter((w) => selected.has(w.id)).map((w) => {
                const locked = lockedWorkerIds.has(w.id)
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleWorker(w.id)}
                    disabled={locked}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full ${
                      locked
                        ? 'bg-emerald-50 text-emerald-800 cursor-default'
                        : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {w.first_name} {w.surname}
                    {locked ? (
                      <span className="text-emerald-600 text-[10px] uppercase">signed</span>
                    ) : (
                      <span className="text-orange-500 font-bold">×</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="px-4 pt-3 pb-2">
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                         focus:ring-2 focus:ring-orange-400 bg-gray-50"
            />
          </div>

          <div className="flex gap-1 px-4 pb-3 overflow-x-auto">
            {ROLE_TABS.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleTab(role)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                  roleTab === role
                    ? 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-slate-500 hover:bg-gray-200'
                }`}
              >
                {role === 'all' ? 'All' : formatWorkerRole(role)}
              </button>
            ))}
          </div>

          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {filteredWorkers.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-6">No workers match</p>
            ) : filteredWorkers.map((w) => {
              const locked = lockedWorkerIds.has(w.id)
              const on = selected.has(w.id)
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWorker(w.id)}
                  disabled={locked}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                    on ? 'bg-orange-50' : 'hover:bg-gray-50'
                  } ${locked ? 'opacity-90' : ''}`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                    on ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                  }`}>
                    {on && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{w.surname}, {w.first_name}</p>
                    <p className="text-xs text-slate-400">
                      {formatWorkerRole(w.role)}
                      {locked ? ' · locked' : ''}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="px-4 py-4 border-t border-gray-100 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-3 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={saveDraft}
              className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200
                         disabled:text-gray-400 text-white font-semibold text-sm rounded-xl"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : talk || isAmend ? (
                `Continue signing (${selected.size})`
              ) : (
                `Start signing (${selected.size})`
              )}
            </button>
          </div>
        </section>
      )}

      {step === 3 && talk && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-slate-900">
              {isAmend ? 'New attendee signatures' : 'Attendee signatures'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Signed <strong className="text-slate-800">{signedCount} of {totalAttendees}</strong>
              {isAmend
                ? ' · only unsigned / newly added people need to sign'
                : ' · tap a name to sign'}
            </p>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all"
                style={{ width: `${totalAttendees ? (signedCount / totalAttendees) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {(isAmend ? signingList : talk.attendees).length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-6">
                {isAmend ? 'No new attendees to sign — continue to manager sign-off.' : 'No attendees'}
              </p>
            ) : (isAmend ? signingList : talk.attendees).map((a) => {
              const signed = !!(a.signaturePath || a.signedAt)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { if (!signed) { setError(null); setSigningId(a.id) } }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{a.workerName}</p>
                    <p className="text-xs text-slate-400">{formatWorkerRole(a.workerRole)}</p>
                  </div>
                  {signed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Signed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                      Awaiting signature <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="px-4 py-4 border-t border-gray-100 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setTitle(talk.title)
                  setDescription(talk.description)
                  setSelected(new Set(
                    talk.attendees.map((a) => a.workerId).filter(Boolean) as string[],
                  ))
                  setStep(2)
                }}
                className="px-4 py-3 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl"
              >
                Next — Manager sign-off
              </button>
            </div>
            {talk.status === 'draft' && (
              <button
                type="button"
                disabled={busy}
                onClick={deleteDraft}
                className="w-full text-center text-sm text-red-600 hover:text-red-700 py-1"
              >
                Delete draft
              </button>
            )}
          </div>
        </section>
      )}

      {step === 4 && talk && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Manager sign-off</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAmend ? 'Re-sign to save the amendment and regenerate the PDF' : 'Complete the talk and generate the PDF'}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <p><span className="text-slate-400">Site:</span> {siteName}</p>
            <p><span className="text-slate-400">Title:</span> {title || talk.title}</p>
            <p><span className="text-slate-400">Attendees:</span> {totalAttendees} ({signedCount} signed)</p>
            <p><span className="text-slate-400">Conducted by:</span> {managerName}</p>
          </div>

          {unsignedCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {unsignedCount} attendee{unsignedCount === 1 ? " hasn't" : "s haven't"} signed — they&apos;ll be
              marked &ldquo;Did not sign&rdquo; on the record.
            </div>
          )}

          {managerSigned ? (
            <p className="text-sm font-medium text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Manager signature saved
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                {isAmend
                  ? 'Sign below to confirm this amendment.'
                  : 'Sign below to confirm you conducted this toolbox talk.'}
              </p>
              <SignaturePad
                onSigned={setManagerBlob}
                onCleared={() => setManagerBlob(null)}
              />
            </>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-3 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy || (!managerSigned && !managerBlob)}
              onClick={completeTalk}
              className="flex-1 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300
                         text-white font-semibold rounded-xl"
            >
              {busy
                ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                : isAmend ? 'Save amendment' : 'Complete Talk'}
            </button>
          </div>
        </section>
      )}

      {step === 5 && talk && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isAmend ? 'Amendment saved' : 'Talk completed'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">{talk.title}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={downloadPdf}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Download PDF'}
          </button>
          <Link
            href={`/admin/toolbox-talks?siteId=${siteId}`}
            className="block w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl"
          >
            Back to site talks
          </Link>
        </section>
      )}
    </div>
  )
}
