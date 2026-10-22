# FTC Electrical Lab — preparação para desktop

## Incluído neste pacote
- Base v0.25.6 de comunicação e reconexão, preservada.
- Aba **Perfil técnico** na ficha de cada motor.
- Cadastro REV HD Hex + UltraPlanetary, módulos 3:1, 4:1 e 5:1, com persistência local por identidade do atuador.
- Cálculos **nominais**, não limites de diagnóstico. A leitura do SDK permanece inalterada.

## Pendente antes do desktop
1. Validar STOP, reinício, perda de Wi-Fi, retomada e várias sessões com robô real.
2. Conferir relações **reais** das caixas e modelo configurado no FTC SDK; não aplicar os valores nominais como alarmes.
3. Decidir arquitetura desktop: Tauri com backend HTTP nativo ou Electron, para evitar restrições HTTPS→HTTP do navegador.
4. Definir persistência, logs, tratamento de IP/porta, instalador Windows e testes de instalação.
5. Revisar dependências, testes de regressão e política de segurança (servidor HTTP na rede local sem autenticação).

## Observação
O pacote ainda é uma aplicação web. Não é um instalador Windows nem foi validado em hardware.
