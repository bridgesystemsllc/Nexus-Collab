import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) {
    // In development, use a deterministic fallback so the app doesn't crash
    // In production, TOKEN_ENCRYPTION_KEY must be set
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required in production')
    }
    return crypto.createHash('sha256').update('nexus-dev-key-not-for-production').digest()
  }
  // If key is hex-encoded (64 chars = 32 bytes)
  if (key.length === 64) return Buffer.from(key, 'hex')
  // Otherwise hash it to get 32 bytes
  return crypto.createHash('sha256').update(key).digest()
}

export function encrypt(plaintext: string): { iv: string; encrypted: string; tag: string } {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return { iv: iv.toString('hex'), encrypted, tag }
}

export function decrypt(data: { iv: string; encrypted: string; tag: string }): string {
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'))
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Convenience: encrypt a JSON object
export function encryptJson(obj: Record<string, any>): { iv: string; encrypted: string; tag: string } {
  return encrypt(JSON.stringify(obj))
}

// Convenience: decrypt back to JSON object
export function decryptJson<T = Record<string, any>>(data: { iv: string; encrypted: string; tag: string }): T {
  return JSON.parse(decrypt(data)) as T
}
