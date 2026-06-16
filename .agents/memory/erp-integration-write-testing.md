---
name: Testing writes against a live user integration
description: Why probing /connect with fabricated creds can destroy a user's saved integration config, and how to test safely
---

# Don't overwrite real integration creds when testing

The ERP `/connect` endpoint re-encrypts the WHOLE creds blob (`encryptJson({apiUrl, apiKey})`)
on every call. Calling it with test/fabricated values **overwrites the user's real saved
credentials** — the previous encrypted apiKey is unrecoverable afterward.

**Why:** integration config stores creds as a single encrypted `{iv,encrypted,tag}` blob, not
per-field. There is no plaintext copy to fall back to once overwritten.

**How to apply:**
- To verify connect/test behavior, prefer the **read-only `/test`** endpoint (uses stored creds)
  or hit the user's external API directly with curl. Never POST `/connect` with made-up creds
  against a real integration row.
- If you must exercise `/connect`, snapshot the existing encrypted config first and restore it,
  or use a throwaway integration type.
- Restore path if clobbered: re-encrypt with `encryptJson` via a one-off tsx script using the
  app's own `lib/encryption`, preserving `config.routing`. The real apiKey cannot be recovered —
  the user has to re-enter it.
