#!/usr/bin/env node
/**
 * NEXUS — First-time setup script for Replit
 * Initializes PostgreSQL, runs migrations, and seeds the database.
 */
import { execSync } from 'child_process'
import { existsSync } from 'fs'

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

async function main() {
  console.log('\n🚀 NEXUS — First-time Setup\n')

  // Step 1: Generate Prisma client
  console.log('📦 Step 1: Generating Prisma client...')
  run('cd packages/prisma && npx prisma generate')

  // Step 2: Push schema to database (creates tables without migration files — simpler for Replit)
  console.log('\n🗄️  Step 2: Pushing schema to database...')
  run('cd packages/prisma && npx prisma db push --accept-data-loss')

  // Step 3: Seed database
  console.log('\n🌱 Step 3: Seeding database...')
  run('cd packages/prisma && npx tsx prisma/seed.ts')

  console.log('\n✅ Setup complete! Run `npm run dev` to start NEXUS.\n')
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message)
  process.exit(1)
})
