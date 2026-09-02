/**
 * UPC-A validation utilities for NX-105 Component→Product assignment.
 * UPC-A is a 12-digit code with the last digit being a check digit.
 */

/**
 * Normalize a UPC-A string by stripping spaces and hyphens.
 */
export function normalizeUpcA(upc: string): string {
  return upc.replace(/[\s-]/g, '')
}

/**
 * Validate a UPC-A code: must be exactly 12 digits with valid check digit.
 */
export function isValidUpcA(upc: string): boolean {
  const normalized = normalizeUpcA(upc)
  if (!/^\d{12}$/.test(normalized)) return false

  const digits = normalized.split('').map(Number)
  const checkDigit =
    (10 -
      (digits.slice(0, 11).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 3 : 1), 0) % 10)) %
    10

  return checkDigit === digits[11]
}

/**
 * Check if a string contains any letters (A-Z, a-z).
 * Used to give immediate client-side error without network call.
 */
export function containsLetters(upc: string): boolean {
  return /[a-zA-Z]/.test(upc)
}

/**
 * Check if a prefix is long enough to trigger a search (min 4 digits).
 */
export function isSearchablePrefix(upc: string): boolean {
  const normalized = normalizeUpcA(upc)
  return /^\d{4,}$/.test(normalized)
}
