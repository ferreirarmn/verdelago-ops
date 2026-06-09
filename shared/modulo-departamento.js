// ============================================================================
// modulo-departamento.js — Fábrica de módulos de departamento
// ----------------------------------------------------------------------------
// Cria um módulo com sub-separadores Equipa (CRUD de pessoas) e Presenças
// (grelha mensal partilhada). Usado por HSK, F&B, Recreativo e Serviços Centrais.
//
//   criarModuloDepartamento({
//     id, nome, icone,
//     selPessoas: (incluirInativas) => [...],   // quem pertence ao módulo
//     selFuncoes: () => [...],                   // funções para o dropdown
//   })
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import { dados, funcaoDaPessoa, funcaoEhLookup } from "../core/store.js";
import * as graph from "../core/graph.js";
import { grelhaPresencas } from "./presencas.js";

function garantirEstilos() {
  if (document.getElementById("moddept-css")) return;
  const css = `
  .sub-tabs{display:flex;gap:6px;margin:14px 0 20px;border-bottom:1px solid var(--line)}
  .sub-tab{background:none;border:none;padding:10px 16px;font-size:14px;color:var(--mut);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
  .sub-tab.ativo{color:var(--teal);border-bottom-color:var(--teal);font-weight:600}
  .barra-acoes{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
  .barra-acoes .esq{margin-right:auto;color:var(--mut);font-size:13px}
  .tab-pessoas{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh-1)}
  .tab-pessoas th{background:transparent;text-align:left;padding:13px 16px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:600;border-bottom:1px solid var(--line)}
  .tab-pessoas td{padding:11px 16px;border-top:1px solid var(--line-2)}
  .tab-pessoas tbody tr{transition:background .12s}
  .tab-pessoas tbody tr:hover td{background:var(--softer);cursor:pointer}
  .pess-nome{display:flex;align-items:center;gap:11px}
  .avatar{width:34px;height:34px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;letter-spacing:.02em}
  .pess-nome .n{font-weight:600;color:var(--ink)}
  .pill{font-size:11px;font-weight:600;padding:3px 11px;border-radius:999px;background:var(--soft);color:var(--teal);display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
  .pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.75}
  .pill.sem::before{display:none}
  .pill-emp{font-size:11.5px;font-weight:600;padding:3px 11px;border-radius:999px;white-space:nowrap}
  .e-verde{background:#e7f5ec;color:#2f7d4f} .e-azul{background:#e8f0fb;color:#3667b0}
  .e-rosa{background:#fbeaf0;color:#b0436e} .e-teal{background:#e6f4f2;color:var(--teal)}
  .e-laranja{background:#fbeede;color:#b3702a} .e-cinza{background:#eef0ef;color:#6a7773}
  .est-ativo{background:#e7f5ec;color:#2f7d4f} .est-inativo{background:#eef0ef;color:#98a2a0}
  .est-chegar{background:#fbeede;color:#b3702a} .est-teste{background:#e8f0fb;color:#3667b0}
  .campo{padding:9px 11px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:var(--card);width:100%}
  .campo:focus{border-color:var(--teal2);box-shadow:0 0 0 3px rgba(23,155,143,.15);outline:none}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .form-grid label{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);font-weight:600;display:block;margin-bottom:5px}
  .btn{background:var(--teal);color:#fff;border:none;border-radius:var(--r-sm);padding:10px 18px;font-weight:600;cursor:pointer;box-shadow:var(--sh-1);transition:background .15s,transform .12s}
  .btn:hover{background:var(--teal-d);transform:translateY(-1px)}
  .btn:disabled{opacity:.55;transform:none}
  .btn-sec{background:var(--card);color:var(--teal-d);border:1px solid var(--line);border-radius:var(--r-sm);padding:9px 14px;font-weight:600;cursor:pointer}
  .btn-sec:hover{background:var(--soft)}
  `;
  document.head.append(el("style", { id: "moddept-css", html: css }));
}

function proximoPessoaId() {
  const ns = dados.pessoas.map(p => parseInt(String(p.Title).replace(/^P/, ""), 10)).filter(n => !isNaN(n));
  return "P" + String((ns.length ? Math.max(...ns) : 0) + 1).padStart(3, "0");
}

// cor da pill de empresa (tom suave por agência)
function classeEmpresa(emp) {
  const e = (emp || "").toLowerCase();
  if (e.includes("timing")) return "e-azul";
  if (e.includes("talenter")) return "e-verde";
  if (e.includes("serlima")) return "e-rosa";
  if (e.includes("verdelago") || e.includes("b&g") || e.includes("blue")) return "e-teal";
  if (!e) return "e-cinza";
  return "e-laranja";
}
function classeEstado(est) {
  const e = (est || "").toLowerCase();
  if (e.includes("inativ")) return "est-inativo";
  if (e.includes("cheg")) return "est-chegar";
  if (e.includes("teste")) return "est-teste";
  return "est-ativo";
}
// avatar: iniciais + cor estável a partir do nome
const PALETA = ["#2f7d4f", "#3667b0", "#b0436e", "#0d5450", "#b3702a", "#6a5fb0", "#1f8a8a"];
function avatar(nome) {
  const txt = String(nome || "?").trim();
  const ini = txt.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) % 997;
  return el("span", { class: "avatar", style: "background:" + PALETA[h % PALETA.length] }, ini);
}

export function criarModuloDepartamento(cfg) {
  const M = { sub: "equipa", verInativas: false };

  function render(core, alvo) {
    garantirEstilos();
    const aba = (id, txt) => el("button", {
      class: "sub-tab" + (M.sub === id ? " ativo" : ""),
      onclick: () => { M.sub = id; render(core, alvo); }
    }, txt);

    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, cfg.nome),
        el("p", { class: "mut" }, "Equipa e presenças.")),
      el("div", { class: "sub-tabs" }, aba("equipa", "Equipa"), aba("presencas", "Presenças")),
      corpo
    );
    if (M.sub === "equipa") vistaEquipa(corpo, core, alvo);
    else vistaPresencas(corpo);
  }

  // -------- EQUIPA --------
  function vistaEquipa(corpo, core, alvo) {
    const pessoas = cfg.selPessoas(M.verInativas);
    corpo.replaceChildren(
      el("div", { class: "barra-acoes" },
        el("span", { class: "esq" }, pessoas.length + " pessoas em " + cfg.nome),
        el("label", { style: "font-size:13px;color:var(--mut)" },
          el("input", { type: "checkbox", ...(M.verInativas ? { checked: "checked" } : {}),
            onchange: () => { M.verInativas = !M.verInativas; render(core, alvo); } }),
          " mostrar inativas"),
        el("button", { class: "btn", onclick: () => editorPessoa(null, core, alvo) }, "+ Acrescentar pessoa"))
    );

    if (!pessoas.length) {
      corpo.append(el("div", { class: "mod-nota" },
        dados.pessoas.length
          ? "Há pessoas carregadas, mas nenhuma neste módulo. Confirma o FuncaoID/Departamento na Lista Pessoas/Funções."
          : "Ainda não há pessoas carregadas na Lista Pessoas."));
      return;
    }

    const linhas = pessoas
      .sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"))
      .map(p => {
        const f = funcaoDaPessoa(p);
        return el("tr", { onclick: () => editorPessoa(p, core, alvo) },
          el("td", {}, el("div", { class: "pess-nome" }, avatar(p.Nome), el("span", { class: "n" }, p.Nome || "—"))),
          el("td", {}, f ? f.Nome : "—"),
          el("td", {}, p.EmpresaAgencia ? el("span", { class: "pill-emp " + classeEmpresa(p.EmpresaAgencia) }, p.EmpresaAgencia) : el("span", { class: "mut" }, "—")),
          el("td", {}, p.Vinculo || el("span", { class: "mut" }, "—")),
          el("td", {}, el("span", { class: "pill " + classeEstado(p.Estado) }, p.Estado || "Ativo")));
      });
    corpo.append(el("table", { class: "tab-pessoas" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Nome"), el("th", {}, "Função"), el("th", {}, "Empresa"), el("th", {}, "Vínculo"), el("th", {}, "Estado"))),
      el("tbody", {}, ...linhas)));
  }

  function editorPessoa(p, core, alvo) {
    const novo = !p;
    const funcoes = cfg.selFuncoes().sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));
    const fAtual = p ? funcaoDaPessoa(p) : null;

    const inNome = el("input", { class: "campo", value: p?.Nome || "" });
    const selFunc = el("select", { class: "campo" },
      el("option", { value: "" }, "— função —"),
      ...funcoes.map(f => el("option", { value: f.Title, ...(fAtual && fAtual.Title === f.Title ? { selected: "selected" } : {}) }, f.Nome)));
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
          dados.pessoas.push({ _id: r.id, Title: id, ...campos, ...(fId && !funcaoEhLookup() ? { FuncaoID: fId } : {}) });
          toast("Pessoa criada: " + nome);
        } else {
          await graph.atualizarItem("Pessoas", p._id, campos);
          Object.assign(p, campos);
          if (fId && !funcaoEhLookup()) p.FuncaoID = fId;
          if (fId && funcaoEhLookup()) p.FuncaoIDLookupId = campos.FuncaoIDLookupId;
          toast("Pessoa atualizada");
        }
        badge("connected"); fechar(); render(core, alvo);
      } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); guardar.disabled = false; }
    }}, novo ? "Criar" : "Guardar");

    const acoes = el("div", { style: "display:flex;gap:8px;margin-top:6px;flex-wrap:wrap" }, guardar);
    if (!novo) {
      acoes.append(el("button", { class: "btn-sec", onclick: async () => {
        try { badge("syncing"); await graph.atualizarItem("Pessoas", p._id, { Estado: "Inativo" }); p.Estado = "Inativo"; badge("connected"); toast("Pessoa inativada"); fechar(); render(core, alvo); }
        catch (e) { badge("error"); toast("Falhou: " + e.message, "error"); }
      }}, "Inativar (retirar)"));
    }

    const form = el("div", {},
      el("div", { class: "form-grid" },
        el("div", {}, el("label", {}, "Nome"), inNome),
        el("div", {}, el("label", {}, "Função"), selFunc),
        el("div", {}, el("label", {}, "Empresa / agência"), inEmpresa),
        el("div", {}, el("label", {}, "Vínculo"), selVinculo),
        el("div", {}, el("label", {}, "Estado"), selEstado)),
      acoes);
    fechar = modal(novo ? "Acrescentar pessoa — " + cfg.nome : "Editar — " + (p.Nome || ""), form);
  }

  // -------- PRESENÇAS --------
  async function vistaPresencas(corpo) {
    const pessoas = cfg.selPessoas(false).sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));
    if (!pessoas.length) {
      corpo.replaceChildren(el("div", { class: "mod-nota" }, "Sem pessoas neste módulo para marcar presenças."));
      return;
    }
    await grelhaPresencas(corpo, pessoas);
  }

  return { id: cfg.id, nome: cfg.nome, icone: cfg.icone, async init() { garantirEstilos(); }, render };
}
