import { expect, test } from "@playwright/test";

const appURL = process.env.APP_URL ?? "http://localhost:42069";

test("a new gardener receives one private workspace and can save the garden", async ({ page }) => {
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

  const bootstrap = await page.context().request.post(`${appURL}/api/workspace/bootstrap`, { headers: { origin: appURL } });
  const workspace = (await bootstrap.json() as { workspace: { organizationId: string } }).workspace;
  const subscription = await page.context().request.get(`${appURL}/api/billing/subscription`, { headers: { "x-trestle-tenant": workspace.organizationId } });
  expect(subscription.status()).toBe(200);
  expect((await subscription.json() as { subscription: unknown }).subscription).toBeNull();
});
