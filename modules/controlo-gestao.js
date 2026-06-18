// ============================================================================
// controlo-gestao.js — Controlo de Gestão (execução do orçamento)
// ----------------------------------------------------------------------------
// Compara, por mês: VERSÃO INICIAL · VERSÃO ATUAL · REAL.
// Lentes: Mês · YTD (acumulado Jan→mês) · Meses seguintes.
// Dimensão: por Departamento ou por Função (toggle).
// O REAL de cada mês é calculado pelas datas de entrada/saída das pessoas:
//   conta quem está em casa + quem está a chegar (entrada até esse mês) e
//   desconta quem já saiu. Assim vê-se qualquer mês, incluindo futuros (ex.: Ago).
// Custo real = Custo Mensal Real. Nomes alinhados ao plano pelas Correspondências.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import * as graph from "../core/graph.js";
import { dados, funcaoDaPessoa, moduloDaPessoa } from "../core/store.js";
import { carregarCorrespondencias, canonDepartamento, canonFuncao } from "../core/correspondencias.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const norm = s => String(s || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const eurK = n => "€ " + Math.round(n / 1000).toLocaleString("pt-PT") + "k";

const M = {
  plano: null, colMap: null, erro: null,
  versoes: [], inicial: null, atual: null,
  lente: "mes", eixo: "custo", dim: "dep", mesIdx: new Date().getMonth(),
  ano: new Date().getFullYear(),
};

function getter(colunas) { const by = {}; colunas.forEach(c => by[norm(c.displayName)] = c.name); return d => by[norm(d)] || d; }

// --- deteção dinâmica das colunas de data (entrada / saída) ----------------
let _ent, _sai;
function campoData(tipo) {
  if (tipo === "ent" && _ent !== undefined) return _ent;
  if (tipo === "sai" && _sai !== undefined) return _sai;
  const reEnt = /entrad|admiss|inici|chegad|in[ií]cio/i, reSai = /sa[ií]d|fim|termo|cessa|despedi/i;
  const re = tipo === "ent" ? reEnt : reSai, anti = tipo === "ent" ? reSai : reEnt;
  let achado = null;
  for (const p of dados.pessoas) { const k = Object.keys(p).find(k => /data|date|dt/i.test(k) && re.test(k) && !anti.test(k)); if (k) { achado = k; break; } }
  if (!achado) for (const p of dados.pessoas) { const k = Object.keys(p).find(k => re.test(k) && !anti.test(k)); if (k) { achado = k; break; } }
  if (tipo === "ent") _ent = achado; else _sai = achado;
  return achado;
}
const parseD = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };

// pessoa está ativa no mês (ano, mi)? usa datas de entrada/saída + estado
function ativaNoMes(p, ano, mi) {
  const est = (p.Estado || "").toLowerCase();
  const ini = new Date(ano, mi, 1), fim = new Date(ano, mi + 1, 0, 23, 59);
  const de = campoData("ent") ? parseD(p[campoData("ent")]) : null;
  const ds = campoData("sai") ? parseD(p[campoData("sai")]) : null;
  if (de && de > fim) return false;        // ainda não entrou nesse mês
  if (ds && ds < ini) return false;        // já tinha saído
  if (!de) {                               // sem data de entrada conhecida
    if (est.includes("cheg")) return false;  // "por chegar" sem data: não dá para situar
    if (est.includes("inativ")) return false;
  }
  return true;
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
    const selVer = (val, onCh) => el("select", { class: "campo", style: "max-width:180px", onchange: e => { onCh(e.target.value); self.render(core, alvo); } },
      ...M.versoes.map(v => el("option", { value: v, ...(v === val ? { selected: "selected" } : {}) }, v)));
    const selMes = el("select", { class: "campo", style: "max-width:110px", onchange: e => { M.mesIdx = +e.target.value; self.render(core, alvo); } },
      ...MESES.map((m, i) => el("option", { value: i, ...(i === M.mesIdx ? { selected: "selected" } : {}) }, m)));
    const lente = (id, txt) => el("button", { class: "sub-tab" + (M.lente === id ? " ativo" : ""), onclick: () => { M.lente = id; self.render(core, alvo); } }, txt);
    const dimBtn = el("button", { class: "btn-sec", onclick: () => { M.dim = M.dim === "dep" ? "funcao" : "dep"; self.render(core, alvo); } }, M.dim === "dep" ? "Ver por função" : "Ver por departamento");
    const eixoBtn = el("button", { class: "btn-sec", onclick: () => { M.eixo = M.eixo === "custo" ? "hc" : "custo"; self.render(core, alvo); } }, M.eixo === "custo" ? "Ver HC" : "Ver custo");

    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "Controlo de Gestão"),
        el("p", { class: "mut" }, "Execução do orçamento: inicial vs atual vs real, por mês, acumulado (YTD) e meses seguintes. O real de cada mês considera quem está em casa e quem está a chegar.")),
      el("div", { class: "barra-acoes" },
        el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Versão inicial"), selVer(M.inicial, v => M.inicial = v)),
        el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Versão atual"), selVer(M.atual, v => M.atual = v)),
        el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Mês"), selMes),
        dimBtn, eixoBtn),
      el("div", { class: "sub-tabs" }, lente("mes", "Mês"), lente("ytd", "YTD (acumulado)"), lente("seguintes", "Meses seguintes")),
      corpo);
    vista(corpo);
  }
};

// plano de uma versão, agrupado pela dimensão escolhida (dep|funcao)
function planoVersao(versao, dim) {
  const cm = M.colMap, linhas = M.plano.filter(l => l[cm.versao] === versao);
  const totHC = Array(12).fill(0), totCusto = Array(12).fill(0), grupo = {};
  for (const l of linhas) {
    const chave = dim === "funcao"
      ? (canonFuncao(l[cm.categoria] || l[cm.nome] || "—") || "—")
      : (canonDepartamento(l[cm.departamento] || "—") || "—");
    (grupo[chave] = grupo[chave] || { hc: Array(12).fill(0), custo: Array(12).fill(0) });
    for (let i = 0; i < 12; i++) {
      const h = Number(l[cm.hc[i]] || 0), c = Number(l[cm.custo[i]] || 0);
      totHC[i] += h; totCusto[i] += c; grupo[chave].hc[i] += h; grupo[chave].custo[i] += c;
    }
  }
  return { totHC, totCusto, grupo };
}

// real de UM mês (ano, mi) por dimensão — via datas de entrada/saída
function realMes(ano, mi, dim) {
  const grupo = {}; let hc = 0, custo = 0;
  for (const p of dados.pessoas) {
    if (!ativaNoMes(p, ano, mi)) continue;
    const f = funcaoDaPessoa(p);
    const chave = dim === "funcao"
      ? (canonFuncao((f && f.Nome) || "—") || "—")
      : (canonDepartamento((f && f.Departamento) || moduloDaPessoa(p) || "—") || "—");
    const c = Number(p.CustoMensalReal || p.Custo || 0);
    (grupo[chave] = grupo[chave] || { hc: 0, custo: 0 });
    grupo[chave].hc += 1; grupo[chave].custo += c; hc += 1; custo += c;
  }
  return { grupo, hc, custo };
}

// real agregado sobre vários meses (soma) — por dimensão
function realAgregado(ano, meses, dim) {
  const grupo = {}; let hc = 0, custo = 0;
  for (const mi of meses) {
    const r = realMes(ano, mi, dim);
    hc += r.hc; custo += r.custo;
    for (const k in r.grupo) { (grupo[k] = grupo[k] || { hc: 0, custo: 0 }); grupo[k].hc += r.grupo[k].hc; grupo[k].custo += r.grupo[k].custo; }
  }
  return { grupo, hc, custo };
}

function vista(corpo) {
  const dim = M.dim;
  const ini = planoVersao(M.inicial, dim), atu = planoVersao(M.atual, dim);
  const campo = M.eixo === "custo" ? "custo" : "hc";
  const fmt = M.eixo === "custo" ? eurK : (n => Math.round(n) + "");
  const i = M.mesIdx;

  let meses, titulo;
  if (M.lente === "mes") { meses = [i]; titulo = "Mês de " + MESES[i]; }
  else if (M.lente === "ytd") { meses = Array.from({ length: i + 1 }, (_, k) => k); titulo = "Acumulado Jan–" + MESES[i] + " (YTD)"; }
  else { meses = Array.from({ length: 12 - (i + 1) }, (_, k) => i + 1 + k); titulo = "Meses seguintes (" + (MESES[i + 1] || "—") + "–Dez)"; }

  const real = realAgregado(M.ano, meses, dim);
  const arred = x => M.eixo === "hc" ? Math.round(x) : x;   // HC em inteiros, p/ o desvio bater com o que se vê
  const somaPlano = pl => meses.reduce((s, m) => s + (campo === "custo" ? pl.totCusto[m] : pl.totHC[m]), 0);
  const iniTot = arred(somaPlano(ini)), atuTot = arred(somaPlano(atu));
  const realTot = arred(campo === "custo" ? real.custo : real.hc);

  const kpi = (v, l, s, cls) => el("div", { class: "orc-kpi " + (cls || "") }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null);
  const desvio = (a, b) => { const d = a - b, pc = b ? Math.round(100 * d / b) : 0; return (d >= 0 ? "+" : "") + fmt(d) + " (" + (d >= 0 ? "+" : "") + pc + "%)"; };
  const ehFuturo = meses.every(m => m > new Date().getMonth());
  const kpis = el("div", { class: "orc-kpis" },
    kpi(fmt(iniTot), "Versão inicial · " + M.inicial, titulo),
    kpi(fmt(atuTot), "Versão atual · " + M.atual, "vs inicial: " + desvio(atuTot, iniTot), "fixo"),
    kpi(fmt(realTot), ehFuturo ? "Real projetado" : "Real", (ehFuturo ? "em casa + a chegar · " : "") + "vs atual: " + desvio(realTot, atuTot)));

  const grupos = [...new Set([...Object.keys(ini.grupo), ...Object.keys(atu.grupo), ...Object.keys(real.grupo)])].sort();
  const vP = (pl, k) => meses.reduce((s, m) => s + (pl.grupo[k] ? (campo === "custo" ? pl.grupo[k].custo[m] : pl.grupo[k].hc[m]) : 0), 0);
  const vR = k => real.grupo[k] ? (campo === "custo" ? real.grupo[k].custo : real.grupo[k].hc) : 0;

  const cabDim = dim === "funcao" ? "Função" : "Departamento";
  const cab = el("tr", {}, el("th", { class: "rot" }, cabDim), el("th", {}, "Inicial"), el("th", {}, "Atual"), el("th", {}, ehFuturo ? "Real proj." : "Real"), el("th", {}, "Real vs Atual"));
  const linhas = grupos.map(k => {
    const a = arred(vP(ini, k)), b = arred(vP(atu, k)), r = arred(vR(k)), dv = r - b;
    return el("tr", {},
      el("td", { class: "rot" }, k), el("td", {}, fmt(a)), el("td", {}, fmt(b)), el("td", {}, fmt(r)),
      el("td", { style: "color:" + (dv > 0 ? "var(--danger)" : dv < 0 ? "var(--gold)" : "var(--mut)") }, (dv >= 0 ? "+" : "") + fmt(dv)));
  });
  const iniT = arred(iniTot), atuT = arred(atuTot), realT = arred(realTot), dvT = realT - atuT;
  const totRow = el("tr", { style: "font-weight:700;border-top:2px solid var(--line)" },
    el("td", { class: "rot" }, "Total"), el("td", {}, fmt(iniT)), el("td", {}, fmt(atuT)), el("td", {}, fmt(realT)),
    el("td", {}, (dvT >= 0 ? "+" : "") + fmt(dvT)));
  const tabela = el("table", { class: "orc-tab", style: "width:100%" }, el("thead", {}, cab), el("tbody", {}, ...linhas, totRow));

  const semDatas = !campoData("ent");
  const nota = el("div", { class: "mod-nota" },
    semDatas
      ? "Não encontrei coluna de data de entrada nas Pessoas — o real está a contar todas as pessoas ativas em todos os meses. Preenche a data de entrada (e saída) para a projeção mensal ser exata."
      : (ehFuturo
        ? "Real projetado: quem está em casa mais quem está a chegar até esse mês (pela data de entrada), menos quem já saiu. Custo pelo Custo Mensal Real."
        : "Real: pessoas ativas no mês (datas de entrada/saída) e Custo Mensal Real, alinhados ao plano pelas Correspondências."));

  corpo.replaceChildren(kpis,
    el("div", { class: "esc-sec", style: "overflow:auto" }, el("h3", {}, titulo + " · por " + (dim === "funcao" ? "função" : "departamento") + (M.eixo === "custo" ? " — custo" : " — HC")), tabela),
    nota,
    el("div", { class: "barra-acoes" }, el("button", { class: "btn-sec", onclick: () => exportar(grupos, ini, atu, real, meses, cabDim) }, "Exportar Excel")));
}

function exportar(grupos, ini, atu, real, meses, cabDim) {
  (async () => {
    try {
      badge("syncing");
      await new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("Excel")); document.head.append(s); });
      const X = window.XLSX, campo = M.eixo;
      const vP = (pl, k) => meses.reduce((s, m) => s + (pl.grupo[k] ? (campo === "custo" ? pl.grupo[k].custo[m] : pl.grupo[k].hc[m]) : 0), 0);
      const linhas = [[cabDim, "Inicial", "Atual", "Real", "Real vs Atual"]];
      grupos.forEach(k => {
        const a = vP(ini, k), b = vP(atu, k), r = real.grupo[k] ? (campo === "custo" ? real.grupo[k].custo : real.grupo[k].hc) : 0;
        linhas.push([k, Math.round(a), Math.round(b), Math.round(r), Math.round(r - b)]);
      });
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(linhas), "ControloGestao");
      X.writeFile(wb, "Verdelago_ControloGestao_" + M.lente + "_" + MESES[M.mesIdx] + "_" + M.dim + "_" + M.eixo + ".xlsx");
      badge("connected"); toast("Exportado.");
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  })();
}
