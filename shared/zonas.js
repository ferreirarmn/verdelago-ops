// ============================================================================
// zonas.js — Criar e gerir zonas de trabalho (partilhado por todos os módulos)
// ----------------------------------------------------------------------------
// Uma zona é um outlet (F&B), um agrupamento de alojamento (HSK) ou uma zona
// recreativa (Náutico). Tudo na mesma Lista "Zonas", distinguido por Modulo
// e Tipologia.
//
// IMPORTANTE: a coluna de tipo chama-se "Tipologia" (NÃO "Tipo"), porque
// "Tipo" é uma coluna de sistema do SharePoint que não pode ser usada.
// ============================================================================

import * as graph from "../core/graph.js";
import { dados, recarregarZonas } from "../core/store.js";

/** Gera o próximo ZonaID (Z01, Z02, …) com base no que já existe. */
function proximoId() {
  const ns = dados.zonas
    .map(z => parseInt(String(z.Title).replace(/^Z/, ""), 10))
    .filter(n => !isNaN(n));
  const max = ns.length ? Math.max(...ns) : 0;
  return "Z" + String(max + 1).padStart(2, "0");
}

/**
 * Cria uma zona nova.
 * @param {{nome:string, modulo:string, tipologia:string, zonaPaiId?:string}} dados
 */
export async function criarZona({ nome, modulo, tipologia, zonaPaiId = "" }) {
  const id = proximoId();
  await graph.criarItem("Zonas", {
    Title: id,
    Nome: nome,
    Modulo: modulo,
    Tipologia: tipologia,     // <- coluna "Tipologia", não "Tipo"
    ZonaPaiID: zonaPaiId,
    Ativa: true
  });
  await recarregarZonas();
  return id;
}

/** Renomeia ou reconfigura uma zona existente (pelo _id do item). */
export async function atualizarZona(itemId, campos) {
  // campos pode incluir Nome, Tipologia, Modulo, ZonaPaiID, Ativa
  await graph.atualizarItem("Zonas", itemId, campos);
  await recarregarZonas();
}

/** Desativa uma zona sem a apagar (mantém histórico de escalas). */
export async function desativarZona(itemId) {
  await graph.atualizarItem("Zonas", itemId, { Ativa: false });
  await recarregarZonas();
}

/** Devolve as zonas de um módulo organizadas em árvore (pai -> filhas). */
export function arvoreDeZonas(modulo) {
  const zs = dados.zonas.filter(z => z.Modulo === modulo);
  const topo = zs.filter(z => !z.ZonaPaiID);
  return topo.map(t => ({
    ...t,
    filhas: zs.filter(z => z.ZonaPaiID === t.Title)
  }));
}

/** Lista plana de zonas de uma tipologia (ex.: todos os "Outlet"). */
export const zonasPorTipologia = tip => dados.zonas.filter(z => z.Tipologia === tip && z.Ativa !== false);
