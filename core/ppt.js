// ============================================================================
// ppt.js — Exportação de análise de gestão em PowerPoint (no browser)
// ----------------------------------------------------------------------------
// Usa o PptxGenJS servido localmente (lib/pptxgen.bundle.js) para não depender
// de CDNs. Reúne pessoas, assiduidade, alojados e custos por departamento e
// uma visão global, e gera um .pptx para descarregar.
// ============================================================================

import { toast, badge } from "./ui.js";
import { dados, pessoasDoModulo, pessoasGeral, moduloDaPessoa } from "./store.js";
import * as graph from "./graph.js";

const TEAL = "0D5450", TEALD = "073A37", GOLD = "B0894E", INK = "1B2A2A", MUT = "6A7773", LINE = "E7E1D5", SOFT = "F2EFE7";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// grupos = departamentos operacionais + serviços centrais
const GRUPOS = [
  { nome: "Housekeeping", chave: "HSK", pessoas: () => pessoasDoModulo("HSK") },
  { nome: "F&B", chave: "F&B", pessoas: () => pessoasDoModulo("F&B") },
  { nome: "Recreativo", chave: "REC", pessoas: () => pessoasDoModulo("Náutico") },
  { nome: "Serviços Centrais", chave: "SC", pessoas: () => pessoasGeral() },
];
// mapear departamento do ficheiro de custos -> grupo
function grupoDoDepartamento(dep) {
  const d = (dep || "").toUpperCase();
  if (d.includes("HOUSEKEEP")) return "HSK";
  if (["COZINHA", "COPA", "PASTELARIA", "RESTAURANTE", "BAR"].some(x => d.includes(x))) return "F&B";
  if (d.includes("SPORT") || d.includes("ANIMA") || d.includes("NAUTIC")) return "REC";
  return "SC";
}
const grupoDaPessoa = p => { const m = moduloDaPessoa(p); return m === "HSK" ? "HSK" : m === "F&B" ? "F&B" : m === "Náutico" ? "REC" : "SC"; };
const ativa = p => !String(p.Estado || "").toLowerCase().includes("inativ");
const eur = n => "€ " + Math.round(n).toLocaleString("pt-PT");

function carregarPptx() {
  return new Promise((res, rej) => {
    if (window.PptxGenJS) return res();
    const s = document.createElement("script"); s.src = "lib/pptxgen.bundle.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar o gerador de PowerPoint."));
    document.head.append(s);
  });
}

// ---- recolher dados ----
async function recolher() {
  const mesIso = new Date().toISOString().slice(0, 7); // AAAA-MM atual
  let presencas = [], camas = [], budget = null;
  try { presencas = await graph.lerLista("Presenças"); } catch {}
  try { camas = await graph.lerLista("Camas"); } catch {}
  try { budget = await (await fetch("budget_base.json?" + Date.now())).json(); } catch {}

  const idGrupo = {}; for (const p of dados.pessoas) idGrupo[p.Title] = grupoDaPessoa(p);

  // assiduidade do mês atual por grupo
  const assid = {}; GRUPOS.forEach(g => assid[g.chave] = { P: 0, F: 0 });
  for (const m of presencas) {
    if (!String(m.Data || "").startsWith(mesIso)) continue;
    const g = idGrupo[m.PessoaID]; if (!g) continue;
    const e = String(m.Estado || "").toLowerCase();
    if (e.includes("present")) assid[g].P++; else if (e.includes("falt")) assid[g].F++;
  }
  // alojados por grupo (camas ocupadas/por chegar com ocupante)
  const aloj = {}; GRUPOS.forEach(g => aloj[g.chave] = 0);
  for (const c of camas) { if (!c.PessoaID) continue; const g = idGrupo[c.PessoaID]; if (g) aloj[g]++; }
  // custos por grupo (anual, fixo/variável) do budget
  const custo = {}; GRUPOS.forEach(g => custo[g.chave] = { anual: 0, fixo: 0, picoHC: 0 });
  if (budget) {
    for (const l of budget.linhas) {
      const g = grupoDoDepartamento(l.departamento);
      custo[g].anual += l.anual || 0;
      if (String(l.vinculo).toUpperCase() === "QUADRO") custo[g].fixo += l.anual || 0;
    }
    GRUPOS.forEach(g => { custo[g.chave].picoHC = Math.max(...MESES.map((_, i) => budget.linhas.filter(l => grupoDoDepartamento(l.departamento) === g.chave).reduce((s, l) => s + (l.hc[i] || 0), 0))); });
  }
  return { mesIso, assid, aloj, custo, temBudget: !!budget };
}

// ---- gerar o deck ----
export async function exportarPPT() {
  try {
    badge("syncing"); toast("A preparar o PowerPoint…");
    await carregarPptx();
    const D = await recolher();
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: "VDL", width: 13.333, height: 7.5 });
    pptx.layout = "VDL";
    pptx.theme = { headFontFace: "Georgia", bodyFontFace: "Segoe UI" };

    const rodape = s => s.addText("Verdelago Operações · gerado " + new Date().toLocaleDateString("pt-PT"), { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontSize: 9, color: MUT, align: "left" });
    const titulo = (s, t, sub) => { s.addText(t, { x: 0.5, y: 0.45, w: 12.3, h: 0.7, fontSize: 30, bold: true, color: TEAL, fontFace: "Georgia" }); if (sub) s.addText(sub, { x: 0.5, y: 1.15, w: 12.3, h: 0.4, fontSize: 14, color: MUT }); };
    const kpiBox = (s, x, y, valor, label, cor) => {
      s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.9, h: 1.4, fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
      s.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h: 1.4, fill: { color: cor || TEAL } });
      s.addText(valor, { x: x + 0.2, y: y + 0.18, w: 2.6, h: 0.7, fontSize: 30, bold: true, color: INK, fontFace: "Georgia" });
      s.addText(label, { x: x + 0.2, y: y + 0.92, w: 2.6, h: 0.4, fontSize: 11, color: MUT });
    };
    const opTab = { x: 0.5, w: 12.3, border: { type: "solid", color: LINE, pt: 1 }, fontSize: 12, color: INK, fontFace: "Segoe UI", valign: "middle", autoPage: false };
    const cab = arr => arr.map(t => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: TEAL }, fontSize: 11 } }));

    // ---------- 1) Capa ----------
    let s = pptx.addSlide(); s.background = { color: SOFT };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: GOLD } });
    s.addText("Análise de Gestão", { x: 0.9, y: 2.6, w: 11, h: 0.9, fontSize: 44, bold: true, color: TEAL, fontFace: "Georgia" });
    s.addText("Verdelago · Recursos Humanos e Operações", { x: 0.95, y: 3.6, w: 11, h: 0.5, fontSize: 18, color: TEALD });
    s.addText(new Date().toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }), { x: 0.95, y: 4.15, w: 11, h: 0.4, fontSize: 14, color: MUT });

    // ---------- 2) Global ----------
    s = pptx.addSlide(); s.background = { color: SOFT };
    titulo(s, "Visão global", "Pessoas, assiduidade, alojamento e custos");
    const ativos = dados.pessoas.filter(ativa).length;
    const totalP = Object.values(D.assid).reduce((a, b) => a + b.P, 0), totalF = Object.values(D.assid).reduce((a, b) => a + b.F, 0);
    const assidPct = (totalP + totalF) ? Math.round(100 * totalP / (totalP + totalF)) : null;
    const alojTot = Object.values(D.aloj).reduce((a, b) => a + b, 0);
    const custoTot = Object.values(D.custo).reduce((a, b) => a + b.anual, 0);
    const fixoTot = Object.values(D.custo).reduce((a, b) => a + b.fixo, 0);
    kpiBox(s, 0.5, 1.8, "" + ativos, "Efetivos ativos", TEAL);
    kpiBox(s, 3.6, 1.8, assidPct == null ? "—" : assidPct + "%", "Assiduidade (mês)", TEAL);
    kpiBox(s, 6.7, 1.8, "" + alojTot, "Trabalhadores alojados", TEAL);
    kpiBox(s, 9.8, 1.8, D.temBudget ? eur(custoTot) : "—", "Custo anual", GOLD);
    const linhasG = [cab(["Departamento", "Ativos", "Assiduidade", "Alojados", "Custo anual", "Fixo (quadro)"])];
    GRUPOS.forEach(g => {
      const ps = g.pessoas(); const at = ps.filter(ativa).length;
      const a = D.assid[g.chave]; const pct = (a.P + a.F) ? Math.round(100 * a.P / (a.P + a.F)) + "%" : "—";
      const c = D.custo[g.chave];
      linhasG.push([g.nome, "" + at, pct, "" + D.aloj[g.chave], D.temBudget ? eur(c.anual) : "—", D.temBudget ? eur(c.fixo) : "—"]);
    });
    s.addTable(linhasG, { ...opTab, y: 3.5, rowH: 0.42, colW: [3.3, 1.5, 1.9, 1.6, 2, 2] });
    rodape(s);

    // ---------- 3..N) por departamento ----------
    for (const g of GRUPOS) {
      const ps = g.pessoas();
      const at = ps.filter(ativa).length, ina = ps.length - at;
      const a = D.assid[g.chave]; const pct = (a.P + a.F) ? Math.round(100 * a.P / (a.P + a.F)) : null;
      const c = D.custo[g.chave];
      s = pptx.addSlide(); s.background = { color: SOFT };
      titulo(s, g.nome, "Análise de gestão do departamento");
      kpiBox(s, 0.5, 1.8, "" + at, "Pessoas ativas", TEAL);
      kpiBox(s, 3.6, 1.8, pct == null ? "—" : pct + "%", "Assiduidade (mês)", TEAL);
      kpiBox(s, 6.7, 1.8, "" + D.aloj[g.chave], "Alojados", TEAL);
      kpiBox(s, 9.8, 1.8, D.temBudget ? eur(c.anual) : "—", "Custo anual", GOLD);

      // repartição por empresa
      const porEmp = {}; ps.filter(ativa).forEach(p => { const e = p.EmpresaAgencia || "—"; porEmp[e] = (porEmp[e] || 0) + 1; });
      const empRows = [cab(["Empresa / agência", "Pessoas"])];
      Object.entries(porEmp).sort((x, y) => y[1] - x[1]).forEach(([e, n]) => empRows.push([e, "" + n]));
      s.addText("Por empresa", { x: 0.5, y: 3.5, w: 6, h: 0.4, fontSize: 15, bold: true, color: TEALD, fontFace: "Georgia" });
      s.addTable(empRows, { ...opTab, x: 0.5, w: 5.8, y: 3.95, rowH: 0.38, colW: [4.2, 1.6] });

      // detalhe de gestão
      const det = [cab(["Indicador", "Valor"])];
      det.push(["Pessoas (ativas)", "" + at]);
      det.push(["Inativas", "" + ina]);
      det.push(["Presenças no mês", "" + a.P]);
      det.push(["Faltas no mês", "" + a.F]);
      det.push(["Alojados", "" + D.aloj[g.chave]]);
      if (D.temBudget) { det.push(["Custo anual", eur(c.anual)]); det.push(["Fixo (quadro)", eur(c.fixo)]); det.push(["Pico de pessoas (mês)", "" + c.picoHC]); }
      s.addText("Indicadores", { x: 6.8, y: 3.5, w: 6, h: 0.4, fontSize: 15, bold: true, color: TEALD, fontFace: "Georgia" });
      s.addTable(det, { ...opTab, x: 6.8, w: 6, y: 3.95, rowH: 0.38, colW: [3.8, 2.2] });
      rodape(s);
    }

    await pptx.writeFile({ fileName: "Verdelago_Analise_Gestao_" + new Date().toISOString().slice(0, 10) + ".pptx" });
    badge("connected"); toast("PowerPoint gerado.");
  } catch (e) {
    badge("error", e.message); toast("Falha ao gerar PPT: " + e.message, "error");
  }
}
