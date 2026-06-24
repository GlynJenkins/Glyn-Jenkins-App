import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateSubcontractPdf } from '@/lib/generate-subcontract-pdf'
import { needsPortalLogin } from '@/lib/worker-access'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
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

    // ── Supabase service-role client ───────────────────────────
    const supabase = createServiceClient()

    // ── Ensure storage bucket exists ───────────────────────────
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === 'worker-documents')
    if (!bucketExists) {
      await supabase.storage.createBucket('worker-documents', { public: false })
    }

    // ── Generate a stable worker ID to use in file paths ──────
    const workerId = crypto.randomUUID()

    // ── Upload helper ──────────────────────────────────────────
    async function uploadFile(file: File, folder: string): Promise<string> {
      const ext      = file.name.split('.').pop() ?? 'bin'
      const path     = `${folder}/${workerId}/${Date.now()}.${ext}`
      const buffer   = Buffer.from(await file.arrayBuffer())

      const { error } = await supabase.storage
        .from('worker-documents')
        .upload(path, buffer, { contentType: file.type, upsert: false })

      if (error) throw new Error(`File upload failed: ${error.message}`)
      return path
    }

    // ── Upload required documents ──────────────────────────────
    const signatureBuffer = Buffer.from(await signature.arrayBuffer())

    const [cscsUrl, idUrl, signatureUrl] = await Promise.all([
      uploadFile(cscsCard,   'cscs'),
      uploadFile(idDocument, 'id-documents'),
      uploadFile(signature,  'signatures'),
    ])

    // ── Generate signed subcontract agreement PDF ──────────────
    const signedAt = new Date()
    const pdfBuffer = await generateSubcontractPdf({
      firstName,
      surname,
      email,
      signedAt,
      signaturePng: signatureBuffer,
    })

    const pdfPath = `subcontract-agreements/${workerId}/${Date.now()}.pdf`
    const { error: pdfUploadError } = await supabase.storage
      .from('worker-documents')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

    if (pdfUploadError) {
      throw new Error(`PDF upload failed: ${pdfUploadError.message}`)
    }

    let insuranceUrl: string | null = null
    if (hasPersonalInsurance === 'yes' && insuranceCert) {
      insuranceUrl = await uploadFile(insuranceCert, 'insurance')
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
        const msg = authError.message.toLowerCase().includes('already')
          ? 'An account with this email already exists. Use a different email or sign in.'
          : `Login creation failed: ${authError.message}`
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      authUserId = authData.user.id
    }

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
      })

    if (insertError) {
      if (authUserId) {
        await supabase.auth.admin.deleteUser(authUserId)
      }
      return NextResponse.json({ error: `Registration failed: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, workerId, portalLoginCreated: createPortalLogin })
  } catch (err) {
    console.error('[Induction API Error]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
