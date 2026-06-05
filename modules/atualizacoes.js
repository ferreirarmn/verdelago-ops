// ============================================================================
// atualizacoes.js — Aplicador de atualizações em massa (revisto antes de aplicar)
// ----------------------------------------------------------------------------
// Lê um ficheiro de alterações já reconciliado (atualizacoes.json), mostra o
// que vai mudar, e ao confirmar aplica cada alteração à Lista Pessoas PELO
// PessoaID (nunca por posição). Atualiza fichas existentes e cria as novas.
// Para futuras atualizações, basta substituir o atualizacoes.json.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { dados, funcaoPorId, funcaoEhLookup } from "../core/store.js";
import * as graph from "../core/graph.js";

const M = { patch: null, erro: null, aplicado: false };

function garantirEstilos() {
  if (document.getElementById("atz-css")) return;
  const css = `
  .atz-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 18px}
  .atz-kpis .kpi{background:#fff;border:1px solid var(--line);border-radius:11px;padding:10px 16px;min-width:130px}
  .atz-kpis .kpi b{font-size:22px;color:var(--teal);display:block}
  .atz-kpis .kpi span{font-size:12px;color:var(--mut)}
  .atz-sec{margin:18px 0}
  .atz-sec h3{font-size:16px;color:var(--teal);margin:0 0 8px}
  .atz-tab{width:100%;border-collapse:collapse;font-size:13.5px;background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
  .atz-tab th{background:var(--soft);text-align:left;padding:8px 12px;font-size:12px;color:var(--teal-d)}
  .atz-tab td{padding:8px 12px;border-top:1px solid var(--line);vertical-align:top}
  .atz-tab .mud{color:var(--teal-d)}
  .atz-warn{color:var(--amber);font-size:12px}
  .atz-barra{display:flex;gap:10px;align-items:center;margin:10px 0 4px}
  .btn{background:var(--teal);color:#fff;border:none;border-radius:9px;padding:10px 20px;font-weight:600;cursor:pointer}
  .btn:disabled{opacity:.55}
  .atz-log{margin-top:14px;font-size:13px;background:var(--softer);border:1px solid var(--line);border-radius:10px;padding:12px 14px;max-height:240px;overflow:auto}
  .atz-log .ok{color:var(--teal)} .atz-log .ko{color:#b34b4b}
  `;
  document.head.append(el("style", { id: "atz-css", html: css }));
}

function proximoPessoaId(extra = 0) {
  const ns = dados.pessoas.map(p => parseInt(String(p.Title).replace(/^P/, ""), 10)).filter(n => !isNaN(n));
  return "P" + String((ns.length ? Math.max(...ns) : 0) + 1 + extra).padStart(3, "0");
}
const labelCampo = { EmpresaAgencia: "Empresa", Vinculo: "Vínculo", Estado: "Estado" };

export const moduloAtualizacoes = {
  id: "atualizacoes",
  nome: "Atualizações",
  icone: "🔄",

  async init() {
    garantirEstilos();
    if (M.patch || M.erro) return;
    try {
      const r = await fetch("atualizacoes.json?" + Date.now());
      if (!r.ok) throw new Error("HTTP " + r.status);
      M.patch = await r.json();
    } catch (e) { M.erro = e.message; }
  },

  render(core, alvo) {
    if (M.erro) {
      alvo.replaceChildren(
        el("div", { class: "mod-cab" }, el("h2", {}, "🔄 Atualizações")),
        el("div", { class: "mod-nota" }, "Não encontrei o ficheiro de atualizações (atualizacoes.json). Confirma que está na raiz da app. Detalhe: " + M.erro));
      return;
    }
    const p = M.patch || { updates: [], creates: [] };
    const corpo = el("div", {});

    // updates
    const tabUpd = el("table", { class: "atz-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Pessoa"), el("th", {}, "PessoaID"), el("th", {}, "Alterações"))),
      el("tbody", {}, ...p.updates.map(u => {
        const existe = dados.pessoas.find(x => x.Title === u.PessoaID);
        const mud = Object.entries(u.campos).map(([k, v]) => (labelCampo[k] || k) + ": " + v).join(" · ");
        return el("tr", {},
          el("td", {}, u.Nome || "—", existe ? null : el("span", { class: "atz-warn" }, " (não encontrada!)")),
          el("td", {}, u.PessoaID),
          el("td", { class: "mud" }, mud));
      })));

    // creates
    const tabNov = el("table", { class: "atz-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Nome"), el("th", {}, "Função"), el("th", {}, "Empresa"), el("th", {}, "Vínculo"), el("th", {}, "Estado"))),
      el("tbody", {}, ...p.creates.map(c =>
        el("tr", {},
          el("td", {}, c.Nome),
          el("td", {}, c.FuncaoID ? (c.FuncaoNome || c.FuncaoID) : el("span", { class: "atz-warn" }, "sem função — definir depois")),
          el("td", {}, c.EmpresaAgencia || "—"),
          el("td", {}, c.Vinculo || "—"),
          el("td", {}, c.Estado || "Ativo")))));

    const log = el("div", { class: "atz-log", style: "display:none" });
    const btn = el("button", { class: "btn", onclick: () => aplicar(core, alvo, btn, log) },
      "Aplicar tudo ao SharePoint");

    corpo.append(
      el("div", { class: "atz-kpis" },
        el("div", { class: "kpi" }, el("b", {}, "" + p.updates.length), el("span", {}, "fichas a atualizar")),
        el("div", { class: "kpi" }, el("b", {}, "" + p.creates.length), el("span", {}, "pessoas a criar"))),
      el("div", { class: "atz-sec" }, el("h3", {}, "Atualizar fichas existentes"), tabUpd),
      el("div", { class: "atz-sec" }, el("h3", {}, "Acrescentar pessoas novas"), tabNov),
      el("div", { class: "atz-barra" }, btn,
        el("span", { class: "mut", style: "font-size:13px" }, M.aplicado ? "Já aplicado nesta sessão." : "Revê acima; só grava quando clicares.")),
      log);

    alvo.replaceChildren(
      el("div", { class: "mod-cab" }, el("h2", {}, "🔄 Atualizações"),
        el("p", { class: "mut" }, "Alterações reconciliadas dos ficheiros (F&B + HSK). Revê e aplica.")),
      corpo);
  }
};

async function aplicar(core, alvo, btn, log) {
  const p = M.patch; if (!p) return;
  btn.disabled = true; log.style.display = ""; log.replaceChildren();
  const linha = (txt, ok = true) => log.append(el("div", { class: ok ? "ok" : "ko" }, (ok ? "✓ " : "✗ ") + txt));
  let nOk = 0, nErr = 0;
  badge("syncing");

  // 1) updates por PessoaID
  for (const u of p.updates) {
    const alvoP = dados.pessoas.find(x => x.Title === u.PessoaID);
    if (!alvoP) { linha("Update ignorado (não encontrei " + u.PessoaID + " — " + (u.Nome || "") + ")", false); nErr++; continue; }
    try {
      await graph.atualizarItem("Pessoas", alvoP._id, u.campos);
      Object.assign(alvoP, u.campos);
      linha("Atualizado: " + (u.Nome || u.PessoaID)); nOk++;
    } catch (e) { linha("Falha ao atualizar " + (u.Nome || u.PessoaID) + ": " + e.message, false); nErr++; }
  }

  // 2) creates
  let i = 0;
  for (const c of p.creates) {
    const id = proximoPessoaId(i);
    const campos = { Title: id, Nome: c.Nome, EmpresaAgencia: c.EmpresaAgencia || "", Vinculo: c.Vinculo || "", Estado: c.Estado || "Ativo" };
    if (c.FuncaoID) {
      if (funcaoEhLookup()) {
        const fObj = dados.funcoes.find(f => f.Title === c.FuncaoID);
        if (fObj) campos.FuncaoIDLookupId = Number(fObj._id);
      } else campos.FuncaoID = c.FuncaoID;
    }
    try {
      const r = await graph.criarItem("Pessoas", campos);
      dados.pessoas.push({ _id: r.id, ...campos, ...(c.FuncaoID && !funcaoEhLookup() ? { FuncaoID: c.FuncaoID } : {}) });
      linha("Criado: " + c.Nome + " (" + id + ")"); nOk++; i++;
    } catch (e) { linha("Falha ao criar " + c.Nome + ": " + e.message, false); nErr++; }
  }

  badge(nErr ? "error" : "connected");
  M.aplicado = true;
  log.append(el("div", { style: "margin-top:8px;font-weight:600" }, "Concluído: " + nOk + " aplicadas, " + nErr + " com erro."));
  toast(nErr ? ("Aplicado com " + nErr + " erros") : "Atualizações aplicadas", nErr ? "error" : "info");
}
