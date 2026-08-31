// ─── Open Order Report data hooks ───────────────────────────
// Every list is server-driven: filters, sorting and paging go to the API as
// parameters and come back as a page plus a total. Nothing here fetches "all
// the lines" and filters in the browser — the grid is the operator's working
// surface and it will hold thousands of rows by the second month.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const BASE = '/operations/oor'

export interface OorLineRow {
  id: string
  customerPoNumber: string | null
  channelTag: string | null
  salesOrderNumber: string | null
  itemNumber: string | null
  custPartNumber: string | null
  description: string | null
  qtyOrdered: string | null
  qtyOrderedRaw: string | null
  qtyRemaining: string | null
  unitPrice: string | null
  valueSource: string | null
  valueComputed: string | null
  valueMismatch: boolean
  orderDate: string | null
  shipDate: string | null
  origRequiredDate: string | null
  requiredDeliveryDate: string | null
  workOrderNumber: string | null
  jobNumber: string | null
  fulfillmentType: string
  cmCode: string | null
  jobStatus: string | null
  lineStatus: string
  statusSource: string
  statusOverrideReason: string | null
  riskLevel: string
  ownerId: string | null
  isOpen: boolean
  rawRow: Record<string, unknown>
  _count: { nodes: number; comments: number; notes: number; meetingUpdates: number }
}

export interface OorSummary {
  openLines: number
  openValue: number
  linesShort: number
  critical: number
  awaitingCustomerApproval: number
}

export interface OorTreeNode {
  id: string
  level: number
  jobNumber: string | null
  partNumber: string | null
  description: string | null
  materialClass: string
  componentType: string | null
  qtyNeeded: string | null
  uom: string | null
  qtyOnHand: string | null
  onHandLocation: string | null
  customerProvided: boolean
  mfgComment: string | null
  shortageReason: string
  etaDate: string | null
  etaConfidence: string
  nodeStatus: string
  sortIndex: number
  children: OorTreeNode[]
}

export interface OorFilters {
  brandId?: string
  customerPoNumber?: string
  status?: string[]
  risk?: string[]
  fulfillmentType?: string
  cmCode?: string
  search?: string
  requiredBefore?: string
  hasShortage?: boolean
  openOnly?: boolean
  page?: number
  pageSize?: number
  sort?: string
  dir?: 'asc' | 'desc'
}

export interface ManufacturerMapping {
  id: string
  erpManufacturerName: string
  cmCode: string
  updatedAt: string
}

export function useManufacturerMapping(manufacturerName?: string) {
  return useQuery({
    queryKey: ['oor', 'manufacturer-mapping', manufacturerName],
    enabled: Boolean(manufacturerName),
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/manufacturer-mapping`, { params: { manufacturerName } })
      return data as { mapping: ManufacturerMapping | null; cmCodes: string[]; canManage: boolean }
    },
  })
}

export function useSaveManufacturerMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ manufacturerName, cmCode }: { manufacturerName: string; cmCode: string }) => {
      const { data } = await api.put(`${BASE}/manufacturer-mapping`, { manufacturerName, cmCode })
      return data as { mapping: ManufacturerMapping }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['oor', 'manufacturer-mapping', variables.manufacturerName] })
      qc.invalidateQueries({ queryKey: ['oor', 'lines'] })
    },
  })
}

function toParams(filters: OorFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue
    params[key] = Array.isArray(value) ? value.join(',') : typeof value === 'boolean' ? String(value) : value
  }
  return params
}

export function useOorLines(filters: OorFilters, enabled = true) {
  return useQuery({
    queryKey: ['oor', 'lines', filters],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/lines`, { params: toParams(filters) })
      return data as { rows: OorLineRow[]; total: number; page: number; pageSize: number; summary: OorSummary }
    },
    enabled,
    // A page of rows the operator is reading should not vanish and reflow while
    // they are reading it.
    placeholderData: (prev) => prev,
  })
}

/** Materialize the ERP-backed OPEN_ORDERS snapshots before the report loads. */
export function useReconcileOpenOrders() {
  return useQuery({
    queryKey: ['oor', 'reconcile-open-orders'],
    queryFn: async () => {
      const { data } = await api.post(`${BASE}/reconcile-open-orders`)
      return data as { created: number; updated: number; closed: number }
    },
    staleTime: 30_000,
  })
}

export function useOorLine(lineId: string | null) {
  return useQuery({
    queryKey: ['oor', 'line', lineId],
    enabled: lineId !== null,
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/lines/${lineId}`)
      return data as OorLineRow & { reportRun: { reportLabel: string; asOfDate: string | null } | null }
    },
  })
}

/** Trees load on first expand, never with the page: 58 lines would otherwise
 *  mean 58 tree queries for the handful anyone actually opens. */
export function useOorTree(lineId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['oor', 'tree', lineId],
    enabled: lineId !== null && enabled,
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/lines/${lineId}/tree`)
      return (data as { nodes: OorTreeNode[] }).nodes
    },
  })
}

export function useOorCollection<T>(lineId: string | null, path: string, enabled = true) {
  return useQuery({
    queryKey: ['oor', path, lineId],
    enabled: lineId !== null && enabled,
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/lines/${lineId}/${path}`)
      return data as { rows: T[]; total?: number; overdue?: number }
    },
  })
}

/** Everything that changes a line, with the cache invalidations each implies. */
export function useOorMutations(lineId?: string | null) {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['oor', 'lines'] })
    if (lineId) {
      qc.invalidateQueries({ queryKey: ['oor', 'line', lineId] })
      qc.invalidateQueries({ queryKey: ['oor', 'activity', lineId] })
    }
  }

  const patchLine = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data } = await api.patch(`${BASE}/lines/${id}`, patch)
      return data as OorLineRow
    },
    onSuccess: refresh,
  })

  const patchNode = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data } = await api.patch(`${BASE}/nodes/${id}`, patch)
      return data as OorTreeNode
    },
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['oor', 'tree', lineId] })
    },
  })

  const addRecord = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: Record<string, unknown> }) => {
      const { data } = await api.post(`${BASE}/lines/${lineId}/${path}`, body)
      return data
    },
    onSuccess: (_data, variables) => {
      refresh()
      qc.invalidateQueries({ queryKey: ['oor', variables.path, lineId] })
    },
  })

  const importReport = useMutation({
    mutationFn: async ({ file, brandId }: { file: File; brandId: string }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('brandId', brandId)
      const { data } = await api.post(`${BASE}/imports`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data as {
        runId: string
        created: number
        updated: number
        nodesWritten: number
        commentsImported: number
        duplicateOfRunId?: string
        warnings: { rowNumber: number; column: string; rawValue: string; reason: string }[]
      }
    },
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['oor', 'manufacturer-mapping'] })
    },
  })

  return { patchLine, patchNode, addRecord, importReport }
}
