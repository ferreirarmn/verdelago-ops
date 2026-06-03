// ============================================================================
// hsk.js — Módulo Housekeeping: EQUIPA + PRESENÇAS
// ----------------------------------------------------------------------------
// Departamento de limpeza. NÃO gere alojamento (isso é o módulo Alojamento).
//  • Equipa    — pessoas do HSK: acrescentar, editar, inativar
//  • Presenças — marcar assiduidade por dia (Presente/Falta/Folga/Extra)
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import {
  dados, nomePessoa, funcaoPorId, funcaoDaPessoa, funcaoEhLookup, pessoasDoModulo
} from "../core/store.js";
import * as graph from "../core/graph.js";

const MOD = "HSK";
const M = { sub: "equipa", data: hoje(), presencas: [], presCarregado: false, verInativas: false };

function hoje() { return new Date().toISOString().slice(0, 10); }

function garantirEstilos() {
  if (document.getElementById("hsk-css")) return;
  const css = `
  .sub-tabs{display:flex;gap:6px;margin:14px 0 20px;border-bottom:1px solid var(--line)}
  .sub-tab{background:none;border:none;padding:10px 16px;font-size:14px;color:var(--mut);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
  .sub-tab.ativo{color:var(--teal);border-bottom-color:var(--teal);font-weight:600}
  .barra-acoes{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  .barra-acoes .esq{margin-right:auto;color:var(--mut);font-size:13px}
  .tab-pessoas{width:100%;border-collapse:collapse;font-size:14px;background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
  .tab-pessoas th{background:var(--soft);text-align:left;padding:10px 12px;font-size:12px;color:var(--teal-d);font-weight:600}
  .tab-pessoas td{padding:10px 12px;border-top:1px solid var(--line)}
  .tab-pessoas tr:hover td{background:var(--softer);cursor:pointer}
  .pill{font-size:11px;font-weight:600;padding:2px 9px;border-radius:11px;background:var(--soft);color:var(--teal)}
  .pill.inativo{background:#eee;color:#999}
  .campo{padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:14px;background:#fff;width:100%}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .form-grid label{font-size:12px;color:var(--mut);display:block;margin-bottom:4px}
  .btn{background:var(--teal);color:#fff;border:none;border-radius:9px;padding:9px 18px;font-weight:600;cursor:pointer}
  .btn:disabled{opacity:.6}
  .btn-sec{background:var(--soft);color:var(--teal-d);border:1px solid var(--line);border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer}
  .pres-linha{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:11px;padding:9px 14px;margin-bottom:7px}
  .pres-linha .nome{font-weight:600}
  .pres-linha .fn{color:var(--mut);font-size:12px}
  .pres-botoes{margin-left:auto;display:flex;gap:6px}
  .pres-b{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;color:var(--mut)}
  .pres-b:hover{background:var(--soft)}
  .pres-b.on-presente{background:#e8faf4;border-color:var(--teal2);color:var(--teal);font-weight:600}
  .pres-b.on-falta{background:#f7e3e3;border-color:#b34b4b;color:#b34b4b;font-weight:600}
  .pres-b.on-folga{background:#eef2f1;border-color:#9bb0ad;color:var(--mut);font-weight:600}
  .pres-b.on-extra{background:#fbeede;border-color:var(--amber);color:var(--amber);font-weight:600}
  .pres-kpis{display:flex;gap:10px;margin:0 0 16px;flex-wrap:wrap}
  .pres-kpis .kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 14px}
  .pres-kpis .kpi b{font-size:18px;color:var(--teal)}
  `;
  document.head.append(el("style", { id: "hsk-css", html: css }));
}

export const moduloHSK = {
  id: "hsk",
  nome: "Housekeeping",
  icone: "🧹",
  modulo: "HSK",

  async init() { garantirEstilos(); },

  render(core, alvo) {
    const self = this;
    const aba = (id, txt) => el("button", {
      class: "sub-tab" + (M.sub === id ? " ativo" : ""),
      onclick: () => { M.sub = id; self.render(core, alvo); }
    }, txt);

    const corpo = el("div", { id: "hsk-corpo" });
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "🧹 Housekeeping"),
        el("p", { class: "mut" }, "Departamento de limpeza — equipa e presenças.")),
      el("div", { class: "sub-tabs" }, aba("equipa", "Equipa"), aba("presencas", "Presenças")),
      corpo
    );

    if (M.sub === "equipa") vistaEquipa(self, core, alvo, corpo);
    else vistaPresencas(self, core, alvo, corpo);
  }
};

// ===================== EQUIPA =====================
function vistaEquipa(self, core, alvo, corpo) {
  const pessoas = pessoasDoModulo(MOD, M.verInativas);
  corpo.replaceChildren();

  const barra = el("div", { class: "barra-acoes" },
    el("span", { class: "esq" }, pessoas.length + " pessoas no Housekeeping"),
    el("label", { style: "font-size:13px;color:var(--mut)" },
      el("input", { type: "checkbox", ...(M.verInativas ? { checked: "checked" } : {}),
        onchange: () => { M.verInativas = !M.verInativas; self.render(core, alvo); } }),
      " mostrar inativas"),
    el("button", { class: "btn", onclick: () => editorPessoa(self, core, alvo, null) }, "+ Acrescentar pessoa")
  );
  corpo.append(barra);

  if (!pessoas.length) {
    corpo.append(el("div", { class: "mod-nota" },
      dados.pessoas.length
        ? "Há pessoas carregadas, mas nenhuma com função do Housekeeping. Confirma o FuncaoID/Departamento na Lista Pessoas/Funções."
        : "Ainda não há pessoas carregadas na Lista Pessoas."));
    return;
  }

  const linhas = pessoas
    .sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"))
    .map(p => {
      const f = funcaoDaPessoa(p);
      const inativa = (p.Estado || "").toLowerCase().includes("inativ");
      return el("tr", { onclick: () => editorPessoa(self, core, alvo, p) },
        el("td", {}, el("strong", {}, p.Nome || "—")),
        el("td", {}, f ? f.Nome : "—"),
        el("td", {}, p.EmpresaAgencia || "—"),
        el("td", {}, p.Vinculo || "—"),
        el("td", {}, el("span", { class: "pill" + (inativa ? " inativo" : "") }, p.Estado || "Ativo")));
    });
  corpo.append(el("table", { class: "tab-pessoas" },
    el("thead", {}, el("tr", {},
      el("th", {}, "Nome"), el("th", {}, "Função"), el("th", {}, "Empresa"), el("th", {}, "Vínculo"), el("th", {}, "Estado"))),
    el("tbody", {}, ...linhas)));
}

function proximoPessoaId() {
  const ns = dados.pessoas.map(p => parseInt(String(p.Title).replace(/^P/, ""), 10)).filter(n => !isNaN(n));
  return "P" + String((ns.length ? Math.max(...ns) : 0) + 1).padStart(3, "0");
}

function editorPessoa(self, core, alvo, p) {
  const novo = !p;
  const funcoesHSK = dados.funcoes
    .filter(f => f.Modulo === MOD || (f.Departamento || "").toUpperCase().includes("HOUSEKEEPING"))
    .sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));

  const fAtual = p ? funcaoDaPessoa(p) : null;
  const inNome = el("input", { class: "campo", value: p?.Nome || "" });
  const selFunc = el("select", { class: "campo" },
    el("option", { value: "" }, "— função —"),
    ...funcoesHSK.map(f => el("option", { value: f.Title, ...(fAtual && fAtual.Title === f.Title ? { selected: "selected" } : {}) }, f.Nome)));
  const inEmpresa = el("input", { class: "campo", value: p?.EmpresaAgencia || "" });
  const selVinculo = el("select", { class: "campo" },
    ...["", "Quadro", "Sazonal", "TT", "Estágio"].map(v =>
      el("option", { value: v, ...(p?.Vinculo === v ? { selected: "selected" } : {}) }, v || "— vínculo —")));
  const selEstado = el("select", { class: "campo" },
    ...["Ativo", "Por chegar", "Inativo"].map(v =>
      el("option", { value: v, ...((p?.Estado || "Ativo") === v ? { selected: "selected" } : {}) }, v)));

  let fechar;
  const guardar = el("button", { class: "btn", onclick: async () => {
    const nome = inNome.value.trim();
    if (!nome) return toast("Indica o nome.", "error");
    const campos = { Nome: nome, EmpresaAgencia: inEmpresa.value.trim(), Vinculo: selVinculo.value, Estado: selEstado.value };
    // função: escreve conforme a coluna seja Pesquisa ou texto
    const fId = selFunc.value;
    if (fId) {
      if (funcaoEhLookup()) {
        const fObj = dados.funcoes.find(f => f.Title === fId);
        if (fObj) campos.FuncaoIDLookupId = Number(fObj._id);
      } else campos.FuncaoID = fId;
    }
    try {
      guardar.disabled = true; badge("syncing");
      if (novo) {
        const id = proximoPessoaId();
        const r = await graph.criarItem("Pessoas", { Title: id, ...campos });
        dados.pessoas.push({ _id: r.id, Title: id, ...campos, FuncaoID: fId });
        toast("Pessoa criada: " + nome);
      } else {
        await graph.atualizarItem("Pessoas", p._id, campos);
        Object.assign(p, campos, fId && !funcaoEhLookup() ? { FuncaoID: fId } : {});
        if (fId && funcaoEhLookup()) p.FuncaoIDLookupId = campos.FuncaoIDLookupId;
        toast("Pessoa atualizada");
      }
      badge("connected"); fechar(); self.render(core, alvo);
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); guardar.disabled = false; }
  }}, novo ? "Criar" : "Guardar");

  const acoes = el("div", { style: "display:flex;gap:8px;margin-top:6px;flex-wrap:wrap" }, guardar);
  if (!novo) {
    const inativar = el("button", { class: "btn-sec", onclick: async () => {
      try { badge("syncing"); await graph.atualizarItem("Pessoas", p._id, { Estado: "Inativo" }); p.Estado = "Inativo"; badge("connected"); toast("Pessoa inativada"); fechar(); self.render(core, alvo); }
      catch (e) { badge("error"); toast("Falhou: " + e.message, "error"); }
    }}, "Inativar (retirar)");
    acoes.append(inativar);
  }

  const form = el("div", {},
    el("div", { class: "form-grid" },
      el("div", {}, el("label", {}, "Nome"), inNome),
      el("div", {}, el("label", {}, "Função"), selFunc),
      el("div", {}, el("label", {}, "Empresa / agência"), inEmpresa),
      el("div", {}, el("label", {}, "Vínculo"), selVinculo),
      el("div", {}, el("label", {}, "Estado"), selEstado)),
    acoes);
  fechar = modal(novo ? "Acrescentar pessoa (Housekeeping)" : "Editar — " + (p.Nome || ""), form);
}

// ===================== PRESENÇAS =====================
async function vistaPresencas(self, core, alvo, corpo) {
  corpo.replaceChildren(el("p", { class: "carregar" }, "A carregar presenças…"));
  if (!M.presCarregado) { M.presencas = await graph.lerLista("Presenças"); M.presCarregado = true; }

  const pessoas = pessoasDoModulo(MOD).sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));

  function presDe(pessoaId) {
    return M.presencas.find(x => x.PessoaID === pessoaId && String(x.Data || "").slice(0, 10) === M.data);
  }
  const ESTADOS = [["Presente", "presente"], ["Falta", "falta"], ["Folga", "folga"], ["Extra", "extra"]];

  async function marcar(pessoa, estado) {
    const existente = presDe(pessoa.Title);
    try {
      badge("syncing");
      if (existente) {
        await graph.atualizarItem("Presenças", existente._id, { Estado: estado });
        existente.Estado = estado;
      } else {
        const r = await graph.criarItem("Presenças", {
          Title: "PR" + Date.now(), PessoaID: pessoa.Title, Data: M.data, Estado: estado
        });
        M.presencas.push({ _id: r.id, Title: "PR", PessoaID: pessoa.Title, Data: M.data, Estado: estado });
      }
      badge("connected"); pintar();
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  }

  const inData = el("input", { type: "date", class: "campo", style: "max-width:180px", value: M.data,
    onchange: e => { M.data = e.target.value; pintar(); } });

  const lista = el("div", {});
  const kpis = el("div", { class: "pres-kpis" });

  function pintar() {
    const cont = { presente: 0, falta: 0, folga: 0, extra: 0, semmarca: 0 };
    lista.replaceChildren(...pessoas.map(p => {
      const pr = presDe(p.Title);
      const est = pr ? (pr.Estado || "").toLowerCase() : "";
      if (est && cont[est] != null) cont[est]++; else cont.semmarca++;
      const f = funcaoDaPessoa(p);
      return el("div", { class: "pres-linha" },
        el("div", {},
          el("div", { class: "nome" }, p.Nome || "—"),
          el("div", { class: "fn" }, f ? f.Nome : "")),
        el("div", { class: "pres-botoes" },
          ...ESTADOS.map(([lbl, key]) => el("button", {
            class: "pres-b" + (est === key ? " on-" + key : ""),
            onclick: () => marcar(p, lbl)
          }, lbl))));
    }));
    kpis.replaceChildren(
      el("div", { class: "kpi" }, el("b", {}, "" + cont.presente), " presentes"),
      el("div", { class: "kpi" }, el("b", {}, "" + cont.falta), " faltas"),
      el("div", { class: "kpi" }, el("b", {}, "" + cont.folga), " folgas"),
      el("div", { class: "kpi" }, el("b", {}, "" + cont.semmarca), " por marcar"));
  }

  corpo.replaceChildren(
    el("div", { class: "barra-acoes" }, el("span", { class: "esq" }, "Presenças do dia"), inData),
    kpis, lista);
  if (!pessoas.length) lista.append(el("div", { class: "mod-nota" }, "Sem pessoas do Housekeeping para marcar."));
  else pintar();
}
