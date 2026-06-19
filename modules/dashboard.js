// ============================================================================
// dashboard.js — Painel de Gestão (pessoal + assiduidade + alojamento)
// ----------------------------------------------------------------------------
// Vistas: Global · Por departamento · Por área/zona. Exporta para Excel
// (SheetJS, carregado sob procura). O PowerPoint é gerado fora da app.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { dados, moduloDaPessoa, zonasPorTipologia } from "../core/store.js";
import * as graph from "../core/graph.js";
import { exportarPPTGeral, exportarPPTFB, exportarPPTHSK } from "../core/ppt.js";

const DEPTS = ["HSK", "F&B", "Náutico", "Serviços Centrais"];
const ROT = { "HSK": "Housekeeping", "F&B": "F&B", "Náutico": "Recreativo", "Serviços Centrais": "Serviços Centrais" };
const M = { sub: "global", mes: new Date(), pres: [], camas: [], carregado: false, ultimo: null };

function garantirEstilos() {
  // Estilos centralizados em estilo.css (design system v2) — nada a injetar.
}

// ---- helpers de agregação ----
const ativo = p => !((p.Estado || "").toLowerCase().includes("inativ"));
const porChegar = p => (p.Estado || "").toLowerCase().includes("cheg");
// camas a NÃO contar: estado "Não Ocupar" (fora de serviço)
const camaForaServico = c => { const e = (c.Estado || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); return e.includes("nao ocupar") || e.includes("naoocupar") || e.includes("fora de servic"); };
const camasUteis = () => M.camas.filter(c => !camaForaServico(c));
function deptDe(p) {
  const m = moduloDaPessoa(p);
  return (m === "HSK" || m === "F&B" || m === "Náutico") ? m : "Serviços Centrais";
}
function zonaIdDaCama(c) {
  const v = c.ZonaID;
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object") return v.LookupValue || v.Value || "";
  if (c.ZonaIDLookupId != null) { const z = dados.zonas.find(z => String(z._id) === String(c.ZonaIDLookupId)); return z ? z.Title : ""; }
  return "";
}
const classeEstado = e => { e = (e || "").toLowerCase(); return e.includes("ocup") ? "ocupada" : e.includes("cheg") ? "porchegar" : e.includes("bloq") ? "bloqueada" : "livre"; };
const ym = d => d.toISOString().slice(0, 7);

function assiduidadeDe(pessoaIds, mesStr) {
  const set = new Set(pessoaIds);
  let p = 0, f = 0, fo = 0; const medidos = new Set();
  for (const x of M.pres) {
    if (!set.has(x.PessoaID)) continue;
    if (String(x.Data || "").slice(0, 7) !== mesStr) continue;
    const e = (x.Estado || "").toLowerCase();
    if (e.includes("present")) { p++; medidos.add(x.PessoaID); }
    else if (e.includes("falt")) { f++; medidos.add(x.PessoaID); }
    else if (e.includes("folg")) fo++;
  }
  const base = p + f;
  return { p, f, fo, taxa: base ? Math.round(p / base * 100) : null, cobertos: medidos.size };
}

export const moduloDashboard = {
  id: "gestao", nome: "Gestão", icone: "📊",

  async init() {
    garantirEstilos();
    if (!M.carregado) {
      const [pres, camas] = await Promise.all([
        graph.lerLista("Presenças").catch(() => []),
        graph.lerLista("Camas").catch(() => [])
      ]);
      M.pres = pres; M.camas = camas; M.carregado = true;
    }
  },

  render(core, alvo) {
    const self = this;
    const aba = (id, txt) => el("button", { class: "dash-tab" + (M.sub === id ? " ativo" : ""), onclick: () => { M.sub = id; self.render(core, alvo); } }, txt);
    const mesStr = ym(M.mes);

    const barra = el("div", { class: "dash-bar" },
      el("div", { class: "mesnav" },
        el("button", { onclick: () => { M.mes = new Date(M.mes.getFullYear(), M.mes.getMonth() - 1, 1); self.render(core, alvo); } }, "‹"),
        el("span", { class: "mes" }, M.mes.toLocaleDateString("pt-PT", { month: "long", year: "numeric" })),
        el("button", { onclick: () => { M.mes = new Date(M.mes.getFullYear(), M.mes.getMonth() + 1, 1); self.render(core, alvo); } }, "›")),
      el("span", { class: "mut", style: "font-size:12px" }, "(mês para a assiduidade)"),
      el("button", { class: "exp", style: "background:var(--gold);margin-left:auto", onclick: () => exportarPPTGeral() }, "PPT Geral"),
      el("button", { class: "exp", style: "background:var(--gold)", onclick: () => exportarPPTFB() }, "PPT F&B"),
      el("button", { class: "exp", style: "background:var(--gold)", onclick: () => exportarPPTHSK() }, "PPT HSK"),
      el("button", { class: "exp", onclick: () => exportarExcel() }, "Exportar Excel"));

    const corpo = el("div", {});
    if (M.sub === "global") vistaGlobal(corpo, mesStr);
    else if (M.sub === "dept") vistaDept(corpo, mesStr);
    else vistaZona(corpo, mesStr);

    alvo.replaceChildren(
      el("div", { class: "mod-cab" }, el("h2", {}, "Gestão"), el("p", { class: "mut" }, "Pessoal, assiduidade e alojamento — visão de gestão.")),
      el("div", { class: "dash-tabs" }, aba("global", "Global"), aba("dept", "Por departamento"), aba("zona", "Por área/zona")),
      barra, corpo);
  }
};

function kpi(v, l, s) { return el("div", { class: "kpi" }, el("div", { class: "v" }, "" + v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null); }
function barra(pct) { return el("div", { class: "barpct" }, el("i", { style: "width:" + (pct || 0) + "%" })); }

// ---------- GLOBAL ----------
function vistaGlobal(corpo, mesStr) {
  const pessoas = dados.pessoas;
  const ativos = pessoas.filter(ativo);
  const ass = assiduidadeDe(ativos.map(p => p.Title), mesStr);
  const camas = camasUteis();
  const totalCamas = camas.length;
  const cont = { ocupada: 0, porchegar: 0, bloqueada: 0, livre: 0 };
  camas.forEach(c => cont[classeEstado(c.Estado)]++);
  const ocup = cont.ocupada;
  const alojados = new Set(camas.filter(c => c.PessoaID).map(c => c.PessoaID)).size;
  const aChegar = ativos.filter(porChegar).length;

  const subCamas = ocup + " ocupadas · " + cont.porchegar + " a chegar" + (cont.bloqueada ? " · " + cont.bloqueada + " bloqueadas" : "");
  corpo.append(el("div", { class: "kpis" },
    kpi(ativos.length, "Ativos", aChegar + " por chegar · " + pessoas.length + " no total"),
    kpi(ass.taxa == null ? "—" : ass.taxa + "%", "Assiduidade (HSK e TT)", ass.p + "P · " + ass.f + "F · cobre " + ass.cobertos + " pessoas"),
    kpi(totalCamas, "Camas (utilizáveis)", subCamas),
    kpi(cont.livre, "Camas livres", alojados + " alojados · " + cont.porchegar + " reservadas (a chegar)")));

  // por departamento (resumo)
  corpo.append(secaoDept(mesStr));
  // alojamento por edifício
  corpo.append(secaoAlojamento());
}

// ---------- POR DEPARTAMENTO ----------
function vistaDept(corpo, mesStr) { corpo.append(secaoDept(mesStr, true)); }

function secaoDept(mesStr, detalhe = false) {
  const linhas = DEPTS.map(d => {
    const gente = dados.pessoas.filter(p => deptDe(p) === d);
    const ativos = gente.filter(ativo);
    const aChegar = ativos.filter(porChegar).length;
    const ass = assiduidadeDe(ativos.map(p => p.Title), mesStr);
    const alojados = new Set(camasUteis().filter(c => c.PessoaID && deptDe({ ...pessoaPorTitle(c.PessoaID) }) === d).map(c => c.PessoaID)).size;
    return { d, ativos: ativos.length, aChegar, p: ass.p, f: ass.f, taxa: ass.taxa, cobertos: ass.cobertos, alojados };
  });
  const tb = el("table", { class: "dtab" },
    el("thead", {}, el("tr", {},
      el("th", {}, "Departamento"), el("th", { class: "num" }, "Ativos"), el("th", { class: "num" }, "Por chegar"),
      el("th", { class: "num" }, "Presenças"), el("th", { class: "num" }, "Faltas"), el("th", {}, "Assiduidade (HSK/TT)"), el("th", { class: "num" }, "Alojados"))),
    el("tbody", {}, ...linhas.map(r => el("tr", {},
      el("td", {}, ROT[r.d]),
      el("td", { class: "num" }, "" + r.ativos),
      el("td", { class: "num" }, r.aChegar ? "" + r.aChegar : "—"),
      el("td", { class: "num" }, "" + r.p),
      el("td", { class: "num" }, "" + r.f),
      el("td", {}, el("div", { style: "display:flex;align-items:center;gap:8px" }, barra(r.taxa), el("span", {}, r.taxa == null ? "—" : r.taxa + "% (" + r.cobertos + ")"))),
      el("td", { class: "num" }, "" + r.alojados)))));
  M.ultimo = M.ultimo || {}; M.ultimo.dept = linhas;
  return el("div", { class: "dash-sec" }, el("h3", {}, "Por departamento"), tb);
}

const _pIdx = {};
function pessoaPorTitle(t) { if (!_pIdx[t]) { const p = dados.pessoas.find(x => x.Title === t); _pIdx[t] = p || {}; } return _pIdx[t]; }

// ---------- POR ÁREA / ZONA ----------
function vistaZona(corpo, mesStr) { corpo.append(secaoAlojamento(true)); }

function secaoAlojamento(detalhe = false) {
  const edificios = zonasPorTipologia("Alojamento");
  const linhas = edificios.map(z => {
    const camas = M.camas.filter(c => zonaIdDaCama(c) === z.Title && !camaForaServico(c));
    const cont = { ocupada: 0, porchegar: 0, bloqueada: 0, livre: 0 };
    camas.forEach(c => cont[classeEstado(c.Estado)]++);
    const pct = camas.length ? Math.round(cont.ocupada / camas.length * 100) : 0;
    return { nome: z.Nome, total: camas.length, ...cont, pct };
  });
  M.ultimo = M.ultimo || {}; M.ultimo.aloj = linhas;
  const tb = el("table", { class: "dtab" },
    el("thead", {}, el("tr", {},
      el("th", {}, "Edifício"), el("th", { class: "num" }, "Camas"), el("th", { class: "num" }, "Ocupadas"),
      el("th", { class: "num" }, "Livres"), el("th", { class: "num" }, "Por chegar"), el("th", { class: "num" }, "Bloqueadas"), el("th", {}, "Ocupação"))),
    el("tbody", {}, ...linhas.map(r => el("tr", {},
      el("td", {}, r.nome),
      el("td", { class: "num" }, "" + r.total),
      el("td", { class: "num" }, "" + r.ocupada),
      el("td", { class: "num" }, "" + r.livre),
      el("td", { class: "num" }, "" + r.porchegar),
      el("td", { class: "num" }, "" + r.bloqueada),
      el("td", {}, el("div", { style: "display:flex;align-items:center;gap:8px" }, barra(r.pct), el("span", {}, r.pct + "%")))))),
    el("tfoot", {}, (() => {
      const t = linhas.reduce((a, r) => ({ total: a.total + r.total, ocupada: a.ocupada + r.ocupada, livre: a.livre + r.livre, porchegar: a.porchegar + r.porchegar, bloqueada: a.bloqueada + r.bloqueada }), { total: 0, ocupada: 0, livre: 0, porchegar: 0, bloqueada: 0 });
      const pct = t.total ? Math.round(t.ocupada / t.total * 100) : 0;
      return el("tr", { style: "font-weight:700;border-top:2px solid var(--line)" },
        el("td", {}, "Total"), el("td", { class: "num" }, "" + t.total), el("td", { class: "num" }, "" + t.ocupada),
        el("td", { class: "num" }, "" + t.livre), el("td", { class: "num" }, "" + t.porchegar), el("td", { class: "num" }, "" + t.bloqueada),
        el("td", {}, el("div", { style: "display:flex;align-items:center;gap:8px" }, barra(pct), el("span", {}, pct + "%"))));
    })()));
  const nota = detalhe ? el("p", { class: "mut", style: "font-size:13px" }, "A ocupação por outlet (F&B/Recreativo) fica disponível quando as escalas estiverem implementadas.") : null;
  return el("div", { class: "dash-sec" }, el("h3", {}, "Alojamento por edifício"), tb, nota);
}

// ---------- EXPORTAR EXCEL ----------
function carregarXLSX() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement("script");
    s.src = "lib/xlsx.full.min.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Não consegui carregar a biblioteca de Excel (lib/xlsx.full.min.js)."));
    document.head.append(s);
  });
}

async function exportarExcel() {
  try {
    badge("syncing");
    await carregarXLSX();
    const mesStr = ym(M.mes);
    const X = window.XLSX;
    const wb = X.utils.book_new();

    // Resumo global
    const pessoas = dados.pessoas, ativos = pessoas.filter(ativo);
    const ass = assiduidadeDe(ativos.map(p => p.Title), mesStr);
    const camas = camasUteis();
    const totalCamas = camas.length, ocup = camas.filter(c => classeEstado(c.Estado) === "ocupada").length;
    const resumo = [
      ["Verdelago — Painel de Gestão"], ["Mês (assiduidade)", mesStr], [],
      ["Ativos", ativos.length], ["Por chegar", ativos.filter(porChegar).length], ["Total pessoas", pessoas.length],
      ["Assiduidade HSK/TT (%)", ass.taxa == null ? "—" : ass.taxa], ["Presenças", ass.p], ["Faltas", ass.f], ["Pessoas medidas", ass.cobertos],
      ["Camas utilizáveis", totalCamas], ["Camas ocupadas", ocup], ["Trabalhadores alojados", new Set(camas.filter(c => c.PessoaID).map(c => c.PessoaID)).size]
    ];
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(resumo), "Resumo");

    // Por departamento
    const dep = [["Departamento", "Ativos", "Por chegar", "Presenças", "Faltas", "Assiduidade HSK/TT %", "Pessoas medidas", "Alojados"]];
    DEPTS.forEach(d => {
      const gente = pessoas.filter(p => deptDe(p) === d), at = gente.filter(ativo);
      const a = assiduidadeDe(at.map(p => p.Title), mesStr);
      const aloj = new Set(camasUteis().filter(c => c.PessoaID && deptDe(pessoaPorTitle(c.PessoaID)) === d).map(c => c.PessoaID)).size;
      dep.push([ROT[d], at.length, at.filter(porChegar).length, a.p, a.f, a.taxa == null ? "" : a.taxa, a.cobertos, aloj]);
    });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(dep), "Por Departamento");

    // Alojamento por edifício
    const al = [["Edifício", "Camas", "Ocupadas", "Livres", "Por chegar", "Bloqueadas", "Ocupação %"]];
    zonasPorTipologia("Alojamento").forEach(z => {
      const camas = M.camas.filter(c => zonaIdDaCama(c) === z.Title && !camaForaServico(c));
      const cont = { ocupada: 0, porchegar: 0, bloqueada: 0, livre: 0 };
      camas.forEach(c => cont[classeEstado(c.Estado)]++);
      al.push([z.Nome, camas.length, cont.ocupada, cont.livre, cont.porchegar, cont.bloqueada, camas.length ? Math.round(cont.ocupada / camas.length * 100) : 0]);
    });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(al), "Alojamento");

    // Pessoas (detalhe)
    const pp = [["PessoaID", "Nome", "Departamento", "Empresa", "Vínculo", "Estado"]];
    pessoas.forEach(p => pp.push([p.Title, p.Nome || "", ROT[deptDe(p)], p.EmpresaAgencia || "", p.Vinculo || "", p.Estado || ""]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(pp), "Pessoas");

    X.writeFile(wb, "Verdelago_Gestao_" + mesStr + ".xlsx");
    badge("connected"); toast("Excel exportado.");
  } catch (e) { badge("error", e.message); toast("Falha a exportar: " + e.message, "error"); }
}
