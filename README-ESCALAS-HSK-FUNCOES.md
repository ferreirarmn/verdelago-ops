# Escalas HSK — mais funções no ajuste manual (jun 2026)

## O que muda
No ajuste manual da escala HSK, o seletor de cada célula passa a oferecer TODAS
as funções, independentemente das competências registadas na pessoa:

  Automático · Folga · Andares · Áreas · Lavandaria · Turndown ·
  Valete (manhã) · Valete (tarde) · Governanta · Excesso

Novidades face ao que existia:
- **Governanta** (chefia) — nova função atribuível, com cor própria na grelha.
- **Valete (manhã)** além de Valete (tarde) — separação dos dois turnos de valete.
- **Áreas, Turndown e Valete** deixam de depender da competência registada —
  ficam sempre disponíveis para o gestor atribuir manualmente.

## Coerência com o cálculo
- O cálculo AUTOMÁTICO e a tabela de cobertura mantêm-se inalterados (continuam
  a dimensionar Andares, Áreas, Lavandaria, Turndown e Valete-tarde a partir das
  room nights × parâmetros).
- Governanta e Valete-manhã são atribuições manuais visíveis na grelha mas NÃO
  entram na cobertura operacional (Governanta é chefia; Valete-manhã ainda não
  tem necessidade dimensionada no modelo). Se quiseres dimensionar valete por
  turno manhã/tarde no automático, é um passo à parte — diz quando quiseres.
- Persistência local, "Repor automática" e Exportar Excel mantêm-se.

## Ficheiro
- modules/escalas.js  (SUBSTITUIR)

## QA
Testado com JSDOM: o seletor HSK apresenta as 7 funções + Folga/Excesso/
Automático. Sintaxe validada.
