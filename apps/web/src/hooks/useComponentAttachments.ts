import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * NX-ATTACH: Hooks for Component Attachments (Compatibility Reports & Spec Sheets)
 */

export type ComponentAttachmentKind = 'COMPATIBILITY_REPORT' | 'SPEC_SHEET'

export interface ComponentAttachment {
  id: string
  kind: ComponentAttachmentKind
  kindDisplay: string
  version: number
  filename: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface CreateAttachmentResponse extends ComponentAttachment {
  uploadUrl: string
}

export interface DownloadUrlResponse {
  downloadUrl: string
  filename: string
  contentType: string
  sizeBytes: number
}

export interface CreateAttachmentParams {
  componentId: string
  kind: ComponentAttachmentKind
  filename: string
  contentType: string
  sizeBytes: number
}

/**
 * Fetch all attachments for a component
 */
export function useComponentAttachments(componentId: string | null) {
  return useQuery<ComponentAttachment[]>({
    queryKey: ['component-attachments', componentId],
    queryFn: () =>
      api.get(`/components/${componentId}/attachments`).then((r) => r.data),
    enabled: !!componentId,
  })
}

/**
 * Create a new attachment and get presigned upload URL.
 * Returns attachment metadata + uploadUrl. Caller must PUT file bytes to uploadUrl.
 */
export function useCreateComponentAttachment() {
  const qc = useQueryClient()
  return useMutation<CreateAttachmentResponse, any, CreateAttachmentParams>({
    mutationFn: ({ componentId, kind, filename, contentType, sizeBytes }) =>
      api
        .post(`/components/${componentId}/attachments`, {
          kind,
          filename,
          contentType,
          sizeBytes,
        })
        .then((r) => r.data),
    onSuccess: (_, { componentId }) => {
      qc.invalidateQueries({ queryKey: ['component-attachments', componentId] })
    },
  })
}

/**
 * Get a presigned download URL for an attachment.
 */
export function useComponentAttachmentDownloadUrl(
  componentId: string | null,
  attachmentId: string | null
) {
  return useQuery<DownloadUrlResponse>({
    queryKey: ['component-attachment-download', componentId, attachmentId],
    queryFn: () =>
      api
        .get(`/components/${componentId}/attachments/${attachmentId}/download-url`)
        .then((r) => r.data),
    enabled: !!componentId && !!attachmentId,
    staleTime: 5 * 60 * 1000, // 5 minutes (URLs are valid for 15)
  })
}

/**
 * Manually fetch download URL (not using query - for imperative download)
 */
export async function fetchComponentAttachmentDownloadUrl(
  componentId: string,
  attachmentId: string
): Promise<DownloadUrlResponse> {
  const res = await api.get(
    `/components/${componentId}/attachments/${attachmentId}/download-url`
  )
  return res.data
}
