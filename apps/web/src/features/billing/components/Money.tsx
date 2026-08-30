import { formatMoney } from '../lib/format'

export function Money({ cents, currency = 'usd', className = '' }: {
  cents: number; currency?: string; className?: string
}) {
  return <span className={`numeric ${className}`}>{formatMoney(cents, currency)}</span>
}
