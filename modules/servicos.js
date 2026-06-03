// servicos.js — Módulo Serviços Centrais (tudo o que não é HSK/F&B/Recreativo)
import { criarModuloDepartamento } from "../shared/modulo-departamento.js";
import { pessoasGeral, dados, MODULOS_OPERACIONAIS } from "../core/store.js";

export const moduloServicos = criarModuloDepartamento({
  id: "servicos", nome: "Serviços Centrais", icone: "🏢",
  selPessoas: inc => pessoasGeral(inc),
  selFuncoes: () => dados.funcoes.filter(f => !MODULOS_OPERACIONAIS.includes(f.Modulo))
});
