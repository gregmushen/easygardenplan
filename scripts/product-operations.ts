import postgres from "postgres";

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
    database`select provider, sum(request_count)::int as requests, min(window_started_at) as first_window, max(window_started_at) as latest_window
      from location_provider_usage group by provider order by provider`,
  ]);
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
    providerUsage,
  }, null, 2)}\n`);
} finally {
  await database.end();
}
