// ============================================================================
// importar-equipa.js — Importação de equipa por departamento (Excel)
// ----------------------------------------------------------------------------
// Usado pelo módulo de departamento (F&B, HSK, Recreativo, SC). Lê um Excel,
// casa cada linha com as pessoas existentes (por nome), e mostra um preview
// de diferenças (criar / atualizar / possíveis saídas) ANTES de aplicar.
// Aplica item a item (escritas individuais ao Graph, que funcionam na rede).
//
// Colunas reconhecidas (nomes flexíveis): Nome, Função, Empresa, Vínculo,
// Estado, e os campos extra da Lista Pessoas (custo real, datas) se existirem.
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import { dados, funcaoEhLookup } from "../core/store.js";
import * as graph from "../core/graph.js";

const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const isoData = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

function carregarXLSX() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar o leitor de Excel."));
    document.head.append(s);
  });
}

// procura um valor numa linha por vários nomes de coluna possíveis
function campo(row, ...nomes) {
  const chaves = Object.keys(row);
  for (const n of nomes) {
    const alvo = norm(n);
    const k = chaves.find(c => norm(c) === alvo);
    if (k != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

const mapEstado = v => { const e = norm(v); if (!e) return "Ativo"; if (e.includes("inativ") || e.includes("dispens") || e.includes("saiu") || e.includes("saida") || e.includes("desligad")) return "Inativo"; if (e.includes("cheg")) return "Por chegar"; return String(v).trim(); };
const classVinc = v => { const s = norm(v); if (s.includes("quadro")) return "Quadro"; if (s.includes("sazon")) return "Sazonal"; if (s.includes("estag") || s.includes("estág")) return "Estágio"; if (s.includes("tt") || s.includes("tempor")) return "TT"; return String(v || "").trim(); };

// resolve texto de função -> Title, restringindo às funções do módulo
function resolverFuncao(txt, funcoesModulo) {
  const n = norm(txt); if (!n) return null;
  let f = funcoesModulo.find(x => norm(x.Nome) === n);
  if (f) return f;
  f = funcoesModulo.find(x => { const fn = norm(x.Nome); return fn && (fn.includes(n) || n.includes(fn)); });
  return f || null;
}

// constrói o patch a partir do workbook
function construirPatch(wb, cfg, colsExtra) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = window.XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  const funcoesModulo = cfg.selFuncoes();
  const vivasModulo = cfg.selPessoas(true);                 // do departamento (inc. inativas)
  const todas = dados.pessoas;                              // todas (para evitar duplicar entre depts)
  const porNome = new Map(); todas.forEach(p => porNome.set(norm(p.Nome), p));
  const nomesFich = new Set();

  const criar = [], atualizar = [], iguais = [], avisos = [];

  for (const r of linhas) {
    const nome = campo(r, "Nome", "Colaborador", "Vagas Preenchidas", "Nome Completo");
    if (!nome) continue;
    nomesFich.add(norm(nome));
    const empresa = campo(r, "Empresa", "Agência", "Agencia", "EmpresaAgencia", "N_CENTRO_CUSTO");
    const vinc = classVinc(campo(r, "Vínculo", "Vinculo", "VINCULO"));
    const estado = mapEstado(campo(r, "Estado", "Situação", "Situacao"));
    const funcTxt = campo(r, "Função", "Funcao", "Categoria", "N_CATEGORIA", "Cargo");
    const fObj = funcTxt ? resolverFuncao(funcTxt, funcoesModulo) : null;
    if (funcTxt && !fObj) avisos.push("Função não reconhecida em " + cfg.nome + ": “" + funcTxt + "” (" + nome + ") — fica sem função.");

    // campos extra (custo real, datas) presentes no ficheiro
    const extra = {};
    for (const c of (colsExtra || [])) {
      const v = campo(r, c.displayName, c.name);
      if (v === "") continue;
      if (c.tipo === "number") { const n = Number(v.replace(",", ".")); if (!isNaN(n)) extra[c.name] = n; }
      else if (c.tipo === "date") { const iso = isoData(v); if (iso) extra[c.name] = iso; }
      else extra[c.name] = v;
    }

    const viva = porNome.get(norm(nome));
    if (viva) {
      const campos = {};
      if (empresa && empresa !== (viva.EmpresaAgencia || "")) campos.EmpresaAgencia = empresa;
      if (vinc && vinc !== (viva.Vinculo || "")) campos.Vinculo = vinc;
      if (estado && estado !== (viva.Estado || "")) campos.Estado = estado;
      if (fObj) {
        const atualFid = funcaoEhLookup() ? null : viva.FuncaoID;
        if (!funcaoEhLookup() && fObj.Title !== atualFid) campos.FuncaoID = fObj.Title;
        if (funcaoEhLookup()) campos.FuncaoIDLookupId = Number(fObj._id);
      }
      for (const k in extra) if (extra[k] !== viva[k]) campos[k] = extra[k];
      if (Object.keys(campos).length) atualizar.push({ p: viva, nome, campos });
      else iguais.push(nome);
    } else {
      criar.push({ nome, empresa, vinc, estado, fObj, extra });
    }
  }

  // possíveis saídas: pessoas ativas do módulo que não vieram no ficheiro
  const saidas = vivasModulo.filter(p =>
    !String(p.Estado || "").toLowerCase().includes("inativ") && !nomesFich.has(norm(p.Nome)));

  return { criar, atualizar, iguais, saidas, avisos, colsExtra };
}

// próximo ID de pessoa (Pxxx) — evita colisões com os já existentes e os a criar
function proximoId(offset) {
  let max = 0;
  for (const p of dados.pessoas) { const m = /^P0*(\d+)$/.exec(p.Title || ""); if (m) max = Math.max(max, Number(m[1])); }
  return "P" + String(max + 1 + offset).padStart(3, "0");
}

// ---- entrada principal: abre o fluxo de importação ----
export function abrirImportarEquipa(cfg, colsExtra, aoConcluir) {
  const inFich = el("input", { type: "file", accept: ".xlsx,.xls", style: "display:none",
    onchange: async e => { const f = e.target.files[0]; if (f) await processar(f); } });

  const corpo = el("div", {},
    el("p", { class: "mut" }, "Escolhe um Excel com a equipa COMPLETA de " + cfg.nome + ". A app sincroniza: cria entradas e pessoas a chegar, atualiza quem mudou, e marca como saída quem estiver no sistema mas não no ficheiro. Colunas: Nome (obrigatória), Função, Empresa, Vínculo, Estado" + ((colsExtra || []).length ? ", " + colsExtra.map(c => c.displayName).join(", ") : "") + "."),
    el("div", { class: "pp-acoes" },
      el("button", { class: "btn", onclick: () => inFich.click() }, "Escolher ficheiro…"), inFich));
  const fechar = modal("Importar equipa — " + cfg.nome, corpo);

  async function processar(file) {
    try {
      badge("syncing");
      await carregarXLSX();
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: "array" });
      const patch = construirPatch(wb, cfg, colsExtra);
      badge("connected");
      mostrarPreview(patch, file.name);
    } catch (err) { badge("error", err.message); toast("Falha a ler: " + err.message, "error"); }
  }

  function mostrarPreview(patch, ficheiro) {
    const { criar, atualizar, iguais, saidas, avisos } = patch;
    const chkSaidas = el("input", { type: "checkbox", checked: "checked" });   // sincronização completa por defeito

    const linhaPess = (txt, sub) => el("div", { style: "padding:6px 0;border-bottom:1px solid var(--line-2)" },
      el("div", { style: "font-weight:600" }, txt), sub ? el("div", { class: "mut", style: "font-size:12px" }, sub) : null);

    const secs = [];
    secs.push(el("div", { class: "kpis" },
      el("div", { class: "kpi livres" }, el("div", { class: "v" }, "" + criar.length), el("div", { class: "l" }, "Entradas (criar)")),
      el("div", { class: "kpi" }, el("div", { class: "v" }, "" + atualizar.length), el("div", { class: "l" }, "A atualizar")),
      el("div", { class: "kpi" }, el("div", { class: "v" }, "" + iguais.length), el("div", { class: "l" }, "Sem alteração")),
      el("div", { class: "kpi gap" }, el("div", { class: "v" }, "" + saidas.length), el("div", { class: "l" }, "Saídas (inativar)"))));

    if (avisos.length) secs.push(el("div", { class: "mod-nota" }, avisos.slice(0, 6).join(" ") + (avisos.length > 6 ? " (+" + (avisos.length - 6) + ")" : "")));

    if (criar.length) secs.push(el("div", { class: "orc-sec" }, el("h3", {}, "Entradas — novas pessoas (" + criar.length + ")"),
      el("div", {}, ...criar.slice(0, 40).map(c => linhaPess(c.nome, [c.fObj?.Nome, c.vinc, c.estado, c.empresa].filter(Boolean).join(" · "))))));
    if (atualizar.length) secs.push(el("div", { class: "orc-sec" }, el("h3", {}, "A atualizar (" + atualizar.length + ")"),
      el("div", {}, ...atualizar.slice(0, 40).map(u => linhaPess(u.nome, Object.keys(u.campos).join(", "))))));
    if (saidas.length) secs.push(el("div", { class: "orc-sec" }, el("h3", {}, "Saídas — no sistema mas não no ficheiro (" + saidas.length + ")"),
      el("div", { class: "mod-nota" }, "Confirma que o ficheiro tem a equipa COMPLETA de " + cfg.nome + ". Estas pessoas serão marcadas como saída (inativas) — o histórico mantém-se, deixam só de aparecer na equipa ativa."),
      el("label", { style: "display:flex;gap:8px;align-items:center;margin:4px 0 10px;font-size:13px" }, chkSaidas, " marcar estas " + saidas.length + " pessoas como saída (desliga se o ficheiro for parcial)"),
      el("div", {}, ...saidas.slice(0, 40).map(p => linhaPess(p.Nome, "ativa no sistema, ausente do ficheiro")))));

    const log = el("div", { class: "atz-log", style: "display:none" });
    const btnAplicar = el("button", { class: "btn", onclick: () => aplicar(patch, chkSaidas.checked, btnAplicar, log) },
      "Aplicar atualização da equipa");
    if (!criar.length && !atualizar.length && !saidas.length) btnAplicar.disabled = true;

    corpo.replaceChildren(
      el("div", { class: "atz-fonte" }, el("span", {}, "Ficheiro: "), el("strong", {}, ficheiro)),
      ...secs,
      el("div", { class: "pp-acoes" }, btnAplicar, el("button", { class: "btn-sec", onclick: () => fechar() }, "Cancelar")),
      log);
  }

  async function aplicar(patch, marcarSaidas, btn, log) {
    btn.disabled = true; log.style.display = ""; log.replaceChildren(); badge("syncing");
    const linha = (txt, ok = true) => log.append(el("div", { class: ok ? "ok" : "ko" }, (ok ? "✓ " : "✗ ") + txt));
    let nOk = 0, nErr = 0;

    for (const u of patch.atualizar) {
      try { await graph.atualizarItem("Pessoas", u.p._id, u.campos); Object.assign(u.p, u.campos); linha("Atualizado: " + u.nome); nOk++; }
      catch (e) { linha("Falha ao atualizar " + u.nome + ": " + e.message, false); nErr++; }
    }
    let i = 0;
    for (const c of patch.criar) {
      const id = proximoId(i);
      const campos = { Title: id, Nome: c.nome, EmpresaAgencia: c.empresa || "", Vinculo: c.vinc || "", Estado: c.estado || "Ativo", ...c.extra };
      if (c.fObj) { if (funcaoEhLookup()) campos.FuncaoIDLookupId = Number(c.fObj._id); else campos.FuncaoID = c.fObj.Title; }
      try {
        const r = await graph.criarItem("Pessoas", campos);
        dados.pessoas.push({ _id: r.id, ...campos, ...(c.fObj && !funcaoEhLookup() ? { FuncaoID: c.fObj.Title } : {}) });
        linha("Criado: " + c.nome + " (" + id + ")"); nOk++; i++;
      } catch (e) { linha("Falha ao criar " + c.nome + ": " + e.message, false); nErr++; }
    }
    if (marcarSaidas) {
      const hoje = new Date().toISOString();
      const colDataSaida = (patch.colsExtra || []).find(c => c.tipo === "date" && /said|fim|termo/i.test(c.name + " " + (c.displayName || "")));
      for (const p of patch.saidas) {
        const campos = { Estado: "Inativo" };
        if (colDataSaida && !p[colDataSaida.name]) campos[colDataSaida.name] = hoje;
        try { await graph.atualizarItem("Pessoas", p._id, campos); Object.assign(p, campos); linha("Saída registada: " + p.Nome); nOk++; }
        catch (e) { linha("Falha ao registar saída de " + p.Nome + ": " + e.message, false); nErr++; }
      }
    }
    badge(nErr ? "error" : "connected");
    linha("Concluído: " + nOk + " aplicadas" + (nErr ? ", " + nErr + " com erro" : "") + ".", !nErr);
    toast(nErr ? "Importação com " + nErr + " erros." : "Equipa atualizada.", nErr ? "error" : undefined);
    if (typeof aoConcluir === "function") aoConcluir();
  }
}
