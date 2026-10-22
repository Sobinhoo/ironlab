
import { Handle, Position } from '@xyflow/react';

type ServoData = {
  name: string;
  configName: string;
  port: number;
  hubId?: string;
  source?: string;
  model?: string;
  pendingIssues?: number;
  pendingMaintenance?: number;
};

function formatServoModel(model?: string) {
  if (!model) return 'Servo';

  const models: Record<string, string> = {
    Servo: 'Servo',
    ContinuousRotationServo:
      'Servo de Rotação Contínua',
  };

  return models[model] ?? model;
}

export default function ServoNode({
  data,
}: {
  data: ServoData;
}) {
  const imported = data.source === 'ftc-import';

  const pendingIssues = data.pendingIssues ?? 0;
  const pendingMaintenance = data.pendingMaintenance ?? 0;

  return (
    <div className="flow-motor flow-servo">
      <Handle
        type="target"
        position={Position.Top}
        className="flow-handle"
      />

      <div className="motor-symbol">S</div>

      <div className="motor-details">
        <span>SERVO</span>

        <strong>{data.name}</strong>

        <small>
          FTC:{' '}
          {imported
            ? formatServoModel(data.model)
            : data.configName}
        </small>
      </div>

      <div className="motor-port">
        S{data.port}
      </div>

      {(pendingIssues > 0 || pendingMaintenance > 0) && (
        <div className="actuator-node-alerts">
          {pendingIssues > 0 && (
            <span
              className="actuator-node-badge issue"
              title={
                pendingIssues +
                ' ocorrência(s) pendente(s)'
              }
            >
              ⚠ {pendingIssues}
            </span>
          )}

          {pendingMaintenance > 0 && (
            <span
              className="actuator-node-badge maintenance"
              title={
                pendingMaintenance +
                ' manutenção(ões) pendente(s)'
              }
            >
              🔧 {pendingMaintenance}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
