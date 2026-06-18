// ============================================================================
// controlo-gestao.js — Controlo de Gestão (execução do orçamento)
// ----------------------------------------------------------------------------
// Compara, por mês: VERSÃO INICIAL · VERSÃO ATUAL (última revisão) · REAL.
// Lentes: Mês (corrente), YTD (acumulado Jan→mês) e Meses seguintes (futuro).
// REAL = pessoas ativas (HC) + Custo Mensal Real (custo). Os nomes de
// departamentos/funções do plano e do real são alinhados pelas Correspondências.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import * as graph from "../core/graph.js";
import { dados, funcaoDaPessoa, moduloDaPessoa } from "../core/store.js";
import { carregarCorrespondencias, canonDepartamento } from "../core/correspondencias.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const norm = s => String(s || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const eurK = n => "€ " + Math.round(n / 1000).toLocaleString("pt-PT") + "k";

const M = {
  plano: null, colMap: null, erro: null,
  versoes: [], inicial: null, atual: null,
  lente: "mes", eixo: "custo", mesIdx: new Date().getMonth(),
};

function getter(colunas) {
  const byDisp = {}; colunas.forEach(c => byDisp[norm(c.displayName)] = c.name);
  return disp => byDisp[norm(disp)] || disp;
}

export const moduloControloGestao = {
  id: "controlo", nome: "Controlo de Gestão", icone: "💶",

  async init() {
    if (M.plano || M.erro) return;
    try { await carregarCorrespondencias(); } catch {}
    try {
      const [linhas, colunas] = await Promise.all([graph.lerLista("Orçamento"), graph.colunasDaLista("Orçamento")]);
      const g = getter(colunas);
      M.colMap = {
        versao: g("Versao"), tipo: g("TipoLinha"), nome: g("Nome"),
        categoria: g("Categoria"), departamento: g("Departamento"), vinculo: g("Vinculo"),
        hc: MESES.map(m => g("HC_" + m)), custo: MESES.map(m => g("Custo_" + m))
      };
      M.plano = linhas;
      M.versoes = [...new Set(linhas.map(l => l[M.colMap.versao]).filter(Boolean))].sort();
      M.inicial = M.versoes.find(v => /inicial/i.test(v)) || M.versoes[0] || null;
      M.atual = M.versoes.slice().reverse().find(v => /revis/i.test(v)) || M.versoes[M.versoes.length - 1] || M.inicial;
    } catch (e) { M.erro = e.message; }
  },

  render(core, alvo) {
    const self = this;
    if (M.erro || !M.plano) {
      alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "Controlo de Gestão")),
        el("div", { class: "mod-nota" }, "Não foi possível ler a Lista \"Orçamento\". Detalhe: " + (M.erro || "sem dados")));
      return;
    }
    if (!M.versoes.length) {
      alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "Controlo de Gestão")),
        el("div", { class: "mod-nota" }, "Ainda não há versões na Lista Orçamento. Cria uma versão Inicial (e revisões) para acompanhar a execução."));
      return;
    }

    const selVer = (val, onCh) => el("select", { class: "campo", style: "max-width:190px", onchange: e => { onCh(e.target.value); self.render(core, alvo); } },
      ...M.versoes.map(v => el("option", { value: v, ...(v === val ? { selected: "selected" } : {}) }, v)));
    const selMes = el("select", { class: "campo", style: "max-width:120px", onchange: e => { M.mesIdx = +e.target.value; self.render(core, alvo); } },
      ...MESES.map((m, i) => el("option", { value: i, ...(i === M.mesIdx ? { selected: "selected" } : {}) }, m)));
    const lente = (id, txt) => el("button", { class: "sub-tab" + (M.lente === id ? " ativo" : ""), onclick: () => { M.lente = id; self.render(core, alvo); } }, txt);
    const eixoBtn = el("button", { class: "btn-sec", onclick: () => { M.eixo = M.eixo === "custo" ? "hc" : "custo"; self.render(core, alvo); } }, M.eixo === "custo" ? "Ver HC" : "Ver custo");

    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "Controlo de Gestão"),
        el("p", { class: "mut" }, "Execução do orçamento: versão inicial vs versão atual vs real, por mês, acumulado (YTD) e meses seguintes.")),
      el("div", { class: "barra-acoes" },
        el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Versão inicial"), selVer(M.inicial, v => M.inicial = v)),
        el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Versão atual"), selVer(M.atual, v => M.atual = v)),
        el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Mês de referência"), selMes),
        eixoBtn),
      el("div", { class: "sub-tabs" }, lente("mes", "Mês"), lente("ytd", "YTD (acumulado)"), lente("seguintes", "Meses seguintes")),
      corpo);
    vista(corpo);
  }
};

function planoVersao(versao) {
  const cm = M.colMap, linhas = M.plano.filter(l => l[cm.versao] === versao);
  const totHC = Array(12).fill(0), totCusto = Array(12).fill(0), dep = {};
  for (const l of linhas) {
    const dc = canonDepartamento(l[cm.departamento] || "—") || "—";
    (dep[dc] = dep[dc] || { hc: Array(12).fill(0), custo: Array(12).fill(0) });
    for (let i = 0; i < 12; i++) {
      const h = Number(l[cm.hc[i]] || 0), c = Number(l[cm.custo[i]] || 0);
      totHC[i] += h; totCusto[i] += c; dep[dc].hc[i] += h; dep[dc].custo[i] += c;
    }
  }
  return { totHC, totCusto, dep };
}

function realSnapshot() {
  const dep = {}; let hc = 0, custo = 0;
  for (const p of dados.pessoas) {
    const est = (p.Estado || "").toLowerCase();
    if (est.includes("inativ") || est.includes("cheg")) continue;
    const f = funcaoDaPessoa(p);
    const dReal = (f && f.Departamento) || moduloDaPessoa(p) || "—";
    const dc = canonDepartamento(dReal) || "—";
    const c = Number(p.CustoMensalReal || p.Custo || 0);
    (dep[dc] = dep[dc] || { hc: 0, custo: 0 });
    dep[dc].hc += 1; dep[dc].custo += c; hc += 1; custo += c;
  }
  return { dep, hc, custo };
}

function vista(corpo) {
  const ini = planoVersao(M.inicial), atu = planoVersao(M.atual), real = realSnapshot();
  const campo = M.eixo === "custo" ? "custo" : "hc";
  const fmt = M.eixo === "custo" ? eurK : (n => Math.round(n) + "");
  const i = M.mesIdx;

  let meses, titulo, temReal;
  if (M.lente === "mes") { meses = [i]; titulo = "Mês de " + MESES[i]; temReal = (i === new Date().getMonth()); }
  else if (M.lente === "ytd") { meses = Array.from({ length: i + 1 }, (_, k) => k); titulo = "Acumulado Jan–" + MESES[i] + " (YTD)"; temReal = false; }
  else { meses = Array.from({ length: 12 - (i + 1) }, (_, k) => i + 1 + k); titulo = "Meses seguintes (" + (MESES[i + 1] || "—") + "–Dez)"; temReal = false; }

  const somaPlano = pl => meses.reduce((s, m) => s + (campo === "custo" ? pl.totCusto[m] : pl.totHC[m]), 0);
  const iniTot = somaPlano(ini), atuTot = somaPlano(atu);
  const realTot = temReal ? (campo === "custo" ? real.custo : real.hc) : null;

  const kpi = (v, l, s, cls) => el("div", { class: "orc-kpi " + (cls || "") }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null);
  const desvio = (a, b) => { if (a == null || b == null) return ""; const d = a - b, pc = b ? Math.round(100 * d / b) : 0; return (d >= 0 ? "+" : "") + fmt(d) + " (" + (d >= 0 ? "+" : "") + pc + "%)"; };
  const kpis = el("div", { class: "orc-kpis" },
    kpi(fmt(iniTot), "Versão inicial · " + M.inicial, titulo),
    kpi(fmt(atuTot), "Versão atual · " + M.atual, "vs inicial: " + desvio(atuTot, iniTot), "fixo"),
    kpi(realTot != null ? fmt(realTot) : "—", "Real", realTot != null ? ("vs atual: " + desvio(realTot, atuTot)) : "snapshot só no mês corrente"));

  const deps = [...new Set([...Object.keys(ini.dep), ...Object.keys(atu.dep), ...Object.keys(real.dep)])].sort();
  const vP = (pl, d) => meses.reduce((s, m) => s + (pl.dep[d] ? (campo === "custo" ? pl.dep[d].custo[m] : pl.dep[d].hc[m]) : 0), 0);
  const vR = d => temReal && real.dep[d] ? (campo === "custo" ? real.dep[d].custo : real.dep[d].hc) : null;

  const cab = el("tr", {}, el("th", { class: "rot" }, "Departamento"), el("th", {}, "Inicial"), el("th", {}, "Atual"), el("th", {}, "Real"), el("th", {}, "Real vs Atual"));
  const linhas = deps.map(d => {
    const a = vP(ini, d), b = vP(atu, d), r = vR(d), dv = r != null ? r - b : null;
    return el("tr", {},
      el("td", { class: "rot" }, d), el("td", {}, fmt(a)), el("td", {}, fmt(b)),
      el("td", {}, r != null ? fmt(r) : "—"),
      el("td", { style: dv != null ? ("color:" + (dv > 0 ? "var(--danger)" : "var(--teal)")) : "" }, dv != null ? ((dv >= 0 ? "+" : "") + fmt(dv)) : "—"));
  });
  const totRow = el("tr", { style: "font-weight:700;border-top:2px solid var(--line)" },
    el("td", { class: "rot" }, "Total"), el("td", {}, fmt(iniTot)), el("td", {}, fmt(atuTot)),
    el("td", {}, realTot != null ? fmt(realTot) : "—"),
    el("td", {}, realTot != null ? ((realTot - atuTot >= 0 ? "+" : "") + fmt(realTot - atuTot)) : "—"));
  const tabela = el("table", { class: "orc-tab", style: "width:100%" }, el("thead", {}, cab), el("tbody", {}, ...linhas, totRow));

  const nota = el("div", { class: "mod-nota" }, M.lente === "mes"
    ? "Real = pessoas ativas e Custo Mensal Real, alinhados ao plano pelas Correspondências."
    : M.lente === "ytd"
      ? "YTD: planos acumulados de Janeiro ao mês de referência. O real acumulado precisa de fotos mensais do histórico — por agora o real fiável é o do mês corrente (lente Mês)."
      : "Meses seguintes: projeção dos planos (inicial vs atual); ainda não há real.");

  corpo.replaceChildren(kpis,
    el("div", { class: "esc-sec", style: "overflow:auto" }, el("h3", {}, titulo + (M.eixo === "custo" ? " — custo" : " — HC")), tabela),
    nota,
    el("div", { class: "barra-acoes" }, el("button", { class: "btn-sec", onclick: () => exportar(deps, ini, atu, real, meses, temReal) }, "Exportar Excel")));
}

function exportar(deps, ini, atu, real, meses, temReal) {
  (async () => {
    try {
      badge("syncing");
      await new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("Excel")); document.head.append(s); });
      const X = window.XLSX, campo = M.eixo;
      const vP = (pl, d) => meses.reduce((s, m) => s + (pl.dep[d] ? (campo === "custo" ? pl.dep[d].custo[m] : pl.dep[d].hc[m]) : 0), 0);
      const linhas = [["Departamento", "Inicial", "Atual", "Real", "Real vs Atual"]];
      deps.forEach(d => {
        const a = vP(ini, d), b = vP(atu, d), r = temReal && real.dep[d] ? (campo === "custo" ? real.dep[d].custo : real.dep[d].hc) : "";
        linhas.push([d, Math.round(a), Math.round(b), r === "" ? "" : Math.round(r), r === "" ? "" : Math.round(r - b)]);
      });
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(linhas), "ControloGestao");
      X.writeFile(wb, "Verdelago_ControloGestao_" + M.lente + "_" + MESES[M.mesIdx] + "_" + M.eixo + ".xlsx");
      badge("connected"); toast("Exportado.");
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  })();
}
