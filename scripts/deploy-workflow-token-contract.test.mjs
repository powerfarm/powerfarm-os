import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, ".github/workflows/deploy.yml"), "utf8");
const steps = workflow.split(/\n      - (?=name:|uses:)/);

const operationalToken = /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/;
const readonlyToken = /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN_READONLY \}\}/;

test("deployment-version API consumers use the operational Cloudflare token", () => {
  const deploymentReaders = steps.filter((step) =>
    /(?:record-versions|verify-versions)\.mjs/.test(step),
  );

  assert.equal(deploymentReaders.length, 3, "expected rollback snapshot, verification, and final state recording");
  for (const step of deploymentReaders) {
    assert.match(step, operationalToken);
    assert.doesNotMatch(step, readonlyToken);
  }
});

test("production drift prefers read-only and retries the same guard with operational auth", () => {
  const driftSteps = steps.filter((step) => step.includes("check-drift.mjs"));
  assert.equal(driftSteps.length, 2, "expected a least-privilege attempt plus one authenticated fallback");

  const primary = driftSteps.find((step) => step.includes("REGRA 1a"));
  const fallback = driftSteps.find((step) => step.includes("REGRA 1b"));
  assert.ok(primary, "primary drift step must exist");
  assert.ok(fallback, "fallback drift step must exist");

  assert.match(primary, readonlyToken);
  assert.doesNotMatch(primary, operationalToken);
  assert.match(primary, /continue-on-error:\s*true/);
  assert.match(primary, /id:\s*drift_readonly/);

  assert.match(fallback, operationalToken);
  assert.doesNotMatch(fallback, readonlyToken);
  assert.match(fallback, /steps\.drift_readonly\.outcome\s*==\s*'failure'/);

  const primaryCommand = primary.match(/run:\s*(node scripts\/check-drift\.mjs[^\n]*)/)?.[1];
  const fallbackCommand = fallback.match(/run:\s*(node scripts\/check-drift\.mjs[^\n]*)/)?.[1];
  assert.ok(primaryCommand && fallbackCommand, "both drift steps must execute the drift guard");
  assert.equal(fallbackCommand, primaryCommand, "fallback must repeat exactly the same drift check");
});
