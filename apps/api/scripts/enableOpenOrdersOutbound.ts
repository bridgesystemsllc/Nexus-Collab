/**
 * Enable the `openOrders` OUTBOUND ERP feed (Nexus → ERP write-back).
 * Flips config.outbound.openOrders.enabled = true on the ERP_KAREVE_SYNC
 * integration, preserving encrypted creds + inbound routing via the same
 * helper the app's admin route uses.
 *
 *   npx tsx apps/api/scripts/enableOpenOrdersOutbound.ts
 *
 * Requires DATABASE_URL in the environment. Idempotent.
 */
import { PrismaClient } from '@prisma/client'
import { setOutboundOnConfig, getOutbound } from '../src/lib/erpRouting'

const prisma = new PrismaClient()

async function main() {
  const integration = await prisma.integration.findFirst({ where: { type: 'ERP_KAREVE_SYNC' } })
  if (!integration) {
    console.log('No ERP_KAREVE_SYNC integration found — connect the ERP first, then re-run.')
    return
  }

  const before = getOutbound(integration).openOrders
  console.log('openOrders outbound BEFORE:', before)

  const newConfig = setOutboundOnConfig(integration.config, {
    openOrders: { enabled: true },
  })
  const updated = await prisma.integration.update({
    where: { id: integration.id },
    data: { config: newConfig },
  })

  console.log('openOrders outbound AFTER :', getOutbound(updated).openOrders)
  console.log('\n✅ openOrders outbound feed enabled.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
