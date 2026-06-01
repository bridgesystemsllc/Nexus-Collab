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
