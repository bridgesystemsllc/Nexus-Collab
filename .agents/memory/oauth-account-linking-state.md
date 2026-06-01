---
name: OAuth account-linking state must be server-side & single-use
description: Why per-user OAuth connect flows in this app bind state to the session, not a signed token
---

For per-user account-linking OAuth flows (e.g. connecting a member's own
Microsoft/Google account), the `state` parameter must be an opaque random nonce
stored **server-side in the express-session**, consumed (deleted) on callback so
it is single-use, AND the callback must assert the currently authenticated
member equals the member the state was issued for.

**Why:** A stateless signed-state design (HMAC of memberId+timestamp) is
forgeable when the signing secret falls back to a hardcoded dev default, and is
replayable within its TTL — both enable an account-link hijack where an attacker
binds their Microsoft account to a victim's member record. Code review flagged
this as a Fail on the first pass.

**How to apply:** At `/connect` write `req.session.msOAuth = {nonce, memberId,
createdAt}` and `req.session.save(...)` BEFORE redirecting to the IdP (so the PG
session store has it). At `/callback` read then immediately `delete` it, check
TTL, `crypto.timingSafeEqual` the nonce, and require `req.member.id ===
stored.memberId`. The session store is connect-pg-simple with
`saveUninitialized:false`, so the user must already be logged in for this to work.
