// hsk.js — Módulo Housekeeping (departamento de limpeza)
import { criarModuloDepartamento } from "../shared/modulo-departamento.js";
import { pessoasDoModulo, dados } from "../core/store.js";

export const moduloHSK = criarModuloDepartamento({
  id: "hsk", nome: "Housekeeping", icone: "🧹",
  selPessoas: inc => pessoasDoModulo("HSK", inc),
  selFuncoes: () => dados.funcoes.filter(f =>
    f.Modulo === "HSK" || (f.Departamento || "").toUpperCase().includes("HOUSEKEEPING"))
});
