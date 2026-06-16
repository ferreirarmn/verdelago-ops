// ============================================================================
// orcamento.js — Módulo Orçamento
// ----------------------------------------------------------------------------
// Aba "Plano vs Real": compara o orçamento congelado (Lista Orçamento) com a
// execução real (Lista Pessoas) em HC e custo, por mês, em quatro níveis —
// geral, departamento, função e pessoa. O nível de pessoa é aproximado
// (casamento de nomes normalizado); o que não casa fica em "Por conciliar".
//
// Princípio "Tipologia vs Tipo": os nomes INTERNOS das colunas da Lista
// Orçamento são resolvidos em tempo de execução a partir dos nomes a mostrar
// (HC_Jan, Custo_Ago, …), nunca hardcoded.
//
// A aba "Previsão" (motor room nights → pessoas/custo) entra na Fase 3.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { dados, funcaoDaPessoa } from "../core/store.js";
import * as graph from "../core/graph.js";
import { carregarParametros } from "./parametros.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DEPS_FB = ["BAR", "COZINHA", "COPA", "PASTELARIA", "RESTAURANTE"];
const eur = n => "€ " + Math.round(n).toLocaleString("pt-PT");
const eurK = n => "€ " + Math.round(n / 1000).toLocaleString("pt-PT") + "k";
const norm = s => String(s || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const sinal = n => (n > 0 ? "+" : "") + Math.round(n).toLocaleString("pt-PT");

function garantirEstilos() { /* estilos centralizados em estilo.css */ }

const M = {
  plano: null, colMap: null, erro: null,
  versao: null, versoes: [],
  nivel: "departamento",      // geral | departamento | funcao | pessoa
  mesIdx: new Date().getMonth(),
  aba: "pvr",                 // pvr | previsao
  // motor de previsão
  rn: null, fb: null, params: null, prevErro: null, prevMes: null,
  fatorCob: 1.4   // cobertura de folgas (5 dias trabalho / 2 folga = 7/5)
};

// Resolve { displayName -> nome interno } para uma lista, e devolve um getter
// que aceita o nome a mostrar e dá o valor do item (tolerante a _x005f_ etc.).
function fazerGetter(colunas) {
  const porDisplay = {}; const porNome = {};
  colunas.forEach(c => { porDisplay[norm(c.displayName)] = c.name; porNome[c.name] = c.name; });
  return display => porDisplay[norm(display)] || display;
}

export const moduloOrcamento = {
  id: "orcamento",
  nome: "Orçamento",
  icone: "orcamento",

  async init() {
    garantirEstilos();
    if (M.plano || M.erro) return;
    try {
      const [linhas, colunas] = await Promise.all([
        graph.lerLista("Orçamento"),
        graph.colunasDaLista("Orçamento")
      ]);
      const get = fazerGetter(colunas);
      // mapa de campos que nos interessam (nome a mostrar -> nome interno real)
      M.colMap = {
        versao: get("Versao"), tipo: get("TipoLinha"), nome: get("Nome"),
        categoria: get("Categoria"), departamento: get("Departamento"), vinculo: get("Vinculo"),
        hc: MESES.map(m => get("HC_" + m)), custo: MESES.map(m => get("Custo_" + m))
      };
      M.plano = linhas;
      M.versoes = [...new Set(linhas.map(l => l[M.colMap.versao]).filter(Boolean))].sort();
      M.versao = M.versoes[M.versoes.length - 1] || null;
    } catch (e) { M.erro = e.message; }

    // dados do motor de previsão (não bloqueia o Plano vs Real se faltarem)
    try {
      const b = await (await fetch("escala_base.json?" + Date.now())).json();
      M.rn = b.room_nights || null;
      M.fb = await (await fetch("escala_fb.json?" + Date.now())).json();
      M.params = await carregarParametros();
    } catch (e) { M.prevErro = e.message; }
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) {
      alvo.replaceChildren(
        el("div", { class: "mod-cab" }, el("h2", {}, "Orçamento")),
        el("div", { class: "mod-nota" }, "Não foi possível ler a Lista \"Orçamento\". Confirma que existe no site. Detalhe: " + M.erro));
      return;
    }

    const aba = (id, txt) => el("button", { class: "sub-tab" + (M.aba === id ? " ativo" : ""), onclick: () => { M.aba = id; self.render(core, alvo); } }, txt);

    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "Orçamento"),
        el("p", { class: "mut" }, "Previsão a partir das room nights e comparação do plano congelado com a execução real.")),
      el("div", { class: "sub-tabs" }, aba("pvr", "Plano vs Real"), aba("previsao", "Previsão")),
      corpo
    );
    if (M.aba === "previsao") vistaPrevisao(corpo, self, core, alvo);
    else vistaPlanoVsReal(corpo, self, core, alvo);
  }
};

// ---------------------------------------------------------------------------
function vistaPlanoVsReal(corpo, self, core, alvo) {
  const cm = M.colMap;
  const linhas = M.plano.filter(l => !M.versao || l[cm.versao] === M.versao);

  // ---- PLANO: agregação por mês e por chave de nível ----
  const planoMes = i => linhas.reduce((s, l) => s + (Number(l[cm.hc[i]]) || 0), 0);
  const planoCustoMes = i => linhas.reduce((s, l) => s + (Number(l[cm.custo[i]]) || 0), 0);

  // ---- REAL: descobrir campos na Lista Pessoas (defensivo) ----
  const amostra = dados.pessoas[0] || {};
  const chave = re => Object.keys(amostra).find(k => re.test(k)) || null;
  const cCustoReal = chave(/custo.*real|custoreal|custo.*mens/i);
  const cDataEnt = chave(/data.*(entrad|admiss|inici)/i);
  const cDataSai = chave(/data.*(said|fim|termo|sa) /i) || chave(/data.*(said|fim|termo)/i);
  const temDatas = !!cDataEnt;
  const temCustoReal = !!cCustoReal;

  const ativaPessoa = p => !String(p.Estado || "").toLowerCase().includes("inativ");
  const ymd = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
  function realAtivaNoMes(p, i) {
    if (!ativaPessoa(p)) return false;
    if (!temDatas) return true; // sem datas: fotografia atual aplicada a todos os meses (aproximação)
    const ini = new Date(new Date().getFullYear(), i, 1);
    const fim = new Date(new Date().getFullYear(), i + 1, 0);
    const de = ymd(p[cDataEnt]); const ds = cDataSai ? ymd(p[cDataSai]) : null;
    if (de && de > fim) return false;
    if (ds && ds < ini) return false;
    return true;
  }
  const realCustoPessoaMes = p => temCustoReal ? (Number(p[cCustoReal]) || 0) : 0;

  // chave de agregação de uma pessoa real, por nível
  function chaveRealPessoa(p, nivel) {
    const f = funcaoDaPessoa(p);
    if (nivel === "geral") return "TOTAL";
    if (nivel === "departamento") return norm(f?.Departamento || f?.Modulo || "—");
    if (nivel === "funcao") return norm(f?.Nome || "—");
    return norm(p.Nome || "—");
  }
  // chave de agregação de uma linha de plano, por nível
  function chavePlanoLinha(l, nivel) {
    if (nivel === "geral") return "TOTAL";
    if (nivel === "departamento") return norm(l[cm.departamento] || "—");
    if (nivel === "funcao") return norm(l[cm.categoria] || "—");
    return norm(l[cm.nome] || "(vaga)");
  }
  // rótulo legível para uma chave (usa a 1ª ocorrência no plano ou real)
  function rotulo(chave, nivel) {
    if (nivel === "geral") return "Total";
    const lp = linhas.find(l => chavePlanoLinha(l, nivel) === chave);
    if (lp) return (nivel === "departamento" ? lp[cm.departamento] : nivel === "funcao" ? lp[cm.categoria] : (lp[cm.nome] || "(vaga)"));
    const pr = dados.pessoas.find(p => chaveRealPessoa(p, nivel) === chave);
    if (pr) { const f = funcaoDaPessoa(pr); return nivel === "departamento" ? (f?.Departamento || f?.Modulo || "—") : nivel === "funcao" ? (f?.Nome || "—") : (pr.Nome || "—"); }
    return chave;
  }

  const i = M.mesIdx;
  const nivel = M.nivel;

  // construir agregados do mês i, por chave
  const agg = {}; // chave -> {pHC,pC,rHC,rC}
  const garante = k => (agg[k] ||= { pHC: 0, pC: 0, rHC: 0, rC: 0 });
  linhas.forEach(l => { const k = chavePlanoLinha(l, nivel); const a = garante(k); a.pHC += Number(l[cm.hc[i]]) || 0; a.pC += Number(l[cm.custo[i]]) || 0; });
  dados.pessoas.forEach(p => { if (!realAtivaNoMes(p, i)) return; const k = chaveRealPessoa(p, nivel); const a = garante(k); a.rHC += 1; a.rC += realCustoPessoaMes(p); });

  // totais do mês
  const tot = Object.values(agg).reduce((s, a) => ({ pHC: s.pHC + a.pHC, pC: s.pC + a.pC, rHC: s.rHC + a.rHC, rC: s.rC + a.rC }), { pHC: 0, pC: 0, rHC: 0, rC: 0 });
  const totAnoPlanoC = MESES.reduce((s, _, k) => s + planoCustoMes(k), 0);

  // ---- UI ----
  // barra: versão + nível + mês
  const selVersao = el("select", { class: "campo", style: "max-width:160px", onchange: e => { M.versao = e.target.value; self.render(core, alvo); } },
    ...M.versoes.map(v => el("option", { value: v, ...(v === M.versao ? { selected: "selected" } : {}) }, v)));
  const segNivel = el("div", { class: "orc-seg" },
    ...[["geral", "Geral"], ["departamento", "Departamento"], ["funcao", "Função"], ["pessoa", "Pessoa"]].map(([id, t]) =>
      el("button", { class: M.nivel === id ? "ativo" : "", onclick: () => { M.nivel = id; self.render(core, alvo); } }, t)));
  const navMes = el("div", { class: "mesnav" },
    el("button", { onclick: () => { M.mesIdx = (M.mesIdx + 11) % 12; self.render(core, alvo); } }, "‹"),
    el("span", { class: "mes" }, MESES[i]),
    el("button", { onclick: () => { M.mesIdx = (M.mesIdx + 1) % 12; self.render(core, alvo); } }, "›"));

  // KPIs do mês
  const kpi = (v, l, s, cls) => el("div", { class: "kpi " + (cls || "") }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null);
  const dHC = tot.rHC - tot.pHC, dC = tot.rC - tot.pC;
  const kpis = el("div", { class: "kpis" },
    kpi(Math.round(tot.pHC) + " / " + tot.rHC, "HC plano / real", "Δ " + sinal(dHC) + " pessoas", dHC > 0 ? "" : "livres"),
    kpi(temCustoReal ? (eurK(tot.pC) + " / " + eurK(tot.rC)) : (eurK(tot.pC) + " / —"), "Custo plano / real", temCustoReal ? ("Δ " + (dC >= 0 ? "+" : "") + eurK(dC)) : "falta custo real", "fixo"),
    kpi(eurK(totAnoPlanoC), "Plano anual (custo)", linhas.length + " posições · versão " + (M.versao || "—")));

  // tabela comparativa (ordenada por desvio absoluto de HC)
  const chaves = Object.keys(agg).filter(k => agg[k].pHC > 0 || agg[k].rHC > 0)
    .sort((a, b) => Math.abs(agg[b].rHC - agg[b].pHC) - Math.abs(agg[a].rHC - agg[a].pHC));
  const head = ["", "Plano HC", "Real HC", "Δ HC", "Plano €", "Real €", "Δ €"];
  const trCab = el("tr", {}, ...head.map((h, j) => el("th", { class: j ? "num" : "" }, h)));
  const corpoTab = chaves.map(k => {
    const a = agg[k]; const dh = a.rHC - a.pHC; const dc = a.rC - a.pC;
    const corDh = Math.abs(dh) < 0.5 ? "var(--mut)" : dh > 0 ? "var(--amber)" : "var(--danger)";
    return el("tr", {},
      el("td", {}, rotulo(k, nivel)),
      el("td", { class: "num" }, "" + Math.round(a.pHC)),
      el("td", { class: "num" }, "" + a.rHC),
      el("td", { class: "num", style: "color:" + corDh + ";font-weight:600" }, sinal(dh)),
      el("td", { class: "num" }, a.pC ? eur(a.pC) : "—"),
      el("td", { class: "num" }, temCustoReal ? (a.rC ? eur(a.rC) : "—") : "—"),
      el("td", { class: "num" }, (temCustoReal && (a.pC || a.rC)) ? (dc >= 0 ? "+" : "") + eur(dc) : "—"));
  });
  const tabela = nivel === "geral"
    ? null
    : el("table", { class: "orc-tab" }, el("thead", {}, trCab), el("tbody", {}, ...corpoTab),
        el("tfoot", {}, el("tr", {},
          el("td", {}, "Total"),
          el("td", { class: "num" }, "" + Math.round(tot.pHC)),
          el("td", { class: "num" }, "" + tot.rHC),
          el("td", { class: "num", style: "font-weight:600" }, sinal(dHC)),
          el("td", { class: "num" }, eur(tot.pC)),
          el("td", { class: "num" }, temCustoReal ? eur(tot.rC) : "—"),
          el("td", { class: "num" }, temCustoReal ? ((dC >= 0 ? "+" : "") + eur(dC)) : "—"))));

  // "Por conciliar": chaves que só existem num dos lados (exceto vagas planeadas, que são esperadas)
  const soPlano = chaves.filter(k => agg[k].pHC > 0 && agg[k].rHC === 0);
  const soReal = chaves.filter(k => agg[k].rHC > 0 && agg[k].pHC === 0);
  const conciliar = (nivel === "pessoa")
    ? el("div", { class: "orc-sec" },
        el("h3", {}, "Por conciliar"),
        el("p", { class: "mut", style: "font-size:13px;margin-top:-4px" },
          soPlano.length + " no plano sem correspondência no real (vagas por preencher ou nomes que não casaram) · " +
          soReal.length + " no real fora do plano (entradas não orçamentadas ou nomes diferentes)."))
    : null;

  // avisos de dados em falta
  const avisos = [];
  if (!temCustoReal) avisos.push("Falta a coluna de custo real na Lista Pessoas (ex.: \"CustoMensalReal\") — o lado de custo do real fica vazio.");
  if (!temDatas) avisos.push("Sem datas de entrada/saída na Lista Pessoas — o HC real é a fotografia atual aplicada a todos os meses (aproximação).");
  const nota = avisos.length ? el("div", { class: "mod-nota" }, avisos.join(" ")) : null;

  corpo.replaceChildren(
    el("div", { class: "orc-bar" },
      el("label", { style: "font-size:12px;color:var(--mut)" }, "Versão "), selVersao,
      segNivel,
      navMes),
    kpis,
    nota,
    tabela,
    conciliar
  );
}

// ============================================================================
//  ABA "PREVISÃO" — motor room nights → pessoas e custo
// ----------------------------------------------------------------------------
//  Reaproveita a lógica das Escalas, agregada por mês:
//   HSK: room nights média do mês × minutos ponderados ÷ horas produtivas
//   F&B: covers do mês ÷ rácios por outlet/área
//  Custo = HC previsto × custo unitário de referência (média do orçamento por
//  departamento, para o mês). A equipa fixa (Quadro) é o piso que se mantém.
// ============================================================================
const normD = s => String(s || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// necessidade de HSK para um mês com room nights.
// Devolve posições/dia por função + HC de pessoas (variáveis × fator de folgas;
// os mínimos fixos já são pessoas e não levam fator).
function previsaoHSK(mesNome) {
  const cfg = M.params?.hsk; const dias = M.rn?.[mesNome];
  if (!cfg || !dias || !cfg.tipos || !cfg.mix_tipologias) return null;
  const vals = Object.values(dias).map(Number).filter(n => !isNaN(n));
  if (!vals.length) return null;
  const rn = vals.reduce((a, b) => a + b, 0) / vals.length; // RN média diária do mês
  const mix = cfg.mix_tipologias, tipos = cfg.tipos;
  const pond = tarefa => Object.keys(mix).reduce((s, t) => s + (Number(mix[t]) || 0) * (Number((tipos[t] || {})[tarefa]) || 0), 0);
  const prod = (Number(cfg.horas_produtivas) || 6.8) * 60;
  const fx = cfg.fixos || {};
  const cob = fx.turndown_cob != null ? Number(fx.turndown_cob) : 1;
  // [posições/dia, é variável?]
  const f = {
    "Andares": [Math.max(Number(fx.min_andares) || 1, Math.ceil(rn * pond("Stayover") / prod)), true],
    "Turndown": [Math.max(1, Math.ceil(rn * cob * pond("Turndown") / prod)), true],
    "Valete": [Math.max(Number(fx.min_valet) || 1, Math.ceil(rn * pond("Valet") / prod)), true],
    "Áreas comuns": [Number(fx.areas) || 0, false],
    "Lavandaria": [Number(fx.lavandaria) || 1, false],
    "Governanta": [Number(fx.min_gov) || 1, false]
  };
  const fator = Number(M.fatorCob) || 1;
  let posicoes = 0, hc = 0;
  for (const k in f) { const [pos, varia] = f[k]; posicoes += pos; hc += varia ? Math.ceil(pos * fator) : pos; }
  return { rn, funcoes: f, posicoes, hc };
}

// necessidade de F&B para um mês. Usa o HC do simulador (hc_mensal: FOH/BOH/Ref)
// quando disponível — é a fonte calibrada e coerente com o plano. Caso não
// exista, calcula por covers ÷ rácios (fallback).
function previsaoFB(mesNome) {
  const fb = M.fb; if (!fb) return null;
  // 1) fonte preferida: HC do simulador
  const hcm = fb.hc_mensal && fb.hc_mensal[mesNome];
  if (hcm) {
    const total = Math.round(Number(hcm.total) || 0);
    return {
      simulador: true,
      areas: { "FOH (sala)": Math.round(hcm.foh || 0), "BOH (cozinha)": Math.round(hcm.boh || 0), "Referência": Math.round(hcm.ref || 0) },
      posicoes: total, hc: total
    };
  }
  // 2) fallback: covers ÷ rácios
  if (!fb.ratios || !fb.covers || !fb.dias_mes?.[mesNome]) return null;
  const dm = fb.dias_mes[mesNome];
  const areas = { "FOH Serviço": 0, "BOH Cozinha": 0, "BOH Copa": 0 };
  for (const o in fb.ratios) {
    if (!fb.covers[o]) continue;
    const covdia = (fb.covers[o][mesNome] || 0) / dm;
    for (const area in fb.ratios[o]) {
      const ratio = fb.ratios[o][area];
      areas[area] = (areas[area] || 0) + (ratio > 0 ? Math.ceil(covdia / ratio) : (covdia > 0 ? 1 : 0));
    }
  }
  const posicoes = Object.values(areas).reduce((a, b) => a + b, 0);
  const hc = Math.ceil(posicoes * (Number(M.fatorCob) || 1));
  return { areas, posicoes, hc };
}

// custo unitário mensal de referência por grupo de departamentos (do orçamento)
function custoUnitario(depsNorm, mesIdx) {
  const cm = M.colMap; if (!cm) return 0;
  let custo = 0, hc = 0;
  M.plano.filter(l => !M.versao || l[cm.versao] === M.versao).forEach(l => {
    if (depsNorm.includes(normD(l[cm.departamento]))) {
      custo += Number(l[cm.custo[mesIdx]]) || 0;
      hc += Number(l[cm.hc[mesIdx]]) || 0;
    }
  });
  return hc > 0 ? custo / hc : 0;
}

// equipa fixa de Quadro por grupo de departamentos (das pessoas reais)
function quadroFixo(depsNorm) {
  return dados.pessoas.filter(p => {
    if (String(p.Estado || "").toLowerCase().includes("inativ")) return false;
    if (!String(p.Vinculo || "").toUpperCase().includes("QUADRO")) return false;
    const f = funcaoDaPessoa(p);
    return depsNorm.includes(normD(f?.Departamento || f?.Modulo || ""));
  }).length;
}

function vistaPrevisao(corpo, self, core, alvo) {
  if (M.prevErro || !M.rn) {
    corpo.replaceChildren(el("div", { class: "mod-nota" },
      "Faltam dados para a previsão (escala_base.json / escala_fb.json). Detalhe: " + (M.prevErro || "sem room nights")));
    return;
  }
  const mesesComRN = Object.keys(M.rn);   // ex.: ["Junho","Julho"]
  if (!mesesComRN.length) {
    corpo.replaceChildren(el("div", { class: "mod-nota" }, "Sem room nights carregadas. Carrega o forecast para poder prever."));
    return;
  }
  if (!M.prevMes || !mesesComRN.includes(M.prevMes)) M.prevMes = mesesComRN[0];
  const mesNome = M.prevMes;
  const mesIdx = MESES_LONGOS.indexOf(mesNome);

  const hsk = previsaoHSK(mesNome);
  const fb = previsaoFB(mesNome);

  // custo unitário por grupo
  const cuHSK = custoUnitario(["HOUSEKEEPING"], mesIdx);
  const cuFB = custoUnitario(DEPS_FB, mesIdx);
  const hcHSK = hsk ? hsk.hc : 0, hcFB = fb ? fb.hc : 0;
  const custoHSK = hcHSK * cuHSK, custoFB = hcFB * cuFB;
  const fixoHSK = quadroFixo(["HOUSEKEEPING"]), fixoFB = quadroFixo(DEPS_FB);
  const hcTotal = hcHSK + hcFB, custoTotal = custoHSK + custoFB;

  // seletor de mês (só os que têm RN) + fator de cobertura
  const selMes = el("select", { class: "campo", style: "max-width:150px", onchange: e => { M.prevMes = e.target.value; self.render(core, alvo); } },
    ...mesesComRN.map(m => el("option", { value: m, ...(m === mesNome ? { selected: "selected" } : {}) }, m)));
  const inFator = el("input", { class: "campo", type: "number", step: "0.05", min: "1", style: "max-width:90px", value: "" + M.fatorCob,
    onchange: e => { M.fatorCob = Number(e.target.value) || 1.4; self.render(core, alvo); } });

  // KPIs
  const kpi = (v, l, s, cls) => el("div", { class: "kpi " + (cls || "") }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null);
  const kpis = el("div", { class: "kpis" },
    kpi(hsk ? Math.round(hsk.rn) : "—", "Room nights (média/dia)", "mês de " + mesNome),
    kpi("" + hcTotal, "HC previsto (HSK+F&B)", hcHSK + " HSK · " + hcFB + " F&B · folgas ×" + M.fatorCob),
    kpi(eurK(custoTotal), "Custo previsto / mês", "a custo unitário do plano", "fixo"));

  // tabela HSK por função (posições/dia + tipo)
  const secHSK = hsk ? el("div", { class: "orc-sec" },
    el("h3", {}, "Housekeeping — necessidade por função"),
    el("table", { class: "orc-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Função"), el("th", { class: "num" }, "Posições/dia"), el("th", {}, "Tipo"))),
      el("tbody", {}, ...Object.entries(hsk.funcoes).map(([f, [pos, varia]]) => el("tr", {}, el("td", {}, f), el("td", { class: "num" }, "" + pos), el("td", {}, varia ? "variável" : "fixo")))),
      el("tfoot", {}, el("tr", {}, el("td", {}, "Total — posições/dia · HC"), el("td", { class: "num" }, hsk.posicoes + " · " + hsk.hc), el("td", {}, ""))))) : null;

  // tabela F&B por área
  const secFB = fb ? el("div", { class: "orc-sec" },
    el("h3", {}, "F&B — necessidade por área"),
    el("table", { class: "orc-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Área"), el("th", { class: "num" }, "Posições/dia"))),
      el("tbody", {}, ...Object.entries(fb.areas).map(([a, n]) => el("tr", {}, el("td", {}, a), el("td", { class: "num" }, "" + n)))),
      el("tfoot", {}, el("tr", {}, el("td", {}, "Total — posições/dia · HC"), el("td", { class: "num" }, fb.posicoes + " · " + fb.hc))))) : null;

  // resumo por departamento: previsto vs fixo (quadro) vs plano congelado
  const planoHCdept = (depsNorm) => {
    const cm = M.colMap;
    return M.plano.filter(l => (!M.versao || l[cm.versao] === M.versao) && depsNorm.includes(normD(l[cm.departamento])))
      .reduce((s, l) => s + (Number(l[cm.hc[mesIdx]]) || 0), 0);
  };
  const resumo = el("div", { class: "orc-sec" },
    el("h3", {}, "Resumo por departamento — previsto vs plano"),
    el("table", { class: "orc-tab" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Departamento"), el("th", { class: "num" }, "Fixo (quadro)"),
        el("th", { class: "num" }, "HC previsto"), el("th", { class: "num" }, "HC plano"),
        el("th", { class: "num" }, "Custo previsto"))),
      el("tbody", {},
        el("tr", {}, el("td", {}, "Housekeeping"), el("td", { class: "num" }, "" + fixoHSK), el("td", { class: "num" }, "" + hcHSK), el("td", { class: "num" }, "" + Math.round(planoHCdept(["HOUSEKEEPING"]))), el("td", { class: "num" }, eur(custoHSK))),
        el("tr", {}, el("td", {}, "F&B"), el("td", { class: "num" }, "" + fixoFB), el("td", { class: "num" }, "" + hcFB), el("td", { class: "num" }, "" + Math.round(planoHCdept(DEPS_FB))), el("td", { class: "num" }, eur(custoFB)))),
      el("tfoot", {}, el("tr", {},
        el("td", {}, "Total"), el("td", { class: "num" }, "" + (fixoHSK + fixoFB)),
        el("td", { class: "num" }, "" + hcTotal), el("td", { class: "num" }, "" + Math.round(planoHCdept(["HOUSEKEEPING", ...DEPS_FB]))),
        el("td", { class: "num" }, eur(custoTotal))))));

  const nota = el("div", { class: "mod-nota" },
    "Método: HSK = room nights média × minutos ponderados ÷ horas produtivas (Parâmetros); F&B = covers ÷ rácios (Parâmetros). " +
    "Posições/dia → HC de pessoas aplicando o fator de cobertura de folgas (×" + M.fatorCob + ", padrão 5 dias / 2 folga) às funções variáveis; os mínimos fixos já são pessoas. " +
    "Custo = HC previsto × custo unitário médio do plano nesse departamento/mês. Cobre HSK e F&B (escalam com a procura); os restantes mantêm a equipa de quadro. " +
    "Só há room nights para: " + mesesComRN.join(", ") + ".");

  corpo.replaceChildren(
    el("div", { class: "orc-bar" },
      el("label", { style: "font-size:12px;color:var(--mut)" }, "Mês "), selMes,
      el("label", { style: "font-size:12px;color:var(--mut);margin-left:8px" }, "Fator folgas "), inFator),
    kpis, secHSK, secFB, resumo, nota);
}
