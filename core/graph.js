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

/** Pedido genérico ao Graph com o token atual. */
async function g(caminho, opts = {}) {
  const token = await obterToken();
  const url = caminho.startsWith("http") ? caminho : BASE + caminho;
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers || {})
    }
  });
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
