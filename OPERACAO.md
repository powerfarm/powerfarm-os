# PowerFarm — como se opera isto

Você não precisa lembrar de nada deste arquivo. Ele existe para o dia em que
algo falhar e você quiser saber o que a máquina estava tentando te dizer.

---

## A gramática inteira

Cinco verbos. Não existe um sexto.

### 1. Trocar cor, logo, nome, aviso, instrução do agente

Abre `/admin` na tua instância. Muda. Pronto.

**Não passa por aqui.** Não tem deploy, não tem commit, não tem CI. É config em
runtime. Se o que você quer mudar está no `/admin`, o repositório é irrelevante.

### 2. Adicionar um blueprint (um app, um formato de documento)

Você constrói no próprio Workshop, usando o produto. Exporta o `.gadget`. Aí:

```
pnpm import:format-blueprint ~/Downloads/OQueVoceFez.gadget --new nome-curto
```

Commit, PR, merge.

### 3. Adicionar uma integração (o backend soberano, um serviço qualquer)

Vira um **gatekeeper** em `packages/`. Aponte um agente para
`cloudflare-os/.agents/skills/write-gatekeeper/` — a skill guia a implementação
inteira. Commit, PR, merge.

### 4. Atualizar o Cloudflare OS

Você não faz nada. Toda segunda de manhã chega um PR sozinho, com a análise de
migration no corpo e um veredito no topo. Verde, você mergeia.

### 5. Deu ruim

O pipeline tentou recuperar e te diz se conseguiu. Se não conseguiu, abre um
incidente. Vem com o link do run.

---

## O que você nunca faz

**Nunca mexe pelo dashboard da Cloudflare.** Não porque quebra na hora — porque
o próximo deploy sobrescreve calado. A varredura das 6h abre uma issue quando
isso acontece, e a correção volta **por PR**: o Git continua sendo quem manda.

**Nunca deploya de branch.** O job que roda código de PR não recebe secret
nenhum. Não é disciplina, é que não existe o caminho.

**Nunca faz merge com a REGRA 2 vermelha.** É a única coisa aqui sem volta.

---

## As oito regras

| | Regra | Te salva de |
|---|---|---|
| 0 | O repo é a fonte da verdade | produção virar a verdade por descuido |
| 1 | Vivo ≠ esperado bloqueia | ter mexido no dashboard e esquecido |
| 2 | Migration destrutiva só com aprovação **do conteúdo exato** | apagar Durable Object sem volta |
| 3 | Binding não some **nem troca de alvo** | perder connector calado |
| 4 | Admin existe no fonte **e no artefato gerado** | se trancar fora do próprio `/admin` |
| 5 | Publicação e ativação em ordem explícita | router novo contra backend velho |
| 6 | Código de PR roda **sem secret nenhum** | postinstall hostil levar tua credencial |
| 7 | Pontos de volta gravados **antes** de ativar | rollback virar arqueologia |
| 8 | Falha de deploy **ou** de smoke dispara recuperação, e recuperação só vale depois de novo smoke | achar que voltou quando não voltou |

Regras 1 a 4 rodam **duas vezes**: no PR e de novo no merge, contra o estado
daquele momento. PR aberto na terça e mergeado na sexta é reavaliado na sexta.

---

## Direção da verdade

Isto é o coração do desenho, e é fácil de inverter sem perceber:

```
deployment.jsonc + submodule pinado     ← você edita isto
            ↓  pnpm check
     wrangler.prod.jsonc (gerado)
            ↓  derive-expected.mjs
      state/esperado.json               ← o contrato, commitado
            ↓  check-drift.mjs
   produção é comparada contra ele
```

A produção **nunca** ensina o repo. Se você mexeu no dashboard e estava certo,
a mudança entra por PR no `deployment.jsonc`. Se estava errada, o próximo deploy
a desfaz. Não existe botão de "aceitar a produção como verdade".

`state/takeover.json` é a exceção histórica: a fotografia do que o deploy service
da Cloudflare tinha injetado antes de assumirmos. É prova do ponto de partida,
não fonte corrente.

---

## Quando o CI ficar vermelho

**REGRA 1 — drift.** Você mexeu no dashboard. Traz a mudança para o
`deployment.jsonc` num PR, ou deixa o próximo deploy desfazer.

**REGRA 2 — migration destrutiva.** O upstream vai renomear ou apagar uma classe
de Durable Object. Alguém perde dado. O erro te diz exatamente o que escrever em
`state/migrations-approved.json`, incluindo o digest do conteúdo — se a migration
mudar depois, a aprovação deixa de valer sozinha.

**REGRA 3 — binding.** Um binding some ou passa a apontar para outro alvo. Se
disser `GATEKEEPER_*`, um connector inteiro ia parar de rotear — e em silêncio,
porque o router cai no SPA e devolve 200.

**REGRA 4 — admin.** O deploy ia te tirar do `/admin`, seja porque o
`deployment.jsonc` está errado, seja porque o gerador perdeu os admins no meio.

**REGRA 8 — não subiu, ou não voltou.** Se o smoke falhou, já tentou reverter e
te disse se conseguiu. Se o rollback foi **recusado** pela Cloudflare (acontece
quando há mudança de ciclo de vida de DO), abre incidente e aí sim é com você.

---

## Setup, uma vez, nunca mais

**Secrets:**
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — Workers Scripts:Edit, KV:Edit, R2:Edit. **Só o step de deploy e o de rollback o veem.**
- `CLOUDFLARE_API_TOKEN_READONLY` — Workers Scripts:Read

**Variables:**
- `POWERFARM_OWNER_EMAIL` — teu email, o que a REGRA 4 protege
- `POWERFARM_PUBLIC_URL` — a URL da instância, o que a REGRA 8 testa
- `POWERFARM_GATEKEEPERS` — opcional, padrão `context,scheduler`

**Environment** chamado `producao`, com "Required reviewers" apontando para você
se quiser a pausa entre o merge e a produção.

Nenhum secret fica no `env:` do job. Cada step pede o que precisa, e o step que
instala dependências não pede nada.

---

## O que isto não protege

Rollback reverte **código**. Não reverte dado escrito entre o deploy e a
reversão, não reverte KV, R2, D1 nem Durable Object — e **pode ser recusado pela
Cloudflare** quando houve mudança de ciclo de vida de DO ou quando um recurso
ligado à versão antiga não existe mais.

É exatamente por isso que a REGRA 2 é uma parede e não um aviso: ela guarda a
única porta que só abre para um lado.

---

## Pendências conhecidas

- **Publicar bytes e mudar tráfego ainda são o mesmo passo.** `pnpm deploy` usa
  `wrangler deploy`, que sobe a versão e manda 100% do tráfego nela na hora.
  O certo é `wrangler versions upload` para todos, conferir, e só então ativar
  em ordem. Reduz muito a janela de versões misturadas. Entra junto com a
  extensão do `deploy.mjs` para router e scheduler.
- **`deployment.jsonc`, submodule e `pnpm-lock.yaml` ainda não existem aqui.**
  Este diretório é a camada de operação, não o repo executável.
