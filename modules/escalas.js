// ============================================================================
// escalas.js — Motor de Escala (HSK) — alocação por necessidades
// ----------------------------------------------------------------------------
// Replica o simulador: pessoas ativas com capacidades (Andares/Áreas/Turndown/
// Valet), padrão rotativo de 2 folgas seguidas (= 5 dias de trabalho), alocação
// às necessidades por função/turno, com deteção de GAPS (necessidade por cobrir)
// e EXCESSO (pessoas a mais nesse dia).
//
// Necessidades: por agora vêm do perfil por dia-da-semana do simulador
// (escala_base.json). Quando ligarmos as room nights, substituem este perfil.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { pessoasDoModulo } from "../core/store.js";
const M = { base: null, fb: null, erro: null, dept: "HSK", fonte: "Junho", fbMes: "Junho", semana: null };

const ROLES = [
  { key: "Áreas", cap: "Áreas", shift: "07:30", ab: "Ár", need: "Áreas" },
  { key: "Lavandaria", cap: null, shift: "07:30", ab: "L", need: "Lavandaria" },
  { key: "Turndown", cap: "Turndown", shift: "14:30", ab: "T", need: "Turndown" },
  { key: "Valet_t", cap: "Valet", shift: "14:30", ab: "V", need: "Valet_t", rotulo: "Valet" },
  { key: "Andares", cap: "Andares", shift: "07:30", ab: "A", need: "Andares" },
];
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function inicioSemana(d) { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); x.setHours(0, 0, 0, 0); return x; }
function primeiraSemanaDoMes(fonte) { const m = fonte === "Julho" ? 6 : 5; return inicioSemana(new Date(2026, m, 1)); }
const isoData = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
// necessidade de um dia: do forecast (por data) se existir; senão perfil por dia-da-semana
function needDoDia(data) {
  const iso = isoData(data);
  const porData = M.base.necessidades_data?.[M.fonte]?.[iso];
  if (porData) return porData;
  const dow = (data.getDay() + 6) % 7;
  const p = M.base.perfil_necessidades_dow?.[dow] || {};
  return { Andares: p.Andares || 0, "Áreas": p["Áreas"] || 0, Turndown: p.Turndown || 0, Valet_m: p.Valet_m || 0, Valet_t: p.Valet_t || 0, Lavandaria: 1 };
}
function rnDoDia(data) { return M.base.room_nights?.[M.fonte]?.[isoData(data)]; }
function norm(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }

function garantirEstilos() {
  if (document.getElementById("esc-css")) return;
  const css = `
  .esc-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0 16px}
  .esc-meses{display:flex;gap:6px}
  .esc-mes{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:14px;color:var(--mut)}
  .esc-mes.ativo{background:var(--teal);color:#fff;border-color:var(--teal);font-weight:600}
  .esc-nav{display:flex;align-items:center;gap:8px}
  .esc-nav button{border:1px solid var(--line);background:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;color:var(--teal)}
  .esc-sem{font-weight:600;min-width:200px;text-align:center}
  .esc-exp{margin-left:auto;background:var(--teal);color:#fff;border:none;border-radius:9px;padding:9px 16px;font-weight:600;cursor:pointer}
  .esc-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .esc-kpis .kpi{background:#fff;border:1px solid var(--line);border-radius:11px;padding:10px 15px;min-width:120px}
  .esc-kpis .kpi b{font-size:20px;display:block}
  .esc-kpis .kpi.gap b{color:#b34b4b}.esc-kpis .kpi.exc b{color:var(--amber)}.esc-kpis .kpi.ok b{color:var(--teal)}
  .esc-kpis .kpi span{font-size:12px;color:var(--mut)}
  .esc-sec{margin:18px 0}.esc-sec h3{font-size:15px;color:var(--teal);margin:0 0 8px}
  table.esc{border-collapse:collapse;font-size:12.5px;width:100%;background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
  table.esc th,table.esc td{border:1px solid var(--line);padding:6px 8px;text-align:center}
  table.esc th{background:var(--soft);color:var(--teal-d);font-size:11.5px}
  table.esc td.rot,table.esc th.rot{text-align:left;font-weight:600;background:#fff;position:sticky;left:0}
  .cobre .gap{background:#f7e3e3;color:#b34b4b;font-weight:700}
  .cobre .ok{color:var(--teal)}
  .cobre .exc{color:var(--amber)}
  .cel-A{background:#e8faf4}.cel-Ár{background:#eaf1f4}.cel-T{background:#fbeede}.cel-Vm,.cel-Vt{background:#efecf9}
  .cel-F{background:#f0f0f0;color:#999}.cel-EX{background:#fff7e6;color:var(--amber)}
  .leg{font-size:12px;color:var(--mut);margin-top:8px}.leg span{display:inline-block;padding:1px 7px;border-radius:5px;margin:0 3px}
  `;
  document.head.append(el("style", { id: "esc-css", html: css }));
}

export const moduloEscalas = {
  id: "escalas", nome: "Escalas", icone: "🗓️",

  async init() {
    garantirEstilos();
    if (M.base || M.erro) return;
    try { const r = await fetch("escala_base.json?" + Date.now()); if (!r.ok) throw new Error("HTTP " + r.status); M.base = await r.json(); }
    catch (e) { M.erro = e.message; }
    try { const r = await fetch("escala_fb.json?" + Date.now()); if (r.ok) M.fb = await r.json(); } catch {}
    if (!M.semana) M.semana = primeiraSemanaDoMes(M.fonte);
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) { alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "🗓️ Escalas")), el("div", { class: "mod-nota" }, "Falta o escala_base.json na raiz. Detalhe: " + M.erro)); return; }

    const deptBtn = (d, txt) => el("button", { class: "esc-mes" + (M.dept === d ? " ativo" : ""), onclick: () => { M.dept = d; self.render(core, alvo); } }, txt);
    const cab = el("div", { class: "mod-cab" }, el("h2", {}, "🗓️ Escalas"),
      el("p", { class: "mut" }, "Dimensionamento de pessoal a partir das room nights do forecast."));
    const toggle = el("div", { class: "esc-meses", style: "margin-bottom:14px" }, deptBtn("HSK", "Housekeeping"), deptBtn("F&B", "F&B"));

    if (M.dept === "F&B") { alvo.replaceChildren(cab, toggle, renderFB(self, core, alvo)); return; }

    const pessoas = prepararPessoas();
    const datas = Array.from({ length: 7 }, (_, i) => { const d = new Date(M.semana); d.setDate(d.getDate() + i); return d; });
    const esc = gerar(datas, pessoas);

    const fim = datas[6];
    const mesBtn = (f) => el("button", { class: "esc-mes" + (M.fonte === f ? " ativo" : ""), onclick: () => { M.fonte = f; M.semana = primeiraSemanaDoMes(f); self.render(core, alvo); } }, f);
    const bar = el("div", { class: "esc-bar" },
      el("div", { class: "esc-meses" }, mesBtn("Junho"), mesBtn("Julho")),
      el("div", { class: "esc-nav" },
        el("button", { onclick: () => { M.semana = new Date(M.semana.getFullYear(), M.semana.getMonth(), M.semana.getDate() - 7); self.render(core, alvo); } }, "‹"),
        el("span", { class: "esc-sem" }, M.semana.toLocaleDateString("pt-PT") + " a " + fim.toLocaleDateString("pt-PT")),
        el("button", { onclick: () => { M.semana = new Date(M.semana.getFullYear(), M.semana.getMonth(), M.semana.getDate() + 7); self.render(core, alvo); } }, "›")),
      el("button", { class: "esc-exp", onclick: () => exportar(esc, pessoas, datas) }, "⬇ Exportar Excel"));

    alvo.replaceChildren(
      cab, toggle,
      bar,
      kpis(esc),
      secaoCobertura(esc, datas),
      secaoGrelha(esc, pessoas, datas),
      el("div", { class: "leg" }, "Legenda: ",
        el("span", { class: "cel-A" }, "A Andares"), el("span", { class: "cel-Ár" }, "Ár Áreas"),
        el("span", { class: "cel-T" }, "T Turndown"), el("span", { class: "cel-Vt" }, "V Valet"),
        el("span", { class: "cel-A" }, "L Lavandaria"),
        el("span", { class: "cel-F" }, "F Folga"), el("span", { class: "cel-EX" }, "· Excesso")));
  }
};

function prepararPessoas() {
  const capIdx = {};
  (M.base.capacidades || []).forEach(c => { capIdx[norm(c.Nome)] = c; });
  return pessoasDoModulo("HSK").map(p => {
    const c = capIdx[norm(p.Nome)];
    const caps = c ? { "Andares": c.Andares, "Áreas": c.Áreas, "Turndown": c.Turndown, "Valet": c.Valet }
                   : { "Andares": true, "Áreas": false, "Turndown": false, "Valet": false }; // sem dados: assume Andares
    return { nome: p.Nome, empresa: p.EmpresaAgencia || "", caps };
  });
}

// algoritmo de alocação (do simulador), necessidades por data
function gerar(datas, pessoas) {
  const patterns = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]];
  const off = pessoas.map((_, i) => new Set(patterns[i % 7]));
  const dias = [];
  const grelha = pessoas.map(() => Array(7).fill("F"));

  datas.forEach((data, col) => {
    const dow = (data.getDay() + 6) % 7;
    const need = needDoDia(data);
    const disp = [];
    pessoas.forEach((p, i) => { if (!off[i].has(dow)) disp.push(i); else grelha[i][col] = "F"; });
    const usados = new Set();
    const assign = {}, gap = {};
    for (const role of ROLES) {
      const n = Number(need[role.need] || 0);
      let cnt = 0;
      for (const i of disp) {
        if (cnt >= n) break;
        if (usados.has(i)) continue;
        if (role.cap && !pessoas[i].caps[role.cap]) continue;  // cap null = qualquer pessoa
        usados.add(i); grelha[i][col] = role.key; cnt++;
      }
      assign[role.key] = cnt; gap[role.key] = Math.max(0, n - cnt);
    }
    const excesso = disp.filter(i => !usados.has(i));
    excesso.forEach(i => grelha[i][col] = "EX");
    dias.push({ data, dow, need, assign, gap, excesso: excesso.length, disp: disp.length, rn: rnDoDia(data) });
  });
  return { dias, grelha };
}

function kpis(esc) {
  const totalGap = esc.dias.reduce((s, x) => s + Object.values(x.gap).reduce((a, b) => a + b, 0), 0);
  const totalExc = esc.dias.reduce((s, x) => s + x.excesso, 0);
  const totalNeed = esc.dias.reduce((s, x) => s + Object.values(x.need).reduce((a, b) => a + Number(b || 0), 0), 0);
  return el("div", { class: "esc-kpis" },
    el("div", { class: "kpi" }, el("b", {}, "" + totalNeed), el("span", {}, "necessidades (semana)")),
    el("div", { class: "kpi " + (totalGap ? "gap" : "ok") }, el("b", {}, "" + totalGap), el("span", {}, "gaps por cobrir")),
    el("div", { class: "kpi exc" }, el("b", {}, "" + totalExc), el("span", {}, "excesso (pessoa·dia)")));
}

function cabDatas(datas) {
  return datas.map(d => el("th", {}, DIAS[(d.getDay() + 6) % 7], el("div", { style: "font-weight:400;font-size:10px;color:var(--mut)" }, d.getDate() + "/" + (d.getMonth() + 1))));
}

function secaoCobertura(esc, datas) {
  const head = el("tr", {}, el("th", { class: "rot" }, "Função / dia"), ...cabDatas(datas));
  const rnRow = el("tr", { class: "cobre" }, el("td", { class: "rot" }, "Room nights (forecast)"),
    ...esc.dias.map(d => el("td", { style: "color:var(--teal-d);font-weight:600" }, d.rn == null ? "—" : "" + Math.round(d.rn))));
  const linhas = ROLES.map(role => el("tr", { class: "cobre" },
    el("td", { class: "rot" }, role.rotulo || role.key),
    ...esc.dias.map(dia => {
      const n = Number(dia.need[role.need] || 0); const a = dia.assign[role.key] || 0; const g = dia.gap[role.key] || 0;
      return el("td", { class: g ? "gap" : (n ? "ok" : "") }, n ? (a + "/" + n) : "—");
    })));
  const exc = el("tr", { class: "cobre" }, el("td", { class: "rot" }, "Excesso"), ...esc.dias.map(d => el("td", { class: d.excesso ? "exc" : "" }, "" + d.excesso)));
  return el("div", { class: "esc-sec" }, el("h3", {}, "Cobertura por função (alocado / necessário)"),
    el("table", { class: "esc" }, el("thead", {}, head), el("tbody", {}, rnRow, ...linhas, exc)));
}

function secaoGrelha(esc, pessoas, datas) {
  const head = el("tr", {}, el("th", { class: "rot" }, "Pessoa"), ...cabDatas(datas));
  const linhas = pessoas.map((p, i) => el("tr", {},
    el("td", { class: "rot" }, p.nome),
    ...esc.grelha[i].map(v => {
      const ab = v === "F" ? "F" : v === "EX" ? "·" : (ROLES.find(r => r.key === v)?.ab || v);
      const cls = v === "Valet_t" ? "Vt" : v;
      return el("td", { class: "cel-" + cls }, ab);
    })));
  return el("div", { class: "esc-sec" }, el("h3", {}, "Escala por pessoa"),
    el("table", { class: "esc" }, el("thead", {}, head), el("tbody", {}, ...linhas)));
}

function carregarXLSX() {
  return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar Excel")); document.head.append(s); });
}
async function exportar(esc, pessoas, datas) {
  try {
    badge("syncing"); await carregarXLSX(); const X = window.XLSX; const wb = X.utils.book_new();
    const rotDias = datas.map(d => DIAS[(d.getDay() + 6) % 7] + " " + d.getDate() + "/" + (d.getMonth() + 1));
    const cob = [["", ...rotDias], ["Room nights", ...esc.dias.map(d => d.rn == null ? "" : Math.round(d.rn))]];
    ROLES.forEach(role => { cob.push([role.rotulo || role.key, ...esc.dias.map(d => { const n = Number(d.need[role.need] || 0); return n ? (d.assign[role.key] || 0) + "/" + n : "—"; })]); });
    cob.push(["Excesso", ...esc.dias.map(d => d.excesso)]);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(cob), "Cobertura");
    const gr = [["Pessoa", ...rotDias]];
    pessoas.forEach((p, i) => gr.push([p.nome, ...esc.grelha[i].map(v => v === "F" ? "Folga" : v === "EX" ? "Excesso" : (ROLES.find(r => r.key === v)?.rotulo || v))]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(gr), "Escala");
    X.writeFile(wb, "Verdelago_Escala_" + M.fonte + "_" + isoData(M.semana) + ".xlsx");
    badge("connected"); toast("Escala exportada.");
  } catch (e) { badge("error", e.message); toast("Falha: " + e.message, "error"); }
}

// ============================ VISTA F&B ============================
const FB_AREAS = ["FOH Serviço", "BOH Cozinha", "BOH Copa"];

function fbCalc(mes) {
  const { ratios, covers, dias_mes, conv } = M.fb;
  const dm = dias_mes[mes]; const linhas = []; let tot = 0;
  for (const o in ratios) {
    if (!covers[o]) continue;
    const covdia = (covers[o][mes] || 0) / dm;
    const det = {}; let s = 0;
    for (const area in ratios[o]) {
      const ratio = ratios[o][area];
      let fte = ratio > 0 ? covdia / ratio : (covdia > 0 ? 1 : 0);
      const c = covdia > 0 ? Math.ceil(Math.max(fte, 1) * conv) : 0;
      det[area] = c; s += c;
    }
    linhas.push({ o, covdia, det, s }); tot += s;
  }
  return { linhas, tot };
}

function renderFB(self, core, alvo) {
  if (!M.fb) return el("div", { class: "mod-nota" }, "Falta o escala_fb.json na raiz da app.");
  const mes = M.fbMes;
  const calc = fbCalc(mes);
  const orc = M.fb.orcamento[mes] || { FOH: 0, BOH: 0, Ref: 0, Total: 0 };
  const atual = pessoasDoModulo("F&B").length;
  const gap = atual - Math.round(orc.Total);

  const mesBtn = f => el("button", { class: "esc-mes" + (mes === f ? " ativo" : ""), onclick: () => { M.fbMes = f; self.render(core, alvo); } }, f);
  const bar = el("div", { class: "esc-bar" },
    el("div", { class: "esc-meses" }, mesBtn("Junho"), mesBtn("Julho")),
    el("button", { class: "esc-exp", onclick: () => exportarFB(mes, calc, orc, atual) }, "⬇ Exportar Excel"));

  const kpi = (v, l, cls) => el("div", { class: "kpi " + (cls || "") }, el("b", {}, "" + v), el("span", {}, l));
  const kpisFB = el("div", { class: "esc-kpis" },
    kpi(Math.round(orc.Total), "Headcount orçamentado", "ok"),
    kpi(calc.tot, "Estimativa por covers (×1,4)", "exc"),
    kpi(atual, "Pessoal F&B atual"),
    kpi((gap >= 0 ? "+" : "") + gap, "Atual vs orçamento", gap < 0 ? "gap" : ""));

  // tabela por outlet (covers-driven)
  const head = el("tr", {}, el("th", { class: "rot" }, "Outlet"), el("th", {}, "Covers/dia"), ...FB_AREAS.map(a => el("th", {}, a)), el("th", {}, "Total"));
  const linhas = calc.linhas.map(L => el("tr", {},
    el("td", { class: "rot" }, L.o),
    el("td", {}, "" + Math.round(L.covdia)),
    ...FB_AREAS.map(a => el("td", {}, L.det[a] != null ? "" + L.det[a] : "—")),
    el("td", { style: "font-weight:600" }, "" + L.s)));
  const tabela = el("table", { class: "esc" }, el("thead", {}, head), el("tbody", {}, ...linhas));

  // orçamento FOH/BOH
  const orcTab = el("table", { class: "esc", style: "max-width:420px" },
    el("thead", {}, el("tr", {}, el("th", {}, "Orçamento"), el("th", {}, "FOH"), el("th", {}, "BOH"), el("th", {}, "Ref"), el("th", {}, "Total"))),
    el("tbody", {}, el("tr", {}, el("td", { class: "rot" }, mes),
      el("td", {}, "" + Math.round(orc.FOH)), el("td", {}, "" + Math.round(orc.BOH)),
      el("td", {}, "" + Math.round(orc.Ref)), el("td", { style: "font-weight:600" }, "" + Math.round(orc.Total)))));

  return el("div", {},
    bar, kpisFB,
    el("div", { class: "esc-sec" }, el("h3", {}, "Headcount orçamentado (base fiável)"), orcTab),
    el("div", { class: "esc-sec" }, el("h3", {}, "Estimativa por covers ÷ rácio × 1,4 (comparação)"), tabela,
      el("p", { class: "mut", style: "font-size:12.5px" }, "Covers mensais repartidos pelos dias do mês, rácios 'low', com o conversor de folgas ×1,4. Tende a ficar acima do orçamento — serve de referência por outlet, não de número final.")));
}

function exportarFB(mes, calc, orc, atual) {
  (async () => {
    try {
      badge("syncing"); await carregarXLSX(); const X = window.XLSX; const wb = X.utils.book_new();
      const resumo = [["F&B — Dimensionamento", mes], [], ["Headcount orçamentado", Math.round(orc.Total)],
        ["  FOH", Math.round(orc.FOH)], ["  BOH", Math.round(orc.BOH)], ["  Ref", Math.round(orc.Ref)],
        ["Estimativa por covers (×1,4)", calc.tot], ["Pessoal F&B atual", atual], ["Atual vs orçamento", atual - Math.round(orc.Total)]];
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(resumo), "Resumo");
      const tab = [["Outlet", "Covers/dia", ...FB_AREAS, "Total"]];
      calc.linhas.forEach(L => tab.push([L.o, Math.round(L.covdia), ...FB_AREAS.map(a => L.det[a] ?? ""), L.s]));
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(tab), "Por Outlet");
      X.writeFile(wb, "Verdelago_FB_" + mes + ".xlsx");
      badge("connected"); toast("F&B exportado.");
    } catch (e) { badge("error", e.message); toast("Falha: " + e.message, "error"); }
  })();
}
