import { useState, useEffect, useRef } from 'react'
import { Search, Plus, X, Loader2, AlertCircle } from 'lucide-react'
import {
  useComponentProductLinks,
  useSearchProductsByUpc,
  useAssignComponentProduct,
  useUnassignComponentProduct,
  type LinkedProduct,
} from '@/hooks/useComponentProducts'
import {
  normalizeUpcA,
  containsLetters,
  isSearchablePrefix,
  isValidUpcA,
} from '@/lib/upcValidation'

interface UpcAProductSearchProps {
  componentId: string
  onAssigned?: () => void
}

/**
 * NX-105: UPC-A-only product search and assignment for Components.
 * Operations user assigns products by searching UPC-A, sees assigned products
 * with UPC-A, and can unassign without deleting component or product.
 */
export function UpcAProductSearch({ componentId, onAssigned }: UpcAProductSearchProps) {
  const [searchInput, setSearchInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const normalized = normalizeUpcA(searchInput)
  const hasLetters = containsLetters(searchInput)
  const canSearch = !hasLetters && isSearchablePrefix(normalized)

  const { data: assignedProducts = [], isLoading: assignedLoading } =
    useComponentProductLinks(componentId)
  const { data: searchResults = [], isLoading: searchLoading, isFetching } =
    useSearchProductsByUpc(componentId, searchInput)

  const assignMutation = useAssignComponentProduct()
  const unassignMutation = useUnassignComponentProduct()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (canSearch && searchInput.length >= 4) {
      setShowDropdown(true)
    }
  }, [canSearch, searchInput])

  const handleAssign = async (product: LinkedProduct) => {
    if (!product.upc) return
    setAssignError(null)
    try {
      await assignMutation.mutateAsync({ componentId, upc: product.upc })
      setSearchInput('')
      setShowDropdown(false)
      onAssigned?.()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to assign product'
      setAssignError(msg)
    }
  }

  const handleUnassign = async (product: LinkedProduct) => {
    if (!product.upc) return
    try {
      await unassignMutation.mutateAsync({ componentId, upc: product.upc })
    } catch (err: any) {
      console.error('Failed to unassign:', err)
    }
  }

  const handleInputChange = (value: string) => {
    setSearchInput(value)
    setAssignError(null)
    if (containsLetters(value)) {
      setAssignError('UPC-A must contain only digits')
    }
  }

  const handleAssignFromInput = async () => {
    if (!isValidUpcA(normalized)) {
      setAssignError('Invalid UPC-A: must be 12 digits with valid check digit')
      return
    }
    setAssignError(null)
    try {
      await assignMutation.mutateAsync({ componentId, upc: normalized })
      setSearchInput('')
      setShowDropdown(false)
      onAssigned?.()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to assign product'
      setAssignError(msg)
    }
  }

  const showSearchResults = canSearch && showDropdown && searchResults.length > 0

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => canSearch && setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && normalized.length === 12) {
                e.preventDefault()
                handleAssignFromInput()
              }
            }}
            placeholder="Search by UPC-A (min 4 digits)..."
            className="w-full pl-9 pr-10 py-2.5 rounded-lg text-[13px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 transition-all"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
          {(searchLoading || isFetching) && canSearch && (
            <Loader2
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] animate-spin"
            />
          )}
        </div>

        {/* Search Dropdown */}
        {showSearchResults && (
          <div className="absolute z-20 mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
            {searchResults.map((product) => (
              <button
                key={product.id}
                onClick={() => handleAssign(product)}
                disabled={assignMutation.isPending}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                    <span
                      className="font-mono"
                      style={{ color: '#0071E3', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {product.upc}
                    </span>
                    {product.brand && (
                      <span className="ml-2 text-[var(--text-secondary)]">· {product.brand}</span>
                    )}
                  </p>
                </div>
                <Plus
                  size={16}
                  className="flex-shrink-0 ml-2 text-[#0071E3]"
                />
              </button>
            ))}
          </div>
        )}

        {/* No results state */}
        {canSearch && showDropdown && !searchLoading && !isFetching && searchResults.length === 0 && normalized.length >= 4 && (
          <div className="absolute z-20 mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg px-4 py-3">
            <p className="text-[13px] text-[var(--text-tertiary)]">
              No products found with UPC starting with "{normalized}"
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {assignError && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)]">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-[#FF3B30]" />
          <p className="text-[12px] text-[#FF3B30]">{assignError}</p>
        </div>
      )}

      {/* Assigned Products List */}
      <div>
        <h4 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Assigned Products ({assignedProducts.length})
        </h4>
        {assignedLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="text-[var(--text-tertiary)] animate-spin" />
          </div>
        ) : assignedProducts.length === 0 ? (
          <p className="text-[13px] text-[var(--text-tertiary)] py-4">
            No products assigned to this component.
          </p>
        ) : (
          <div className="rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {assignedProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between px-3 py-2.5 group hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                    <span
                      className="font-mono"
                      style={{ color: '#0071E3', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {product.upc || '—'}
                    </span>
                    {product.brand && (
                      <span className="ml-2 text-[var(--text-secondary)]">· {product.brand}</span>
                    )}
                    {product.sku && (
                      <span className="ml-2 text-[var(--text-tertiary)]">· SKU: {product.sku}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleUnassign(product)}
                  disabled={unassignMutation.isPending}
                  title="Unassign product"
                  className="flex-shrink-0 ml-2 p-1.5 rounded-md text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[#FF3B30] hover:bg-[rgba(255,59,48,0.08)] transition-all disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
