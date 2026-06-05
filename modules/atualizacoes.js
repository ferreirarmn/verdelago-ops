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

const M = { patch: null, erro: null, aplicado: false, presIndex: null, camasAtuais: null };

// normaliza um nome para comparação (minúsculas, sem acentos)
function norm(s) {
  return String(s || "").trim().toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
// resolve um nome para uma pessoa viva (exato; depois primeiro+último)
function pessoaPorNome(nome) {
  if (!M.presIndex) {
    M.presIndex = new Map();
    for (const p of dados.pessoas) {
      const n = norm(p.Nome);
      if (!M.presIndex.has(n)) M.presIndex.set(n, p);
      const t = n.split(" ");
      if (t.length >= 2) {
        const alt = t[0] + " " + t[t.length - 1];
        if (!M.presIndex.has(alt)) M.presIndex.set(alt, p);
      }
    }
  }
  const n = norm(nome);
  if (M.presIndex.has(n)) return M.presIndex.get(n);
  const t = n.split(" ");
  if (t.length >= 2) { const alt = t[0] + " " + t[t.length - 1]; if (M.presIndex.has(alt)) return M.presIndex.get(alt); }
  return null;
}

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
      // se o patch recarrega camas, lê as camas atuais (para apagar e detetar lookup)
      if (M.patch.camas_reload) {
        try { M.camasAtuais = await graph.lerLista("Camas"); } catch { M.camasAtuais = []; }
      }
    } catch (e) { M.erro = e.message; }
  },

  render(core, alvo) {
    if (M.erro) {
      alvo.replaceChildren(
        el("div", { class: "mod-cab" }, el("h2", {}, "🔄 Atualizações")),
        el("div", { class: "mod-nota" }, "Não encontrei o ficheiro de atualizações (atualizacoes.json). Confirma que está na raiz da app. Detalhe: " + M.erro));
      return;
    }
    const p = M.patch || { updates: [], creates: [], presencas: [] };
    const corpo = el("div", {});

    // ---- resolver presenças (por nome -> pessoa viva) ----
    const pres = p.presencas || [];
    const presOk = [], presNok = new Set();
    for (const m of pres) {
      const pessoa = pessoaPorNome(m.Nome);
      if (pessoa) presOk.push({ ...m, pid: pessoa.Title });
      else presNok.add(m.Nome);
    }
    const presPessoas = new Set(presOk.map(x => x.pid)).size;
    const presDatas = new Set(presOk.map(x => x.Data));

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
    const btn = el("button", { class: "btn", onclick: () => aplicar(core, alvo, btn, log, presOk) },
      "Aplicar tudo ao SharePoint");

    const kpis = el("div", { class: "atz-kpis" });
    if (p.updates.length) kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + p.updates.length), el("span", {}, "fichas a atualizar")));
    if (p.creates.length) kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + p.creates.length), el("span", {}, "pessoas a criar")));
    if (pres.length) {
      kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + presOk.length), el("span", {}, "marcações de presença")));
      kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + presPessoas), el("span", {}, "pessoas · " + presDatas.size + " dias")));
    }
    corpo.append(kpis);

    if (p.updates.length) corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Atualizar fichas existentes"), tabUpd));
    if (p.creates.length) corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Acrescentar pessoas novas"), tabNov));
    if (pres.length) {
      const datas = [...presDatas].sort();
      const resumoPres = el("div", {},
        el("p", { class: "mut" }, "Período: " + (datas[0] || "—") + " a " + (datas[datas.length - 1] || "—") +
          " · " + presOk.length + " marcações para " + presPessoas + " pessoas."));
      if (presNok.size) resumoPres.append(
        el("p", { class: "atz-warn" }, "Sem correspondência (não aplico): " + [...presNok].join(", ")));
      corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Carregar presenças"), resumoPres));
    }

    // ---- recarga de camas ----
    const cr = p.camas_reload;
    let crResolvido = null;
    if (cr) {
      const occ = cr.camas.filter(c => c.Nome);
      const semMatch = new Set();
      for (const c of occ) if (!pessoaPorNome(c.Nome)) semMatch.add(c.Nome);
      crResolvido = { semMatch };
      const porEd = {};
      cr.camas.forEach(c => { porEd[c.Edificio] = (porEd[c.Edificio] || 0) + 1; });
      kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + cr.camas.length), el("span", {}, "camas a recarregar")));
      const resumo = el("div", {},
        el("p", { class: "atz-warn" }, "⚠ Isto SUBSTITUI todas as camas: apaga as " + (M.camasAtuais?.length || 0) + " atuais e cria " + cr.camas.length + " novas."),
        el("p", { class: "mut" }, "Casas: " + Object.entries(porEd).map(([k, v]) => k + " (" + v + ")").join(" · ")),
        cr.zonas_novas?.length ? el("p", { class: "mut" }, "Cria a casa em falta: " + cr.zonas_novas.map(z => z.Nome).join(", ")) : null,
        el("p", { class: "mut" }, occ.length + " camas com ocupante (" + (occ.length - semMatch.size) + " casados por nome).") );
      if (semMatch.size) resumo.append(el("p", { class: "atz-warn" }, "Ocupantes sem correspondência (cama fica sem nome): " + [...semMatch].join(", ")));
      corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Recarregar alojamento (camas)"), resumo));
    }

    corpo.append(
      el("div", { class: "atz-barra" }, btn,
        el("span", { class: "mut", style: "font-size:13px" }, M.aplicado ? "Já aplicado nesta sessão." : "Revê acima; só grava quando clicares.")),
      log);

    alvo.replaceChildren(
      el("div", { class: "mod-cab" }, el("h2", {}, "🔄 Atualizações"),
        el("p", { class: "mut" }, "Alterações reconciliadas dos ficheiros. Revê e aplica.")),
      corpo);
  }
};

async function aplicar(core, alvo, btn, log, presOk) {
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

  // 3) presenças (dedup contra as existentes: PessoaID+Data)
  if (presOk && presOk.length) {
    linha("A carregar presenças existentes para evitar duplicados…");
    let existentes = [];
    try { existentes = await graph.lerLista("Presenças"); }
    catch (e) { linha("Não consegui ler presenças existentes: " + e.message, false); }
    const chave = (pid, d) => pid + "|" + String(d).slice(0, 10);
    const idx = new Map();
    for (const x of existentes) idx.set(chave(x.PessoaID, x.Data), x);

    let pCriadas = 0, pAtualizadas = 0, pIguais = 0;
    for (const m of presOk) {
      const k = chave(m.pid, m.Data);
      const ex = idx.get(k);
      try {
        if (!ex) {
          await graph.criarItem("Presenças", { Title: "PR" + Date.now() + Math.floor(Math.random() * 999), PessoaID: m.pid, Data: m.Data, Estado: m.Estado });
          pCriadas++;
        } else if ((ex.Estado || "") !== m.Estado) {
          await graph.atualizarItem("Presenças", ex._id, { Estado: m.Estado });
          ex.Estado = m.Estado; pAtualizadas++;
        } else pIguais++;
      } catch (e) { linha("Falha numa marcação (" + m.Nome + " " + m.Data + "): " + e.message, false); nErr++; }
    }
    linha("Presenças: " + pCriadas + " criadas, " + pAtualizadas + " atualizadas, " + pIguais + " já iguais.");
    nOk += pCriadas + pAtualizadas;
  }

  // 4) recarga de camas (cria zona em falta, apaga todas, recria)
  const cr = p.camas_reload;
  if (cr) {
    // 4a) garantir zonas novas
    for (const zn of (cr.zonas_novas || [])) {
      const existe = dados.zonas.find(z => z.Nome === zn.Nome);
      if (!existe) {
        try {
          const ns = dados.zonas.map(z => parseInt(String(z.Title).replace(/^Z/, ""), 10)).filter(n => !isNaN(n));
          const zid = "Z" + String((ns.length ? Math.max(...ns) : 0) + 1).padStart(2, "0");
          const r = await graph.criarItem("Zonas", { Title: zid, Nome: zn.Nome, Modulo: zn.Modulo, Tipologia: zn.Tipologia, Ativa: true });
          dados.zonas.push({ _id: r.id, Title: zid, Nome: zn.Nome, Modulo: zn.Modulo, Tipologia: zn.Tipologia, Ativa: true });
          linha("Zona criada: " + zn.Nome + " (" + zid + ")"); nOk++;
        } catch (e) { linha("Falha ao criar zona " + zn.Nome + ": " + e.message, false); nErr++; }
      }
    }
    // detetar se ZonaID das camas é lookup (a partir das camas atuais)
    const zonaLookup = (M.camasAtuais || []).some(c => "ZonaIDLookupId" in c);
    const zonaPorNome = nome => dados.zonas.find(z => z.Nome === nome);

    // 4b) apagar camas atuais
    let apag = 0;
    for (const c of (M.camasAtuais || [])) {
      try { await graph.apagarItem("Camas", c._id); apag++; }
      catch (e) { linha("Falha ao apagar cama " + (c.Title || c._id) + ": " + e.message, false); nErr++; }
    }
    linha("Camas antigas apagadas: " + apag);

    // 4c) criar as novas
    let criadas = 0, semZona = 0;
    let n = 1;
    for (const c of cr.camas) {
      const zona = zonaPorNome(c.Edificio);
      if (!zona) { semZona++; continue; }
      const campos = {
        Title: "C" + String(n).padStart(3, "0"),
        Quarto: c.Quarto || "", Numero: c.Numero ?? "", Estado: c.Estado || "Livre"
      };
      if (zonaLookup) campos.ZonaIDLookupId = Number(zona._id); else campos.ZonaID = zona.Title;
      if (c.Nome) { const pe = pessoaPorNome(c.Nome); if (pe) campos.PessoaID = pe.Title; }
      if (c.DataChegada) campos.DataChegada = c.DataChegada;
      try { await graph.criarItem("Camas", campos); criadas++; n++; }
      catch (e) { linha("Falha ao criar cama " + campos.Title + ": " + e.message, false); nErr++; }
    }
    linha("Camas criadas: " + criadas + (semZona ? (" (" + semZona + " sem zona, ignoradas)") : ""));
    nOk += criadas;
  }

  badge(nErr ? "error" : "connected");
  M.aplicado = true;
  log.append(el("div", { style: "margin-top:8px;font-weight:600" }, "Concluído: " + nOk + " aplicadas, " + nErr + " com erro."));
  toast(nErr ? ("Aplicado com " + nErr + " erros") : "Atualizações aplicadas", nErr ? "error" : "info");
}
