import { createServiceClient } from '@/lib/supabase/server'

export type PayFeeSettings = {
  adminFee: number
  insuranceFee: number
}

const DEFAULTS: PayFeeSettings = {
  adminFee:     6,
  insuranceFee: 3,
}

export async function fetchPayFeeSettings(): Promise<PayFeeSettings> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('admin_settings')
    .select('global_admin_fee, insurance_fee')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    adminFee:     data?.global_admin_fee ?? DEFAULTS.adminFee,
    insuranceFee: data?.insurance_fee    ?? DEFAULTS.insuranceFee,
  }
}
