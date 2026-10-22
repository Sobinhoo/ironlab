# FTC Electrical Lab — v0.25.6

## Alterações
- Resposta HTTP `status: waiting` tratada como estado de espera, sem exceção genérica.
- Respostas sem `timestamp` válido não são exibidas como telemetria ao vivo.
- Resposta repetida com timestamp antigo sinaliza telemetria desatualizada.
- Ao retomar timestamps novos, a interface volta automaticamente ao estado Conectado.
- Sem alterações no firmware/Java do robô.

## Testes recomendados
1. Conectar com OpMode ativo; conferir RPM e bateria.
2. Interromper o OpMode; confirmar estado de espera ou desatualizado.
3. Reiniciar o OpMode; confirmar recuperação sem reconectar.
4. Desconectar Wi-Fi e reconectar; verificar tentativas automáticas.
5. Clicar em Desconectar; confirmar ausência de reconexão automática.

## Observação
Compilação e teste no robô não foram realizados neste ambiente. Execute `npm ci` e `npm run build` no projeto e valide com o Control Hub.