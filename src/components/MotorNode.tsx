
import { Handle, Position } from '@xyflow/react';

type MotorData = {
  name: string;
  configName: string;
  port: number;
  hubId?: string;
  source?: string;
  model?: string;
  pendingIssues?: number;
  pendingMaintenance?: number;
};

function formatMotorModel(model?: string) {
  if (!model) return 'Motor';

  const models: Record<string, string> = {
    RevRoboticsCoreHexMotor: 'REV Core Hex Motor',
    RevRobotics40HDHexMotor: 'REV 40 HD Hex Motor',
    RevRobotics20HDHexMotor: 'REV 20 HD Hex Motor',
    RevRoboticsUltraplanetaryHDHexMotor:
      'REV HD Hex + UltraPlanetary',
  };

  return models[model] ?? model;
}

export default function MotorNode({
  data,
}: {
  data: MotorData;
}) {
  const imported = data.source === 'ftc-import';

  const pendingIssues = data.pendingIssues ?? 0;
  const pendingMaintenance = data.pendingMaintenance ?? 0;

  return (
    <div className="flow-motor">
      <Handle
        type="target"
        position={Position.Right}
        className="flow-handle"
      />

      <div className="motor-symbol">M</div>

      <div className="motor-details">
        <span>MOTOR</span>

        <strong>{data.name}</strong>

        <small>
          FTC:{' '}
          {imported
            ? formatMotorModel(data.model)
            : data.configName}
        </small>
      </div>

      <div className="motor-port">
        M{data.port}
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
