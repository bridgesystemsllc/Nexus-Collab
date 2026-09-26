/**
 * URL path builder for module item API routes.
 * Validates ids and encodes path segments safely.
 */

export class MissingModuleItemIdError extends Error {
  field: 'moduleId' | 'itemId'
  
  constructor(field: 'moduleId' | 'itemId') {
    super(`Missing required ${field} for module item path`)
    this.name = 'MissingModuleItemIdError'
    this.field = field
  }
}

/**
 * Builds the API path for module item operations.
 * 
 * @param ids.departmentId - null, undefined or empty becomes '_' (legacy placeholder)
 * @param ids.moduleId - required, throws MissingModuleItemIdError if missing/empty
 * @param ids.itemId - when provided (not undefined), throws if null/empty/'undefined'/'null'
 * @returns '/departments/{departmentId}/modules/{moduleId}[/items/{itemId}]'
 */
export function moduleItemPath(ids: {
  departmentId?: string | null
  moduleId: string | null | undefined
  itemId?: string | null
}): string {
  // Validate moduleId (required)
  const moduleId = ids.moduleId?.trim()
  if (!moduleId) {
    throw new MissingModuleItemIdError('moduleId')
  }
  
  // Validate itemId when provided (not undefined)
  if (ids.itemId !== undefined) {
    const itemIdStr = ids.itemId === null ? '' : String(ids.itemId).trim()
    if (
      !itemIdStr ||
      itemIdStr.toLowerCase() === 'undefined' ||
      itemIdStr.toLowerCase() === 'null'
    ) {
      throw new MissingModuleItemIdError('itemId')
    }
  }
  
  // Build path with encoded segments
  const deptId = ids.departmentId?.trim() || '_'
  let path = `/departments/${encodeURIComponent(deptId)}/modules/${encodeURIComponent(moduleId)}`
  
  if (ids.itemId !== undefined) {
    path += `/items/${encodeURIComponent(ids.itemId!)}`
  }
  
  return path
}
