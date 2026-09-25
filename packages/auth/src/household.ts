import { applicationRoleAssignment, billingSubscriptionOwnership, garden, member, organization, organizationEntitlement, organizationEntitlementOverride, organizationSubscription, outboxMessage, session, user, type Database } from "@easygardenplan/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export type DefaultHousehold = Readonly<{ organizationId: string; gardenId: string }>;

/**
 * Creates the private household behind the gardener-facing product. The
 * transaction advisory lock makes concurrent signup/session callbacks for one
 * user converge on the same household and garden.
 */
export async function ensureDefaultHousehold(database: Database, userId: string): Promise<DefaultHousehold> {
  return await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    const [existingMembership] = await transaction.select({ organizationId: member.organizationId })
      .from(member).where(eq(member.userId, userId)).orderBy(member.createdAt).limit(1);
    let organizationId = existingMembership?.organizationId;

    if (!organizationId) {
      const [account] = await transaction.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
      if (!account) throw new Error("Cannot create a household for an unknown user");
      organizationId = crypto.randomUUID();
      const suffix = userId.toLowerCase().replace(/[^a-z0-9]/gu, "").slice(-24) || organizationId.replaceAll("-", "").slice(-24);
      const now = new Date();
      await transaction.insert(organization).values({ id: organizationId, name: `${account.name}'s household`, slug: `garden-${suffix}`, createdAt: now, metadata: JSON.stringify({ kind: "garden_household", ownerUserId: userId }), householdOwnerUserId: userId });
      await transaction.insert(member).values({ id: crypto.randomUUID(), organizationId, userId, role: "owner", createdAt: now });
      await transaction.insert(applicationRoleAssignment).values({ organizationId, userId, role: "gardener", grantedBy: "policy:default_household", grantedAt: now });
    }

    const [existingGarden] = await transaction.select({ id: garden.id }).from(garden).where(eq(garden.organizationId, organizationId)).limit(1);
    let gardenId = existingGarden?.id;
    if (!gardenId) {
      const [created] = await transaction.insert(garden).values({ organizationId, name: "My Garden", units: "imperial", monitoringEnabled: false, locationConfirmed: false }).returning();
      if (!created) throw new Error("Failed to create the default garden");
      gardenId = created.id;
    }

    await transaction.update(session).set({ activeOrganizationId: organizationId }).where(and(eq(session.userId, userId), isNull(session.activeOrganizationId)));
    return { organizationId, gardenId };
  });
}

/** Removes household-owned data and pending work before Better Auth deletes the account. */
export async function deleteDefaultHouseholds(database: Database, userId: string): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    const rows = await transaction.select({ organizationId: organization.id, metadata: organization.metadata })
      .from(member).innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, userId), eq(member.role, "owner")));
    const householdIds = rows.filter(({ metadata }) => {
      try {
        const value = JSON.parse(metadata ?? "null") as { kind?: string; ownerUserId?: string } | null;
        return value?.kind === "garden_household" && value.ownerUserId === userId;
      } catch { return false; }
    }).map(({ organizationId }) => organizationId);
    for (const organizationId of householdIds) {
      await transaction.delete(outboxMessage).where(eq(outboxMessage.organizationId, organizationId));
      await transaction.delete(organizationEntitlementOverride).where(eq(organizationEntitlementOverride.organizationId, organizationId));
      await transaction.delete(organizationEntitlement).where(eq(organizationEntitlement.organizationId, organizationId));
      await transaction.delete(organizationSubscription).where(eq(organizationSubscription.organizationId, organizationId));
      await transaction.delete(billingSubscriptionOwnership).where(eq(billingSubscriptionOwnership.organizationId, organizationId));
      await transaction.delete(organization).where(eq(organization.id, organizationId));
    }
  });
}
