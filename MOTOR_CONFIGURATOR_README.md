# Motor Configurator v0.27.1

Na ficha do motor, selecione Perfil técnico e escolha REV HD Hex. A prévia começa sem caixa e atualiza ao marcar módulos 3:1, 4:1 e 5:1. Os perfis existentes permanecem salvos em localStorage.

A imagem é um SVG esquemático construído em React, não um desenho mecânico dimensionalmente preciso. A lógica de telemetria, as portas, o mapa React Flow e os dados do FTC SDK não foram alterados. Os cálculos atuais usam reduções nominais, não relações exatas verificadas. A implementação mantém a restrição preexistente de uma unidade de cada tipo de módulo.

Arquivos adicionados: src/components/MotorAssemblyPreview.tsx e .css. Alterado: src/components/ActuatorPanel.tsx.
