import assert from "node:assert/strict";
import test from "node:test";
import { DEPLOYMENT_ORDER, selectDeploymentTargets } from "./select-deploy-targets.mjs";

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
