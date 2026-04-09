import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

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

export function useCreateCoworkTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ spaceId, ...data }: any) => api.post(`/cowork/${spaceId}/tasks`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cowork', vars.spaceId] })
      qc.invalidateQueries({ queryKey: ['cowork'] })
    },
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

// ─── Everything ─────────────────────────────────────────────
export function useEverything(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['everything', filters], queryFn: () => api.get(`/everything?${params}`).then(r => r.data) })
}

// ─── Integrations ───────────────────────────────────────────
export function useIntegrations() {
  return useQuery({ queryKey: ['integrations'], queryFn: () => api.get('/integrations').then(r => r.data) })
}

export function useSyncIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (type: string) => api.post(`/integrations/${type}/sync`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
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
