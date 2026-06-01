---
name: prisma db push wants to drop the session table
description: Additive schema changes must avoid prisma db push here, or it deletes express-session data
---

`prisma db push` against the nexus DB reports "about to drop the `session`
table" and refuses without `--accept-data-loss`. The `session` table is owned by
connect-pg-simple (express-session), NOT modeled in `schema.prisma`, so Prisma
considers it drift and wants to remove it.

**Why:** Dropping `session` deletes all active logins (everyone gets signed out),
and `--accept-data-loss` would do exactly that.

**How to apply:** For additive schema changes (new model/table), run
`prisma generate` for the client, but create the new table with targeted raw SQL
(`CREATE TABLE IF NOT EXISTS ... ` + indexes + FK) instead of `prisma db push`.
The post-merge setup script also runs db push — if it ever fails on this, the
fix is the same: apply the additive SQL by hand, don't accept data loss. (A
cleaner long-term fix would be to add the session table to the Prisma schema so
it's no longer seen as drift.)
