# A camada PowerFarm — o que reaplicar depois da reinstalação

A base foi reinstalada a partir do fluxo oficial da Cloudflare. Este repositório
guarda o que é **nosso** e tem de voltar por cima. Nada aqui é da Cloudflare.

Etiqueta com o estado exacto antes da reinstalação: `camada-v1`.

## O que é nosso

**`packages/gatekeeper-identity/`** — sign-in contra o emissor OAuth 2.1 do
Supabase. Não conhece o Registry, PKCE S256, só devolve email verificado.
Precisa de `CLIENT_ID` na config e `CLIENT_SECRET` por `wrangler secret put`.
O cliente OAuth está registado no Supabase com redirect exacto para
`<plataforma>/gatekeeper/identity/oauth` — **se o hostname da plataforma mudar,
o redirect URI tem de ser actualizado ao mesmo tempo, é correspondência exacta**.

**`packages/custom-gatekeeper/`** — o exemplo do starter, mantido em branco de
propósito, para servir de referência. Não é para sobrescrever.

**`packages/error-reporter/`** — relatório de erro sem conta de fornecedor.

**`deployment.jsonc`** — as decisões, com o porquê escrito ao lado:
- `auth.mode: password`, sem Cloudflare Access
- `aiGateway`: só Cloudflare, Workers AI em `mode: direct` (o gateway
  `powerfarm-ai` tem auth própria e devolve 401)
- `admins`, KV e R2 reutilizados

**`scripts/deploy-powerfarm.mjs`** — a topologia com router à frente do backend.
Contém duas correcções que custaram a encontrar:
- o router leva os bindings de gatekeeper **sem `entrypoint`**; com ele, todo
  `/gatekeeper/<nome>/` devolve 500 e nenhum OAuth fecha
- `BASE_URL` em cada gatekeeper, senão o redirect_uri sai como localhost

**`scripts/lib.mjs`, `guards/`, `state/`** — as REGRAS. Vigiam drift, bindings,
admins e migrations destrutivas.

**`NAMESPACE.md`** — convenção de nomes de rede e a decisão de tirar a
plataforma do apex.

## Ordem de reaplicação

1. Confirmar o que a instalação oficial criou: nomes de workers, KV, R2.
2. Ajustar `deployment.jsonc` a esses nomes.
3. `pnpm check`, depois `pnpm guards`.
4. `pnpm deploy`.
5. Repor o secret `CLIENT_SECRET` no `powerfarm-gk-identity`.
6. Conferir `/gatekeeper/<nome>/` — 404 do próprio worker é o certo; 500 quer
   dizer que o `entrypoint` voltou.
