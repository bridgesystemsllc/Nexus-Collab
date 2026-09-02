import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { normalizeUpcA, isSearchablePrefix, containsLetters } from '../lib/upcValidation'

/**
 * NX-105: Hooks for Component→Product assignment.
 * Ops user assigns products to components by UPC-A only.
 */

export interface LinkedProduct {
  id: string
  name: string
  brand: string
  sku: string | null
  upc: string | null
}

/**
 * Fetch all products assigned to a component.
 */
export function useComponentProductLinks(componentId: string | null) {
  return useQuery<LinkedProduct[]>({
    queryKey: ['component-products', componentId],
    queryFn: () =>
      api.get(`/components/${componentId}/products`).then((r) => r.data),
    enabled: !!componentId,
  })
}

/**
 * Search products by UPC-A prefix (min 4 digits, excludes already-linked).
 * Returns empty array if prefix contains letters or is too short.
 */
export function useSearchProductsByUpc(componentId: string | null, upcPrefix: string) {
  const normalized = normalizeUpcA(upcPrefix)
  const hasLetters = containsLetters(upcPrefix)
  const canSearch = !!componentId && !hasLetters && isSearchablePrefix(normalized)

  return useQuery<LinkedProduct[]>({
    queryKey: ['component-products-search', componentId, normalized],
    queryFn: () =>
      api
        .get(`/components/${componentId}/products/search?upc=${encodeURIComponent(normalized)}`)
        .then((r) => r.data),
    enabled: canSearch,
    staleTime: 10_000,
  })
}

/**
 * Assign a product to a component by UPC-A.
 */
export function useAssignComponentProduct() {
  const qc = useQueryClient()
  return useMutation<LinkedProduct, any, { componentId: string; upc: string }>({
    mutationFn: ({ componentId, upc }) =>
      api.post(`/components/${componentId}/products`, { upc }).then((r) => r.data),
    onSuccess: (_, { componentId }) => {
      qc.invalidateQueries({ queryKey: ['component-products', componentId] })
      qc.invalidateQueries({ queryKey: ['component-products-search', componentId] })
    },
  })
}

/**
 * Unassign a product from a component by UPC-A.
 */
export function useUnassignComponentProduct() {
  const qc = useQueryClient()
  return useMutation<void, any, { componentId: string; upc: string }>({
    mutationFn: ({ componentId, upc }) =>
      api.delete(`/components/${componentId}/products/${encodeURIComponent(upc)}`).then(() => {}),
    onSuccess: (_, { componentId }) => {
      qc.invalidateQueries({ queryKey: ['component-products', componentId] })
      qc.invalidateQueries({ queryKey: ['component-products-search', componentId] })
    },
  })
}
