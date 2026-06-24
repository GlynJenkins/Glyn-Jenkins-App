import { cn } from '@/lib/utils'

interface PortalHeaderProps {
  children:  React.ReactNode
  className?: string
  padding?:   'pb-6' | 'pb-8'
}

/** Mobile-safe dark header for foreman and worker-facing pages. */
export default function PortalHeader({
  children,
  className,
  padding = 'pb-6',
}: PortalHeaderProps) {
  return (
    <header className={cn('portal-header', padding, className)}>
      {children}
    </header>
  )
}
