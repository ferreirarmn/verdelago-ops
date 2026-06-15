// ============================================================================
// graph.js — Camada de dados genérica sobre as Listas do SharePoint (Graph)
// ----------------------------------------------------------------------------
// Funções que servem QUALQUER Lista. Os módulos usam-nas sem repetir código.
// ============================================================================

import { CONFIG } from "./config.js";
import { obterToken } from "./auth.js";

let siteId = null;
const idDaLista = {};   // displayName -> id interno da Lista

const BASE = "https://graph.microsoft.com/v1.0";

/** Pedido genérico ao Graph com o token atual. Com timeout e repetição em throttling. */
async function g(caminho, opts = {}, tentativa = 0) {
  const token = await Promise.race([
    obterToken(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Não foi possível renovar a sessão a tempo. Recarrega a página e entra de novo.")), 20000))
  ]);
  const url = caminho.startsWith("http") ? caminho : BASE + caminho;
  const ctrl = new AbortController();
  const limite = opts.timeout || 25000;
  const timer = setTimeout(() => ctrl.abort(), limite);
  let r;
  try {
    r = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opts.headers || {})
      }
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      // pedido demorou demasiado: tenta de novo algumas vezes
      if (tentativa < 3) return g(caminho, opts, tentativa + 1);
      throw new Error("Tempo esgotado: o SharePoint não respondeu a tempo.");
    }
    throw e;
  }
  clearTimeout(timer);
  // throttling do SharePoint (429) ou indisponível (503): espera e repete
  if ((r.status === 429 || r.status === 503) && tentativa < 5) {
    const ra = Number(r.headers.get("Retry-After")) || Math.min(Math.pow(2, tentativa) + 1, 30);
    await new Promise(res => setTimeout(res, ra * 1000));
    return g(caminho, opts, tentativa + 1);
  }
  if (!r.ok) {
    const corpo = await r.text();
    throw new Error("Graph " + r.status + ": " + corpo.slice(0, 300));
  }
  return r.status === 204 ? null : r.json();
}

/**
 * Resolve o site e mapeia todas as Listas pelo nome a mostrar.
 * Chamar UMA vez no arranque, depois do login.
 */
export async function arrancar() {
  const site = await g("/sites/" + CONFIG.siteHostname + ":" + CONFIG.sitePath);
  siteId = site.id;
  let url = "/sites/" + siteId + "/lists?$select=id,displayName&$top=200";
  while (url) {
    const page = await g(url);
    page.value.forEach(l => { idDaLista[l.displayName] = l.id; });
    url = page["@odata.nextLink"] || null;
  }
}

function exigirLista(nome) {
  const id = idDaLista[nome];
  if (!id) throw new Error('Lista "' + nome + '" não encontrada no site. Confirma o nome no config.js.');
  return id;
}

/** Lê TODOS os itens de uma Lista (paginado). Devolve [{_id, ...campos}]. */
export async function lerLista(nome) {
  const listId = exigirLista(nome);
  let itens = [];
  let url = "/sites/" + siteId + "/lists/" + listId + "/items?$expand=fields&$top=500";
  while (url) {
    const page = await g(url);
    itens = itens.concat(page.value.map(i => ({ _id: i.id, ...i.fields })));
    const next = page["@odata.nextLink"];
    url = next ? next.replace(BASE, "") : null;
  }
  return itens;
}

/** Cria um item. `campos` é um objeto {NomeInternoColuna: valor}. */
export async function criarItem(nome, campos) {
  const listId = exigirLista(nome);
  return g("/sites/" + siteId + "/lists/" + listId + "/items", {
    method: "POST",
    body: JSON.stringify({ fields: campos })
  });
}

/** Atualiza os campos de um item existente (pelo _id devolvido em lerLista). */
export async function atualizarItem(nome, itemId, campos) {
  const listId = exigirLista(nome);
  return g("/sites/" + siteId + "/lists/" + listId + "/items/" + itemId + "/fields", {
    method: "PATCH",
    body: JSON.stringify(campos)
  });
}

/** Apaga um item. */
export async function apagarItem(nome, itemId) {
  const listId = exigirLista(nome);
  return g("/sites/" + siteId + "/lists/" + listId + "/items/" + itemId, { method: "DELETE" });
}

/**
 * Escreve vários itens numa Lista em LOTES (Graph $batch, até 20 por chamada).
 * ops: [{op:"create", fields}, {op:"update", id, fields}, {op:"delete", id}]
 * onProgresso(feitos, total) é chamado ao fim de cada lote.
 * Devolve { ok, erros:[{op, status, msg}] }.
 */
export async function escreverEmLote(nome, ops, onProgresso) {
  const listId = exigirLista(nome);
  const base = "/sites/" + siteId + "/lists/" + listId + "/items";
  let ok = 0; const erros = []; let feitos = 0;
  for (let i = 0; i < ops.length; i += 20) {
    const lote = ops.slice(i, i + 20);
    const requests = lote.map((o, j) => {
      const id = String(i + j);
      if (o.op === "create") return { id, method: "POST", url: base, headers: { "Content-Type": "application/json" }, body: { fields: o.fields } };
      if (o.op === "update") return { id, method: "PATCH", url: base + "/" + o.id + "/fields", headers: { "Content-Type": "application/json" }, body: o.fields };
      return { id, method: "DELETE", url: base + "/" + o.id };
    });
    let resp;
    try { resp = await g("/$batch", { method: "POST", body: JSON.stringify({ requests }) }); }
    catch (e) { lote.forEach(o => erros.push({ op: o, status: 0, msg: e.message })); feitos += lote.length; if (onProgresso) onProgresso(feitos, ops.length); continue; }
    const porId = {}; (resp.responses || []).forEach(r => porId[r.id] = r);
    let maiorEspera = 0;
    lote.forEach((o, j) => {
      const r = porId[String(i + j)];
      if (!r) { erros.push({ op: o, status: -1, msg: "sem resposta" }); return; }
      if (r.status >= 200 && r.status < 300) ok++;
      else if (r.status === 429 || r.status === 503) { maiorEspera = Math.max(maiorEspera, Number(r.headers?.["Retry-After"]) || 5); erros.push({ op: o, status: r.status, msg: "throttling" }); }
      else erros.push({ op: o, status: r.status, msg: JSON.stringify(r.body || {}).slice(0, 200) });
    });
    feitos += lote.length;
    if (onProgresso) onProgresso(feitos, ops.length);
    await new Promise(res => setTimeout(res, maiorEspera ? maiorEspera * 1000 : 250));
  }
  return { ok, erros };
}

/** Utilizador atual (para saudação e permissões). */
export async function eu() {
  return g("/me?$select=displayName,mail,userPrincipalName");
}

/**
 * Devolve as colunas reais de uma Lista: nome interno, nome a mostrar e se é
 * de Pesquisa (lookup). Permite escrever usando os nomes internos certos.
 */
export async function colunasDaLista(nome) {
  const listId = exigirLista(nome);
  const r = await g("/sites/" + siteId + "/lists/" + listId + "/columns");
  return r.value.map(c => ({
    name: c.name, displayName: c.displayName,
    lookup: !!c.lookup, readOnly: !!c.readOnly,
    tipo: c.number ? "number" : c.dateTime ? "date" : c.boolean ? "boolean" : c.choice ? "choice" : "text",
    choices: c.choice?.choices || null
  }));
}
