# Monitoring capacity evidence

Recorded: September 25, 2026

Status: **local scheduler capacity proved; provider acceptance and billed cost remain staging gates**.

The declared pilot assumption is 1,000 actively monitored gardens, each due once per hour. The deployed application cron runs every two minutes and claims at most 50 due gardens per invocation. That is a deterministic capacity of 1,500 garden evaluations per hour, or 1.5 times the declared pilot requirement. Tenant event creation runs with a bounded concurrency of five so a batch does not serialize 50 database round trips or open an unbounded number of connections.

The capacity model deliberately assumes no geographic sharing: every evaluation performs an NWS point lookup, hourly forecast request and active-alert request. At 30 days this is 720,000 evaluations and 2,160,000 provider requests, averaging 0.833 requests per second. This is a conservative request estimate, not proof that NWS accepts the burst shape or a production service-level claim. The protected staging run must measure response codes, latency and freshness before launch.

Scheduler storage failures retain their count and retry after 5, 10, 20, 40 and then at most 60 minutes. Successful scheduling resets the count. Due rows use leases and `SKIP LOCKED`, while the event idempotency key remains stable for the garden, location revision and due hour.

Automated tests prove the capacity arithmetic, detect a 2,000-garden overload under the same settings, validate the bounded backoff, verify Trestle's rendered Worker config preserves both the application cron and framework maintenance tick, and exercise due claiming against PostgreSQL with tenant-provenanced committed events.

NWS request attempts are persisted at the adapter boundary before every network call, including failures and retries, and the operations report uses that counter rather than deduplicated forecast snapshots. The remaining provider-cost gate requires real NWS behavior plus contracted Geoapify, MapTiler, Exa, Resend and Stripe rates and observed usage. No rate or service allowance is inferred from this local result.
