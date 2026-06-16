# Módulo Equipa — lista única de todos os colaboradores (jun 2026)

## O que é
Novo módulo "Equipa" (Operação → Equipa, primeiro item) com uma lista ÚNICA de
todos os colaboradores ativos, de todos os departamentos — para pesquisar,
filtrar, verificar e corrigir num só lugar. Ideal para o trabalho de limpeza
de dados (estados, vínculos, departamentos).

## Funcionalidades
- Tabela com Nome · **Departamento** · Função · Empresa · Vínculo · Estado.
- Pesquisa por nome (tempo real).
- **Filtros**: Departamento, Vínculo, Estado (combinam com a pesquisa).
  Ex.: filtrar Estado = "Sim"/"Teste" para encontrar registos a corrigir;
  ou Vínculo vazio para encontrar quem precisa de vínculo.
- "Mostrar inativas" para incluir saídas.
- Clicar numa linha abre o MESMO editor de pessoa já existente (mudar função/
  departamento, vínculo, estado, custo real, datas…). Sem código novo de edição.
- "+ Acrescentar pessoa" também disponível.

## Como foi feito
A fábrica criarModuloDepartamento ganhou um modo `geral: true` que: mostra todos
os departamentos, acrescenta a coluna Departamento e os filtros, e esconde o
separador Presenças e o "Importar equipa" (que são por departamento). Reutiliza
integralmente o editor de pessoas — nada duplicado.

## Ficheiros
- modules/equipa.js            (NOVO)
- shared/modulo-departamento.js (SUBSTITUIR — modo geral)
- app.js                        (SUBSTITUIR — regista o módulo na navegação)
- core/icones.js                (SUBSTITUIR — ícone "equipa")

## QA
Testado com JSDOM (pessoas de 3 departamentos): lista única com coluna
Departamento, 3 filtros, pesquisa, inativas escondidas por defeito, edição via
o editor existente. Sintaxe validada.
