#!/usr/bin/env node
// REGRA 8b — a borda pública responde de verdade.
//
// Cuidado embutido: o router descobre gatekeepers escaneando os próprios
// bindings GATEKEEPER_*. Se um sumir, /gatekeeper/<nome>/ NÃO dá 404 — cai no
// fallback de SPA e devolve 200 com o HTML do app. Um smoke ingênuo aprova isso.
// Por isso comparamos o corpo com o do SPA: se for igual, o gatekeeper sumiu.
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) { console.error("✗ REGRA 8b — defina POWERFARM_PUBLIC_URL."); process.exit(1); }

const gatekeepers = (process.env.POWERFARM_GATEKEEPERS ?? "context,scheduler")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Atrás do Cloudflare Access, 302/401/403 na raiz é saudável (é o login).
const bordaOk = (s) => [200, 204, 302, 401, 403].includes(s);

async function pegar(path, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      return { status: res.status, corpo: await res.text().catch(() => "") };
    } catch (e) {
      if (t === tentativas) return { status: 0, erro: e.message, corpo: "" };
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

let ruim = 0;
const raiz = await pegar("/");
if (bordaOk(raiz.status)) console.log(`✓ origem pública — HTTP ${raiz.status}`);
else { ruim++; console.error(`✗ origem pública — ${raiz.status || raiz.erro}`); }

// Se a raiz devolveu o SPA, guardamos a impressão digital dele.
const spa = raiz.status === 200 && raiz.corpo.length > 0 ? raiz.corpo.slice(0, 2000) : null;

const api = await pegar("/api");
if (bordaOk(api.status)) console.log(`✓ backend via /api — HTTP ${api.status}`);
else { ruim++; console.error(`✗ backend via /api — ${api.status || api.erro}`); }

for (const nome of gatekeepers) {
  const r = await pegar(`/gatekeeper/${nome}/`);
  if (!bordaOk(r.status)) { ruim++; console.error(`✗ gatekeeper ${nome} — ${r.status || r.erro}`); continue; }
  if (spa && r.status === 200 && r.corpo.slice(0, 2000) === spa) {
    ruim++;
    console.error(`✗ gatekeeper ${nome} — devolveu o SPA, ou seja o binding GATEKEEPER_${nome.toUpperCase()} NÃO existe.`);
    console.error(`    O connector está morto e a borda parecia saudável.`);
    continue;
  }
  console.log(`✓ gatekeeper ${nome} — HTTP ${r.status}, resposta própria`);
}

if (ruim) { console.error(`\n✗ REGRA 8b — ${ruim} verificação(ões) falharam.`); process.exit(1); }
console.log("\n✓ REGRA 8b — borda pública coerente.");
