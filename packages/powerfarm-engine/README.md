# Powerfarm Engine v0.1

This package proves the smallest Gadget-owned ADK-JS path:

`Gadget YAML → strict validation → deterministic plan → ADK-JS → explicit capabilities → Supabase truth → disposable compute → resume`

## Local verification

From the Powerfarm OS root:

```sh
pnpm --filter @powerfarm/engine test
pnpm --filter @powerfarm/engine build
pnpm --filter @powerfarm/engine types
pnpm --filter @powerfarm/engine exec wrangler deploy --dry-run
```

The credentialed integration test reads the user-authorized credential file at
runtime, never prints its values, creates and removes a temporary Auth caller,
and leaves the durable run provenance:

```sh
pnpm --filter @powerfarm/engine test:live
```

Override the local credential path with `POWERFARM_CREDENTIAL_FILE`.

## Invoke

The Worker requires `SUPABASE_URL`, the `SUPABASE_PUBLISHABLE_KEY` Worker
secret, a Workers AI `AI` binding, and `WORKERS_AI_MODEL`. The caller supplies a
Supabase user JWT per request.

```sh
export POWERFARM_ENGINE_URL=https://powerfarm-engine.dan-1f4.workers.dev
export POWERFARM_TOKEN='<short-lived Supabase user JWT>'
export POWERFARM_IDEMPOTENCY_KEY='hello-001'
node scripts/invoke.mjs invoke hello-agentic 'Help me finish this task'

node scripts/invoke.mjs resume '<run-id>' 'The missing input'
node scripts/invoke.mjs get '<run-id>'
```

The CLI never prints the token. HTTP routes are:

- `POST /v1/gadgets/hello-agentic/invocations`
- `GET /v1/runs/:runId`
- `POST /v1/runs/:runId/resume`
- `GET /healthz`

## Security invariants

- Supabase receives the caller bearer and enforces ownership through RLS/RPC.
- No service-role key exists in the Worker.
- The Workers AI binding is capability authority; no model credential is
  persisted or passed into ADK.
- A missing capability fails compilation before invocation.
- Effect completion is replayable; `claimed`/`uncertain` effects are not retried
  automatically.
- The Engine has no D1, Durable Object, service, or Worker Loader binding.

## Concrete TODO

- Expose the existing Workshop `executeCodeMode()` through an upstream-safe
  scoped RPC seam before enabling the production code-executor capability.
- Decide a production custom domain or Router integration separately; v0.1 uses
  an explicit workers.dev endpoint.
- Replace the narrow unpublished ADK ESM imports if Google publishes a Worker-
  safe documented export surface, after rerunning compatibility tests.
