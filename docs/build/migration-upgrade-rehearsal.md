# Supported upgrade migration rehearsal

Recorded: September 25, 2026

Status: **passed locally**.

The repeatable `pnpm validation:migrations` check creates an isolated database with a random `easygardenplan_rehearsal_` name, installs the supported prior schema through `0049_bored_hannibal_king`, writes a representative located and monitored household garden, upgrades through the current migration journal, verifies the preserved record and required later schema, and removes the database in a `finally` block.

The supported baseline is application commit `7e157e1578532dccf2a010a3d6ba948dff1de00e`, which introduced migration 0049. The current endpoint is migration `0053_famous_the_enforcers`.

## Result

- 54 of 54 journal entries applied.
- The representative garden retained its name, coordinates, timezone, monitoring flag and confirmed-location flag.
- The upgraded database contained 72 public tables and 39 tables with forced row-level security.
- `notification_digest_due.local_date` and `recommendation_version.affected_task_ids`, `delivery_class` and `affected_crop_names` were present after the upgrade.
- The isolated database and temporary prior-migration directory were removed after verification.

Run with an administrative local or isolated database URL and the explicit safety guard:

```sh
MIGRATION_REHEARSAL_ALLOW_CREATE_DATABASE=1 pnpm validation:migrations
```

This proves the application upgrade path against PostgreSQL. The protected production restore remains a separate launch gate because it requires the production provider, retained backup history and recovery credentials.
