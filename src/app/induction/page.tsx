'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  User,
  CreditCard,
  Briefcase,
  Upload,
  Camera,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  KeyRound,
} from 'lucide-react'
import { needsPortalLogin } from '@/lib/worker-access'
import PortalHeader from '@/components/PortalHeader'

// ── Validation schema ──────────────────────────────────────────────────────────
// UTR and tax type are only required for non-apprentices
const schema = z.object({
  firstName:            z.string().min(1, 'First name is required'),
  surname:              z.string().min(1, 'Surname is required'),
  phone:                z.string().min(10, 'Enter a valid UK phone number'),
  email:                z.string().email('Enter a valid email address'),
  role:                 z.enum(['foreman', 'bricklayer', 'labourer', 'apprentice', 'management'], { error: 'Select your role' }),
  hasPersonalInsurance: z.enum(['yes', 'no'], { error: 'Please answer this question' }),
  bankSortCode:         z.string().regex(/^\d{2}-\d{2}-\d{2}$/, 'Format: 12-34-56'),
  bankAccountNumber:    z.string().regex(/^\d{8}$/, 'Must be exactly 8 digits'),
  niNumber:             z.string().regex(/^[A-Z]{2}\d{6}[A-D]$/i, 'Enter a valid NI number (e.g. AB123456C)'),
  utrNumber:            z.string().optional(),
  taxType:              z.string().optional(),
  cscsNumber:           z.string().min(1, 'CSCS number is required'),
  cscsExpiryDate:       z.string().min(1, 'CSCS expiry date is required'),
  password:             z.string().optional(),
  confirmPassword:        z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role !== 'apprentice') {
    if (!data.utrNumber || !/^\d{10}$/.test(data.utrNumber)) {
      ctx.addIssue({ code: 'custom', path: ['utrNumber'], message: 'Must be exactly 10 digits' })
    }
    if (!data.taxType || !['cis_20', 'gross'].includes(data.taxType)) {
      ctx.addIssue({ code: 'custom', path: ['taxType'], message: 'Select a tax type' })
    }
  }
  if (needsPortalLogin(data.role)) {
    if (!data.password || data.password.length < 8) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Password must be at least 8 characters' })
    }
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' })
    }
  }
})

type FormValues = z.infer<typeof schema>

// ── Helpers ────────────────────────────────────────────────────────────────────
const inputCls = (hasError: boolean) =>
  `w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none transition-all
   focus:ring-2 focus:ring-orange-400 focus:border-transparent
   ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {message}
    </p>
  )
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-orange-600" />
        </div>
        <h2 className="font-semibold text-slate-800 text-base">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── File upload area ───────────────────────────────────────────────────────────
interface FileUploadProps {
  label: string
  required?: boolean
  file: File | null
  onChange: (f: File | null) => void
  error?: string
}

function FileUploadArea({ label, required, file, onChange, error }: FileUploadProps) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-all ${
          file
            ? 'border-green-400 bg-green-50'
            : error
            ? 'border-red-300 bg-red-50'
            : 'border-gray-200 bg-gray-50 active:border-orange-400 active:bg-orange-50'
        }`}
      >
        {file ? (
          <>
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            <span className="text-sm text-green-700 truncate text-left">{file.name}</span>
          </>
        ) : (
          <>
            <Camera className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500 text-left">Tap to take photo or upload file</span>
          </>
        )}
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
          <AlertCircle className="w-3 h-3 shrink-0" /> {error}
        </p>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

// ── Signature pad ──────────────────────────────────────────────────────────────
function SignaturePad({
  onSigned,
  onCleared,
  error,
}: {
  onSigned: (blob: Blob) => void
  onCleared: () => void
  error?: string
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const hasMark    = useRef(false)

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    drawing.current = true
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.strokeStyle = '#1e293b'
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    hasMark.current = true
  }

  const endDraw = () => {
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas || !hasMark.current) return
    canvas.toBlob((blob) => { if (blob) onSigned(blob) }, 'image/png')
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasMark.current = false
    onCleared()
  }

  return (
    <div>
      <div className={`rounded-xl border-2 overflow-hidden ${error ? 'border-red-300' : 'border-gray-300'} bg-white`}>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full touch-none"
          style={{ cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        {error
          ? <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3 h-3" />{error}</p>
          : <p className="text-xs text-slate-400">Sign above using your finger or mouse</p>
        }
        <button
          type="button"
          onClick={clear}
          className="text-xs text-slate-500 underline"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function InductionPage() {
  const [cscsCard,        setCscsCard]        = useState<File | null>(null)
  const [idDocument,      setIdDocument]      = useState<File | null>(null)
  const [insuranceCert,   setInsuranceCert]   = useState<File | null>(null)
  const [signatureBlob,   setSignatureBlob]   = useState<Blob | null>(null)
  const [agreedToTerms,   setAgreedToTerms]   = useState(false)
  const [fileErrors,      setFileErrors]      = useState<Record<string, string>>({})
  const [submitting,      setSubmitting]      = useState(false)
  const [submitted,       setSubmitted]       = useState(false)
  const [portalLoginCreated, setPortalLoginCreated] = useState(false)
  const [serverError,     setServerError]     = useState<string | null>(null)
  const [insuranceFee,    setInsuranceFee]    = useState<number>(3)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.insurance_fee != null) setInsuranceFee(d.insurance_fee) })
      .catch(() => {})
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const hasInsurance  = watch('hasPersonalInsurance')
  const selectedRole  = watch('role')
  const isApprentice  = selectedRole === 'apprentice'
  const needsLogin    = needsPortalLogin(selectedRole ?? '')

  // Clear UTR and tax type when apprentice is selected — not applicable
  useEffect(() => {
    if (isApprentice) {
      setValue('utrNumber', '')
      setValue('taxType',   '')
    }
  }, [isApprentice, setValue])

  // Clear portal passwords when role changes away from foreman / management
  useEffect(() => {
    if (!needsLogin) {
      setValue('password', '')
      setValue('confirmPassword', '')
    }
  }, [needsLogin, setValue])

  const validateFiles = (): boolean => {
    const errs: Record<string, string> = {}
    if (!cscsCard)        errs.cscsCard      = 'CSCS card photo is required'
    if (!idDocument)      errs.idDocument    = 'ID document is required'
    if (hasInsurance === 'yes' && !insuranceCert)
                          errs.insuranceCert = 'Insurance certificate is required'
    if (!signatureBlob)   errs.signature     = 'Please sign the agreement before submitting'
    if (!agreedToTerms)   errs.agreed        = 'You must confirm you have read and agree to the agreement'
    setFileErrors(errs)
    return Object.keys(errs).length === 0
  }

  const onSubmit = async (data: FormValues) => {
    if (!validateFiles()) return

    setSubmitting(true)
    setServerError(null)

    try {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (k === 'confirmPassword') return
        if (v != null && v !== '') fd.append(k, v as string)
      })
      fd.append('cscsCard',   cscsCard!)
      fd.append('idDocument', idDocument!)
      if (insuranceCert)  fd.append('insuranceCert', insuranceCert)
      if (signatureBlob)  fd.append('signature', new File([signatureBlob], 'signature.png', { type: 'image/png' }))

      const res  = await fetch('/api/induction', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Submission failed. Please try again.')
      setPortalLoginCreated(!!json.portalLoginCreated)
      setSubmitted(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Application Submitted</h1>
        <p className="text-slate-500 max-w-sm text-sm leading-relaxed">
          Your registration has been received. The Glyn Jenkins team will review your details
          and be in touch on the number you provided.
        </p>
        {portalLoginCreated && (
          <p className="text-slate-600 max-w-sm text-sm leading-relaxed mt-3">
            Your portal login has been created using the email and password you chose.
            You can sign in once an administrator activates your account.
          </p>
        )}
        <div className="mt-8 w-full max-w-sm p-4 bg-orange-50 border border-orange-200 rounded-2xl text-left">
          <p className="text-sm font-semibold text-orange-800">What happens next?</p>
          <ul className="mt-2 space-y-1 text-sm text-orange-700 list-disc list-inside">
            <li>Admin verifies your documents</li>
            <li>Your account is activated</li>
            {portalLoginCreated ? (
              <li>Sign in at the login page — portal access unlocks after activation</li>
            ) : (
              <li>You receive a text message to confirm</li>
            )}
          </ul>
        </div>
        {portalLoginCreated && (
          <a
            href="/login"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600
                       text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Go to login
            <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="min-h-screen bg-gray-50">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PortalHeader padding="pb-8">
        <a
          href="/login"
          className="flex items-center gap-1.5 text-orange-400 text-xs font-semibold tracking-widest uppercase mb-4"
        >
          ← Back to Login
        </a>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Worker Registration</h1>
          </div>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          Complete all sections below. Fields marked <span className="text-red-400 font-bold">*</span> are required.
        </p>
      </PortalHeader>

      {/* ── Form sections ───────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-36 space-y-5 max-w-lg mx-auto">

        {/* Section 1 — Personal Details */}
        <SectionCard icon={User} title="Personal Details">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register('firstName')}
              placeholder="e.g. John"
              className={inputCls(!!errors.firstName)}
            />
            <FieldError message={errors.firstName?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Surname <span className="text-red-500">*</span>
            </label>
            <input
              {...register('surname')}
              placeholder="e.g. Smith"
              className={inputCls(!!errors.surname)}
            />
            <FieldError message={errors.surname?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mobile Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              {...register('phone')}
              type="tel"
              inputMode="tel"
              placeholder="e.g. 07700 900000"
              className={inputCls(!!errors.phone)}
            />
            <FieldError message={errors.phone?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              {...register('email')}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              placeholder="e.g. john.smith@email.com"
              className={inputCls(!!errors.email)}
            />
            <FieldError message={errors.email?.message} />
          </div>
        </SectionCard>

        {/* Section 2 — Job Role */}
        <SectionCard icon={Briefcase} title="Job Role">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Your Role <span className="text-red-500">*</span>
            </label>
            <select {...register('role')} className={inputCls(!!errors.role)}>
              <option value="">Select your role...</option>
              <option value="foreman">Foreman</option>
              <option value="bricklayer">Bricklayer</option>
              <option value="labourer">Labourer</option>
              <option value="apprentice">Apprentice</option>
              <option value="management">Management</option>
            </select>
            <FieldError message={errors.role?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Do you have your own public liability insurance?{' '}
              <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-slate-500 mb-2">
              If <strong>No</strong>, a company insurance fee of <strong>£{insuranceFee.toFixed(2)}</strong> will be deducted from your pay each period.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'yes', label: '✓ Yes — I have my own insurance' },
                { value: 'no',  label: '✗ No — I do not have insurance' },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    hasInsurance === value
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <input
                    {...register('hasPersonalInsurance')}
                    type="radio"
                    value={value}
                    className="accent-orange-500"
                  />
                  <span className="text-xs font-medium text-slate-700 leading-tight">{label}</span>
                </label>
              ))}
            </div>
            <FieldError message={errors.hasPersonalInsurance?.message} />
          </div>
        </SectionCard>

        {/* Section 2b — Portal login (foreman / management only) */}
        {needsLogin && (
          <SectionCard icon={KeyRound} title="Portal Login">
            <p className="text-xs text-slate-500 leading-relaxed">
              As {selectedRole === 'foreman' ? 'a Foreman' : 'Management'}, you&apos;ll use the app
              to manage sites and claims. Choose a password now — your login will be activated
              once an administrator approves your registration.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Create Password <span className="text-red-500">*</span>
              </label>
              <input
                {...register('password')}
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className={inputCls(!!errors.password)}
              />
              <FieldError message={errors.password?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                {...register('confirmPassword')}
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                className={inputCls(!!errors.confirmPassword)}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
          </SectionCard>
        )}

        {/* Section 3 — Financial & Tax */}
        <SectionCard icon={CreditCard} title="Financial & Tax Details">

          {isApprentice && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                As an Apprentice, UTR number and tax type are not required at registration.
                Tax will be calculated based on your earnings threshold.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              National Insurance Number <span className="text-red-500">*</span>
            </label>
            <input
              {...register('niNumber')}
              placeholder="e.g. AB123456C"
              maxLength={9}
              autoCapitalize="characters"
              className={inputCls(!!errors.niNumber)}
            />
            <FieldError message={errors.niNumber?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Bank Sort Code <span className="text-red-500">*</span>
            </label>
            <input
              {...register('bankSortCode')}
              placeholder="12-34-56"
              maxLength={8}
              className={inputCls(!!errors.bankSortCode)}
            />
            <FieldError message={errors.bankSortCode?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Bank Account Number <span className="text-red-500">*</span>
            </label>
            <input
              {...register('bankAccountNumber')}
              placeholder="12345678"
              maxLength={8}
              inputMode="numeric"
              className={inputCls(!!errors.bankAccountNumber)}
            />
            <FieldError message={errors.bankAccountNumber?.message} />
          </div>

          {!isApprentice && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  UTR Number <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('utrNumber')}
                  placeholder="10-digit UTR number"
                  maxLength={10}
                  inputMode="numeric"
                  className={inputCls(!!errors.utrNumber)}
                />
                <FieldError message={errors.utrNumber?.message} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tax Type <span className="text-red-500">*</span>
                </label>
                <select {...register('taxType')} className={inputCls(!!errors.taxType)}>
                  <option value="">Select your tax type...</option>
                  <option value="cis_20">CIS 20% Tax</option>
                  <option value="gross">Gross (No Deduction)</option>
                </select>
                <FieldError message={errors.taxType?.message} />
              </div>
            </>
          )}
        </SectionCard>

        {/* Section 4 — Documents */}
        <SectionCard icon={Upload} title="Document Uploads">
          <p className="text-xs text-slate-500 -mt-1">
            Tap each box to take a photo or choose a file from your phone.
          </p>

          <FileUploadArea
            label="CSCS Card"
            required
            file={cscsCard}
            onChange={setCscsCard}
            error={fileErrors.cscsCard}
          />

          <FileUploadArea
            label="Passport or Driving Licence"
            required
            file={idDocument}
            onChange={setIdDocument}
            error={fileErrors.idDocument}
          />

          {hasInsurance === 'yes' && (
            <FileUploadArea
              label="Public Liability Insurance Certificate"
              required
              file={insuranceCert}
              onChange={setInsuranceCert}
              error={fileErrors.insuranceCert}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              CSCS Registration Number <span className="text-red-500">*</span>
            </label>
            <input
              {...register('cscsNumber')}
              placeholder="e.g. 1234567890"
              inputMode="text"
              className={inputCls(!!errors.cscsNumber)}
            />
            <FieldError message={errors.cscsNumber?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              CSCS Card Expiry Date <span className="text-red-500">*</span>
            </label>
            <input
              {...register('cscsExpiryDate')}
              type="date"
              className={inputCls(!!errors.cscsExpiryDate)}
            />
            <FieldError message={errors.cscsExpiryDate?.message} />
          </div>
        </SectionCard>

        {/* Section 5 — Subcontract Agreement */}
        <SectionCard icon={Briefcase} title="Subcontract Agreement">
          <p className="text-xs text-slate-500 -mt-1">
            Please read the agreement in full, then sign and confirm below.
          </p>

          {/* Scrollable agreement text */}
          <div className="h-64 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-slate-700 leading-relaxed space-y-3">
            <p className="font-bold text-sm text-slate-900">SUBCONTRACT AGREEMENT — GLYN JENKINS LTD</p>

            <p>This agreement is entered into between <strong>Glyn Jenkins LTD</strong> (the &ldquo;Company&rdquo;) and the operative named in this registration form (the &ldquo;Subcontractor&rdquo;).</p>

            <p><strong>1. STATUS</strong><br />
            The Subcontractor agrees to provide services to the Company as a self-employed subcontractor and not as an employee. The Subcontractor is responsible for their own tax affairs and National Insurance contributions, subject to the Construction Industry Scheme (CIS) where applicable.</p>

            <p><strong>2. PAYMENT</strong><br />
            Payment will be made on a fortnightly basis, subject to work being completed to the satisfaction of the Company&apos;s Foreman and approved by the Company&apos;s administration. Gross amounts are agreed per lift or stage as set out in the price schedule for each site. Deductions including CIS tax (where applicable), admin fees, and insurance fees will be applied before net payment is made.</p>

            <p><strong>3. CONSTRUCTION INDUSTRY SCHEME (CIS)</strong><br />
            Where the Subcontractor is registered under CIS at the standard 20% deduction rate, the Company will deduct 20% from the taxable element of each payment and submit this to HMRC on the Subcontractor&apos;s behalf. Gross-status subcontractors will receive payment without CIS deduction, subject to valid HMRC gross-status verification.</p>

            <p><strong>4. ADMIN FEE</strong><br />
            A fortnightly administration fee as set by the Company will be deducted from each payment to cover payroll processing and administrative costs.</p>

            <p><strong>5. INSURANCE</strong><br />
            The Subcontractor declares whether they hold their own public liability insurance. Where they do not, a company insurance fee as set by the Company will be deducted from each payment.</p>

            <p><strong>6. CSCS COMPLIANCE</strong><br />
            The Subcontractor confirms their CSCS card is valid and will remain valid throughout their engagement. The Company reserves the right to suspend access to site if the CSCS card expires.</p>

            <p><strong>7. RIGHT TO WORK</strong><br />
            The Subcontractor confirms they have the legal right to work in the United Kingdom and that all documents submitted are genuine and belong to them.</p>

            <p><strong>8. CONDUCT & SAFETY</strong><br />
            The Subcontractor agrees to comply with all site health and safety rules, follow instructions from the Foreman, and conduct themselves professionally at all times. Failure to comply may result in immediate removal from site and suspension of payment.</p>

            <p><strong>9. TERMINATION & SUBSTANDARD WORK</strong><br />
            Either party may terminate this agreement with reasonable notice. The Company reserves the right to terminate immediately in cases of gross misconduct, safety breaches, or fraudulent claims. Where work is deemed to be substandard or defective, the Company reserves the right to withhold payment, in full or in part, to cover the reasonable cost of remediation. Withheld payment will be released in full once the work has been inspected and passed to the required standard.</p>

            <p><strong>10. GOVERNING LAW</strong><br />
            This agreement is governed by the laws of England and Wales.</p>

            <p className="font-bold text-sm text-slate-900 pt-3">SUBCONTRACTOR STATUS DECLARATION</p>
            <p className="italic">This Declaration forms part of the Self-Employed Subcontractor Agreement between Glyn Jenkins Ltd and the Subcontractor.</p>

            <p><strong>Self-Employment Status</strong></p>
            <p>1. I have freely chosen to operate as a self-employed subcontractor and have not been required by Glyn Jenkins Ltd to do so.</p>
            <p>2. I understand that I am not an employee, worker, partner, agent or representative of Glyn Jenkins Ltd.</p>
            <p>3. I understand that I am not entitled to:</p>
            <ul className="list-disc list-inside pl-2 space-y-0.5">
              <li>Holiday pay;</li>
              <li>Sick pay;</li>
              <li>Pension contributions;</li>
              <li>Redundancy pay;</li>
              <li>Notice pay;</li>
              <li>Maternity or paternity pay; or</li>
              <li>Any other employment-related rights or benefits.</li>
            </ul>

            <p><strong>Taxation</strong></p>
            <p>4. I confirm that I am responsible for my own Income Tax, National Insurance Contributions and any other personal tax liabilities.</p>
            <p>5. I understand that Glyn Jenkins Ltd may make deductions under the Construction Industry Scheme (CIS) where required by law.</p>
            <p>6. I understand that CIS deductions do not create an employment relationship between myself and Glyn Jenkins Ltd.</p>
            <p>7. I understand that I remain responsible for submitting my own Self Assessment tax returns and dealing directly with HMRC regarding my personal tax affairs.</p>

            <p><strong>Business Independence</strong></p>
            <p>8. I am operating as an independent business undertaking.</p>
            <p>9. I am free to work for other contractors, businesses and clients at any time.</p>
            <p>10. I understand that Glyn Jenkins Ltd is under no obligation to offer me work.</p>
            <p>11. I understand that I am under no obligation to accept work offered by Glyn Jenkins Ltd.</p>
            <p>12. I acknowledge that there is no guarantee of future work.</p>
            <p>13. I understand that each plot, phase, work package or instruction represents a separate engagement.</p>

            <p><strong>Substitution</strong></p>
            <p>14. I understand that I may provide a suitably qualified substitute in accordance with the terms of the Agreement.</p>
            <p>15. I remain fully responsible for the performance, supervision and payment of any substitute provided by me.</p>

            <p><strong>Quality, Defects and Snagging</strong></p>
            <p>16. I understand that I remain responsible for the quality of all works completed by me.</p>
            <p>17. I agree to rectify defective workmanship, incomplete works and snagging items attributable to my works.</p>
            <p>18. I acknowledge that Glyn Jenkins Ltd may retain reasonable sums from monies due to me in order to:</p>
            <ul className="list-disc list-inside pl-2 space-y-0.5">
              <li>Complete outstanding works;</li>
              <li>Rectify defective workmanship;</li>
              <li>Complete snagging items;</li>
              <li>Remedy non-compliant work; and</li>
              <li>Recover reasonable losses arising from defective work.</li>
            </ul>
            <p>19. I acknowledge that any deductions made shall be limited to reasonable costs actually incurred by Glyn Jenkins Ltd.</p>

            <p><strong>Insurance and Administration Charges</strong></p>
            <p>20. I understand that I am responsible for maintaining appropriate insurance where required.</p>
            <p>21. Where I elect to utilise insurance arrangements made available by Glyn Jenkins Ltd, I agree that a reasonable charge may be deducted from monies due to me.</p>
            <p>22. I acknowledge that Glyn Jenkins Ltd may charge reasonable administration fees relating to:</p>
            <ul className="list-disc list-inside pl-2 space-y-0.5">
              <li>CIS administration;</li>
              <li>Payment processing;</li>
              <li>Production of payment statements;</li>
              <li>Workforce administration;</li>
              <li>Compliance administration; and</li>
              <li>Digital management systems.</li>
            </ul>
            <p>23. I understand that such charges do not create an employment relationship between myself and Glyn Jenkins Ltd.</p>

            <p><strong>General Declaration</strong></p>
            <p>24. I have read and understood the Self-Employed Subcontractor Agreement.</p>
            <p>25. I have been given the opportunity to seek independent legal, tax or financial advice prior to signing.</p>
            <p>26. I confirm that all information provided by me is true and accurate.</p>
            <p>27. I acknowledge that this Declaration forms part of the contractual arrangements between myself and Glyn Jenkins Ltd.</p>
            <p>28. I understand and accept that failure to comply with the terms of the Agreement may result in deductions being made in accordance with the Agreement or termination of future work opportunities.</p>

            <p className="pt-2 text-slate-500 italic"><strong>Confirmation:</strong> By signing this Declaration and the Self-Employed Subcontractor Agreement, I confirm that I have read, understood and voluntarily accepted all terms and conditions contained within both documents and acknowledge that I am entering into the Agreement as an independent self-employed subcontractor.</p>
          </div>

          {/* Signature pad */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Your Signature <span className="text-red-500">*</span>
            </label>
            <SignaturePad
              onSigned={(blob) => setSignatureBlob(blob)}
              onCleared={() => setSignatureBlob(null)}
              error={fileErrors.signature}
            />
          </div>

          {/* Agreement checkbox */}
          <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
            agreedToTerms ? 'border-orange-500 bg-orange-50' : fileErrors.agreed ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="accent-orange-500 mt-0.5 w-4 h-4 shrink-0"
            />
            <span className="text-xs font-medium text-slate-700 leading-relaxed">
              I confirm I have read the subcontract agreement in full and I agree to be bound by its terms.
            </span>
          </label>
          {fileErrors.agreed && (
            <p className="flex items-center gap-1 text-xs text-red-500 -mt-2">
              <AlertCircle className="w-3 h-3 shrink-0" />{fileErrors.agreed}
            </p>
          )}
        </SectionCard>

        {/* Server error */}
        {serverError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}
      </div>

      {/* ── Sticky submit button ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-xl px-4 py-4 safe-bottom-bar">
        <button
          type="submit"
          disabled={submitting}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 bg-orange-600
                     hover:bg-orange-700 active:bg-orange-800 disabled:bg-orange-300
                     text-white font-semibold py-4 rounded-xl transition-colors text-base"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              Submit Application <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </form>
  )
}
