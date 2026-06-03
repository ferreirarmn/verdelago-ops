// nautico.js — Módulo Recreativo (dados continuam com Modulo="Náutico")
import { criarModuloDepartamento } from "../shared/modulo-departamento.js";
import { pessoasDoModulo, dados } from "../core/store.js";

export const moduloNautico = criarModuloDepartamento({
  id: "nautico", nome: "Recreativo", icone: "🏖️",
  selPessoas: inc => pessoasDoModulo("Náutico", inc),
  selFuncoes: () => dados.funcoes.filter(f => f.Modulo === "Náutico")
});
