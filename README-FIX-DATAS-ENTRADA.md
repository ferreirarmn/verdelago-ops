# Correção — datas de entrada nos slides de pessoas a chegar (jun 2026)

## Problema
Nos dashboards (slides "Entradas por semana" e "Próximas entradas"), as
pessoas a chegar apareciam sem data / não eram colocadas nas semanas certas.

## Causa
A deteção do campo de data de entrada olhava apenas a PRIMEIRA pessoa
(dados.pessoas[0]). Como o Microsoft Graph não devolve campos vazios, se essa
primeira pessoa não tivesse a data preenchida, a coluna não aparecia nas suas
chaves e a app concluía (erradamente) que não havia campo de data — ignorando
as datas de TODA a gente.

## Correção
campoDataEntrada() passa a varrer TODAS as pessoas até encontrar a coluna, e
aceita mais variações de nome (DataEntrada, Data Admissão, Data Início…),
excluindo a de saída. Resultado fica em cache.

## Ficheiro
- core/ppt.js  (SUBSTITUIR)

## QA
Testado o caso crítico (1ª pessoa sem data, restantes a chegar com data): as
datas passam a ser lidas e o gráfico de entradas por semana distribui-as nas
semanas corretas. Sintaxe validada.
