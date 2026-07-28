import { Router, Request, Response } from 'express'
import { ObjectStorageService, ObjectNotFoundError } from '../lib/objectStorage'
import { UPLOAD_MAX_BYTES, validateUpload } from '../lib/uploadValidation'

export const uploadRoutes: ReturnType<typeof Router> = Router()

const objectStorage = new ObjectStorageService()

// ─── Request a presigned upload URL ─────────────────────────
// Client sends JSON metadata (NOT the file). It then PUTs the file
// directly to the returned uploadURL (Google Cloud Storage).
uploadRoutes.post('/request-url', async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body
    if (!name) return res.status(400).json({ error: 'File name is required' })

    // A valid, positive size is required so the size limit cannot be
    // bypassed by simply omitting it.
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: 'A valid file size is required' })
    }

    // Reject oversized or unsupported files before issuing an upload URL.
    const validation = validateUpload({ name, size, mimeType: contentType }, UPLOAD_MAX_BYTES)
    if (!validation.ok) return res.status(400).json({ error: validation.error })

    const uploadURL = await objectStorage.getObjectEntityUploadURL()
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL)

    res.json({ uploadURL, objectPath })
  } catch (error) {
    console.error('[uploads] POST /request-url error:', error)
    res.status(500).json({ error: 'Failed to generate upload URL' })
  }
})

// ─── Finalize an uploaded image ─────────────────────────────
// Authoritative post-upload verification: reads the REAL stored object
// metadata (size + content type) from object storage — not client claims —
// rejects non-images / oversized files, binds the object to the signed-in
// member via ACL, and returns the canonical served URL. Clients must persist
// the returned url, never a self-constructed path.
uploadRoutes.post('/finalize-image', async (req: Request, res: Response) => {
  try {
    const memberId = (req as any).member?.id as string | undefined
    if (!memberId) return res.status(401).json({ error: 'Unauthorized' })

    const { objectPath } = req.body
    if (typeof objectPath !== 'string' || !objectPath.startsWith('/objects/')) {
      return res.status(400).json({ error: 'A valid objectPath is required' })
    }

    const { size, contentType } = await objectStorage.getObjectEntityMetadata(objectPath)
    if (!Number.isFinite(size) || size <= 0 || size > UPLOAD_MAX_BYTES) {
      return res.status(400).json({ error: 'Uploaded file is missing or too large' })
    }
    const type = (contentType || '').toLowerCase()
    if (!type.startsWith('image/')) {
      return res.status(400).json({ error: 'Uploaded file is not an image' })
    }

    const normalized = await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
      owner: memberId,
      visibility: 'public',
    })
    res.json({ url: `/api/v1/uploads${normalized}` })
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: 'Uploaded file not found' })
    }
    console.error('[uploads] POST /finalize-image error:', error)
    res.status(500).json({ error: 'Failed to finalize image upload' })
  }
})

// ─── Serve / download an uploaded object ────────────────────
// Stored objects live in the private bucket dir and are streamed
// through the API so they are downloadable from the app.
uploadRoutes.get('/objects/*', async (req: Request, res: Response) => {
  try {
    const objectId = (req.params as Record<string, string>)['0']
    const objectFile = await objectStorage.getObjectEntityFile(`/objects/${objectId}`)
    await objectStorage.downloadObject(objectFile, res)
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: 'File not found' })
    }
    console.error('[uploads] GET /objects error:', error)
    return res.status(500).json({ error: 'Failed to download file' })
  }
})
