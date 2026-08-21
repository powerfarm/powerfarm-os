import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOYMENT_ORDER, selectDeploymentTargets } from "./select-deploy-targets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("identity-only changes redeploy only Identity", () => {
  assert.deepEqual(
    selectDeploymentTargets([
      "packages/gatekeeper-identity/src/registry-client.ts",
      "packages/gatekeeper-identity/src/registry-client.test.ts",
    ]),
    ["identity"],
  );
});

test("Engine and Identity changes preserve dependency order", () => {
  assert.deepEqual(
    selectDeploymentTargets([
      "packages/gatekeeper-identity/src/identity.ts",
      "packages/powerfarm-engine/src/workspace-runtime.ts",
    ]),
    ["engine", "identity"],
  );
});

test("shared topology changes force full convergence", () => {
  assert.deepEqual(selectDeploymentTargets(["deployment.jsonc"]), DEPLOYMENT_ORDER);
  assert.deepEqual(selectDeploymentTargets(["scripts/deploy-powerfarm.mjs"]), DEPLOYMENT_ORDER);
  assert.deepEqual(selectDeploymentTargets(["cloudflare-os"]), DEPLOYMENT_ORDER);
});

test("docs and workflow-only edits do not redeploy Workers", () => {
  assert.deepEqual(
    selectDeploymentTargets(["docs/runtime.md", ".github/workflows/pr.yml", "README.md"]),
    [],
  );
});

test("deploy compares against the last successfully deployed commit", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/deploy.yml"), "utf8");
  assert.match(workflow, /LAST=.*state\/ultimo-deploy\.json/);
  assert.match(workflow, /select-deploy-targets\.mjs --base "\$LAST" --head/);
  assert.doesNotMatch(workflow, /select-deploy-targets\.mjs --base '\$\{\{ github\.event\.before \}\}'/);
});

test("trusted PR drift uses the working Cloudflare token", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/pr.yml"), "utf8");
  const driftStep = workflow.slice(workflow.indexOf("REGRA 1 — produção bate"));
  assert.match(driftStep, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(driftStep, /CLOUDFLARE_API_TOKEN_READONLY/);
});
