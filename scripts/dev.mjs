#!/usr/bin/env node
/**
 * NEXUS — Development startup script
 * Runs API + Vite frontend concurrently.
 * On Replit, serves the built frontend from the API server.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'

const isReplit = !!process.env.REPL_SLUG || !!process.env.REPLIT_DEPLOYMENT
const isProduction = process.env.NODE_ENV === 'production'

function spawnProcess(name, command, args, opts = {}) {
  const proc = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...opts,
  })
  proc.on('error', (err) => console.error(`[${name}] Error:`, err.message))
  proc.on('exit', (code) => {
    if (code !== 0) console.error(`[${name}] Exited with code ${code}`)
  })
  return proc
}

async function main() {
  console.log('\n⚡ Starting NEXUS...\n')

  // Generate Prisma client if needed
  if (!existsSync('node_modules/.prisma/client')) {
    console.log('📦 Generating Prisma client...')
    spawnProcess('prisma', 'cd', ['packages/prisma', '&&', 'npx', 'prisma', 'generate'])
    await new Promise(r => setTimeout(r, 3000))
  }

  if (isReplit || isProduction) {
    // On Replit: run API server which serves both API and static frontend
    console.log('🏗️  Replit mode — building frontend...')
    spawnProcess('build', 'pnpm', ['--filter', '@nexus/web', 'build'])

    // Wait for build to complete
    await new Promise(r => setTimeout(r, 10000))

    console.log('🚀 Starting API server...')
    spawnProcess('api', 'pnpm', ['--filter', '@nexus/api', 'dev'])
  } else {
    // Local dev: run API and Vite concurrently
    console.log('🔧 Local dev mode — starting API + Vite...\n')
    spawnProcess('api', 'pnpm', ['--filter', '@nexus/api', 'dev'])
    spawnProcess('web', 'pnpm', ['--filter', '@nexus/web', 'dev'])
  }
}

main().catch(console.error)
