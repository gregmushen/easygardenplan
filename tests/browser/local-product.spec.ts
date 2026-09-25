import { expect, test } from "@playwright/test";
import { catalogRelease, catalogReleaseRule, createDatabase, crop, evidenceItem, knowledgeSource, ruleFamily, ruleVersion } from "../../packages/db/src/index.js";

const appURL = process.env.APP_URL ?? "http://localhost:42069";

async function seedPlanningCatalog() {
  const connectionString = process.env.TRESTLE_BROWSER_DATABASE_URL; if (!connectionString) throw new Error("Browser database is required");
  const database = createDatabase(connectionString, "postgres-js"); const nonce = crypto.randomUUID(); const cropId = crypto.randomUUID(); const sourceId = crypto.randomUUID(); const evidenceId = crypto.randomUUID(); const familyIds = [crypto.randomUUID(), crypto.randomUUID()]; const ruleIds = [crypto.randomUUID(), crypto.randomUUID()]; const releaseId = crypto.randomUUID();
  await database.insert(crop).values({ id: cropId, slug: `browser-crop-${nonce}`, commonName: "Browser fixture tomato", status: "published" });
  await database.insert(knowledgeSource).values({ id: sourceId, url: `https://example.test/browser-${nonce}`, title: "Browser fixture", publisher: "Tests", sourceType: "fixture", accessedAt: new Date() });
  await database.insert(evidenceItem).values({ id: evidenceId, sourceId, normalizedClaim: "Synthetic browser fact", scope: { fixture: true } });
  await database.insert(ruleFamily).values([{ id: familyIds[0]!, cropId, ruleType: "spacing", method: "direct_sow", contextKey: nonce }, { id: familyIds[1]!, cropId, ruleType: "planting_window", method: "direct_sow", contextKey: nonce }]);
  const applicability = { methods: ["direct_sow"], regionIds: [], climateRegimes: [], hardinessZones: [], varietyIds: [] };
  await database.insert(ruleVersion).values([{ id: ruleIds[0]!, familyId: familyIds[0]!, version: 1, state: "published", applicability, payload: { state: "known", type: "spacing", withinRowMeters: { minimum: 0.5, maximum: 0.5, minimumInclusive: true, maximumInclusive: true }, pattern: "individual", sourceUnit: "meters" }, evidenceIds: [evidenceId], publishedAt: new Date() }, { id: ruleIds[1]!, familyId: familyIds[1]!, version: 1, state: "published", applicability, payload: { state: "known", type: "planting_window", windows: [{ kind: "calendar", startMonth: 3, startDay: 1, endMonth: 4, endDay: 15, endYearOffset: 0 }] }, evidenceIds: [evidenceId], publishedAt: new Date() }]);
  await database.insert(catalogRelease).values({ id: releaseId, name: `browser-${nonce}`, status: "published", publishedBy: "browser-test", publishedAt: new Date() }); await database.insert(catalogReleaseRule).values(ruleIds.map((ruleVersionId) => ({ releaseId, ruleVersionId })));
  await database.$client.end();
}

test("a new gardener receives one private workspace and can save the garden", async ({ page }) => {
  await seedPlanningCatalog();
  const nonce = crypto.randomUUID().slice(0, 12);
  const email = `garden-${nonce}@example.test`;
  const password = `Garden-test-${nonce}!`;

  await page.goto("/sign-up");
  await page.getByRole("textbox", { name: "Name" }).fill("Garden Tester");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const message = page.locator("article").filter({ hasText: email });
  const verificationUrl = await message.getByRole("link", { name: "Open message link" }).getAttribute("href");
  expect(verificationUrl).toBeTruthy();
  await page.goto(verificationUrl!);

  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Garden Tester" })).toBeVisible();
  await expect(page.getByText(/organization/iu)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /organization/iu })).toHaveCount(0);

  await page.getByRole("link", { name: "Open my garden" }).click();
  await expect(page.getByRole("heading", { name: "Garden basics" })).toBeVisible();
  await page.getByLabel("Garden name").fill("Kitchen Garden");
  await page.getByRole("button", { name: "Save garden" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByText("The aerial map is unavailable in this environment.", { exact: false })).toBeVisible();
  await page.getByLabel("Latitude").fill("34.0522");
  await page.getByLabel("Longitude").fill("-118.2437");
  await page.getByLabel("Time zone").fill("America/Los_Angeles");
  await page.getByRole("button", { name: "Confirm this garden pin" }).click();
  await expect(page.getByText("Location confirmed. Climate matching has been refreshed.")).toBeVisible();
  await page.getByLabel("Hardiness zone").fill("10b");
  await page.getByLabel("Last spring frost (MM-DD)").fill("02-15");
  await page.getByLabel("First autumn frost (MM-DD)").fill("12-01");
  await page.getByRole("button", { name: "Use these dates" }).click();
  await expect(page.getByText("Your seasonal anchor has been saved as gardener-supplied information.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Garden name")).toHaveValue("Kitchen Garden");
  await expect(page.getByLabel("Latitude")).toHaveValue("34.0522");
  await expect(page.getByText("Pin confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Status:", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draw your growing space" })).toBeVisible();
  await page.getByRole("button", { name: "Save bed", exact: true }).click();
  await expect(page.getByText("Bed revision saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Main bed · revision 1" })).toBeVisible();
  await page.getByRole("button", { name: "Main bed · revision 1" }).click();
  await page.getByLabel("Outer boundary vertex 2 X").fill("4");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(page.getByRole("button", { name: "Main bed · revision 2" })).toBeVisible();
  const printHref = await page.getByRole("link", { name: "Print diagram" }).getAttribute("href");
  expect(printHref).toContain("print.svg");
  await expect(page.getByRole("heading", { name: "Build a planting proposal" })).toBeVisible();
  await expect(page.getByLabel("Crop")).toContainText("Browser fixture tomato");
  await page.getByRole("button", { name: "Add crop" }).click();
  await expect(page.getByText(/Browser fixture tomato: 4 retained plants/u)).toBeVisible();
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await expect(page.getByText(/4 placed, 0 unplaced/u)).toBeVisible();
  await expect(page.getByText(/through/u)).toBeVisible();
  await page.getByRole("button", { name: "Save pinned position" }).click();
  await expect(page.getByRole("heading", { name: /Plan version 2 · proposal/u })).toBeVisible();
  await page.getByRole("button", { name: "Activate this plan" }).click();
  await expect(page.getByRole("heading", { name: /active/u })).toBeVisible();

  const bootstrap = await page.context().request.post(`${appURL}/api/workspace/bootstrap`, { headers: { origin: appURL } });
  const workspace = (await bootstrap.json() as { workspace: { organizationId: string } }).workspace;
  const subscription = await page.context().request.get(`${appURL}/api/billing/subscription`, { headers: { "x-trestle-tenant": workspace.organizationId } });
  expect(subscription.status()).toBe(200);
  expect((await subscription.json() as { subscription: unknown }).subscription).toBeNull();
});
