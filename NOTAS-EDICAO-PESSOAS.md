# Verdelago Operações — Edição alargada de pessoas (jun 2026)

## O que muda
O editor de pessoas (separador "Equipa" de cada departamento) passa a permitir
muito mais do que antes. Ficheiro: shared/modulo-departamento.js.

### 1. Mudar de departamento
O dropdown de Função deixa de mostrar só as funções do departamento atual:
mostra **todas as funções**, agrupadas por departamento (optgroup). Escolher
uma função de outro departamento **move a pessoa** para lá — porque, no vosso
modelo, o departamento deriva sempre da função (fonte única, sem duplicar).
Por baixo do dropdown aparece um aviso "→ Departamento: X" e, se a escolha
mover a pessoa, fica a âmbar com "(move de Y)". O toast ao guardar confirma
"Movida: Y → X".

### 2. "Outros elementos" — campos extra automáticos
O editor descobre as colunas reais da Lista Pessoas no SharePoint e gera
automaticamente uma secção "Outros dados" com os campos que ainda não estavam
no formulário (datas, contactos, etc.). Não é preciso codificar campo a campo
— quando acrescentares uma coluna à lista, ela aparece sozinha no editor.
  - Exclui colunas de sistema e só-de-leitura (Created, Modified, etc.).
  - Exclui lookups (precisariam de tratamento especial) — só texto/data/número.
  - Campos cujo nome sugere data (DataAdmissao, Início, etc.) viram seletor de
    data; o valor ISO do SharePoint é convertido para/de YYYY-MM-DD.

### 3. Permissões
Conforme decidido: **todos os que entram na app** podem editar (não há
restrição por perfil). Marcar presenças e editar pessoas usam o mesmo caminho
de escrita item-a-item ao Graph, que funciona na vossa rede.

## Ficheiros alterados
- shared/modulo-departamento.js  (cache de colunas + editor reescrito)

## QA feito
Render do editor testado com JSDOM: agrupamento por departamento (4 grupos,
13 funções), pré-seleção da função atual, secção "Outros dados" com os campos
certos (sistema e lookups excluídos), deteção e conversão de datas. Sintaxe
validada. Não testável aqui: escrita real no SharePoint e descoberta real de
colunas — confirma com dados reais (sobretudo que os nomes internos das colunas
extra são os esperados ao gravar).

## Nota para multi-unidade
A descoberta dinâmica de colunas é exatamente o tipo de mecanismo que serve a
standardização: a mesma app adapta-se às colunas que cada unidade tiver na sua
Lista Pessoas, sem alterar código.
