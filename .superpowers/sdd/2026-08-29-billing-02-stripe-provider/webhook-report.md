# Stripe webhook intake — status report

Status: complete. Typecheck 0 errors. `stripeClient.ts` remains the only `import Stripe`.

Commits:
- 76d5f0c — feat(billing): mount the Stripe webhook above the body parser
- 5a5bfcd — feat(billing): idempotent, order-aware webhook processing

Tests: 903 passed / 62 files (`npx vitest run`), including 7 new in
webhookProcessor.test.ts and 5 new in billingWebhooks.test.ts.

Unauthenticated curl (no signature, PORT=3100): **400** (not 401, not 404).

No branches pushed, no PR opened, per instructions.
