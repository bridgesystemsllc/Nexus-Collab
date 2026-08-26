// packages/shared/src/billing/seats.ts

/**
 * Would `seats` exceed the tier's ceiling?
 *
 * The only sanctioned way to ask. A bare `seats > maxSeats` is `false` when
 * maxSeats is null, which happens to be right for Enterprise and is right by
 * accident — the moment someone writes `maxSeats ?? 0` nearby it becomes a
 * ceiling of zero and Enterprise can hold no users at all.
 */
export function exceedsSeatCeiling(seats: number, maxSeats: number | null): boolean {
  if (maxSeats === null) return false
  return seats > maxSeats
}

/** Purchased minus consumed, never negative. */
export function seatsAvailable(purchased: number, consumed: number): number {
  return Math.max(0, purchased - consumed)
}
