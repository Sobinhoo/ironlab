/**
 * ASBI Awake — deterministic, read-only foundation.
 * This module never executes hardware commands and never fabricates telemetry.
 * A language-model backend can be added later behind an authenticated API.
 */
export type ASBIActuator = {
  id: string;
  name: string;
  type: 'motor' | 'servo';
  port?: number;
  hubName?: string;
};

export type ASBIContext = {
  robotName: string;
  actuators: ASBIActuator[];
  telemetryConnected: boolean;
  capturedAt: string;
};

export type ASBIReply = {
  message: string;
  evidence: string[];
  suggestions: string[];
};

export function describeASBIContext(context: ASBIContext): ASBIReply {
  const motors = context.actuators.filter(a => a.type === 'motor');
  const servos = context.actuators.filter(a => a.type === 'servo');
  return {
    message: `Robô ${context.robotName}: ${motors.length} motor(es) e ${servos.length} servo(s) no contexto recebido. ${context.telemetryConnected ? 'A conexão de telemetria foi informada como ativa.' : 'Não há conexão de telemetria confirmada.'}`,
    evidence: context.actuators.map(a => `${a.type === 'motor' ? 'Motor' : 'Servo'} ${a.name} (${a.hubName ?? 'hub não informado'}, porta ${a.port ?? 'não informada'})`),
    suggestions: context.telemetryConnected
      ? ['Compare os valores de telemetria com os resultados esperados antes de diagnosticar falhas.']
      : ['Conecte a telemetria para permitir diagnósticos baseados em medições reais.'],
  };
}

export function answerASBIQuestion(question: string, context: ASBIContext): ASBIReply {
  const normalized = question.trim().toLocaleLowerCase('pt-BR');
  const overview = describeASBIContext(context);
  if (!normalized) return { message: 'Digite uma pergunta sobre o robô.', evidence: [], suggestions: [] };
  if (/motor|servo|atuador|configura|cadastrad|robô|robo|hub/.test(normalized)) return overview;
  return {
    message: 'Sou o ASBI Awake. Nesta primeira versão, consigo apresentar os atuadores informados pelo IronLab. Ainda não tenho um modelo de linguagem nem acesso automático aos dados do laboratório.',
    evidence: [],
    suggestions: ['Pergunte quais motores ou servos estão cadastrados.', 'Integre um snapshot do projeto para habilitar respostas contextualizadas.'],
  };
}
