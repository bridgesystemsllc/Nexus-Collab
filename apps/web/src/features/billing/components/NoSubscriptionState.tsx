import { PlansPicker } from './PlansPicker'

/**
 * The no-subscription state.
 *
 * Shows the plans picker so users can select a plan for their workspace.
 */
export function NoSubscriptionState() {
  return (
    <div className="billing-card" style={{ padding: '32px' }}>
      <PlansPicker />
    </div>
  )
}
