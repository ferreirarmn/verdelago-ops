# Exportações Excel com função (jun 2026)

## O que muda
A função (categoria) passa a constar nas exportações para Excel.

### Equipa (geral) e Departamentos — NOVO botão "Exportar Excel"
Na barra de ações (ao lado de "+ Acrescentar pessoa"). Exporta as pessoas da
lista para .xlsx com:
- Nome · (Departamento — só na vista geral) · **Função** · Empresa/Agência ·
  Vínculo · Estado · + colunas extra (ex.: Custo Mensal Real, datas).
- Respeita o "mostrar inativas" e, na vista geral, os filtros (Departamento/
  Vínculo/Estado) que tiveres aplicados.
- Ficheiro: Verdelago_Equipa_AAAA-MM-DD.xlsx (ou Verdelago_<Departamento>_…).

### Escalas (HSK e F&B) — coluna Função na folha "Escala"
A folha "Escala" passa de "Pessoa + dias" para **Pessoa · Função · Empresa · dias**.
A folha "Cobertura" (e "Por Outlet" no F&B) mantêm-se.

## Ficheiros
- shared/modulo-departamento.js  (SUBSTITUIR — botão + função de exportação)
- modules/escalas.js             (SUBSTITUIR — coluna Função nas escalas)

## Nota
A exportação usa o Excel local (lib/xlsx.full.min.js), como as escalas já
faziam — sem dependência de CDN.

## QA
Testado com JSDOM: exportação da equipa traz Nome/Departamento/Função/Empresa/
Vínculo/Estado/Custo; escala HSK e F&B trazem coluna Função. Sintaxe validada.
