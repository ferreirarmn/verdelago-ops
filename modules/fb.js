// fb.js — Módulo F&B
import { criarModuloDepartamento } from "../shared/modulo-departamento.js";
import { pessoasDoModulo, dados } from "../core/store.js";

export const moduloFB = criarModuloDepartamento({
  id: "fb", nome: "F&B", icone: "🍽️",
  selPessoas: inc => pessoasDoModulo("F&B", inc),
  selFuncoes: () => dados.funcoes.filter(f => f.Modulo === "F&B")
});
