#!/usr/bin/env node
// REGRA 8b — a borda pública responde de verdade.
//
// Critério importa: esta checagem dispara rollback automático, então um teste
// severo demais derruba deploy saudável. O que cada endpoint faz quando está BOM:
//   /                     200 com o HTML do app
//   /api                  400 "only accepts POST or WebSocket" (é WebSocket/Cap'n Web)
//   /gatekeeper/<nome>/   qualquer coisa que NÃO seja o SPA
//
// O último é o que realmente importa: o router acha gatekeeper escaneando os
// próprios GATEKEEPER_*. Se um binding sumir, o path cai no fallback de SPA e
// devolve 200 com o HTML do app — connector morto, borda "saudável".
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) { console.error("✗ REGRA 8b — defina POWERFARM_PUBLIC_URL."); process.exit(1); }

const gatekeepers = (process.env.POWERFARM_GATEKEEPERS ?? "context,scheduler")
  .split(",").map((s) => s.trim()).filter(Boolean);

async function pegar(path, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
      return { status: res.status, corpo: await res.text().catch(() => "") };
    } catch (e) {
      if (t === tentativas) return { status: 0, erro: e.message, corpo: "" };
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Impressão digital do SPA, tirada da própria raiz. Comparar com o app real é
// muito mais confiável do que adivinhar por "parece HTML": a página de erro da
// Cloudflare (1101) também é HTML com <script>, e um heurístico frouxo a
// confundiria com o fallback do SPA — reprovando um deploy saudável.
let assinaturaSpa = null;
const tituloDe = (c) => (c.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
const ehSpa = (c) => assinaturaSpa !== null && c.length > 0 && tituloDe(c) === assinaturaSpa;
let ruim = 0;

// --- 1. a origem serve o app
const raiz = await pegar("/");
if (raiz.status === 200 && /<!DOCTYPE html/i.test(raiz.corpo)) assinaturaSpa = tituloDe(raiz.corpo);
if (raiz.status === 200 && assinaturaSpa !== null) console.log("✓ origem pública — 200, app servido");
else if ([301, 302, 401, 403].includes(raiz.status)) {
  ruim++; console.error(`✗ origem pública — ${raiz.status}, algo está interceptando antes do worker`);
} else { ruim++; console.error(`✗ origem pública — ${raiz.status || raiz.erro}`); }

// --- 2. o backend está atrás do router
const api = await pegar("/api");
if (api.status === 0) { ruim++; console.error(`✗ backend via /api — sem resposta (${api.erro})`); }
else if (ehSpa(api.corpo)) { ruim++; console.error("✗ backend via /api — devolveu o SPA: o router não está mandando /api para o backend"); }
else console.log(`✓ backend via /api — ${api.status} (${api.corpo.slice(0, 48).trim() || "sem corpo"})`);

// --- 3. cada gatekeeper está BINDADO (o que o SPA mascara)
for (const nome of gatekeepers) {
  const r = await pegar(`/gatekeeper/${nome}/`);
  if (r.status === 0) { ruim++; console.error(`✗ gatekeeper ${nome} — sem resposta`); continue; }
  if (ehSpa(r.corpo)) {
    ruim++;
    console.error(`✗ gatekeeper ${nome} — devolveu o SPA: o binding GATEKEEPER_${nome.toUpperCase().replace(/-/g, "_")} NÃO existe.`);
    console.error("    O connector está morto e a borda parecia saudável.");
    continue;
  }
  console.log(`✓ gatekeeper ${nome} — ${r.status}, resposta do próprio worker (bindado)`);
}

if (ruim) { console.error(`\n✗ REGRA 8b — ${ruim} verificação(ões) falharam.`); process.exit(1); }
console.log("\n✓ REGRA 8b — borda pública coerente.");
