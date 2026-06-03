// ============================================================================
// presencas.js — Grelha mensal de presenças (componente partilhado)
// ----------------------------------------------------------------------------
// Pessoas em linhas, dias do mês em colunas. Clique numa célula alterna o
// estado: vazio → Presente → Falta → Folga → vazio. Resumo por pessoa à direita.
// Usado pelo HSK, F&B e Náutico — cada módulo passa a sua lista de pessoas.
//
// Lê/escreve a Lista "Presenças" (PessoaID texto, Data, Estado).
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { funcaoDaPessoa } from "../core/store.js";
import * as graph from "../core/graph.js";

// ciclo de estados: clicar avança; a partir de Folga volta a vazio
const CICLO = ["", "Presente", "Falta", "Folga"];
const SIGLA = { "Presente": "P", "Falta": "F", "Folga": "D" };  // D = Dispensa/foLga
const CLASSE = { "Presente": "presente", "Falta": "falta", "Folga": "folga" };

let CACHE = null;   // presenças carregadas (partilhadas entre módulos)

function garantirEstilos() {
  if (document.getElementById("pres-grid-css")) return;
  const css = `
  .pg-topo{display:flex;align-items:center;gap:14px;margin:4px 0 8px;flex-wrap:wrap}
  .pg-nav{display:flex;align-items:center;gap:8px}
  .pg-nav button{border:1px solid var(--line);background:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:15px;color:var(--teal)}
  .pg-mes{font-weight:600;min-width:140px;text-align:center;text-transform:capitalize}
  .pg-busca{padding:8px 11px;border:1px solid var(--line);border-radius:9px;font-size:14px;min-width:220px;flex:1}
  .pg-legenda{font-size:12.5px;color:var(--mut)}
  .pg-legenda .s{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;font-weight:700;font-size:11px;margin:0 3px}
  .pg-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
  table.pg{border-collapse:collapse;font-size:12px;width:100%}
  table.pg th,table.pg td{border-bottom:1px solid var(--line);text-align:center;padding:0}
  table.pg thead th{position:sticky;top:0;background:var(--soft);color:var(--teal-d);font-weight:600;padding:6px 2px;z-index:2}
  table.pg th.pessoa,table.pg td.pessoa{position:sticky;left:0;background:#fff;text-align:left;padding:7px 12px;min-width:180px;border-right:1px solid var(--line);z-index:1}
  table.pg thead th.pessoa{z-index:3}
  table.pg td.pessoa .nm{font-weight:600;font-size:13px}
  table.pg td.pessoa .fn{color:var(--mut);font-size:11px}
  table.pg th.dia{min-width:30px;font-weight:600}
  table.pg th.dia .dn{font-size:10px;color:var(--mut);font-weight:500;display:block}
  table.pg th.dia.fds{color:var(--amber)}
  table.pg th.hoje{background:var(--teal);color:#fff;border-radius:6px 6px 0 0}
  td.cel{cursor:pointer;width:30px;height:34px}
  td.cel .b{display:flex;align-items:center;justify-content:center;width:24px;height:24px;margin:auto;border-radius:6px;font-weight:700;font-size:11px;color:var(--mut)}
  td.cel:hover .b{outline:2px solid var(--teal2);outline-offset:-2px}
  td.cel.fds{background:#fcfaf6}
  td.cel.hoje{box-shadow:inset 0 0 0 2px var(--teal2)}
  .b.presente{background:#e8faf4;color:var(--teal)}
  .b.falta{background:#f7e3e3;color:#b34b4b}
  .b.folga{background:#eef2f1;color:#7a8f8c}
  th.resumo,td.resumo{position:sticky;right:0;background:#fff;border-left:1px solid var(--line);padding:6px 10px;min-width:120px;text-align:left;font-size:11.5px}
  td.resumo .pc{font-weight:700;color:var(--teal)}
  `;
  document.head.append(el("style", { id: "pres-grid-css", html: css }));
}

function diasDoMes(ano, mes) { // mes 0-11
  const n = new Date(ano, mes + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => new Date(ano, mes, i + 1));
}
const iso = d => d.toISOString().slice(0, 10);
const ehFds = d => [0, 6].includes(d.getDay());

/**
 * Desenha a grelha mensal num elemento alvo.
 * @param {HTMLElement} alvo
 * @param {Array} pessoas  lista de pessoas (objetos com Title e Nome)
 * @param {Object} opts    { mes?:Date }  mês inicial
 */
export async function grelhaPresencas(alvo, pessoas, opts = {}) {
  garantirEstilos();
  let ref = opts.mes || new Date();
  let filtro = "";

  alvo.replaceChildren(el("p", { class: "carregar" }, "A carregar presenças…"));
  if (!CACHE) CACHE = await graph.lerLista("Presenças");

  const hojeIso = iso(new Date());

  function presDe(pessoaId, dataIso) {
    return CACHE.find(x => x.PessoaID === pessoaId && String(x.Data || "").slice(0, 10) === dataIso);
  }

  async function alternar(pessoa, dataIso, celB) {
    const atual = presDe(pessoa.Title, dataIso);
    const estAtual = atual ? (atual.Estado || "") : "";
    const prox = CICLO[(CICLO.indexOf(estAtual) + 1) % CICLO.length];
    try {
      badge("syncing");
      if (!atual && prox) {
        const r = await graph.criarItem("Presenças", {
          Title: "PR" + Date.now(), PessoaID: pessoa.Title, Data: dataIso, Estado: prox
        });
        CACHE.push({ _id: r.id, PessoaID: pessoa.Title, Data: dataIso, Estado: prox });
      } else if (atual && prox) {
        await graph.atualizarItem("Presenças", atual._id, { Estado: prox });
        atual.Estado = prox;
      } else if (atual && !prox) {
        await graph.apagarItem("Presenças", atual._id);
        CACHE = CACHE.filter(x => x !== atual);
      }
      badge("connected");
      pintarCelula(celB, prox);
      atualizarResumo(pessoa);
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  }

  function pintarCelula(b, estado) {
    b.className = "b" + (CLASSE[estado] ? " " + CLASSE[estado] : "");
    b.textContent = SIGLA[estado] || "";
  }

  const resumoRefs = {}; // pessoaId -> td

  function calcResumo(pessoaId, dias) {
    let p = 0, f = 0;
    for (const d of dias) {
      const r = presDe(pessoaId, iso(d));
      if (!r) continue;
      if (r.Estado === "Presente") p++;
      else if (r.Estado === "Falta") f++;
    }
    const base = p + f;
    const pct = base ? Math.round((p / base) * 100) : 100;
    return { p, f, pct };
  }
  function atualizarResumo(pessoa) {
    const td = resumoRefs[pessoa.Title];
    if (!td) return;
    const dias = diasDoMes(ref.getFullYear(), ref.getMonth());
    const { p, f, pct } = calcResumo(pessoa.Title, dias);
    td.replaceChildren(el("span", {}, p + "P · " + f + "F · "), el("span", { class: "pc" }, pct + "%"));
  }

  function desenhar() {
    const ano = ref.getFullYear(), mes = ref.getMonth();
    const dias = diasDoMes(ano, mes);
    const nomeMes = ref.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    const lista = pessoas.filter(p => !filtro || (p.Nome || "").toLowerCase().includes(filtro));

    // cabeçalho
    const thsDias = dias.map(d => {
      const cls = "dia" + (ehFds(d) ? " fds" : "") + (iso(d) === hojeIso ? " hoje" : "");
      const dn = d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3);
      return el("th", { class: cls }, "" + d.getDate(), el("span", { class: "dn" }, dn));
    });
    const thead = el("thead", {}, el("tr", {},
      el("th", { class: "pessoa" }, "Pessoa"), ...thsDias, el("th", { class: "resumo" }, "Resumo")));

    // linhas
    const linhas = lista.map(p => {
      const f = funcaoDaPessoa(p);
      const tdResumo = el("td", { class: "resumo" });
      resumoRefs[p.Title] = tdResumo;
      const cels = dias.map(d => {
        const di = iso(d);
        const r = presDe(p.Title, di);
        const b = el("div", { class: "b" });
        pintarCelula(b, r ? r.Estado : "");
        const td = el("td", {
          class: "cel" + (ehFds(d) ? " fds" : "") + (di === hojeIso ? " hoje" : ""),
          onclick: () => alternar(p, di, b)
        }, b);
        return td;
      });
      const tr = el("tr", {},
        el("td", { class: "pessoa" },
          el("div", { class: "nm" }, p.Nome || "—"),
          el("div", { class: "fn" }, f ? f.Nome : "")),
        ...cels, tdResumo);
      return tr;
    });

    alvo.replaceChildren(
      el("div", { class: "pg-topo" },
        el("div", { class: "pg-nav" },
          el("button", { onclick: () => { ref = new Date(ano, mes - 1, 1); desenhar(); } }, "‹"),
          el("span", { class: "pg-mes" }, nomeMes),
          el("button", { onclick: () => { ref = new Date(ano, mes + 1, 1); desenhar(); } }, "›")),
        el("input", { class: "pg-busca", placeholder: "Procurar pessoa…", value: filtro,
          oninput: e => { filtro = e.target.value.trim().toLowerCase(); desenhar(); } }),
        el("div", { class: "pg-legenda" },
          el("span", { class: "s presente" }, "P"), "Presente ",
          el("span", { class: "s falta" }, "F"), "Falta ",
          el("span", { class: "s folga" }, "D"), "Folga — clica para alternar")),
      el("div", { class: "pg-wrap" }, el("table", { class: "pg" }, thead, el("tbody", {}, ...linhas)))
    );
    lista.forEach(p => atualizarResumo(p));
  }

  desenhar();
}

/** Força recarregar as presenças do servidor na próxima abertura. */
export function limparCachePresencas() { CACHE = null; }
