import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useUserStore } from '../stores/userStore'

// ─── Departments ────────────────────────────────────────────
export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then(r => r.data) })
}

export function useDepartment(id: string) {
  return useQuery({ queryKey: ['department', id], queryFn: () => api.get(`/departments/${id}`).then(r => r.data), enabled: !!id })
}

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/departments', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })
}

// ─── Microsoft account (per-user Graph connection) ──────────
export function useMicrosoftStatus() {
  return useQuery({
    queryKey: ['microsoft', 'status'],
    queryFn: () => api.get('/integrations/microsoft/me').then((r) => r.data),
  })
}

export function useDisconnectMicrosoft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/integrations/microsoft/disconnect').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microsoft', 'status'] }),
  })
}

// ─── Contract Manufacturers (CM Productivity profiles) ──────
export interface CMOption {
  id: string
  name: string
  status: string | null
  brands: string[]
  erpId: string | null
  cmCode: string | null
  legalName: string | null
  cmType: string | null
  vendorId: string | null
  headquarters: unknown
}

export function useCMs() {
  return useQuery<CMOption[]>({ queryKey: ['cms'], queryFn: () => api.get('/cms').then(r => r.data) })
}

// ─── Members ───────────────────────────────────────────────
export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api.get('/members').then(r => r.data) })
}

export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/members', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/members/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/members/invite', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['invites'] })
    },
  })
}

export function useInvites() {
  return useQuery({ queryKey: ['invites'], queryFn: () => api.get('/members/invites').then(r => r.data) })
}

export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/members/invites/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  })
}

export function useAssignDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, departmentId }: { memberId: string; departmentId: string }) =>
      api.post(`/members/${memberId}/assign-department`, { departmentId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

// ─── Production Update Email ───────────────────────────────
// POST /emails/production-update. The server gates actual sending: when email
// isn't configured it returns { sent:false, configured:false } and the UI
// offers a Copy fallback instead of treating it as an error.
export interface ProductionEmailRecipient {
  email: string
  name?: string
}

export interface SendProductionEmailVars {
  recipients: ProductionEmailRecipient[]
  subject: string
  html: string
  itemId?: string
}

export interface SendProductionEmailResult {
  sent: boolean
  configured: boolean
  messageId?: string
  error?: string
}

export function useSendProductionEmail() {
  return useMutation<SendProductionEmailResult, any, SendProductionEmailVars>({
    mutationFn: (vars) => api.post('/emails/production-update', vars).then((r) => r.data),
  })
}

// ─── Tasks ──────────────────────────────────────────────────
export function useTasks(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['tasks', filters], queryFn: () => api.get(`/tasks?${params}`).then(r => r.data) })
}

export function useTask(id: string) {
  return useQuery({ queryKey: ['task', id], queryFn: () => api.get(`/tasks/${id}`).then(r => r.data), enabled: !!id })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/tasks', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/tasks/${id}`, data).then(r => r.data),
    onSuccess: (updated: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (vars?.id) qc.invalidateQueries({ queryKey: ['task', vars.id] })
      if (updated?.parentId) qc.invalidateQueries({ queryKey: ['task', updated.parentId] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useAddTaskNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.post(`/tasks/${id}/notes`, { content }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['task', vars.id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ─── Cowork ─────────────────────────────────────────────────
export function useCoworkSpaces() {
  return useQuery({ queryKey: ['cowork'], queryFn: () => api.get('/cowork').then(r => r.data) })
}

export function useCoworkSpace(id: string) {
  return useQuery({ queryKey: ['cowork', id], queryFn: () => api.get(`/cowork/${id}`).then(r => r.data), enabled: !!id })
}

export function useCreateCoworkSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/cowork', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cowork'] }),
  })
}

export function useUpdateCoworkSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ spaceId, ...data }: any) => api.patch(`/cowork/${spaceId}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cowork', vars.spaceId] })
      qc.invalidateQueries({ queryKey: ['cowork'] })
    },
  })
}

export function useCreateCoworkTask() {
  const qc = useQueryClient()
  return useMutation({
    // No actorId: the API attributes the task to the authenticated member.
    mutationFn: ({ spaceId, ...data }: any) => api.post(`/cowork/${spaceId}/tasks`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cowork', vars.spaceId] })
      qc.invalidateQueries({ queryKey: ['cowork'] })
    },
  })
}

export function useAttachCoworkFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ spaceId, ...data }: any) => api.post(`/cowork/${spaceId}/files`, data).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['cowork', vars.spaceId] }),
  })
}

export function usePostActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ spaceId, ...data }: any) => api.post(`/cowork/${spaceId}/activity`, data).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['cowork', vars.spaceId] }),
  })
}

// ─── Documents ──────────────────────────────────────────────
export function useDocuments(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['documents', filters], queryFn: () => api.get(`/documents?${params}`).then(r => r.data) })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  const actorId = useUserStore((s) => s.currentUser?.id)
  return useMutation({
    mutationFn: (data: { name: string; objectPath?: string; storageUrl?: string; mimeType?: string; size?: number; type?: string }) =>
      api.post('/documents/upload', { actorId, ...data }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

// ─── Everything ─────────────────────────────────────────────
export function useEverything(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['everything', filters], queryFn: () => api.get(`/everything?${params}`).then(r => r.data) })
}

// ─── Integrations ───────────────────────────────────────────
export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get('/integrations').then(r => r.data),
    // While a sync is running the server briefly reports status SYNCING; keep
    // polling until it settles back to CONNECTED so the UI never looks like
    // the connection was lost.
    refetchInterval: (query) => {
      const list = query.state.data as any[] | undefined
      return Array.isArray(list) && list.some((i: any) => i?.status === 'SYNCING') ? 2000 : false
    },
  })
}

export function useSyncIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (type: string) => api.post(`/integrations/${type}/sync`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

// ─── Connector Catalog ───────────────────────────────────────
export interface ConnectorDefinition {
  type: string
  name: string
  description: string
  category: string
  authTypes: string[]
  singleton: boolean
  isGeneric: boolean
}

export function useConnectorCatalog() {
  return useQuery<ConnectorDefinition[]>({
    queryKey: ['connector-catalog'],
    queryFn: () => api.get('/integrations/catalog').then(r => r.data),
    staleTime: 60_000,
  })
}

// ─── Connector (Integration) CRUD ────────────────────────────
export function useConnector(id: string) {
  return useQuery({
    queryKey: ['connector', id],
    queryFn: () => api.get(`/integrations/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: string; name: string; config: Record<string, unknown> }) =>
      api.post('/integrations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

export function useUpdateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; config?: Record<string, unknown> }) =>
      api.patch(`/integrations/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      qc.invalidateQueries({ queryKey: ['connector', vars.id] })
    },
  })
}

export function useTestConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/test`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

export function usePauseConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/pause`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

export function useResumeConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/resume`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

export function useDeleteConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

// ─── Automations ────────────────────────────────────────────
// §5.2: Automation interface aligned with new schema
export interface Automation {
  id: string
  name: string
  description: string | null
  orgId: string
  connectorId: string // §5.2: renamed from integrationId
  connector?: { id: string; name: string; type: string }
  triggerType: 'SCHEDULE' | 'WEBHOOK' | 'MANUAL'
  triggerConfig: { everyMinutes?: number; timezone?: string } | null // §5.2
  actionType: 'HTTP_REQUEST' | 'MCP_CALL' | 'WEBHOOK_FORWARD' // §5.2
  actionConfig: { method?: string; path?: string; headers?: Record<string, string>; body?: unknown } | null // §5.2
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ERROR' // §5.2: added DRAFT
  retryPolicy: { maxAttempts?: number; baseDelayMs?: number; maxBackoffMs?: number } | null // §5.2
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunOk: boolean | null
  lastError: string | null
  consecutiveFailures: number
  createdAt: string
  updatedAt: string
}

// §5.2: AutomationRun interface aligned with new schema
export interface AutomationRun {
  id: string
  automationId: string
  orgId: string
  trigger: 'SCHEDULE' | 'WEBHOOK' | 'MANUAL'
  idempotencyKey: string | null // §5.2: renamed from requestId
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED' // §5.2
  error: { code: string; message: string; retryable: boolean } | null // §5.2
  requestSummary: { method: string; host: string; path: string } | null // §5.2
  recordsProcessed: number // §5.2
  recordsFailed: number // §5.2
  inputSnapshot: Record<string, unknown> | null
  outputSnapshot: Record<string, unknown> | null
  httpStatus: number | null
  durationMs: number | null
  retryCount: number
  startedAt: string
  completedAt: string | null
}

export function useAutomations() {
  return useQuery<Automation[]>({
    queryKey: ['automations'],
    queryFn: () => api.get('/automations').then(r => r.data),
    refetchInterval: (query) => {
      const list = query.state.data as Automation[] | undefined
      return Array.isArray(list) && list.some(a => a.status === 'ACTIVE' && a.triggerType === 'SCHEDULE') ? 10000 : false
    },
  })
}

export function useAutomation(id: string) {
  return useQuery<Automation>({
    queryKey: ['automation', id],
    queryFn: () => api.get(`/automations/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

// §5.2: Automations use connectorId, triggerType+triggerConfig, actionType+actionConfig
export function useCreateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      connectorId: string // §5.2: not integrationId
      triggerType: 'SCHEDULE' | 'WEBHOOK' | 'MANUAL'
      triggerConfig?: { everyMinutes?: number; timezone?: string }
      actionType?: 'HTTP_REQUEST' | 'MCP_CALL' | 'WEBHOOK_FORWARD'
      actionConfig?: { method?: string; path?: string; headers?: Record<string, string>; body?: unknown }
      retryPolicy?: { maxAttempts?: number; baseDelayMs?: number; maxBackoffMs?: number }
    }) => api.post('/automations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

export function useUpdateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string
      name?: string
      description?: string
      triggerConfig?: { everyMinutes?: number; timezone?: string }
      actionConfig?: { method?: string; path?: string; headers?: Record<string, string>; body?: unknown }
      retryPolicy?: { maxAttempts?: number; baseDelayMs?: number; maxBackoffMs?: number } | null
      status?: string
    }) => api.patch(`/automations/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      qc.invalidateQueries({ queryKey: ['automation', vars.id] })
    },
  })
}

export function useDeleteAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/automations/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

export function usePauseAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/automations/${id}/pause`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

export function useResumeAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/automations/${id}/resume`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

// §5.2: POST /:id/activate transitions DRAFT → ACTIVE
export function useActivateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/automations/${id}/activate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

// §5.2: POST /:id/run executes immediately via the same executor
export function useRunAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/automations/${id}/run`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

export function useAutomationRuns(automationId: string, limit = 20) {
  return useQuery<AutomationRun[]>({
    queryKey: ['automation-runs', automationId, limit],
    queryFn: () => api.get(`/automations/${automationId}/runs?limit=${limit}`).then(r => r.data),
    enabled: !!automationId,
    refetchInterval: (query) => {
      const list = query.state.data as AutomationRun[] | undefined
      // §5.2: Status is QUEUED|RUNNING|SUCCESS|PARTIAL|FAILED|SKIPPED
      return Array.isArray(list) && list.some(r => r.status === 'QUEUED' || r.status === 'RUNNING') ? 2000 : false
    },
  })
}

export function useAutomationRun(automationId: string, runId: string) {
  return useQuery<AutomationRun>({
    queryKey: ['automation-run', automationId, runId],
    queryFn: () => api.get(`/automations/${automationId}/runs/${runId}`).then(r => r.data),
    enabled: !!automationId && !!runId,
  })
}

// ─── ERP Data Routing ───────────────────────────────────────
// GET returns which ERP feeds flow to which Nexus modules. PATCH updates a
// partial routing map (admin / OPS_MANAGER only — a 403 surfaces in the UI).
export interface ErpRoutingFeed {
  key: string
  label: string
  description: string
  enabled: boolean
  targetModuleId: string | null
  targetModuleType: string | null
  erpPath: string | null
}

export interface ErpRoutingResponse {
  connected: boolean
  feeds: ErpRoutingFeed[]
}

export type ErpRoutingPatch = Record<string, {
  enabled?: boolean
  targetModuleId?: string | null
  targetModuleType?: string | null
  erpPath?: string | null
}>

const ERP_ROUTING_KEY = ['integration-routing', 'ERP_KAREVE_SYNC'] as const

export function useErpRouting(enabled = true) {
  return useQuery<ErpRoutingResponse>({
    queryKey: ERP_ROUTING_KEY,
    queryFn: () => api.get('/integrations/ERP_KAREVE_SYNC/routing').then(r => r.data),
    enabled,
    retry: false,
  })
}

export function useUpdateErpRouting() {
  const qc = useQueryClient()
  return useMutation<{ feeds: ErpRoutingFeed[] }, any, ErpRoutingPatch>({
    mutationFn: (routing: ErpRoutingPatch) =>
      api.patch('/integrations/ERP_KAREVE_SYNC/routing', { routing }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ERP_ROUTING_KEY })
      qc.invalidateQueries({ queryKey: ['integrations'] })
    },
  })
}

// ─── ERP Outbound Push (Nexus → ERP) ────────────────────────
// GET returns which Nexus feeds may push TO the ERP. PATCH updates a partial
// outbound config; POST triggers a push. All mutations are admin / OPS_MANAGER
// only (a 403 surfaces in the UI). When the ERP is not connected, a push
// returns dryRun:true results describing what WOULD be sent.
export interface ErpOutboundFeed {
  key: string
  label: string
  description: string
  enabled: boolean
  erpPath: string | null
  itemCount: number
}

export interface ErpOutboundResponse {
  connected: boolean
  configured: boolean
  feeds: ErpOutboundFeed[]
}

export type ErpOutboundPatch = Record<string, {
  enabled?: boolean
  erpPath?: string | null
}>

export interface ErpPushFeedResult {
  count: number
  configured: boolean
  dryRun: boolean
  sent: number
  sample?: unknown
  error?: string
}

export interface ErpPushResponse {
  feeds: Record<string, ErpPushFeedResult>
  pushed: number
}

const ERP_OUTBOUND_KEY = ['integration-outbound', 'ERP_KAREVE_SYNC'] as const

export function useErpOutbound(enabled = true) {
  return useQuery<ErpOutboundResponse>({
    queryKey: ERP_OUTBOUND_KEY,
    queryFn: () => api.get('/integrations/ERP_KAREVE_SYNC/outbound').then(r => r.data),
    enabled,
    retry: false,
  })
}

export function useUpdateErpOutbound() {
  const qc = useQueryClient()
  return useMutation<{ feeds: ErpOutboundFeed[] }, any, ErpOutboundPatch>({
    mutationFn: (outbound: ErpOutboundPatch) =>
      api.patch('/integrations/ERP_KAREVE_SYNC/outbound', { outbound }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ERP_OUTBOUND_KEY })
      qc.invalidateQueries({ queryKey: ['integrations'] })
    },
  })
}

export function usePushToErp() {
  const qc = useQueryClient()
  return useMutation<ErpPushResponse, any, { feeds?: string[] } | void>({
    mutationFn: (vars) =>
      api.post('/integrations/ERP_KAREVE_SYNC/push', { feeds: vars?.feeds }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ERP_OUTBOUND_KEY })
    },
  })
}

// ─── AI ─────────────────────────────────────────────────────
export function useAIBriefing() {
  return useQuery({ queryKey: ['ai-briefing'], queryFn: () => api.get('/ai/briefing').then(r => r.data) })
}

export function useAIChat() {
  return useMutation({
    mutationFn: (data: { message: string; history?: any[] }) => api.post('/ai/chat', data).then(r => r.data),
  })
}

export function useAIAction() {
  return useMutation({
    mutationFn: (action: string) => api.post(`/ai/actions/${action}`).then(r => r.data),
  })
}

// ─── Onboarding ────────────────────────────────────────────
export function useOnboardingStatus() {
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.get('/onboarding/status').then(r => r.data),
    staleTime: 60_000,
  })
}

export function useSubmitOnboarding() {
  return useMutation({
    mutationFn: (data: any) => api.post('/onboarding', data).then(r => r.data),
  })
}

export function useCheckSlug() {
  return useMutation({
    mutationFn: (slug: string) => api.get(`/onboarding/check-slug/${slug}`).then(r => r.data),
  })
}

// ─── Products ──────────────────────────────────────────────
export function useProducts(params?: Record<string, string>) {
  const searchParams = new URLSearchParams(params || {}).toString()
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => api.get(`/products?${searchParams}`).then(r => Array.isArray(r.data) ? r.data : []),
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/products', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/products/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useSyncKareve() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/products/sync-kareve').then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['integrations'] })
    },
  })
}

// ─── Pulse ──────────────────────────────────────────────────
export function usePulse(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['pulse', filters], queryFn: () => api.get(`/pulse?${params}`).then(r => r.data) })
}

export function useMarkPulseRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/pulse/${id}/read`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulse'] }),
  })
}

export function useMarkAllPulseRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/pulse/read-all').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulse'] }),
  })
}

// ─── Brand Transition ──────────────────────────────────────
export function useTransitionSkus(params?: Record<string, string>) {
  const searchParams = new URLSearchParams(params || {}).toString()
  return useQuery({
    queryKey: ['transition-skus', params],
    queryFn: () => api.get(`/brand-transition?${searchParams}`).then(r => r.data),
  })
}

export function useTransitionSku(id: string) {
  return useQuery({
    queryKey: ['transition-sku', id],
    queryFn: () => api.get(`/brand-transition/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useUpdateTransitionSku() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/brand-transition/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transition-skus'] }),
  })
}

export function useCreateTransitionNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skuId, ...data }: { skuId: string; noteType: string; noteText: string; createdBy?: string }) =>
      api.post(`/brand-transition/${skuId}/notes`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transition-skus'] }),
  })
}

export function useCreateTransitionMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skuId, ...data }: { skuId: string; milestoneName: string; dueDate?: string; notes?: string }) =>
      api.post(`/brand-transition/${skuId}/milestones`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transition-skus'] }),
  })
}

export function useUpdateTransitionMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ milestoneId, ...data }: { milestoneId: string; [key: string]: any }) =>
      api.patch(`/brand-transition/milestones/${milestoneId}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transition-skus'] }),
  })
}

export function useSeedTransitionData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/brand-transition/seed').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transition-skus'] }),
  })
}

// ─── Task Attachments ──────────────────────────────────────
export function useTaskAttachments(taskId: string, module: string) {
  return useQuery({
    queryKey: ['task-attachments', taskId, module],
    queryFn: () => api.get(`/tasks/${taskId}/attachments?module=${module}`).then(r => r.data),
    enabled: !!taskId,
  })
}

export function useCreateEmailAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { taskId: string; module: string; external_id?: string; subject: string; sender_name?: string; sender_email?: string; received_at?: string; snippet?: string; web_link?: string; source?: string; message_count?: number; createdBy?: string }) => {
      const { taskId, ...body } = data
      return api.post(`/tasks/${taskId}/attachments/email`, body).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments'] }),
  })
}

// Search the signed-in member's OWN Outlook mailbox via Microsoft Graph.
// Enabled only when connected and the query is non-trivial. A 412 from the API
// means the connection lapsed — the caller surfaces the connect prompt.
export interface MailSearchResult {
  id: string
  subject: string
  from_name: string | null
  from_email: string | null
  received_at: string | null
  snippet: string
  web_link: string | null
}

export function useMailSearch(query: string, enabled: boolean) {
  const q = query.trim()
  return useQuery<{ messages: MailSearchResult[] }>({
    queryKey: ['microsoft', 'mail', 'search', q],
    queryFn: () => api.get(`/integrations/microsoft/mail/search?q=${encodeURIComponent(q)}`).then(r => r.data),
    enabled: enabled && q.length >= 2,
    retry: false,
    staleTime: 30_000,
  })
}

export interface MailMessage {
  id: string
  subject: string
  from_name: string | null
  from_email: string | null
  to: string[]
  cc: string[]
  received_at: string | null
  body_content_type: string
  body_content: string
  web_link: string | null
}

// Fetch a single Outlook message's full content (to render in-app).
export function useMailMessage(id: string | null) {
  return useQuery<MailMessage>({
    queryKey: ['microsoft', 'mail', 'message', id],
    queryFn: () => api.get(`/integrations/microsoft/mail/${encodeURIComponent(id as string)}`).then(r => r.data),
    enabled: !!id,
    retry: false,
  })
}

// Reply to an Outlook message in-app.
export function useReplyToMail() {
  return useMutation<{ sent: boolean }, any, { id: string; comment: string; replyAll?: boolean }>({
    mutationFn: ({ id, comment, replyAll }) =>
      api.post(`/integrations/microsoft/mail/${encodeURIComponent(id)}/reply`, { comment, replyAll }).then(r => r.data),
  })
}

// ─── OneDrive (browse + search the signed-in member's own drive) ──
// Both hooks are enabled only when connected. A 412 from the API means the
// connection lapsed — the caller surfaces the connect prompt.
export interface OneDriveItem {
  id: string
  name: string
  is_folder: boolean
  child_count: number
  size: number
  mime_type: string | null
  web_url: string | null
  last_modified: string | null
}

export function useOneDriveChildren(folderId: string | null, enabled: boolean) {
  return useQuery<{ items: OneDriveItem[] }>({
    queryKey: ['microsoft', 'onedrive', 'children', folderId ?? 'root'],
    queryFn: () =>
      api
        .get(`/integrations/microsoft/onedrive/children${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`)
        .then((r) => r.data),
    enabled,
    retry: false,
    staleTime: 30_000,
  })
}

export function useOneDriveSearch(query: string, enabled: boolean) {
  const q = query.trim()
  return useQuery<{ items: OneDriveItem[] }>({
    queryKey: ['microsoft', 'onedrive', 'search', q],
    queryFn: () => api.get(`/integrations/microsoft/onedrive/search?q=${encodeURIComponent(q)}`).then((r) => r.data),
    enabled: enabled && q.length >= 2,
    retry: false,
    staleTime: 30_000,
  })
}

export function useCreateFileAttachment() {
  const qc = useQueryClient()
  const actorId = useUserStore((s) => s.currentUser?.id)
  return useMutation({
    mutationFn: (data: { taskId: string; module: string; filename: string; size_bytes?: number; mime_type?: string; storage_url?: string; objectPath?: string; onedrive_item_id?: string; uploaded_via?: string; createdBy?: string }) => {
      const { taskId, ...body } = data
      return api.post(`/tasks/${taskId}/attachments/file`, { createdBy: actorId, ...body }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments'] }),
  })
}

export function useCreateFileFromUrl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { taskId: string; module: string; url: string; filename?: string; createdBy?: string }) => {
      const { taskId, ...body } = data
      return api.post(`/tasks/${taskId}/attachments/file/url`, body).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments'] }),
  })
}

export function useCreateCommentAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { taskId: string; module: string; body_plain: string; body_html?: string; mentions?: string[]; createdBy?: string }) => {
      const { taskId, ...body } = data
      return api.post(`/tasks/${taskId}/attachments/comment`, body).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments'] }),
  })
}

export function useUpdateAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; body_plain?: string; body_html?: string }) =>
      api.patch(`/tasks/attachments/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments'] }),
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/attachments/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments'] }),
  })
}

// ─── Tech Transfer Stages ──────────────────────────────────
export function useTechTransferStages(transferId: string) {
  return useQuery({
    queryKey: ['tt-stages', transferId],
    queryFn: () => api.get(`/tech-transfer-stages/${transferId}/stages`).then(r => r.data),
    enabled: !!transferId,
  })
}

export function useSeedTechTransferStages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, transferType }: { transferId: string; transferType: string }) =>
      api.post(`/tech-transfer-stages/${transferId}/stages/seed`, { transferType }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tt-stages'] }),
  })
}

export function useUpdateTechTransferStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, stageId, ...data }: { transferId: string; stageId: string; [key: string]: any }) =>
      api.patch(`/tech-transfer-stages/${transferId}/stages/${stageId}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tt-stages'] }),
  })
}

export function useAdvanceTechTransferStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, stageId }: { transferId: string; stageId: string }) =>
      api.post(`/tech-transfer-stages/${transferId}/stages/${stageId}/advance`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tt-stages'] }),
  })
}

export function useCreateStageTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, stageId, ...data }: { transferId: string; stageId: string; taskName: string; [key: string]: any }) =>
      api.post(`/tech-transfer-stages/${transferId}/stages/${stageId}/tasks`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tt-stages'] }),
  })
}

// ─── Finance (costing hub — read-only aggregation) ─────────
export function useFinanceSummary() {
  return useQuery({ queryKey: ['finance', 'summary'], queryFn: () => api.get('/finance/summary').then(r => r.data) })
}

export function useProductCosts() {
  return useQuery({
    queryKey: ['finance', 'product-costs'],
    queryFn: () => api.get('/finance/product-costs').then(r => Array.isArray(r.data) ? r.data : []),
  })
}

export function useComponentCosts() {
  return useQuery({
    queryKey: ['finance', 'component-costs'],
    queryFn: () => api.get('/finance/component-costs').then(r => Array.isArray(r.data) ? r.data : []),
  })
}

export function useMoqCosts() {
  return useQuery({
    queryKey: ['finance', 'moq-costs'],
    queryFn: () => api.get('/finance/moq-costs').then(r => Array.isArray(r.data) ? r.data : []),
  })
}

export function useCostAnalysis() {
  return useQuery({
    queryKey: ['finance', 'cost-analysis'],
    queryFn: () => api.get('/finance/cost-analysis').then(r => Array.isArray(r.data) ? r.data : []),
  })
}

// ─── Formulation Detail ────────────────────────────────────
export function useFormulationIngredients(formulationId: string) {
  return useQuery({
    queryKey: ['formulation-ingredients', formulationId],
    queryFn: () => api.get(`/formulation-detail/${formulationId}/ingredients`).then(r => r.data),
    enabled: !!formulationId,
  })
}

export function useCreateFormulationIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formulationId, ...data }: { formulationId: string; [key: string]: any }) =>
      api.post(`/formulation-detail/${formulationId}/ingredients`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formulation-ingredients'] }),
  })
}

export function useBulkUpdateIngredients() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formulationId, ingredients }: { formulationId: string; ingredients: any[] }) =>
      api.post(`/formulation-detail/${formulationId}/ingredients/bulk`, { ingredients }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formulation-ingredients'] }),
  })
}

export function useFormulationProcedure(formulationId: string) {
  return useQuery({
    queryKey: ['formulation-procedure', formulationId],
    queryFn: () => api.get(`/formulation-detail/${formulationId}/procedure`).then(r => r.data),
    enabled: !!formulationId,
  })
}

export function useFormulationCostAnalysis(formulationId: string) {
  return useQuery({
    queryKey: ['formulation-cost', formulationId],
    queryFn: () => api.get(`/formulation-detail/${formulationId}/cost-analysis`).then(r => r.data),
    enabled: !!formulationId,
  })
}

// ─── Supplier inventory feeds (Geodis 3PL) ──────────────────
export function useGeodisFeedStatus() {
  return useQuery({
    queryKey: ['inventory-import', 'geodis', 'status'],
    queryFn: () => api.get('/inventory-import/geodis/status').then(r => r.data),
    // The feed runs on the supplier's schedule, so a stale header is more
    // misleading than a slightly chatty poll.
    refetchInterval: 120_000,
  })
}

export function useGeodisImportLogs() {
  return useQuery({
    queryKey: ['inventory-import', 'geodis', 'logs'],
    queryFn: () => api.get('/inventory-import/geodis/logs').then(r => r.data),
  })
}

export function useUploadGeodisInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, overrideGuard }: { file: File; overrideGuard?: boolean }) => {
      const form = new FormData()
      form.append('file', file)
      if (overrideGuard) form.append('overrideGuard', 'true')
      return api
        .post('/inventory-import/geodis/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          // A held import answers 409 by design; it carries the reason in the
          // body and must reach the caller rather than throwing as an error.
          validateStatus: (s) => s < 500,
        })
        .then((r) => ({ httpStatus: r.status, ...r.data }))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-import', 'geodis'] })
      qc.invalidateQueries({ queryKey: ['department'] })
    },
  })
}
