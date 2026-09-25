import postgres from "postgres";
import { evaluateProviderBudgets, parseProviderBudgetConfig, type ProviderUsage } from "./provider-budget.js";

const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL, DATABASE_MIGRATION_URL, or DATABASE_URL is required");
const database = postgres(connectionString, { max: 1 });

try {
  const [catalog, forecast, due, backlog, deliveries, deliverySuppressions, recentDeliveryHistory, billing, providerUsage] = await Promise.all([
    database`select rf.rule_type, rv.payload->>'state' as state, count(*)::int as count
      from catalog_release cr join catalog_release_rule crr on crr.release_id=cr.id
      join rule_version rv on rv.id=crr.rule_version_id join rule_family rf on rf.id=rv.family_id
      where cr.status='published' group by rf.rule_type, rv.payload->>'state' order by rf.rule_type, state`,
    database`select max(retrieved_at) as latest_retrieval,
      count(*) filter (where source_updated_at < now() - interval '3 hours')::int as source_older_than_three_hours,
      count(*)::int as snapshots from weather_forecast_snapshot`,
    database`select count(*) filter (where next_due_at <= now() and (lease_expires_at is null or lease_expires_at < now()))::int as overdue,
      count(*) filter (where failure_count > 0)::int as retrying, count(*)::int as eligible from weather_location_due`,
    database`select event_name, status, count(*)::int as count from outbox_message
      where event_name in ('garden.weather_evaluation.requested','garden.recommendation.transitioned','billing.subscription.changed')
      and status <> 'processed' group by event_name, status order by event_name, status`,
    database`select status, count(*)::int as count from notification_delivery_intent group by status order by status`,
    database`select suppression_reason, count(*)::int as count from notification_delivery_intent
      where status='suppressed' group by suppression_reason order by suppression_reason`,
    database`select date_trunc('hour', updated_at) as hour, status, count(*)::int as count
      from notification_delivery_intent where updated_at >= now() - interval '7 days'
      group by date_trunc('hour', updated_at), status order by hour desc, status`,
    database`select count(*) filter (where status='received')::int as unprocessed,
      min(received_at) filter (where status='received') as oldest_unprocessed_at,
      count(*) filter (where status='failed')::int as failed from billing_provider_event`,
    database`with usage as (
      select provider, 'request'::text as meter, sum(request_count)::float8 as units, null::float8 as actual_cost_usd
        from location_provider_usage where window_started_at >= date_trunc('month', now()) group by provider
      union all select 'exa', 'search', coalesce(sum(attempt_count), 0)::float8,
        case when count(cost_usd) > 0 then sum(cost_usd)::float8 else null::float8 end
        from research_run where created_at >= date_trunc('month', now())
      union all select 'resend', 'accepted_email', count(*)::float8, null::float8
        from notification_delivery_intent where accepted_at >= date_trunc('month', now())
      union all select 'resend', 'accepted_email', count(*)::float8, null::float8
        from notification_digest where accepted_at >= date_trunc('month', now())
      union all select 'stripe', 'provider_event', count(*)::float8, null::float8
        from billing_provider_event where received_at >= date_trunc('month', now())
    ) select provider, meter, sum(units)::float8 as units,
      case when count(actual_cost_usd) > 0 then sum(actual_cost_usd)::float8 else null end as actual_cost_usd
      from usage group by provider, meter order by provider`,
  ]);
  const observedUsage: ProviderUsage[] = (providerUsage as unknown as Array<{ provider: ProviderUsage["provider"]; meter: string; units: number; actual_cost_usd: number | null }>).map((row) => ({ provider: row.provider, meter: row.meter, units: row.units, actualCostUsd: row.actual_cost_usd }));
  if (!observedUsage.some(({ provider }) => provider === "geoapify")) observedUsage.push({ provider: "geoapify", meter: "request", units: 0 });
  if (!observedUsage.some(({ provider }) => provider === "nws")) observedUsage.push({ provider: "nws", meter: "request", units: 0 });
  observedUsage.push({ provider: "maptiler", meter: "map_session", units: null });
  const providerBudgets = evaluateProviderBudgets(observedUsage, parseProviderBudgetConfig(process.env.PROVIDER_BUDGETS_JSON));
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    catalogCoverage: catalog,
    forecastFreshness: forecast[0] ?? { latest_retrieval: null, source_older_than_three_hours: 0, snapshots: 0 },
    monitoringDue: due[0] ?? { overdue: 0, retrying: 0, eligible: 0 },
    evaluationBacklog: backlog,
    deliveryOutcomes: deliveries,
    deliverySuppressions,
    recentDeliveryHistory,
    billingLag: billing[0] ?? { unprocessed: 0, oldest_unprocessed_at: null, failed: 0 },
    providerUsage: observedUsage,
    providerBudgets,
  }, null, 2)}\n`);
} finally {
  await database.end();
}
