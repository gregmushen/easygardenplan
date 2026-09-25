import { createDatabase, garden, member, organization, applicationRoleAssignment, billingSubscriptionOwnership, organizationEntitlement, organizationSubscription, user } from "@easygardenplan/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { deleteDefaultHouseholds, ensureDefaultHousehold } from "./household.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;
const userId = `household-${Date.now()}`;

suite("default household bootstrap", () => {
  afterAll(async () => {
    await database!.delete(user).where(eq(user.id, userId));
    await database!.$client.end();
  });

  it("converges concurrent first requests on one household and one garden", async () => {
    await database!.insert(user).values({ id: userId, name: "Garden Tester", email: `${userId}@example.test`, emailVerified: true });
    const results = await Promise.all(Array.from({ length: 8 }, async () => await ensureDefaultHousehold(database!, userId)));
    expect(new Set(results.map(({ organizationId }) => organizationId))).toHaveLength(1);
    expect(new Set(results.map(({ gardenId }) => gardenId))).toHaveLength(1);
    const organizationId = results[0]!.organizationId;
    expect(await database!.select().from(member).where(eq(member.userId, userId))).toHaveLength(1);
    expect(await database!.select().from(garden).where(eq(garden.organizationId, organizationId))).toHaveLength(1);
    expect(await database!.select().from(applicationRoleAssignment).where(eq(applicationRoleAssignment.userId, userId))).toMatchObject([{ role: "gardener" }]);
    await database!.insert(organizationSubscription).values({ organizationId, provider: "stripe", providerSubscriptionId: `sub_${userId}`, plan: "pro", status: "active" });
    await database!.insert(organizationEntitlement).values({ organizationId, entitlement: "weather.monitoring" });
    await database!.insert(billingSubscriptionOwnership).values({ provider: "stripe", providerSubscriptionId: `sub_${userId}`, organizationId });

    await deleteDefaultHouseholds(database!, userId);
    expect(await database!.select().from(organization).where(eq(organization.id, organizationId))).toHaveLength(0);
    expect(await database!.select().from(garden).where(eq(garden.organizationId, organizationId))).toHaveLength(0);
    expect(await database!.select().from(organizationSubscription).where(eq(organizationSubscription.organizationId, organizationId))).toHaveLength(0);
    expect(await database!.select().from(billingSubscriptionOwnership).where(eq(billingSubscriptionOwnership.organizationId, organizationId))).toHaveLength(0);
  });
});
