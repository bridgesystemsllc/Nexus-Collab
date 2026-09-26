/**
 * Department scope resolver for module item routes.
 * Handles the legacy '_' placeholder for org-wide scoping.
 */

/**
 * Converts a route parameter for the department segment into a nullable scope.
 * 
 * '_' (legacy placeholder), '' or whitespace → null (= any department in the acting org).
 * Anything else → the trimmed id.
 */
export function departmentScopeFromParam(param: string | undefined): string | null {
  if (param === undefined) return null
  const trimmed = param.trim()
  if (trimmed === '' || trimmed === '_') return null
  return trimmed
}
