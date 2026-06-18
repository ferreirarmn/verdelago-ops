# Módulo Correspondências (Planeamento → Correspondências)

## Objetivo
Resolver as imprecisões plano vs real: os nomes de departamentos e funções
diferem ligeiramente entre o orçamento e o real (ex.: "Cozinheiro de 2ª" vs
"Cozinheiro 2ª"; departamento "RESTAURANTE/COZINHA/…" no plano vs "F&B" no real).
Esta tabela liga-os; os módulos passam a comparar por ela em vez de adivinhar.

## O que faz
- Lê a Lista "Correspondencias" (Title=nome plano, Tipo, NomeReal).
- Mostra, por tipo (Funções / Departamentos): correspondências existentes e os
  nomes do orçamento **ainda por mapear**, com **sugestão automática** do nome
  real mais parecido.
- Criar/editar/apagar correspondências — escreve item a item via Graph
  (escritas individuais, que passam na rede).

## Helper partilhado (core/correspondencias.js)
- carregarCorrespondencias(), canonDepartamento(nome), canonFuncao(nome),
  mesmoDepartamento(a,b), mesmaFuncao(a,b).
- Os outros módulos (Orçamento, Controlo de Gestão e, a seguir, os PPTs) vão
  usar estes helpers para alinhar plano e real. (Esta entrega cria a base; a
  ligação dos restantes módulos vem nas fases seguintes.)

## Ficheiros
- core/correspondencias.js   (NOVO)
- modules/mapeamento.js       (NOVO)
- core/icones.js              (SUBSTITUIR — ícone "mapeamento")
- app.js                      (SUBSTITUIR — regista o módulo em Planeamento)
- + criar a Lista "Correspondencias" (ver GUIA-Lista-Correspondencias.md)

## Próximos passos (combinados)
1. (esta) Correspondências.
2. Orçamento por versões (Inicial/Revisões) + dimensionamento por room nights.
3. Controlo de Gestão: Inicial · Atual · Real, por mês / YTD / meses seguintes
   (Real = pessoas ativas no mês + Custo Mensal Real), já usando as correspondências.

## QA
Testado: deteta nomes por mapear e sugere o real mais parecido
("Cozinheiro de 2ª"→"Cozinheiro 2ª"). Escrita via criarItem/atualizarItem/
apagarItem. Sintaxe validada. (A escrita real só se confirma no teu ambiente.)
