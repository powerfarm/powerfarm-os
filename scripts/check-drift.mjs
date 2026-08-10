#!/usr/bin/env node
// REGRA 1 — produção tem que bater com o que o REPO declara.
// Direção importa: o esperado vem do repo (state/esperado.json, derivado dos
// configs gerados). A produção é comparada contra ele. Nunca o contrário.
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDeployment, ownedWorkers, readJson, cfFetch, normalizeLive, tripleKey, SEGREDOS } from "./lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const relIdx = process.argv.indexOf("--relatorio");
const relatorio = relIdx > -1 ? process.argv[relIdx + 1] : null;

const esperado = readJson(`${root}/state/esperado.json`);
if (!esperado) {
  console.error("✗ REGRA 1 — falta state/esperado.json.\n  Rode: pnpm check && node scripts/derive-expected.mjs");
  process.exit(1);
}

const linhas = [];
const anotar = (s) => { linhas.push(s); console.error(s); };
let divergiu = false;

for (const worker of ownedWorkers(await readDeployment(root))) {
  const vivo = normalizeLive(await cfFetch(`/workers/scripts/${worker}/settings`));
  const alvo = esperado.workers[worker];
  if (!alvo) continue;

  if (vivo.missing) { divergiu = true; anotar(`- ${worker}: NÃO EXISTE na conta`); continue; }

  // Segredos e bindings injetados fora do repo não entram na comparação:
  // o repo não os declara, então não pode "esperá-los".
  const vivos = new Map(vivo.bindings.filter((b) => !SEGREDOS.has(b.type)).map((b) => [b.name, b]));
  const alvos = new Map(alvo.bindings.map((b) => [b.name, b]));

  for (const [nome, esp] of alvos) {
    const real = vivos.get(nome);
    if (!real) { divergiu = true; anotar(`- ${worker}: binding ${nome} sumiu da produção`); continue; }
    if (tripleKey(real) !== tripleKey(esp)) {
      divergiu = true;
      anotar(`- ${worker}: binding ${nome} aponta para outro lugar`);
      anotar(`    esperado: ${esp.type} -> ${esp.target ?? "(sem alvo)"}`);
      anotar(`    produção: ${real.type} -> ${real.target ?? "(sem alvo)"}`);
    } else if (esp.text !== undefined && real.text !== esp.text) {
      divergiu = true;
      anotar(`- ${worker}: var ${nome} mudou em produção`);
      anotar(`    esperado: ${esp.text}`);
      anotar(`    produção: ${real.text}`);
    }
  }
  for (const nome of vivos.keys()) {
    if (!alvos.has(nome)) { divergiu = true; anotar(`- ${worker}: binding ${nome} existe em produção mas o repo não o declara`); }
  }
  if (vivo.compatibility_date !== alvo.compatibility_date) {
    divergiu = true;
    anotar(`- ${worker}: compatibility_date ${vivo.compatibility_date} != ${alvo.compatibility_date}`);
  }
}

if (relatorio) await writeFile(`${root}/${relatorio}`, linhas.join("\n") + "\n");

if (divergiu) {
  console.error("\n✗ REGRA 1 — produção divergiu do que o repo declara.");
  console.error("  Traga a diferença para o deployment.jsonc num PR. Não 'aceite' a produção.\n");
  process.exit(1);
}
console.log("✓ REGRA 1 — produção bate com o repo.");
