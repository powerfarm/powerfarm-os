#!/usr/bin/env node
/**
 * Deploy do PowerFarm.
 *
 * O `scripts/deploy.mjs` do starter fica INTOCADO — este arquivo importa as
 * funções dele e pós-processa. Assim, quando o upstream do starter mudar, não
 * há conflito de merge no arquivo mais perigoso do repo.
 *
 * Diferenças de topologia em relação ao starter:
 *   starter:   workshop-backend serve os assets e detém a rota pública.
 *   PowerFarm: existe um `router` que detém a rota pública e os assets, e o
 *              backend fica interno, alcançado só por service binding.
 *              (É a topologia que o deploy service da Cloudflare já criou.)
 *
 * Ordem: folhas -> backend -> router. A origem pública é sempre a última a
 * mudar, para nunca servir frontend novo contra um backend que ainda não subiu.
 */
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";
import { generateConfigs } from "./deploy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GERADO = "wrangler.prod.jsonc";
const check = process.argv.includes("--check");

const OS = "cloudflare-os/packages";
const PACOTES = {
  errorReporter: { dir: "packages/error-reporter", chave: "errorReporter" },
  context: { dir: `${OS}/gatekeeper-context`, chave: "context" },
  scheduler: { dir: `${OS}/gatekeeper-scheduler`, chave: "scheduler" },
  customGatekeeper: { dir: "packages/custom-gatekeeper", chave: "customGatekeeper" },
  workshop: { dir: `${OS}/workshop-backend`, chave: "workshop" },
  router: { dir: `${OS}/router`, chave: "router" },
};
// A ordem do objeto É a ordem de deploy. Folhas primeiro, origem pública por último.
const ORDEM = ["errorReporter", "context", "scheduler", "customGatekeeper", "workshop", "router"];

async function lerJsonc(path) {
  const erros = [];
  const v = parse(await readFile(path, "utf8"), erros, { allowTrailingComma: true });
  if (erros.length) throw new Error(`JSONC inválido: ${path}`);
  return v;
}

// O workspace do submodule exige pnpm 11 (overrides vivem no pnpm-workspace.yaml,
// que o pnpm 9 ignora). POWERFARM_PNPM permite apontar para a versão certa sem
// mexer no pnpm global da máquina.
const PNPM = (process.env.POWERFARM_PNPM ?? "pnpm").split(" ").filter(Boolean);

function rodar(args, cwd = root, env = process.env) {
  const r = spawnSync(PNPM[0], [...PNPM.slice(1), ...args], { cwd, env, stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`pnpm ${args.join(" ")} falhou em ${cwd}`);
}

function capturar(args, cwd) {
  const r = spawnSync(PNPM[0], [...PNPM.slice(1), ...args], { cwd, encoding: "utf8" });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return { codigo: r.status, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** Constrói o config do router: rota pública, assets e TODOS os GATEKEEPER_*. */
function configDoRouter(base, config, gatekeepersDoBackend) {
  const r = structuredClone(base);
  r.account_id = config.accountId;
  r.name = config.workers.router.name;

  const rota = config.workers.router.route;
  if (rota.workersDev) { r.workers_dev = true; delete r.routes; }
  else { r.workers_dev = false; r.routes = [{ pattern: rota.customDomain, custom_domain: true }]; }

  // O router acha gatekeeper escaneando os próprios GATEKEEPER_*. Se um binding
  // não estiver aqui, /gatekeeper/<nome>/ cai no SPA e devolve 200 — o connector
  // morre em silêncio. Por isso espelhamos exatamente os do backend.
  r.services = [
    { binding: "WORKSHOP_BACKEND", service: config.workers.workshop.name },
    ...gatekeepersDoBackend.map(({ binding, service, entrypoint, props }) => ({
      binding, service, ...(entrypoint ? { entrypoint } : {}), ...(props ? { props } : {}),
    })),
  ];

  r.assets = {
    directory: "../workshop-frontend/dist",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api", "/api/*", "/blueprint-screenshot", "/blueprint-screenshot/*", "/gatekeeper/*"],
  };

  r.observability = {
    enabled: config.observability.enabled,
    head_sampling_rate: config.observability.headSamplingRate,
    logs: { invocation_logs: config.observability.logs.invocationLogs },
    traces: {
      enabled: config.observability.traces.enabled,
      head_sampling_rate: config.observability.traces.headSamplingRate,
    },
  };
  return r;
}

function configDoScheduler(base, config) {
  const s = structuredClone(base);
  s.account_id = config.accountId;
  s.name = config.workers.scheduler.name;
  s.workers_dev = false;
  delete s.routes;
  s.observability = {
    enabled: config.observability.enabled,
    head_sampling_rate: config.observability.headSamplingRate,
    logs: { invocation_logs: config.observability.logs.invocationLogs },
    traces: {
      enabled: config.observability.traces.enabled,
      head_sampling_rate: config.observability.traces.headSamplingRate,
    },
  };
  return s;
}

async function gerarTudo(config) {
  // O validateConfig do starter exige workers.workshop.route. Na nossa topologia
  // quem tem rota é o router, então sintetizamos uma para satisfazer a validação
  // e removemos logo em seguida.
  const paraBase = structuredClone(config);
  paraBase.workers.workshop.route ??= { workersDev: true };

  // O validateConfig do starter assume modo Cloudflare Access e exige um bloco
  // access.*. Nesta instância a autenticação é a do upstream (usuário e senha,
  // servida pela própria página do PowerFarm), então sintetizamos valores só
  // para passar na validação e removemos as vars logo depois.
  paraBase.access = {
    issuer: "https://placeholder.cloudflareaccess.com",
    audience: "0".repeat(64),
    // validateConfig do starter exige formato de email em cada admin. No modo
    // senha a identidade e um username, entao passamos um valor so para a
    // validacao e reescrevemos ADMINS com a lista real logo abaixo.
    admins: config.admins.map((a) => (a.includes("@") ? a : `${a}@placeholder.invalid`)),
  };

  const bases = {
    workshop: await lerJsonc(join(root, `${OS}/workshop-backend/wrangler.jsonc`)),
    context: await lerJsonc(join(root, `${OS}/gatekeeper-context/wrangler.jsonc`)),
    customGatekeeper: await lerJsonc(join(root, "packages/custom-gatekeeper/wrangler.jsonc")),
    errorReporter: await lerJsonc(join(root, "packages/error-reporter/wrangler.jsonc")),
  };
  const gerado = generateConfigs(paraBase, bases);

  // --- backend deixa de ser público e de servir assets: quem faz isso é o router
  // Fora do modo Access: sem estas vars o backend serve o próprio login.
  delete gerado.workshop.vars.CF_ACCESS_ISS;
  delete gerado.workshop.vars.CF_ACCESS_AUD;

  // ADMINS real (usernames inclusos), desfazendo o placeholder da validação.
  gerado.workshop.vars.ADMINS = config.admins;

  const gatekeepers = (gerado.workshop.services ?? []).filter((s) => s.binding.startsWith("GATEKEEPER_"));
  delete gerado.workshop.assets;
  gerado.workshop.workers_dev = false;
  delete gerado.workshop.routes;

  gerado.scheduler = configDoScheduler(
    await lerJsonc(join(root, `${OS}/gatekeeper-scheduler/wrangler.jsonc`)), config);

  // O scheduler também precisa estar visível para o backend e para o router.
  const bindingScheduler = {
    binding: "GATEKEEPER_SCHEDULER",
    service: config.workers.scheduler.name,
    entrypoint: "GatekeeperVendor",
  };
  gerado.workshop.services = [...(gerado.workshop.services ?? []), bindingScheduler];

  gerado.router = configDoRouter(
    await lerJsonc(join(root, `${OS}/router/wrangler.jsonc`)), config, [...gatekeepers, bindingScheduler]);

  return gerado;
}

function construir(config) {
  rodar(["--dir", "cloudflare-os", "--filter", "@gadgets/gatekeeper-context", "build"]);
  rodar(["--dir", "cloudflare-os", "--filter", "@gadgets/gatekeeper-scheduler", "build"]);
  rodar(["--dir", "packages/custom-gatekeeper", "run", "build"]);
  if (config.errorReporting.enabled) rodar(["--dir", "packages/error-reporter", "run", "build"]);
  // SEM VITE_CF_ACCESS_MODE: com a flag, o frontend esconde login e cadastro
  // por assumir que o Access já autenticou. Fora dela, ele serve a própria tela.
  rodar(["--dir", "cloudflare-os", "--filter", "@gadgets/workshop-frontend", "build"]);
  rodar(["--dir", "cloudflare-os", "--filter", "@gadgets/workshop-backend", "build"]);
}

/**
 * Sobe UM worker. Em duas fases quando ligado: publica os bytes sem tráfego,
 * devolve o version id, e a ativação acontece depois — separar "publicar" de
 * "mudar tráfego" encolhe muito a janela de versões misturadas.
 */
function publicar(dir, nome, duasFases) {
  const cwd = join(root, dir);
  const args = ["exec", "wrangler", ...(check ? ["deploy", "--dry-run"] : []), "--config", GERADO];

  if (check) { rodar(["exec", "wrangler", "deploy", "--dry-run", "--config", GERADO], cwd); return null; }

  if (!duasFases) { rodar(["exec", "wrangler", "deploy", "--config", GERADO], cwd); return null; }

  const r = capturar(["exec", "wrangler", "versions", "upload", "--config", GERADO], cwd);
  if (r.codigo !== 0) {
    // Worker que ainda não existe não aceita `versions upload`. Cai para o caminho normal.
    console.log(`  (${nome}: versions upload indisponível, usando deploy direto)`);
    rodar(["exec", "wrangler", "deploy", "--config", GERADO], cwd);
    return null;
  }
  const id = r.saida.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!id) throw new Error(`${nome}: não consegui ler o version id do upload`);
  return id;
}

function ativar(dir, nome, versionId) {
  rodar(["exec", "wrangler", "versions", "deploy", `${versionId}@100%`,
    "--config", GERADO, "--message", "deploy powerfarm", "--yes"], join(root, dir));
}

async function main() {
  if (!existsSync(join(root, "cloudflare-os/package.json"))) {
    throw new Error("submodule cloudflare-os não inicializado. Rode: git submodule update --init");
  }
  const config = parse(await readFile(join(root, "deployment.jsonc"), "utf8"), [], { allowTrailingComma: true });
  if (!config.workers?.router?.name || !config.workers?.scheduler?.name) {
    throw new Error("deployment.jsonc precisa de workers.router e workers.scheduler nesta topologia");
  }
  const duasFases = config.deploy?.twoPhase === true;

  const gerado = await gerarTudo(config);
  const escritos = [];
  try {
    for (const chave of ORDEM) {
      if (!gerado[chave]) continue;
      const path = join(root, PACOTES[chave].dir, GERADO);
      await writeFile(path, JSON.stringify(gerado[chave], null, 2) + "\n");
      escritos.push(path);
    }

    if (check) rodar(["test"]);
    construir(config);

    const versoes = {};
    console.log(`\n--- publicando${duasFases ? " (sem tráfego)" : ""} ---`);
    for (const chave of ORDEM) {
      if (!gerado[chave]) continue;
      console.log(`  ${chave} -> ${config.workers[chave].name}`);
      versoes[chave] = publicar(PACOTES[chave].dir, config.workers[chave].name, duasFases);
    }

    if (duasFases && !check) {
      console.log("\n--- ativando na ordem: folhas, backend, origem pública ---");
      for (const chave of ORDEM) {
        if (!versoes[chave]) continue;
        console.log(`  ${chave}`);
        ativar(PACOTES[chave].dir, config.workers[chave].name, versoes[chave]);
      }
    }
    console.log("\nOK.");
  } finally {
    // Em --check os configs gerados FICAM: os guards (REGRA 3 e 4) e o
    // derive-expected.mjs leem exatamente estes arquivos. Apagá-los aqui faria
    // os guards passarem sem ter olhado nada.
    if (!check) await Promise.all(escritos.map((p) => rm(p, { force: true })));
    else console.log(`\n${escritos.length} config(s) gerado(s) mantidos para os guards.`);
  }
}

try { await main(); }
catch (e) { console.error(`\nDeploy falhou. ${e.message}`); process.exitCode = 1; }
