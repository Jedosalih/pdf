# Monetization — JPdf

## Status

Monetization is **architected but not enabled** in the initial build.
Payments, plan checkout, and billing UI are explicitly out of scope until
the core tool workflow, auth, and CMS are solid (blueprint §35, §84). What
ships now is the entitlement/plan data model everything else will hang off
of, so enabling billing later doesn't require a schema rewrite.

## Plan structure (simple by design)

- **Free** — the only active plan at launch. Generous enough to let a real
  user complete their task (blueprint §37), limited enough to create a
  visible ceiling.
- **Pro** — defined in the schema/seed data from day one (so entitlement
  checks like `canUseTool` have a real second tier to branch on in tests),
  but not purchasable until Payments (blueprint §38) is implemented.
- **Business** — future, not modeled yet beyond a placeholder enum value.

Do not add more tiers than this before there's a real reason to.

## Entitlement system

All limit checks go through `lib/entitlements`:

```ts
canUseTool(actor, toolId): Promise<{ allowed: boolean; reason?: string }>
getToolLimits(actor, toolId): Promise<ToolLimits>
getRemainingUsage(actor, toolId): Promise<{ used: number; limit: number }>
```

`actor` is either `{ type: "guest", guestId }` or `{ type: "user", userId
}`. Limits are read from `ToolLimit` rows (per tool, per plan) seeded in
`prisma/seed.ts` — not hardcoded per blueprint §11. No component or route
checks `user.plan === "pro"` directly.

## Conversion moments (UI copy only for now — no paywall enforcement beyond Free limits)

Per blueprint §37, upgrade prompts appear when a guest/user hits a quota,
needs a tool gated to Pro, or uploads a file above the Free size ceiling —
always stating exactly what Pro would unlock, never a dark-pattern
countdown or fake scarcity (blueprint §36, §76–77).

## Payments (future phase, not built yet)

Architected behind an abstraction so no page/route hardcodes a specific
provider:

```
lib/payments/
  types.ts        — Provider-agnostic Checkout/Subscription/Webhook types
  provider.ts      — interface a concrete provider implementation satisfies
```

Flow once implemented: `Checkout → Webhook → verify signature server-side
→ update Subscription → update entitlements`. The browser's reported
payment status is never trusted directly (blueprint §38).

## Regional pricing / local payment methods

Deferred until a provider is chosen; the `Plan` schema supports
per-currency pricing (`PlanPrice { planId, currency, amount, period }`)
so this doesn't require a schema migration later — see `prisma/schema.prisma`.

## What we will not do

No fake discounts, no countdown timers, no manipulative dark patterns
(blueprint §36). Any future discount/coupon must be real and clearly
explained; the `Coupon`/`CouponRedemption` tables exist in the schema for
this but are unused until a real promotion exists.
