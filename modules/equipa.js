// equipa.js — Equipa (geral)
// Lista única de TODOS os colaboradores (todos os departamentos), com pesquisa,
// filtros (departamento, vínculo, estado) e edição — reutiliza a fábrica de
// módulo de departamento em modo "geral".
import { criarModuloDepartamento } from "../shared/modulo-departamento.js";
import { dados } from "../core/store.js";

export const moduloEquipa = criarModuloDepartamento({
  id: "equipa", nome: "Equipa", icone: "equipa", geral: true,
  selPessoas: inc => dados.pessoas.filter(p => inc || !String(p.Estado || "").toLowerCase().includes("inativ")),
  selFuncoes: () => dados.funcoes
});
