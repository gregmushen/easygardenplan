import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");

test("main pushes deploy staging while production requires an explicit manual go-live", () => {
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+deploy_production:/u);
  const production = workflow.slice(workflow.indexOf("  production:"));
  assert.match(production, /needs: staging/u);
  assert.match(production, /if: github\.event_name == 'workflow_dispatch' && inputs\.deploy_production == true/u);
  assert.doesNotMatch(production, /if: github\.event_name == 'push'/u);
});
