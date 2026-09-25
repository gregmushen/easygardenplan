import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sourceUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_ADMIN_URL, DATABASE_MIGRATION_URL, or DATABASE_URL is required");
if (process.env.MIGRATION_REHEARSAL_ALLOW_CREATE_DATABASE !== "1") throw new Error("Set MIGRATION_REHEARSAL_ALLOW_CREATE_DATABASE=1 to create and remove an isolated rehearsal database");

const priorTag = process.env.MIGRATION_REHEARSAL_PRIOR_TAG ?? "0049_bored_hannibal_king";
if (!/^\d{4}_[a-z0-9_]+$/u.test(priorTag)) throw new Error("MIGRATION_REHEARSAL_PRIOR_TAG is invalid");
const sourceMigrations = resolve("packages/db/migrations");
const scratch = await mkdtemp(join(tmpdir(), "easygardenplan-migrations-"));
const priorMigrations = join(scratch, "prior");
const databaseName = `easygardenplan_rehearsal_${crypto.randomUUID().replaceAll("-", "")}`;
const controlUrl = new URL(sourceUrl);
controlUrl.pathname = "/postgres";
const rehearsalUrl = new URL(sourceUrl);
rehearsalUrl.pathname = `/${databaseName}`;
const control = postgres(controlUrl.toString(), { max: 1 });
let created = false;

try {
  const journal = JSON.parse(await readFile(join(sourceMigrations, "meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string }>; [key: string]: unknown };
  const priorIndex = journal.entries.findIndex(({ tag }) => tag === priorTag);
  if (priorIndex < 0) throw new Error(`Prior migration ${priorTag} was not found`);
  const priorEntries = journal.entries.slice(0, priorIndex + 1);
  await mkdir(join(priorMigrations, "meta"), { recursive: true });
  await writeFile(join(priorMigrations, "meta/_journal.json"), `${JSON.stringify({ ...journal, entries: priorEntries }, null, 2)}\n`);
  await Promise.all(priorEntries.map(({ tag }) => cp(join(sourceMigrations, `${tag}.sql`), join(priorMigrations, `${tag}.sql`))));

  await control.unsafe(`create database "${databaseName}"`);
  created = true;
  const client = postgres(rehearsalUrl.toString(), { max: 1 });
  try {
    const database = drizzle(client);
    await migrate(database, { migrationsFolder: priorMigrations });
    const organizationId = `rehearsal-${crypto.randomUUID()}`;
    const gardenId = crypto.randomUUID();
    await client`insert into organization (id, name, slug, created_at) values (${organizationId}, 'Migration household', ${organizationId}, now())`;
    await client`insert into garden (id, organization_id, name, latitude, longitude, timezone, monitoring_enabled, location_confirmed) values (${gardenId}, ${organizationId}, 'Preserved garden', '45.5152', '-122.6784', 'America/Los_Angeles', true, true)`;

    await migrate(database, { migrationsFolder: sourceMigrations });

    const [preserved] = await client`select name, latitude, longitude, timezone, monitoring_enabled, location_confirmed from garden where id=${gardenId}`;
    const migrationRows = await client`select count(*)::int as migrations from drizzle.__drizzle_migrations`;
    const tableRows = await client`select count(*)::int as tables from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`;
    const forcedRlsRows = await client`select count(*)::int as "forcedRls" from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity`;
    const migrations = Number(migrationRows[0]?.migrations ?? 0);
    const tables = Number(tableRows[0]?.tables ?? 0);
    const forcedRls = Number(forcedRlsRows[0]?.forcedRls ?? 0);
    const requiredColumns = await client`select table_name, column_name from information_schema.columns where table_schema='public' and (
      (table_name='recommendation_version' and column_name in ('affected_task_ids','delivery_class','affected_crop_names')) or
      (table_name='notification_digest_due' and column_name='local_date') or
      (table_name='climate_association' and column_name='source_evidence')
    ) order by table_name, column_name`;
    if (migrations !== journal.entries.length) throw new Error(`Expected ${journal.entries.length} migrations, found ${migrations}`);
    if (!preserved || preserved.name !== "Preserved garden" || preserved.timezone !== "America/Los_Angeles" || preserved.monitoring_enabled !== true || preserved.location_confirmed !== true) throw new Error("Representative garden did not survive the upgrade");
    if (requiredColumns.length !== 5) throw new Error("The upgraded schema is missing required post-baseline columns");
    process.stdout.write(`${JSON.stringify({
      status: "passed",
      priorTag,
      currentTag: journal.entries.at(-1)?.tag,
      appliedMigrations: migrations,
      publicTables: tables,
      forcedRlsTables: forcedRls,
      preservedGarden: { id: gardenId, ...preserved },
      requiredColumns,
    }, null, 2)}\n`);
  } finally {
    await client.end();
  }
} finally {
  if (created) {
    await control`select pg_terminate_backend(pid) from pg_stat_activity where datname=${databaseName} and pid <> pg_backend_pid()`;
    await control.unsafe(`drop database if exists "${databaseName}"`);
  }
  await control.end();
  await rm(scratch, { recursive: true, force: true });
}
