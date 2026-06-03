// ============================================================================
// escalas.js — Escalas: associar pessoas a zonas, por dia e turno (partilhado)
// ----------------------------------------------------------------------------
// Uma escala = PessoaID + ZonaID + Data + TurnoID. Guardada como texto na
// Lista "Escalas". Inclui deteção de conflitos (mesma pessoa, dois sítios,
// mesmo turno).
// ============================================================================

import * as graph from "../core/graph.js";

/** Lê as escalas de uma zona numa janela de datas (inclusive). */
export async function escalasDaZona(zonaId, dataInicio, dataFim) {
  const todas = await graph.lerLista("Escalas");
  return todas.filter(e =>
    e.ZonaID === zonaId &&
    e.Data >= dataInicio && e.Data <= dataFim
  );
}

/** Lê todas as escalas de uma pessoa num dia (para verificar conflitos). */
async function escalasDaPessoaNoDia(pessoaId, data) {
  const todas = await graph.lerLista("Escalas");
  return todas.filter(e => e.PessoaID === pessoaId && e.Data === data);
}

/**
 * Cria uma escala, recusando se a pessoa já estiver noutra zona no mesmo turno.
 * @param {{pessoaId:string, zonaId:string, data:string, turnoId:string, funcao?:string}} d
 */
export async function escalar({ pessoaId, zonaId, data, turnoId, funcao = "" }) {
  const noDia = await escalasDaPessoaNoDia(pessoaId, data);

  const choque = noDia.find(e => e.TurnoID === turnoId && e.ZonaID !== zonaId);
  if (choque) {
    throw new Error(
      "Conflito: esta pessoa já está escalada na zona " + choque.ZonaID +
      " neste turno (" + data + " / " + turnoId + ")."
    );
  }
  const jaAqui = noDia.find(e => e.TurnoID === turnoId && e.ZonaID === zonaId);
  if (jaAqui) return jaAqui; // já está escalada aqui, não duplica

  return graph.criarItem("Escalas", {
    Title: "E" + Date.now(),
    PessoaID: pessoaId,
    ZonaID: zonaId,
    Data: data,
    TurnoID: turnoId,
    Funcao: funcao
  });
}

/** Remove uma pessoa de um turno (apaga a linha de escala pelo _id). */
export async function desescalar(escalaItemId) {
  return graph.apagarItem("Escalas", escalaItemId);
}

/**
 * Organiza as escalas de uma zona numa grelha turno × dia.
 * Devolve { [turnoId]: { [data]: [pessoaId, …] } }
 */
export function montarGrelha(escalas) {
  const grelha = {};
  for (const e of escalas) {
    grelha[e.TurnoID] = grelha[e.TurnoID] || {};
    grelha[e.TurnoID][e.Data] = grelha[e.TurnoID][e.Data] || [];
    grelha[e.TurnoID][e.Data].push({ pessoaId: e.PessoaID, _id: e._id });
  }
  return grelha;
}

/** Devolve as datas (YYYY-MM-DD) de uma semana a partir de uma segunda-feira. */
export function semana(segunda) {
  const d0 = new Date(segunda);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(d0);
    d.setDate(d0.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
