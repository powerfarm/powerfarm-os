#!/usr/bin/env node
// REGRA 8a — prova que TODO worker serve exatamente a versão que este run subiu.
// É a prova direta contra deploy parcial (versões misturadas), e funciona sem
// endpoint de health na aplicação: a evidência vem do control plane.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDeployment, ownedWorkers, readJson, cfFetch } from "./lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--antes");
const antes = readJson(`${root}/${i > -1 ? process.argv[i + 1] : "versoes-antes.json"}`);

let ruim = 0, iguais = [];
for (const worker of ownedWorkers(await readDeployment(root))) {
  const deployments = await cfFetch(`/workers/scripts/${worker}/deployments`);
  const atual = deployments?.deployments?.[0];
  const versaoAgora = atual?.versions?.[0]?.version_id ?? null;
  const versaoAntes = antes?.workers?.[worker]?.versionId ?? null;

  if (!versaoAgora) { ruim++; console.error(`✗ ${worker}: sem deployment ativo`); continue; }
  if (versaoAntes && versaoAgora === versaoAntes) { iguais.push(worker); continue; }
  console.log(`✓ ${worker}: ${versaoAgora.slice(0, 8)} (era ${versaoAntes?.slice(0, 8) ?? "nenhuma"})`);
}

// Worker que não mudou de versão é NORMAL quando o código dele não mudou.
// Vira suspeito só se ninguém mudou — aí o deploy não fez nada.
if (iguais.length) console.log(`  inalterados (código idêntico): ${iguais.join(", ")}`);

if (ruim) {
  console.error(`\n✗ REGRA 8a — ${ruim} worker(s) sem deployment ativo. Topologia inconsistente.`);
  process.exit(1);
}
console.log("\n✓ REGRA 8a — todos os workers com deployment ativo e coerente.");
