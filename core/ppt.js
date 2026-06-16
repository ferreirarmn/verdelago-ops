// ============================================================================
// ppt.js — Exportação de dashboards de gestão em PowerPoint (no browser)
// ----------------------------------------------------------------------------
// Três decks, com identidade visual Verdelago:
//   · exportarPPTGeral()  — visão de toda a unidade
//   · exportarPPTFB()     — Food & Beverage em detalhe
//   · exportarPPTHSK()    — Housekeeping em detalhe
//
// Usa PptxGenJS servido localmente (lib/pptxgen.bundle.js) — sem CDN. Os dados
// vêm do núcleo em memória (Pessoas/Funções) + Presenças/Camas via Graph +
// budget_base.json. Quando um dado não existe, o cartão mostra "—" em vez de
// quebrar. Gráficos são nativos do PptxGenJS (donut + barras), editáveis no
// PowerPoint.
// ============================================================================

import { toast, badge } from "./ui.js";
import { dados, pessoasDoModulo, pessoasGeral, moduloDaPessoa } from "./store.js";
import * as graph from "./graph.js";

// ---- paleta Verdelago (alinhada com o design system v2) --------------------
const TEAL = "0C4B46", TEAL2 = "11857A", TEALD = "06322E", MINT = "19B89A";
const GOLD = "A6824A", GOLDD = "84693B", AMBER = "B36F2D", DANGER = "B34B4B";
const INK = "19211F", MUT = "5E6B67", FAINT = "92A09A";
const LINE = "E2E6DF", SOFT = "EDF0EA", SOFTER = "F7F8F5", PAPER = "F2F4F0", CARD = "FFFFFF";
const SERIE = [TEAL2, GOLD, MINT, AMBER, "6A5FB0", "3667B0", DANGER, FAINT]; // donuts/barras

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const HOJE = () => new Date();
const normTxt = s => String(s || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const DEPS_FB = ["BAR", "COZINHA", "COPA", "PASTELARIA", "RESTAURANTE"];
const DEPS_HSK = ["HOUSEKEEPING"];

// ---- agregações do Plano (Lista Orçamento) por grupo de departamentos -----
function planoLinhas(D, depsNorm) {
  if (!D.plano) return [];
  const cm = D.planoCol;
  return D.plano.filter(l => depsNorm.includes(normTxt(l[cm.departamento])));
}
function planoHC(D, depsNorm, mesIdx) {
  const cm = D.planoCol;
  return planoLinhas(D, depsNorm).reduce((s, l) => s + (Number(l[cm.hc[mesIdx]]) || 0), 0);
}
function planoPorFuncao(D, depsNorm, mesIdx) {
  const cm = D.planoCol; const m = {};
  planoLinhas(D, depsNorm).forEach(l => {
    const f = (l[cm.categoria] || "—").trim() || "—";
    m[f] = (m[f] || 0) + (Number(l[cm.hc[mesIdx]]) || 0);
  });
  return m;
}
const dataLonga = d => d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dataCurta = d => d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
const eur = n => "€ " + Math.round(n).toLocaleString("pt-PT");
const eurK = n => "€ " + Math.round(n / 1000).toLocaleString("pt-PT") + "k";
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const ativa = p => !String(p.Estado || "").toLowerCase().includes("inativ");
const cap = s => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);

// mapear departamento (do ficheiro de custos) -> grupo da app
function grupoDoDepartamento(dep) {
  const d = (dep || "").toUpperCase();
  if (d.includes("HOUSEKEEP")) return "HSK";
  if (["COZINHA", "COPA", "PASTELARIA", "RESTAURANTE", "BAR"].some(x => d.includes(x))) return "F&B";
  if (d.includes("SPORT") || d.includes("ANIMA") || d.includes("NAUTIC") || d.includes("RECREAT")) return "REC";
  return "SC";
}
const grupoDaPessoa = p => { const m = moduloDaPessoa(p); return m === "HSK" ? "HSK" : m === "F&B" ? "F&B" : m === "Náutico" ? "REC" : "SC"; };

const GRUPOS = [
  { nome: "Housekeeping", chave: "HSK", pessoas: () => pessoasDoModulo("HSK") },
  { nome: "F&B", chave: "F&B", pessoas: () => pessoasDoModulo("F&B") },
  { nome: "Recreativo", chave: "REC", pessoas: () => pessoasDoModulo("Náutico") },
  { nome: "Serviços Centrais", chave: "SC", pessoas: () => pessoasGeral() },
];

// ---------------------------------------------------------------------------
function carregarPptx() {
  return new Promise((res, rej) => {
    if (window.PptxGenJS) return res();
    const s = document.createElement("script"); s.src = "lib/pptxgen.bundle.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar o gerador de PowerPoint."));
    document.head.append(s);
  });
}

// ---- recolher dados base (partilhado pelos três decks) --------------------
async function recolher() {
  const mesIso = HOJE().toISOString().slice(0, 7);
  let presencas = [], camas = [], budget = null;
  try { presencas = await graph.lerLista("Presenças"); } catch {}
  try { camas = await graph.lerLista("Camas"); } catch {}
  try { budget = await (await fetch("budget_base.json?" + Date.now())).json(); } catch {}

  // Plano congelado (Lista Orçamento) — resolve nomes internos das colunas
  let plano = null, planoCol = null;
  try {
    const [linhas, colunas] = await Promise.all([graph.lerLista("Orçamento"), graph.colunasDaLista("Orçamento")]);
    const byD = {}; colunas.forEach(c => byD[normTxt(c.displayName)] = c.name);
    const get = d => byD[normTxt(d)] || d;
    planoCol = {
      versao: get("Versao"), tipo: get("TipoLinha"), nome: get("Nome"),
      categoria: get("Categoria"), departamento: get("Departamento"), vinculo: get("Vinculo"),
      hc: MESES.map(m => get("HC_" + m)), custo: MESES.map(m => get("Custo_" + m))
    };
    // versão mais recente
    const versoes = [...new Set(linhas.map(l => l[planoCol.versao]).filter(Boolean))].sort();
    const v = versoes[versoes.length - 1] || null;
    plano = linhas.filter(l => !v || l[planoCol.versao] === v);
  } catch { /* sem Lista Orçamento: dashboards funcionam sem o Plano */ }

  const idGrupo = {}; for (const p of dados.pessoas) idGrupo[p.Title] = grupoDaPessoa(p);

  const assid = {}; GRUPOS.forEach(g => assid[g.chave] = { P: 0, F: 0, FO: 0 });
  for (const m of presencas) {
    if (!String(m.Data || "").startsWith(mesIso)) continue;
    const g = idGrupo[m.PessoaID]; if (!g) continue;
    const e = String(m.Estado || "").toLowerCase();
    if (e.includes("present")) assid[g].P++; else if (e.includes("falt")) assid[g].F++; else if (e.includes("folg")) assid[g].FO++;
  }
  const aloj = {}; GRUPOS.forEach(g => aloj[g.chave] = 0);
  for (const c of camas) { if (!c.PessoaID) continue; const g = idGrupo[c.PessoaID]; if (g) aloj[g]++; }

  const custo = {}; GRUPOS.forEach(g => custo[g.chave] = { anual: 0, fixo: 0, picoHC: 0 });
  if (budget) {
    for (const l of budget.linhas) {
      const g = grupoDoDepartamento(l.departamento);
      custo[g].anual += l.anual || 0;
      if (String(l.vinculo).toUpperCase() === "QUADRO") custo[g].fixo += l.anual || 0;
    }
    GRUPOS.forEach(g => { custo[g.chave].picoHC = Math.max(0, ...MESES.map((_, i) => budget.linhas.filter(l => grupoDoDepartamento(l.departamento) === g.chave).reduce((s, l) => s + (l.hc[i] || 0), 0))); });
  }
  return { mesIso, mesIdx: HOJE().getMonth(), presencas, camas, assid, aloj, custo, temBudget: !!budget, plano, planoCol, temPlano: !!plano };
}

// agregações reutilizáveis sobre uma lista de pessoas (já filtradas/ativas)
function porChave(pessoas, campo) {
  const m = {}; pessoas.forEach(p => { const k = (p[campo] || "—").trim() || "—"; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
// vínculo normalizado -> rótulo curto
function classeVinculo(v) {
  const s = (v || "").toUpperCase();
  if (s.includes("QUADRO")) return "Quadro";
  if (s.includes("SAZON")) return "Sazonal";
  if (s.includes("ESTÁG") || s.includes("ESTAG")) return "Estágio";
  if (s) return "TT";
  return "—";
}

// ============================================================================
//  FÁBRICA DE SLIDES — helpers de layout partilhados pelos três decks
// ============================================================================
function novaApresentacao(pptx) {
  pptx.defineLayout({ name: "VDL", width: 13.333, height: 7.5 });
  pptx.layout = "VDL";
  pptx.theme = { headFontFace: "Cambria", bodyFontFace: "Calibri" };
}

function fabrica(pptx) {
  const F = {};
  const W = 13.333, MARGEM = 0.55, LARG = W - 2 * MARGEM;

  // rodapé discreto (sem barra) — alinhado ao estilo dos anexos
  F.rodape = (s, n, total) => {
    s.addText("Verdelago · Operações", { x: MARGEM, y: 7.08, w: 5, h: 0.3, fontSize: 9, color: FAINT, align: "left" });
    s.addText(dataCurta(HOJE()), { x: W / 2 - 2.5, y: 7.08, w: 5, h: 0.3, fontSize: 9, color: FAINT, align: "center" });
    if (n) s.addText(n + " / " + total, { x: W - MARGEM - 2, y: 7.08, w: 2, h: 0.3, fontSize: 9, color: FAINT, align: "right" });
  };

  // eyebrow (rótulo uppercase) + título de secção
  F.cabSeccao = (s, eyebrow, titulo, sub) => {
    s.addText((eyebrow || "").toUpperCase(), { x: MARGEM, y: 0.42, w: LARG, h: 0.3, fontSize: 11, bold: true, color: TEAL2, charSpacing: 2 });
    s.addText(titulo, { x: MARGEM, y: 0.7, w: LARG, h: 0.6, fontSize: 27, bold: true, color: INK, fontFace: "Cambria" });
    if (sub) s.addText(sub, { x: MARGEM, y: 1.3, w: LARG, h: 0.4, fontSize: 14, color: MUT });
  };

  // cartão KPI (rótulo em cima, número grande, sub em baixo) — sem barra lateral
  F.kpi = (s, x, y, w, valor, label, sub, corNum) => {
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 1.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
    s.addText((label || "").toUpperCase(), { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.3, fontSize: 10, bold: true, color: FAINT, charSpacing: 1 });
    s.addText("" + valor, { x: x + 0.2, y: y + 0.42, w: w - 0.4, h: 0.6, fontSize: 33, bold: true, color: corNum || INK, fontFace: "Cambria" });
    if (sub) s.addText(sub, { x: x + 0.22, y: y + 1.08, w: w - 0.44, h: 0.32, fontSize: 11, color: MUT });
  };

  // fila de N KPIs distribuída na largura útil
  F.filaKpis = (s, y, itens) => {
    const gap = 0.25, n = itens.length;
    const w = (LARG - gap * (n - 1)) / n;
    itens.forEach((it, i) => F.kpi(s, MARGEM + i * (w + gap), y, w, it.v, it.l, it.s, it.cor));
  };

  // donut nativo (editável no PowerPoint)
  F.donut = (s, x, y, w, h, titulo, pares, total) => {
    s.addText(titulo.toUpperCase(), { x, y, w, h: 0.3, fontSize: 10, bold: true, color: FAINT, charSpacing: 1 });
    const labels = pares.map(p => p[0]), valores = pares.map(p => p[1]);
    s.addChart(pptx.ChartType.doughnut, [{ name: titulo, labels, values: valores }], {
      x, y: y + 0.35, w, h: h - 0.35, holeSize: 62,
      chartColors: pares.map((_, i) => SERIE[i % SERIE.length]),
      showLegend: true, legendPos: "r", legendFontSize: 10, legendColor: INK,
      showValue: false, dataLabelColor: "FFFFFF", dataLabelFontSize: 9,
      showTitle: false,
    });
    if (total != null) s.addText("" + total, { x: x + 0.02, y: y + h / 2 - 0.05, w: w * 0.52, h: 0.5, fontSize: 22, bold: true, color: INK, align: "center", fontFace: "Cambria" });
  };

  // barras horizontais nativas
  F.barras = (s, x, y, w, h, titulo, pares, cor) => {
    s.addText(titulo.toUpperCase(), { x, y, w, h: 0.3, fontSize: 10, bold: true, color: FAINT, charSpacing: 1 });
    s.addChart(pptx.ChartType.bar, [{ name: titulo, labels: pares.map(p => p[0]), values: pares.map(p => p[1]) }], {
      x, y: y + 0.35, w, h: h - 0.35, barDir: "bar",
      chartColors: [cor || TEAL2], showLegend: false, showTitle: false,
      catAxisLabelColor: INK, catAxisLabelFontSize: 10,
      valAxisHidden: true, valGridLine: { style: "none" },
      showValue: true, dataLabelColor: MUT, dataLabelFontSize: 10, dataLabelPosition: "outEnd",
      barGapWidthPct: 40,
    });
  };

  // tabela com cabeçalho teal
  F.cab = arr => arr.map(t => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: TEAL }, fontSize: 11, align: "left" } }));
  F.tabela = (s, linhas, opts) => s.addTable(linhas, {
    border: { type: "solid", color: LINE, pt: 1 }, fontSize: 12, color: INK,
    fontFace: "Calibri", valign: "middle", autoPage: false, ...opts
  });

  // “card” de bloco com fundo subtil (para agrupamentos tipo Restaurante/Cozinha)
  F.bloco = (s, x, y, w, h, fill) => s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill || SOFTER }, line: { color: LINE, width: 1 }, rectRadius: 0.06 });

  // nota / destaque (caixa âmbar suave)
  F.nota = (s, x, y, w, h, titulo, texto) => {
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: "FBF3E6" }, line: { color: "EAD9B8", width: 1 }, rectRadius: 0.06 });
    s.addText(titulo, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.35, fontSize: 13, bold: true, color: GOLDD, fontFace: "Cambria" });
    s.addText(texto, { x: x + 0.2, y: y + 0.52, w: w - 0.4, h: h - 0.65, fontSize: 12, color: TEALD, valign: "top", lineSpacingMultiple: 1.05 });
  };

  // capa escura, com KPIs em destaque (estilo do anexo F&B)
  F.capa = (s, eyebrow, titulo, sub, kpis) => {
    s.background = { color: TEALD };
    // monograma "lagoa" no canto
    s.addShape(pptx.ShapeType.donut, { x: 10.4, y: -1.2, w: 4.6, h: 4.6, fill: { color: "FFFFFF" }, transparency: 92, line: { type: "none" } });
    s.addShape(pptx.ShapeType.donut, { x: 11.3, y: 4.6, w: 3.6, h: 3.6, fill: { color: GOLD }, transparency: 86, line: { type: "none" } });
    s.addText((eyebrow || "").toUpperCase(), { x: MARGEM, y: 1.7, w: 8, h: 0.4, fontSize: 13, bold: true, color: MINT, charSpacing: 3 });
    s.addText(titulo, { x: MARGEM, y: 2.15, w: 9, h: 1.3, fontSize: 46, bold: true, color: "FFFFFF", fontFace: "Cambria" });
    if (sub) s.addText(sub, { x: MARGEM + 0.02, y: 3.5, w: 9, h: 0.5, fontSize: 16, color: "CFE0DC" });
    // fila de KPIs sobre fundo escuro
    const gap = 0.3, n = kpis.length, w = (LARG - gap * (n - 1)) / n, y = 4.7;
    kpis.forEach((k, i) => {
      const x = MARGEM + i * (w + gap);
      s.addText("" + k.v, { x, y, w, h: 0.8, fontSize: 40, bold: true, color: i === 0 ? MINT : "FFFFFF", fontFace: "Cambria", align: "left" });
      s.addText((k.l || "").toUpperCase(), { x: x + 0.02, y: y + 0.85, w, h: 0.3, fontSize: 11, color: "9DC3BB", charSpacing: 1 });
    });
    s.addText("Blue & Green Corp  ·  " + dataLonga(HOJE()).replace(/^\w/, c => c.toUpperCase()), { x: MARGEM, y: 6.7, w: 11, h: 0.4, fontSize: 12, color: "9DC3BB" });
  };

  F.MARGEM = MARGEM; F.LARG = LARG; F.W = W;
  return F;
}

// ============================================================================
//  DECK 1 — GERAL (toda a unidade)
// ============================================================================
async function gerarGeral(pptx, D) {
  const F = fabrica(pptx);
  const todas = dados.pessoas.filter(ativa);
  const totalP = Object.values(D.assid).reduce((a, b) => a + b.P, 0);
  const totalF = Object.values(D.assid).reduce((a, b) => a + b.F, 0);
  const assidPct = (totalP + totalF) ? pct(totalP, totalP + totalF) + "%" : "—";
  const alojTot = Object.values(D.aloj).reduce((a, b) => a + b, 0);
  const custoTot = Object.values(D.custo).reduce((a, b) => a + b.anual, 0);
  const fixoTot = Object.values(D.custo).reduce((a, b) => a + b.fixo, 0);
  let n = 0; const TOT = 4;

  // 1) capa
  let s = pptx.addSlide(); n++;
  F.capa(s, "Verdelago · Operações", "Painel de gestão", "Pessoas, assiduidade, alojamento e custos da unidade", [
    { v: todas.length, l: "Efetivos ativos" },
    { v: assidPct, l: "Assiduidade (mês)" },
    { v: alojTot, l: "Alojados" },
    { v: D.temBudget ? eurK(custoTot) : "—", l: "Custo anual" },
  ]);

  // 2) visão global — KPIs + donut por departamento + donut por vínculo
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Visão geral", "Onde está a unidade hoje", cap(dataLonga(HOJE())));
  F.filaKpis(s, 1.85, [
    { v: todas.length, l: "Efetivos ativos", s: GRUPOS.map(g => g.pessoas().filter(ativa).length).reduce((a, b) => a + b, 0) + " em " + GRUPOS.length + " áreas" },
    { v: assidPct, l: "Assiduidade", s: totalP + " presenças · " + totalF + " faltas" },
    { v: alojTot, l: "Alojados", s: "em camas da unidade" },
    { v: D.temBudget ? eurK(custoTot) : "—", l: "Custo anual", s: D.temBudget ? (pct(fixoTot, custoTot) + "% fixo (quadro)") : "sem orçamento", cor: GOLDD },
  ]);
  const porDept = GRUPOS.map(g => [g.nome, g.pessoas().filter(ativa).length]).filter(p => p[1] > 0);
  const porVinc = porChave(todas.map(p => ({ Vinculo: classeVinculo(p.Vinculo) })), "Vinculo");
  F.donut(s, F.MARGEM, 3.7, 5.9, 3.0, "Pessoas por departamento", porDept, todas.length);
  F.donut(s, F.MARGEM + 6.3, 3.7, 5.9, 3.0, "Pessoas por vínculo", porVinc, todas.length);
  F.rodape(s, n, TOT);

  // 3) departamentos lado a lado — tabela resumo
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Comparativo", "Departamentos em números", "Efetivos, assiduidade, alojamento e custo por área");
  const linhas = [F.cab(["Departamento", "Ativos", "Assiduidade", "Alojados", "Custo anual", "Fixo (quadro)"])];
  GRUPOS.forEach(g => {
    const at = g.pessoas().filter(ativa).length;
    const a = D.assid[g.chave]; const ap = (a.P + a.F) ? pct(a.P, a.P + a.F) + "%" : "—";
    const c = D.custo[g.chave];
    linhas.push([g.nome, "" + at, ap, "" + D.aloj[g.chave], D.temBudget ? eur(c.anual) : "—", D.temBudget ? eur(c.fixo) : "—"]);
  });
  // linha de total
  linhas.push([{ text: "Total", options: { bold: true, fill: { color: SOFT } } },
    { text: "" + todas.length, options: { bold: true, fill: { color: SOFT } } },
    { text: assidPct, options: { bold: true, fill: { color: SOFT } } },
    { text: "" + alojTot, options: { bold: true, fill: { color: SOFT } } },
    { text: D.temBudget ? eur(custoTot) : "—", options: { bold: true, fill: { color: SOFT } } },
    { text: D.temBudget ? eur(fixoTot) : "—", options: { bold: true, fill: { color: SOFT } } }]);
  F.tabela(s, linhas, { x: F.MARGEM, w: F.LARG, y: 1.95, rowH: 0.46, colW: [3.0, 1.5, 2.0, 1.6, 2.1, 2.03], align: "left" });
  // barra de custo por departamento
  if (D.temBudget) {
    const custos = GRUPOS.map(g => [g.nome, Math.round(D.custo[g.chave].anual)]).filter(p => p[1] > 0);
    F.barras(s, F.MARGEM, 4.9, F.LARG, 1.95, "Custo anual por departamento (€)", custos, TEAL2);
  }
  F.rodape(s, n, TOT);

  // 4) resumo escuro
  s = pptx.addSlide(); n++; s.background = { color: TEALD };
  s.addText("EM RESUMO", { x: F.MARGEM, y: 1.5, w: 8, h: 0.4, fontSize: 13, bold: true, color: MINT, charSpacing: 3 });
  s.addText("Onde estamos hoje", { x: F.MARGEM, y: 1.95, w: 11, h: 0.9, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Cambria" });
  const resumo = [
    { v: todas.length, l: "Efetivos ativos", s: "em " + GRUPOS.length + " áreas operacionais e centrais" },
    { v: assidPct, l: "Assiduidade no mês", s: totalP + " presenças contra " + totalF + " faltas" },
    { v: D.temBudget ? eurK(custoTot) : "—", l: "Custo anual de pessoal", s: D.temBudget ? (eurK(fixoTot) + " fixo · " + eurK(custoTot - fixoTot) + " variável") : "carregar orçamento" },
  ];
  const gap = 0.35, w = (F.LARG - gap * 2) / 3, y = 3.4;
  resumo.forEach((r, i) => {
    const x = F.MARGEM + i * (w + gap);
    s.addText("" + r.v, { x, y, w, h: 1, fontSize: 50, bold: true, color: i === 0 ? MINT : "FFFFFF", fontFace: "Cambria" });
    s.addText(r.l, { x: x + 0.02, y: y + 1.05, w, h: 0.35, fontSize: 14, bold: true, color: "E8F1EF" });
    s.addText(r.s, { x: x + 0.02, y: y + 1.45, w, h: 0.8, fontSize: 12, color: "9DC3BB", valign: "top" });
  });
}

// ============================================================================
//  DECK 2 — F&B
// ============================================================================
async function gerarFB(pptx, D) {
  await deckDepartamento(pptx, D, {
    eyebrow: "Verdelago · F&B", titulo: "Food & Beverage",
    modulo: "F&B", deps: DEPS_FB,
    nota: "Composição da equipa, plano vs efetivo, pipeline de entradas e carências por função."
  });
}

// ============================================================================
//  GERADOR PARTILHADO — dashboard de gestão de um departamento
//  Espelha os anexos: capa · visão geral (plano/pessoas/vagas) · entradas por
//  semana · próximas entradas · pipeline · distribuição · plano vs efetivo por
//  função · carências · resumo.
// ============================================================================
async function deckDepartamento(pptx, D, C) {
  const F = fabrica(pptx);
  const ps = pessoasDoModulo(C.modulo).filter(ativa);
  const a = D.assid[C.modulo === "F&B" ? "F&B" : C.modulo === "HSK" ? "HSK" : "F&B"] || { P: 0, F: 0, FO: 0 };
  const assidPct = (a.P + a.F) ? pct(a.P, a.P + a.F) + "%" : "—";
  const mesIdx = D.mesIdx;

  // plano vs real
  const planoTot = D.temPlano ? Math.round(planoHC(D, C.deps, mesIdx)) : null;
  const chegar = porChegar(ps);
  const aChegar = chegar.length;
  const emEscala = ps.filter(p => !String(p.Estado || "").toLowerCase().includes("cheg")).length;
  const vagas = planoTot != null ? Math.max(0, planoTot - ps.length) : null;

  const porEmp = porChave(ps, "EmpresaAgencia").slice(0, 6);
  const porVinc = porChave(ps.map(p => ({ Vinculo: classeVinculo(p.Vinculo) })), "Vinculo");
  let n = 0; const TOT = 9;

  // 1) CAPA
  let s = pptx.addSlide(); n++;
  F.capa(s, C.eyebrow, C.titulo, C.nota, [
    { v: planoTot != null ? planoTot : "—", l: "Plano (mês)" },
    { v: ps.length, l: "Pessoas" },
    { v: emEscala, l: "Em escala" },
    { v: vagas != null ? vagas : "—", l: "Vagas" },
  ]);

  // 2) VISÃO GERAL — 6 KPIs
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Visão geral", "Onde está " + C.titulo + " hoje", cap(dataLonga(HOJE())));
  const tt = ps.filter(p => classeVinculo(p.Vinculo) === "TT").length;
  const quadro = ps.filter(p => classeVinculo(p.Vinculo) === "Quadro").length;
  const saz = ps.filter(p => classeVinculo(p.Vinculo) === "Sazonal").length;
  const est = ps.filter(p => classeVinculo(p.Vinculo) === "Estágio").length;
  F.kpi(s, F.MARGEM, 1.85, 3.85, planoTot != null ? planoTot : "—", "Plano (mês)", vagas != null ? (vagas + " vagas em aberto") : "sem orçamento", GOLDD);
  F.kpi(s, F.MARGEM + 4.1, 1.85, 3.85, ps.length, "Pessoas", [tt + " TT", quadro + " Quadro", saz + " Sazonal", est + " Estágio"].join(" · "));
  F.kpi(s, F.MARGEM + 8.2, 1.85, 4.03, emEscala, "Em escala", "a operar", TEAL2);
  F.kpi(s, F.MARGEM, 3.55, 3.85, aChegar, "A chegar", "próximos a iniciar");
  F.kpi(s, F.MARGEM + 4.1, 3.55, 3.85, D.aloj[C.modulo] || 0, "Alojados", "em camas da unidade");
  F.kpi(s, F.MARGEM + 8.2, 3.55, 4.03, assidPct, "Assiduidade", a.P + " presenças no mês", TEAL2);
  s.addText("Plano = orçamento congelado para " + MESES[mesIdx] + ". Vagas = plano − pessoas atuais.", { x: F.MARGEM, y: 5.5, w: F.LARG, h: 0.4, fontSize: 12, italic: true, color: MUT });
  F.rodape(s, n, TOT);

  // 3) ENTRADAS POR SEMANA (barras)
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Pipeline de entradas", "Entradas por semana", "Pessoas a chegar nas próximas 8 semanas");
  const semanas = entradasPorSemana(chegar, 8);
  F.barras(s, F.MARGEM, 2.0, F.LARG, 4.3, "Entradas previstas por semana", semanas, TEAL2);
  s.addText(aChegar + " entradas no horizonte · " + (semanas[0]?.[1] || 0) + " já esta semana.", { x: F.MARGEM, y: 6.4, w: F.LARG, h: 0.4, fontSize: 12, color: TEALD });
  F.rodape(s, n, TOT);

  // 4) PRÓXIMAS ENTRADAS (lista nominal)
  s = slidePorChegar(F, pptx, C.eyebrow, chegar); n++;
  F.rodape(s, n, TOT);

  // 5) PIPELINE (estados)
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Pipeline", "Estado de cada colaborador", "Da chegada à operação");
  const pipe = [["Em escala", emEscala], ["A chegar", aChegar], ["Vagas por preencher", vagas != null ? vagas : 0]];
  F.barras(s, F.MARGEM, 2.0, F.LARG, 3.6, "Colaboradores por estado", pipe, GOLD);
  F.nota(s, F.MARGEM, 5.9, F.LARG, 1.0, "Leitura", emEscala + " a operar, " + aChegar + " a caminho" + (vagas != null ? " e " + vagas + " vagas ainda por preencher face ao plano." : "."));
  F.rodape(s, n, TOT);

  // 6) DISTRIBUIÇÃO (donuts)
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Distribuição", "Composição da equipa", "Por empresa/agência e por vínculo contratual");
  F.donut(s, F.MARGEM, 1.95, 5.9, 3.0, "Por empresa / agência", porEmp, ps.length);
  F.donut(s, F.MARGEM + 6.3, 1.95, 5.9, 3.0, "Por vínculo", porVinc, ps.length);
  F.nota(s, F.MARGEM, 5.2, F.LARG, 1.4, "Composição", ps.length + " pessoas: " + tt + " via agência (" + pct(tt, ps.length) + "%), " + quadro + " de quadro, " + saz + " sazonais, " + est + " estágios. " + porEmp.length + " fornecedores distintos.");
  F.rodape(s, n, TOT);

  // 7) PLANO VS EFETIVO POR FUNÇÃO (tabela)
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Plano vs efetivo", "Cobertura por função", "Plano (orçamento), efetivo atual e vagas, por função — " + MESES[mesIdx]);
  const realF = funcoesDe(ps);                       // [[nome, n], ...]
  const planoF = D.temPlano ? planoPorFuncao(D, C.deps, mesIdx) : {};
  const chaves = new Set([...realF.map(x => normTxt(x[0])), ...Object.keys(planoF).map(normTxt)]);
  const linhasTab = [];
  const realMap = {}; realF.forEach(([nm, q]) => realMap[normTxt(nm)] = { nome: nm, q });
  const planoMap = {}; Object.entries(planoF).forEach(([nm, q]) => planoMap[normTxt(nm)] = { nome: nm, q });
  for (const k of chaves) {
    const nome = realMap[k]?.nome || planoMap[k]?.nome || k;
    const pl = Math.round(planoMap[k]?.q || 0), re = realMap[k]?.q || 0;
    linhasTab.push({ nome, pl, re, vaga: Math.max(0, pl - re) });
  }
  linhasTab.sort((x, y) => y.vaga - x.vaga || y.pl - x.pl);
  const rows = [F.cab(["Função", "Plano", "Efetivo", "Vagas"])];
  linhasTab.slice(0, 11).forEach(r => rows.push([r.nome, "" + r.pl, "" + r.re,
    { text: r.vaga ? "" + r.vaga : "—", options: { color: r.vaga ? DANGER : MUT, bold: r.vaga > 0 } }]));
  F.tabela(s, rows, { x: F.MARGEM, w: F.LARG, y: 1.95, rowH: 0.42, colW: [6.6, 1.9, 1.9, 1.83], align: "left" });
  F.rodape(s, n, TOT);

  // 8) FUNÇÕES COM MAIOR CARÊNCIA (barras de gap)
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Carências", "Funções com maior carência", "Vagas por função (plano − efetivo)");
  const gaps = linhasTab.filter(r => r.vaga > 0).slice(0, 9).map(r => [r.nome, r.vaga]);
  if (gaps.length) {
    F.barras(s, F.MARGEM, 2.0, 7.6, 4.5, "Vagas por função", gaps.slice().reverse(), DANGER);
    const top = gaps[0];
    F.nota(s, 8.55, 2.0, F.W - F.MARGEM - 8.55, 2.1, "Maior carência", top[0] + " precisa de mais " + top[1] + " pessoa(s) face ao plano de " + MESES[mesIdx] + ".");
    const totalGap = gaps.reduce((s2, g) => s2 + g[1], 0);
    F.nota(s, 8.55, 4.35, F.W - F.MARGEM - 8.55, 2.15, "Total", "Faltam " + totalGap + " pessoas para cumprir o plano nas funções com carência. Prioridade de recrutamento e escala.");
  } else {
    s.addText(D.temPlano ? "Sem carências face ao plano deste mês." : "Sem Lista Orçamento — não é possível calcular carências.", { x: F.MARGEM, y: 2.3, w: F.LARG, h: 0.6, fontSize: 15, color: MUT });
  }
  F.rodape(s, n, TOT);

  // 9) RESUMO escuro
  s = pptx.addSlide(); n++; s.background = { color: TEALD };
  s.addText("EM RESUMO", { x: F.MARGEM, y: 1.4, w: 8, h: 0.4, fontSize: 13, bold: true, color: MINT, charSpacing: 3 });
  s.addText("Onde estamos hoje", { x: F.MARGEM, y: 1.85, w: 11, h: 0.9, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Cambria" });
  const resumo = [
    { v: emEscala, l: "Em escala", s: "a operar" + (planoTot != null ? " · plano " + planoTot : "") },
    { v: aChegar, l: "A chegar", s: "próximos a iniciar" },
    { v: vagas != null ? vagas : "—", l: "Vagas em aberto", s: vagas ? "recrutamento prioritário" : "plano coberto" },
  ];
  const gap = 0.35, w = (F.LARG - gap * 2) / 3, y = 3.3;
  resumo.forEach((r, i) => {
    const x = F.MARGEM + i * (w + gap);
    s.addText("" + r.v, { x, y, w, h: 1, fontSize: 52, bold: true, color: i === 0 ? MINT : "FFFFFF", fontFace: "Cambria" });
    s.addText(r.l, { x: x + 0.02, y: y + 1.05, w, h: 0.35, fontSize: 14, bold: true, color: "E8F1EF" });
    s.addText(r.s, { x: x + 0.02, y: y + 1.45, w, h: 0.8, fontSize: 12, color: "9DC3BB", valign: "top" });
  });
  F.rodape(s, n, TOT);
}

// entradas (pessoas a chegar) agrupadas por semana, próximas N semanas
function entradasPorSemana(lista, n) {
  const seg = d => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
  const base = seg(new Date());
  const buckets = Array.from({ length: n }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i * 7); return d; });
  const rotulo = (d, i) => i === 0 ? "Esta sem." : String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  const cont = buckets.map(() => 0);
  for (const it of lista) {
    if (!it.data) continue;
    const di = seg(it.data).getTime();
    const idx = buckets.findIndex(b => b.getTime() === di);
    if (idx >= 0) cont[idx]++;
  }
  return buckets.map((d, i) => [rotulo(d, i), cont[i]]);
}
async function gerarHSK(pptx, D) {
  const F = fabrica(pptx);
  const ps = pessoasDoModulo("HSK").filter(ativa);
  const a = D.assid["HSK"] || { P: 0, F: 0, FO: 0 };
  const assidPct = (a.P + a.F) ? pct(a.P, a.P + a.F) + "%" : "—";
  const mesIdx = D.mesIdx;
  const tt = ps.filter(p => classeVinculo(p.Vinculo) === "TT").length;
  const interno = ps.length - tt;
  const porVinc = porChave(ps.map(p => ({ Vinculo: classeVinculo(p.Vinculo) })), "Vinculo");
  const externos = porChave(ps.filter(p => classeVinculo(p.Vinculo) === "TT"), "EmpresaAgencia");
  const topExt = externos[0];
  const planoTot = D.temPlano ? Math.round(planoHC(D, DEPS_HSK, mesIdx)) : null;
  const vagas = planoTot != null ? Math.max(0, planoTot - ps.length) : null;
  const chegar = porChegar(ps);
  let n = 0; const TOT = 7;

  // 1) CAPA
  let s = pptx.addSlide(); n++;
  F.capa(s, "Verdelago · Housekeeping", "Análise de Gestão da Equipa", "Composição, estrutura de vínculos e dependência de fornecedores", [
    { v: ps.length, l: "Colaboradores" },
    { v: pct(tt, ps.length) + "%", l: "Trabalho temporário" },
    { v: externos.length, l: "Agências externas" },
    { v: vagas != null ? vagas : "—", l: "Vagas (mês)" },
  ]);

  // 2) SUMÁRIO EXECUTIVO — 4 cartões
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Sumário executivo", "Quatro leituras essenciais", "");
  const leituras = [
    { v: ps.length, l: "Dimensão da equipa", s: ps.length + " colaboradores afetos ao Housekeeping, em " + funcoesDe(ps).length + " funções operacionais e de chefia." },
    { v: pct(tt, ps.length) + "%", l: "Forte externalização", s: tt + " dos " + ps.length + " são trabalho temporário (TT). A equipa interna resume-se a " + interno + " pessoas." },
    { v: topExt ? pct(topExt[1], tt) + "%" : "—", l: "Concentração num fornecedor", s: topExt ? (topExt[0] + " concentra " + topExt[1] + " dos " + tt + " recursos externos — mais de metade da capacidade.") : "Sem TT." },
    { v: planoTot != null ? planoTot : "—", l: "Plano do mês", s: planoTot != null ? ("Orçamento de " + planoTot + " para " + MESES[mesIdx] + (vagas ? " — " + vagas + " vagas em aberto." : " — plano coberto.")) : "Sem Lista Orçamento." },
  ];
  const gp = 0.3, wc = (F.LARG - gp) / 2, hc = 1.85;
  leituras.forEach((r, i) => {
    const x = F.MARGEM + (i % 2) * (wc + gp), y = 2.05 + Math.floor(i / 2) * (hc + 0.3);
    F.bloco(s, x, y, wc, hc, CARD);
    s.addText("" + r.v, { x: x + 0.25, y: y + 0.22, w: wc - 0.5, h: 0.8, fontSize: 36, bold: true, color: i === 1 ? GOLDD : TEAL, fontFace: "Cambria" });
    s.addText(r.l, { x: x + 0.25, y: y + 0.95, w: wc - 0.5, h: 0.35, fontSize: 14, bold: true, color: INK, fontFace: "Cambria" });
    s.addText(r.s, { x: x + 0.25, y: y + 1.3, w: wc - 0.5, h: 0.5, fontSize: 12, color: MUT, valign: "top" });
  });
  F.rodape(s, n, TOT);

  // 3) COMPOSIÇÃO — interno vs externo (donut + barras + nota)
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Composição da equipa", "Estrutura de vínculos contratuais", "Interno vs. externo");
  F.donut(s, F.MARGEM, 1.95, 5.9, 3.6, "Por vínculo", porVinc, ps.length);
  const barW = F.W - F.MARGEM - 6.6;
  s.addText("INTERNO VS. EXTERNO", { x: 6.6, y: 2.0, w: barW, h: 0.3, fontSize: 10, bold: true, color: FAINT, charSpacing: 1 });
  const linhaBarra = (yy, rot, val, tot, cor) => {
    s.addText(rot, { x: 6.6, y: yy, w: barW, h: 0.28, fontSize: 12, bold: true, color: INK });
    s.addShape(pptx.ShapeType.roundRect, { x: 6.6, y: yy + 0.32, w: barW, h: 0.26, fill: { color: SOFT }, line: { type: "none" }, rectRadius: 0.03 });
    s.addShape(pptx.ShapeType.roundRect, { x: 6.6, y: yy + 0.32, w: Math.max(0.1, barW * val / tot), h: 0.26, fill: { color: cor }, line: { type: "none" }, rectRadius: 0.03 });
    s.addText(val + "  ·  " + pct(val, tot) + "%", { x: 6.6, y: yy + 0.62, w: barW, h: 0.26, fontSize: 11, color: MUT });
  };
  linhaBarra(2.5, "Equipa externa (TT)", tt, ps.length, TEAL2);
  linhaBarra(3.7, "Equipa interna (Quadro + Sazonal)", interno, ps.length, GOLD);
  F.nota(s, 6.6, 4.95, barW, 1.5, "Núcleo interno reduzido", "Quase 3 em cada 4 colaboradores são contratados via agência. A capacidade operacional do Housekeeping está, na prática, externalizada.");
  F.rodape(s, n, TOT);

  // 4) DISTRIBUIÇÃO POR FUNÇÃO — barras + cartões de leitura
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Distribuição por função", "Onde está concentrada a equipa", "Número de colaboradores por função");
  const porFunc = funcoesDe(ps);
  F.barras(s, F.MARGEM, 1.95, 7.6, 4.7, "Colaboradores por função", porFunc.slice(0, 9).slice().reverse(), TEAL2);
  const top = porFunc[0];
  F.nota(s, 8.55, 1.95, F.W - F.MARGEM - 8.55, 2.0, "Função dominante", top ? (top[0] + " representa " + top[1] + " dos " + ps.length + " (" + pct(top[1], ps.length) + "%) — o coração da operação.") : "Sem dados.");
  F.nota(s, 8.55, 4.1, F.W - F.MARGEM - 8.55, 2.5, "Coordenação", "As funções de chefia coordenam a operação diária. Amplitude de controlo elevada exige supervisão atenta nos picos.");
  F.rodape(s, n, TOT);

  // 5) DEPENDÊNCIA DE FORNECEDORES — donut + risco
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Dependência de fornecedores", "Repartição da equipa externa", tt + " colaboradores de trabalho temporário, por agência");
  F.donut(s, F.MARGEM, 1.95, 7.0, 4.7, "Recursos por agência", externos.length ? externos : [["Sem TT", 1]], tt);
  if (topExt && pct(topExt[1], tt) >= 40) {
    s.addShape(pptx.ShapeType.roundRect, { x: 8.0, y: 3.2, w: F.W - F.MARGEM - 8.0, h: 2.2, fill: { color: TEALD }, line: { type: "none" }, rectRadius: 0.06 });
    s.addText("Risco de concentração", { x: 8.25, y: 3.42, w: F.W - F.MARGEM - 8.5, h: 0.4, fontSize: 15, bold: true, color: "FFFFFF", fontFace: "Cambria" });
    s.addText(pct(topExt[1], tt) + "% da capacidade externa depende de " + topExt[0] + ". Uma rutura contratual ou de serviço teria impacto operacional imediato e difícil de substituir no curto prazo.",
      { x: 8.25, y: 3.9, w: F.W - F.MARGEM - 8.5, h: 1.3, fontSize: 12, color: "CFE0DC", valign: "top", lineSpacingMultiple: 1.1 });
  }
  F.rodape(s, n, TOT);

  // 6) ESTRUTURA OPERACIONAL — 2 cartões (interna / externa) com funções
  s = pptx.addSlide(); n++; s.background = { color: PAPER };
  F.cabSeccao(s, "Estrutura operacional", "Quem assegura cada parte da operação", "Funções por tipo de vínculo");
  const funcInterna = funcoesDe(ps.filter(p => classeVinculo(p.Vinculo) !== "TT"));
  const funcExterna = funcoesDe(ps.filter(p => classeVinculo(p.Vinculo) === "TT"));
  const cardW = (F.LARG - 0.4) / 2;
  const cartaoFuncoes = (x, titulo, sub, cor, lista) => {
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.95, w: cardW, h: 0.85, fill: { color: cor }, line: { type: "none" }, rectRadius: 0.06 });
    s.addText(titulo, { x: x + 0.25, y: 2.08, w: cardW - 0.5, h: 0.35, fontSize: 15, bold: true, color: "FFFFFF", fontFace: "Cambria" });
    s.addText(sub, { x: x + 0.25, y: 2.44, w: cardW - 0.5, h: 0.3, fontSize: 11, color: "E8F1EF" });
    let yy = 3.05;
    lista.slice(0, 7).forEach(([nm, q]) => {
      s.addText(nm, { x: x + 0.1, y: yy, w: cardW - 1.0, h: 0.32, fontSize: 12.5, color: INK });
      s.addText("" + q, { x: x + cardW - 0.9, y: yy, w: 0.8, h: 0.32, fontSize: 13, bold: true, color: TEAL, align: "right" });
      s.addShape(pptx.ShapeType.line, { x: x + 0.1, y: yy + 0.34, w: cardW - 0.2, h: 0, line: { color: LINE, width: 0.75 } });
      yy += 0.42;
    });
  };
  cartaoFuncoes(F.MARGEM, "Equipa Interna", interno + " colaboradores · Quadro + Sazonal", TEAL, funcInterna);
  cartaoFuncoes(F.MARGEM + cardW + 0.4, "Equipa Externa (TT)", tt + " colaboradores · " + externos.length + " agências", GOLDD, funcExterna);
  F.rodape(s, n, TOT);

  // 7) PRÓXIMAS ENTRADAS
  s = slidePorChegar(F, pptx, "Verdelago · Housekeeping", chegar); n++;
  F.rodape(s, n, TOT);
}

// funções de uma lista de pessoas -> [["Empregada de Andares", 39], ...]
function funcoesDe(pessoas) {
  const m = {};
  pessoas.forEach(p => { const nome = nomeFuncaoDe(p); m[nome] = (m[nome] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

// nome da função de UMA pessoa (string/lookup/lookupId)
function nomeFuncaoDe(p) {
  const v = p.FuncaoID;
  if (typeof v === "string" && v) { const f = dados.funcoes.find(f => f.Title === v); return f?.Nome || v; }
  if (v && typeof v === "object" && v.LookupValue) return v.LookupValue;
  if (p.FuncaoIDLookupId != null) { const f = dados.funcoes.find(f => String(f._id) === String(p.FuncaoIDLookupId)); return f?.Nome || "—"; }
  return "—";
}

// campo de data de entrada (descoberto dinamicamente na 1ª pessoa)
function campoDataEntrada() {
  const a = dados.pessoas[0] || {};
  return Object.keys(a).find(k => /data.*(entrad|admiss|inici)/i.test(k)) || null;
}
const parseData = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };

// pessoas "a chegar" de uma lista: estado "Por chegar" ou data de entrada futura
function porChegar(pessoas) {
  const cEnt = campoDataEntrada();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return pessoas
    .filter(p => {
      const est = String(p.Estado || "").toLowerCase();
      if (est.includes("cheg")) return true;
      const de = cEnt ? parseData(p[cEnt]) : null;
      return de && de >= hoje;
    })
    .map(p => ({ p, data: cEnt ? parseData(p[cEnt]) : null }))
    .sort((a, b) => (a.data ? a.data.getTime() : Infinity) - (b.data ? b.data.getTime() : Infinity));
}

// início da semana (segunda) de uma data
function segundaDe(d) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; }
const ddmm = d => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
const ddMes = d => d.getDate() + " " + ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][d.getMonth()];

// slide "Próximas entradas" — lista nominal das pessoas a chegar, por semana, em duas colunas
function slidePorChegar(F, pptx, eyebrow, lista) {
  const s = pptx.addSlide(); s.background = { color: PAPER };
  F.cabSeccao(s, eyebrow, "Próximas entradas", "Pessoas a chegar — nome, empresa e função, por semana");

  if (!lista.length) {
    s.addText("Sem entradas previstas de momento.", { x: F.MARGEM, y: 2.2, w: F.LARG, h: 0.5, fontSize: 14, color: MUT });
    return s;
  }

  // agrupar por semana (segunda) e construir itens lineares (cabeçalho + pessoas)
  const semInicio = segundaDe(new Date());
  const proxInicio = new Date(semInicio); proxInicio.setDate(proxInicio.getDate() + 7);
  const grupos = new Map();
  for (const item of lista) {
    const ini = item.data ? segundaDe(item.data) : null;
    const chave = ini ? ini.getTime() : "sem-data";
    if (!grupos.has(chave)) grupos.set(chave, { ini, itens: [] });
    grupos.get(chave).itens.push(item);
  }
  const itens = [];
  for (const { ini, itens: pess } of grupos.values()) {
    let rot;
    if (!ini) rot = "Sem data definida";
    else {
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
      const intervalo = ddMes(ini) + " – " + ddMes(fim);
      if (ini.getTime() === semInicio.getTime()) rot = "Esta semana · " + intervalo;
      else if (ini.getTime() === proxInicio.getTime()) rot = "Próxima semana · " + intervalo;
      else rot = intervalo;
    }
    itens.push({ tipo: "h", txt: rot });
    pess.forEach(it => itens.push({ tipo: "p", it }));
  }

  // distribuir por duas colunas
  const y0 = 1.95, lh = 0.32, maxLin = Math.floor((6.85 - y0) / lh); // ~15 por coluna
  const colX = [F.MARGEM, F.MARGEM + 6.35], colW = 5.9;
  let cortados = 0;
  let col = 0, y = y0;
  const desenha = (item) => {
    if (col === 0 && y + lh > y0 + maxLin * lh) { col = 1; y = y0; }   // muda de coluna
    if (col === 1 && y + lh > y0 + maxLin * lh) { cortados++; return; } // não cabe
    const x = colX[col];
    if (item.tipo === "h") {
      if (y + lh > y0 + 0.3) y += 0.08; // pequeno espaço antes de novo cabeçalho
      s.addText(item.txt.toUpperCase(), { x, y, w: colW, h: 0.28, fontSize: 10, bold: true, color: TEAL2, charSpacing: 2 });
      y += lh;
    } else {
      const p = item.it.p; const d = item.it.data;
      const detalhe = [p.EmpresaAgencia, nomeFuncaoDe(p)].filter(x => x && x !== "—").join(" · ");
      s.addText([
        { text: (d ? ddmm(d) : "—") + "   ", options: { color: MUT } },
        { text: p.Nome || "—", options: { bold: true, color: INK } },
        { text: detalhe ? "   " + detalhe : "", options: { color: MUT, fontSize: 9 } }
      ], { x, y, w: colW, h: 0.3, fontSize: 11, align: "left", valign: "middle" });
      y += lh;
    }
  };
  itens.forEach(desenha);
  if (cortados) s.addText("+ " + cortados + " mais", { x: colX[1], y: y0 + maxLin * lh, w: colW, h: 0.3, fontSize: 10, italic: true, color: MUT });
  return s;
}

// ============================================================================
//  PONTOS DE ENTRADA
// ============================================================================
async function correr(qual, gerador, ficheiro) {
  try {
    badge("syncing"); toast("A preparar o PowerPoint…");
    await carregarPptx();
    const D = await recolher();
    const pptx = new window.PptxGenJS();
    novaApresentacao(pptx);
    await gerador(pptx, D);
    await pptx.writeFile({ fileName: ficheiro + "_" + new Date().toISOString().slice(0, 10) + ".pptx" });
    badge("connected"); toast("PowerPoint gerado.");
  } catch (e) {
    badge("error", e.message); toast("Falha ao gerar PPT: " + e.message, "error");
  }
}

export const exportarPPTGeral = () => correr("geral", gerarGeral, "Verdelago_Painel_Geral");
export const exportarPPTFB    = () => correr("fb", gerarFB, "Verdelago_FB");
export const exportarPPTHSK   = () => correr("hsk", gerarHSK, "Verdelago_HSK");

// retrocompatibilidade: o botão antigo "Exportar PPT" chama o painel geral
export const exportarPPT = exportarPPTGeral;
