'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Building2, CheckCircle, ImageIcon, Loader2 } from 'lucide-react'

type Props = {
  initial: {
    company_name:    string
    company_address: string
    company_phone:   string
    company_email:   string
    company_number:  string
    vat_number:      string
    logo_url:        string | null
  }
}

export default function CompanySettingsForm({ initial }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [companyName,   setCompanyName]   = useState(initial.company_name)
  const [address,       setAddress]       = useState(initial.company_address)
  const [phone,         setPhone]         = useState(initial.company_phone)
  const [email,         setEmail]         = useState(initial.company_email)
  const [companyNumber, setCompanyNumber] = useState(initial.company_number)
  const [vatNumber,     setVatNumber]     = useState(initial.vat_number)
  const [logoUrl,       setLogoUrl]       = useState(initial.logo_url)
  const [logoPreview,   setLogoPreview]   = useState<string | null>(initial.logo_url)

  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    startTransition] = useTransition()
  const [logoBusy, startLogoTransition] = useTransition()

  const inputCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white'

  const handleSave = () => {
    setSuccess(false)
    setError(null)

    const name = companyName.trim()
    if (!name) {
      setError('Company name is required.')
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/admin/settings/company', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          company_name:    name,
          company_address: address.trim() || null,
          company_phone:   phone.trim() || null,
          company_email:   email.trim() || null,
          company_number:  companyNumber.trim() || null,
          vat_number:      vatNumber.trim() || null,
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

  const handleLogoChange = (file: File | null) => {
    if (!file) return
    setError(null)
    setSuccess(false)

    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoPreview(URL.createObjectURL(file))

    startLogoTransition(async () => {
      const form = new FormData()
      form.append('logo', file)

      const res = await fetch('/api/admin/settings/company/logo', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Logo upload failed.')
        setLogoPreview(logoUrl)
        return
      }
      setLogoUrl(json.logo_url ?? null)
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Company details</h2>
            <p className="text-xs text-slate-500">
              Shown on variation PDFs and other downloaded documents
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Company name</label>
          <input
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setSuccess(false) }}
            className={inputCls}
            placeholder="Glyn Jenkins LTD"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Registered address</label>
          <textarea
            value={address}
            onChange={(e) => { setAddress(e.target.value); setSuccess(false) }}
            rows={3}
            className={`${inputCls} resize-y min-h-[88px]`}
            placeholder={'123 Example Street\nTown\nPostcode'}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input value={phone} onChange={(e) => { setPhone(e.target.value); setSuccess(false) }} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSuccess(false) }} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company number</label>
            <input value={companyNumber} onChange={(e) => { setCompanyNumber(e.target.value); setSuccess(false) }} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">VAT number</label>
            <input value={vatNumber} onChange={(e) => { setVatNumber(e.target.value); setSuccess(false) }} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <ImageIcon className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Company logo</h2>
            <p className="text-xs text-slate-500">PNG or JPEG, max 500KB — appears top-left on PDFs</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-28 h-16 border border-dashed border-gray-200 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Company logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400 text-center px-2">No logo</span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={logoBusy}
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
            >
              {logoBusy ? 'Uploading…' : logoPreview ? 'Replace logo' : 'Upload logo'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Per-site details</p>
        <p>
          Developer name, site address, and surveyor are set on each site under{' '}
          <strong>Admin → Sites → [site] → Document details</strong>.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle className="w-4 h-4 shrink-0" />Saved successfully.
        </div>
      )}

      <button
        disabled={busy}
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {busy ? 'Saving…' : 'Save company details'}
      </button>
    </div>
  )
}
