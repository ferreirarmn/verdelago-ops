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
  const token = await obterToken();
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
  return r.value.map(c => ({ name: c.name, displayName: c.displayName, lookup: !!c.lookup, readOnly: !!c.readOnly }));
}
