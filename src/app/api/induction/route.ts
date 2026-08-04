import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { createServiceClient } from '@/lib/supabase/server'
import { generateSubcontractPdf } from '@/lib/generate-subcontract-pdf'
import { needsPortalLogin } from '@/lib/worker-access'
import { INDUCTION_RATE_LIMIT, rateLimit } from '@/lib/rate-limit'
import {
  extensionForMime,
  validateUpload,
} from '@/lib/induction/upload-validation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, INDUCTION_RATE_LIMIT)
  if (!limited.success) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429 },
    )
  }

  // Paths written to storage during this request — cleaned up on failure.
  const uploadedPaths: string[] = []

  try {
    const formData = await request.formData()

    // ── Extract text fields ────────────────────────────────────
    const firstName            = (formData.get('firstName')           as string)?.trim()
    const surname              = (formData.get('surname')             as string)?.trim()
    const phone                = (formData.get('phone')               as string)?.trim()
    const email                = (formData.get('email')               as string)?.trim().toLowerCase()
    const bankSortCode         = (formData.get('bankSortCode')        as string)?.trim()
    const bankAccountNumber    = (formData.get('bankAccountNumber')   as string)?.trim()
    const utrNumber            = (formData.get('utrNumber')           as string)?.trim()
    const taxType              = formData.get('taxType')              as string
    const role                 = formData.get('role')                 as string
    const hasPersonalInsurance = formData.get('hasPersonalInsurance') as string
    const niNumber             = (formData.get('niNumber')            as string)?.trim().toUpperCase()
    const cscsNumber           = (formData.get('cscsNumber')          as string)?.trim()
    const cscsExpiryDate       = (formData.get('cscsExpiryDate')      as string)?.trim()
    const password             = (formData.get('password')             as string) ?? ''
    const privacyConsent       = formData.get('privacyConsent') === 'true' || formData.get('privacyConsent') === 'on'

    // ── Extract files ──────────────────────────────────────────
    const cscsCard      = formData.get('cscsCard')      as File | null
    const idDocument    = formData.get('idDocument')    as File | null
    const insuranceCert = formData.get('insuranceCert') as File | null
    const signature     = formData.get('signature')     as File | null

    // ── Basic server-side validation ───────────────────────────
    const isApprentice = role === 'apprentice'

    if (!firstName || !surname || !phone || !email || !bankSortCode || !bankAccountNumber ||
        !role || !hasPersonalInsurance || !niNumber) {
      return NextResponse.json({ error: 'All required fields must be filled in.' }, { status: 400 })
    }

    if (!privacyConsent) {
      return NextResponse.json(
        { error: 'You must confirm the privacy notice and consent before registering.' },
        { status: 400 },
      )
    }

    if (!isApprentice && (!utrNumber || !taxType)) {
      return NextResponse.json({ error: 'UTR number and tax type are required for subcontractors.' }, { status: 400 })
    }

    if (!cscsCard || !idDocument) {
      return NextResponse.json({ error: 'CSCS card and ID document are both required.' }, { status: 400 })
    }

    if (!signature) {
      return NextResponse.json({ error: 'Signed subcontract agreement is required.' }, { status: 400 })
    }

    if (hasPersonalInsurance === 'yes' && !insuranceCert) {
      return NextResponse.json({ error: 'Insurance certificate is required when you have personal insurance.' }, { status: 400 })
    }

    const createPortalLogin = needsPortalLogin(role)

    if (createPortalLogin) {
      if (!password || password.length < 8) {
        return NextResponse.json({ error: 'Portal password must be at least 8 characters.' }, { status: 400 })
      }
    }

    // ── Validate uploads (type + size + magic bytes) ───────────
    const cscsCheck = await validateUpload(cscsCard, 'document', 'CSCS card')
    if (!cscsCheck.ok) return NextResponse.json({ error: cscsCheck.error }, { status: 400 })

    const idCheck = await validateUpload(idDocument, 'document', 'ID document')
    if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 })

    const sigCheck = await validateUpload(signature, 'signature', 'Signature')
    if (!sigCheck.ok) return NextResponse.json({ error: sigCheck.error }, { status: 400 })

    let insuranceCheck: Awaited<ReturnType<typeof validateUpload>> | null = null
    if (hasPersonalInsurance === 'yes' && insuranceCert) {
      insuranceCheck = await validateUpload(insuranceCert, 'document', 'Insurance certificate')
      if (!insuranceCheck.ok) {
        return NextResponse.json({ error: insuranceCheck.error }, { status: 400 })
      }
    }

    // ── Supabase service-role client ───────────────────────────
    const supabase = createServiceClient()

    const cleanupUploads = async () => {
      if (uploadedPaths.length === 0) return
      try {
        await supabase.storage.from('worker-documents').remove(uploadedPaths)
      } catch (cleanupErr) {
        console.error('[Induction] Failed to clean up uploaded files:', cleanupErr)
      }
    }

    // ── Ensure storage bucket exists ───────────────────────────
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === 'worker-documents')
    if (!bucketExists) {
      await supabase.storage.createBucket('worker-documents', { public: false })
    }

    // ── Generate a stable worker ID to use in file paths ──────
    const workerId = crypto.randomUUID()

    async function uploadBuffer(
      buffer: Buffer,
      mime: string,
      folder: string,
    ): Promise<string> {
      const ext  = extensionForMime(mime)
      const path = `${folder}/${workerId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('worker-documents')
        .upload(path, buffer, { contentType: mime, upsert: false })

      if (error) throw new Error(`File upload failed: ${error.message}`)
      uploadedPaths.push(path)
      return path
    }

    // ── Upload required documents ──────────────────────────────
    const [cscsUrl, idUrl, signatureUrl] = await Promise.all([
      uploadBuffer(cscsCheck.buffer, cscsCheck.mime, 'cscs'),
      uploadBuffer(idCheck.buffer,   idCheck.mime,   'id-documents'),
      uploadBuffer(sigCheck.buffer,  sigCheck.mime,  'signatures'),
    ])

    // ── Generate signed subcontract agreement PDF ──────────────
    const signedAt = new Date()
    const pdfBuffer = await generateSubcontractPdf({
      firstName,
      surname,
      email,
      signedAt,
      signaturePng: sigCheck.buffer,
    })

    const pdfPath = `subcontract-agreements/${workerId}/${Date.now()}.pdf`
    const { error: pdfUploadError } = await supabase.storage
      .from('worker-documents')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

    if (pdfUploadError) {
      await cleanupUploads()
      throw new Error(`PDF upload failed: ${pdfUploadError.message}`)
    }
    uploadedPaths.push(pdfPath)

    let insuranceUrl: string | null = null
    if (insuranceCheck && insuranceCheck.ok) {
      insuranceUrl = await uploadBuffer(insuranceCheck.buffer, insuranceCheck.mime, 'insurance')
    }

    // ── Create portal login for foreman / management ───────────
    let authUserId: string | null = null

    if (createPortalLogin) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (authError) {
        await cleanupUploads()
        const msg = authError.message.toLowerCase().includes('already')
          ? 'An account with this email already exists. Use a different email or sign in.'
          : 'Login creation failed. Please try again or contact the office.'
        console.error('[Induction] Auth createUser failed:', authError.message)
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      authUserId = authData.user.id
    }

    const consentGivenAt = signedAt.toISOString()

    // ── Insert worker record ───────────────────────────────────
    const { error: insertError } = await supabase
      .from('workers')
      .insert({
        id:                        workerId,
        first_name:                firstName,
        surname,
        phone,
        email,
        ni_number:                 niNumber       || null,
        bank_sort_code:            bankSortCode,
        bank_account_number:       bankAccountNumber,
        utr_number:                isApprentice ? null : utrNumber,
        tax_type:                  isApprentice ? null : taxType,
        role,
        has_personal_insurance:    hasPersonalInsurance === 'yes',
        cscs_card_url:             cscsUrl,
        cscs_number:               cscsNumber     || null,
        cscs_expiry_date:          cscsExpiryDate || null,
        id_document_url:           idUrl,
        insurance_certificate_url: insuranceUrl,
        subcontract_signature_url: signatureUrl,
        subcontract_agreement_pdf_url: pdfPath,
        status:                    'pending_verification',
        auth_user_id:              authUserId,
        consent_given_at:          consentGivenAt,
      })

    if (insertError) {
      // Column may not exist yet if the migration hasn't been run —
      // retry once without consent_given_at so registration isn't blocked.
      const missingConsentCol =
        /consent_given_at/i.test(insertError.message) ||
        insertError.code === 'PGRST204'

      if (missingConsentCol) {
        console.warn('[Induction] consent_given_at column missing — insert without it. Run the migration.')
        const { error: retryError } = await supabase
          .from('workers')
          .insert({
            id:                        workerId,
            first_name:                firstName,
            surname,
            phone,
            email,
            ni_number:                 niNumber       || null,
            bank_sort_code:            bankSortCode,
            bank_account_number:       bankAccountNumber,
            utr_number:                isApprentice ? null : utrNumber,
            tax_type:                  isApprentice ? null : taxType,
            role,
            has_personal_insurance:    hasPersonalInsurance === 'yes',
            cscs_card_url:             cscsUrl,
            cscs_number:               cscsNumber     || null,
            cscs_expiry_date:          cscsExpiryDate || null,
            id_document_url:           idUrl,
            insurance_certificate_url: insuranceUrl,
            subcontract_signature_url: signatureUrl,
            subcontract_agreement_pdf_url: pdfPath,
            status:                    'pending_verification',
            auth_user_id:              authUserId,
          })

        if (!retryError) {
          return NextResponse.json({ success: true, workerId, portalLoginCreated: createPortalLogin })
        }

        if (authUserId) await supabase.auth.admin.deleteUser(authUserId)
        await cleanupUploads()
        return apiError('api/induction', retryError, 'Registration failed.')
      }

      if (authUserId) {
        await supabase.auth.admin.deleteUser(authUserId)
      }
      await cleanupUploads()
      return apiError('api/induction', insertError, 'Registration failed.')
    }

    return NextResponse.json({ success: true, workerId, portalLoginCreated: createPortalLogin })
  } catch (err) {
    console.error('[Induction API Error]', err)
    // Best-effort cleanup if we have a client and paths (may already be cleaned).
    try {
      if (uploadedPaths.length > 0) {
        const supabase = createServiceClient()
        await supabase.storage.from('worker-documents').remove(uploadedPaths)
      }
    } catch { /* ignore */ }
    return apiError('api/induction', err)
  }
}
