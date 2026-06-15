// ============================================================================
// controlo-gestao.js — Controlo de Gestão: custos e número de pessoas (orçamentado + real)
// ----------------------------------------------------------------------------
// Lê budget_base.json (uma linha por posição: vínculo, departamento, headcount
// e custo mês a mês, custo anual). Mostra a visão anual de CUSTOS e de PESSOAS,
// com o quadro (fixo) separado do sazonal/variável. O quadro mantém-se como
// custo mesmo com o resort fechado.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const M = { base: null, erro: null, vista: "custos" }; // custos | pessoas
const eur = n => "€ " + Math.round(n).toLocaleString("pt-PT");
const eurK = n => "€ " + (Math.round(n / 1000)).toLocaleString("pt-PT") + "k";
const ehFixo = v => String(v || "").toUpperCase() === "QUADRO";

function garantirEstilos() {
  // Estilos centralizados em estilo.css (design system v2) — nada a injetar.
}

export const moduloControloGestao = {
  id: "controlo",
  nome: "Controlo de Gestão",
  icone: "💶",

  async init() {
    garantirEstilos();
    if (M.base || M.erro) return;
    try {
      const r = await fetch("budget_base.json?" + Date.now());
      if (!r.ok) throw new Error("HTTP " + r.status);
      M.base = await r.json();
    } catch (e) { M.erro = e.message; }
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) {
      alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "Controlo de Gestão")),
        el("div", { class: "mod-nota" }, "Falta o budget_base.json na raiz da app. Detalhe: " + M.erro));
      return;
    }
    const linhas = M.base.linhas;
    const custoMes = i => linhas.reduce((s, l) => s + (l.custo[i] || 0), 0);
    const custoMesFixo = i => linhas.reduce((s, l) => s + (ehFixo(l.vinculo) ? (l.custo[i] || 0) : 0), 0);
    const hcMes = i => linhas.reduce((s, l) => s + (l.hc[i] || 0), 0);
    const hcMesFixo = i => linhas.reduce((s, l) => s + (ehFixo(l.vinculo) ? (l.hc[i] || 0) : 0), 0);

    const anual = linhas.reduce((s, l) => s + (l.anual || 0), 0);
    const anualFixo = linhas.reduce((s, l) => s + (ehFixo(l.vinculo) ? (l.anual || 0) : 0), 0);
    const anualVar = anual - anualFixo;
    const picoHcMes = MESES.map((_, i) => hcMes(i)).reduce((a, b) => Math.max(a, b), 0);
    const hcQuadro = Math.max(...MESES.map((_, i) => hcMesFixo(i)));

    // KPIs
    const kpi = (v, l, s, cls) => el("div", { class: "orc-kpi " + (cls || "") }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null);
    const kpis = el("div", { class: "orc-kpis" },
      kpi(eurK(anual), "Custo anual total", linhas.length + " posições"),
      kpi(eurK(anualFixo), "Quadro · fixo", Math.round(100 * anualFixo / anual) + "% — mantém-se com resort fechado", "fixo"),
      kpi(eurK(anualVar), "Sazonal · variável", Math.round(100 * anualVar / anual) + "% do total"),
      kpi("" + picoHcMes, "Pico de pessoas", "no mês mais alto · quadro: " + hcQuadro));

    // segmento custos/pessoas
    const seg = (k, t) => el("button", { class: M.vista === k ? "ativo" : "", onclick: () => { M.vista = k; self.render(core, alvo); } }, t);
    const bar = el("div", { class: "orc-bar" },
      el("div", { class: "orc-seg" }, seg("custos", "Custos"), seg("pessoas", "Pessoas")),
      el("button", { class: "orc-exp", onclick: () => exportar(linhas) }, "Exportar Excel"));

    // gráfico mensal (barras empilhadas: fixo + variável)
    const valMes = i => M.vista === "custos" ? custoMes(i) : hcMes(i);
    const valFixo = i => M.vista === "custos" ? custoMesFixo(i) : hcMesFixo(i);
    const grafico = barras(valMes, valFixo);

    // tabela mensal
    const cab = el("tr", {}, el("th", {}, "Mês"), el("th", { class: "num" }, "Fixo (quadro)"), el("th", { class: "num" }, "Variável"), el("th", { class: "num" }, "Total"));
    const corpoT = MESES.map((m, i) => {
      const f = valFixo(i), t = valMes(i);
      const fmt = M.vista === "custos" ? eur : (x => "" + x);
      return el("tr", {}, el("td", {}, m), el("td", { class: "num" }, fmt(f)), el("td", { class: "num" }, fmt(t - f)), el("td", { class: "num" }, fmt(t)));
    });
    const totF = MESES.reduce((s, _, i) => s + valFixo(i), 0), totT = MESES.reduce((s, _, i) => s + valMes(i), 0);
    const fmtTot = M.vista === "custos" ? eur : (x => "" + x + " (pessoa·mês)");
    const tabMes = el("table", { class: "orc-tab" },
      el("thead", {}, cab), el("tbody", {}, ...corpoT),
      el("tfoot", {}, el("tr", {}, el("td", {}, "Total"), el("td", { class: "num" }, fmtTot(totF)), el("td", { class: "num" }, fmtTot(totT - totF)), el("td", { class: "num" }, fmtTot(totT)))));

    // por departamento
    const deps = {};
    linhas.forEach(l => { const d = l.departamento || "—"; (deps[d] = deps[d] || { anual: 0, pico: 0, fixo: 0 }); deps[d].anual += l.anual || 0; deps[d].fixo += ehFixo(l.vinculo) ? (l.anual || 0) : 0; });
    MESES.forEach((_, i) => { const porDep = {}; linhas.forEach(l => { const d = l.departamento || "—"; porDep[d] = (porDep[d] || 0) + (l.hc[i] || 0); }); Object.entries(porDep).forEach(([d, v]) => { if (deps[d]) deps[d].pico = Math.max(deps[d].pico, v); }); });
    const depRows = Object.entries(deps).sort((a, b) => b[1].anual - a[1].anual).map(([d, v]) =>
      el("tr", {}, el("td", {}, d), el("td", { class: "num" }, "" + v.pico), el("td", { class: "num" }, eur(v.fixo)), el("td", { class: "num" }, eur(v.anual))));
    const tabDep = el("table", { class: "orc-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Departamento"), el("th", { class: "num" }, "Pico pessoas"), el("th", { class: "num" }, "Fixo/ano"), el("th", { class: "num" }, "Custo/ano"))),
      el("tbody", {}, ...depRows));

    alvo.replaceChildren(
      el("div", { class: "mod-cab" }, el("h2", {}, "Controlo de Gestão"),
        el("p", { class: "mut" }, "Visão anual de custos e pessoas. O quadro é fixo — mantém-se mesmo com o resort fechado.")),
      kpis, bar,
      el("div", { class: "orc-sec" }, el("h3", {}, M.vista === "custos" ? "Custo por mês" : "Pessoas por mês"), grafico,
        el("div", { class: "orc-leg" }, el("span", {}, el("i", { style: "background:var(--gold)" }), "Quadro (fixo)"), el("span", {}, el("i", { style: "background:var(--teal2)" }), "Sazonal / variável"))),
      el("div", { class: "orc-sec" }, el("h3", {}, "Detalhe mensal"), tabMes),
      el("div", { class: "orc-sec" }, el("h3", {}, "Por departamento"), tabDep));
  }
};

// gráfico de barras empilhadas (fixo em baixo, variável em cima)
function barras(valTotal, valFixo) {
  const W = 760, H = 240, padL = 8, padB = 26, padT = 10;
  const max = Math.max(...MESES.map((_, i) => valTotal(i)), 1);
  const bw = (W - padL) / 12, gap = bw * 0.28;
  const escala = v => (H - padB - padT) * (v / max);
  const svg = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`];
  // grelha
  for (let g = 0; g <= 4; g++) { const y = padT + (H - padB - padT) * g / 4; svg.push(`<line x1="${padL}" y1="${y}" x2="${W}" y2="${y}" stroke="var(--line-2)" stroke-width="1"/>`); }
  MESES.forEach((m, i) => {
    const x = padL + i * bw + gap / 2, w = bw - gap;
    const t = valTotal(i), f = valFixo(i);
    const hT = escala(t), hF = escala(f);
    const yT = H - padB - hT, yF = H - padB - hF;
    svg.push(`<rect x="${x}" y="${yT}" width="${w}" height="${hT}" rx="3" fill="var(--teal2)"/>`);
    if (hF > 0) svg.push(`<rect x="${x}" y="${yF}" width="${w}" height="${hF}" rx="3" fill="var(--gold)"/>`);
    svg.push(`<text x="${x + w / 2}" y="${H - 9}" text-anchor="middle" font-size="11" fill="var(--mut)">${m}</text>`);
  });
  svg.push(`</svg>`);
  return el("div", { html: svg.join("") });
}

async function exportar(linhas) {
  try {
    badge("syncing");
    await new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("Falha a carregar Excel")); document.head.append(s); });
    const X = window.XLSX, wb = X.utils.book_new();
    // resumo mensal
    const cm = i => linhas.reduce((s, l) => s + (l.custo[i] || 0), 0);
    const cmf = i => linhas.reduce((s, l) => s + (ehFixo(l.vinculo) ? l.custo[i] || 0 : 0), 0);
    const hm = i => linhas.reduce((s, l) => s + (l.hc[i] || 0), 0);
    const resumo = [["Mês", "Custo fixo", "Custo variável", "Custo total", "Pessoas"]];
    MESES.forEach((m, i) => resumo.push([m, Math.round(cmf(i)), Math.round(cm(i) - cmf(i)), Math.round(cm(i)), hm(i)]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(resumo), "Resumo mensal");
    // posições
    const pos = [["Nome", "Categoria", "Departamento", "Vínculo", "Custo anual", ...MESES]];
    linhas.forEach(l => pos.push([l.nome, l.categoria, l.departamento, l.vinculo, Math.round(l.anual), ...l.custo.map(c => Math.round(c))]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(pos), "Posições");
    X.writeFile(wb, "Verdelago_Orcamento_anual.xlsx");
    badge("connected"); toast("Orçamento exportado.");
  } catch (e) { badge("error", e.message); toast("Falha: " + e.message, "error"); }
}
