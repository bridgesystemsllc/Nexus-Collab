import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function findTsxFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...findTsxFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

function isBadEnterPattern(line: string): boolean {
  if (!/onKeyDown/.test(line)) return false
  if (!/['"]Enter['"]/.test(line)) return false
  if (/onEnter\(/.test(line)) return false
  if (/isComposing/.test(line)) return false
  if (/e\.key\s*===?\s*['"]\s*['"]/.test(line) && /\|\|/.test(line)) return false
  if (/metaKey|ctrlKey|altKey|shiftKey/.test(line)) return false
  return true
}

describe('Enter key handling guard', () => {
  it('should not have any raw Enter key handlers that bypass onEnter', () => {
    const srcDir = path.resolve(__dirname, '..')
    const files = findTsxFiles(srcDir)
    
    const violations: { file: string; line: number; content: string }[] = []
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (isBadEnterPattern(line)) {
          const relPath = path.relative(srcDir, file)
          violations.push({
            file: relPath,
            line: i + 1,
            content: line.trim().substring(0, 100),
          })
        }
      }
    }
    
    if (violations.length > 0) {
      const message = violations
        .map(v => `  ${v.file}:${v.line}: ${v.content}`)
        .join('\n')
      expect.fail(
        `Found ${violations.length} raw Enter key handler(s). Use onEnter() from '@/lib/keys' instead:\n${message}`
      )
    }
  })
})
