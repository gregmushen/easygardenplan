# Provider budget readiness

Recorded: September 25, 2026

Status: **implementation complete; contracted-rate and load gates remain**.

`pnpm operations:product` now reports calendar-month usage for Geoapify requests, Exa searches and their provider-reported cost, NWS forecast fetches, accepted Resend email, and Stripe provider events. MapTiler is explicitly `unmeasured` until browser session or invoice usage is imported; it is never silently reported as zero.

Operators provide the reviewed rate card through `PROVIDER_BUDGETS_JSON`. The versioned shape is demonstrated in `config/provider-budgets.example.json`; its numbers are illustrative and must not be used as contracted rates. Each configured provider returns `ok`, `soft_limit`, `hard_limit`, `unmeasured`, or `meter_mismatch`. A missing rate card remains visibly `unconfigured`.

The parser rejects unknown providers, negative or non-finite values, missing meters and a soft budget above the hard budget. Provider-reported Exa cost takes precedence over a unit estimate. Tests cover threshold selection, hard-limit detection, missing browser measurements and invalid configuration.

The launch gate remains open until the actual plan and contract rates are entered, MapTiler usage is supplied from its billing/analytics source, representative staging load is run, and the resulting cost is reviewed against an agreed customer-volume assumption.
