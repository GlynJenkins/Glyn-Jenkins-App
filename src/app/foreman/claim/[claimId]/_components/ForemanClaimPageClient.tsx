'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ForemanClaimView from './ForemanClaimView'
import type { ForemanClaimDetail } from '@/lib/claims/load-foreman-claim'

type Props = {
  claim:        ForemanClaimDetail
  adminFee:     number
  insuranceFee: number
  canWithdraw:  boolean
}

export default function ForemanClaimPageClient({
  claim, adminFee, insuranceFee, canWithdraw,
}: Props) {
  const router = useRouter()
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawErr, setWithdrawErr] = useState<string | null>(null)

  const handleWithdraw = async () => {
    setWithdrawing(true)
    setWithdrawErr(null)
    try {
      const res = await fetch(`/api/claims/${claim.id}/withdraw`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to withdraw.')
      const url = json.cellsParam
        ? `/foreman/claim?cells=${encodeURIComponent(json.cellsParam)}`
        : '/foreman/claim'
      router.push(url)
    } catch (err) {
      setWithdrawErr(err instanceof Error ? err.message : 'Failed to withdraw.')
      setWithdrawing(false)
    }
  }

  return (
    <ForemanClaimView
      claim={claim}
      adminFee={adminFee}
      insuranceFee={insuranceFee}
      canWithdraw={canWithdraw}
      onWithdraw={handleWithdraw}
      withdrawing={withdrawing}
      withdrawErr={withdrawErr}
    />
  )
}
