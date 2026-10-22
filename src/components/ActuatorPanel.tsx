import MotorAssemblyPreview from './MotorAssemblyPreview';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  ActuatorHistory,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
} from '../utils/projectStorage';
import './ActuatorPanel.css';
import type { LiveServo } from '../services/hubTelemetry';
import type {
  DiagnosticSettings,
  DiagnosticAlert,
} from '../utils/motorDiagnostics';
import {
  loadMotorProfiles,
  saveMotorProfiles,
  nominalGearRatio,
  type GearStage,
  type MotorProfile,
} from '../utils/motorProfiles';
type PanelTab = 'general' | 'encoder' | 'profile' | 'issues' | 'maintenance';
type InterventionType = Exclude<MaintenanceType, 'problem'>;
type RecordWithLink = MaintenanceRecord & {
  relatedIssueId?: string;
};
type Props = {
  type: 'motor' | 'servo';
  name: string;
  configName: string;
  model?: string;
  port: number;
  hubName: string;
  source?: string;
  actuatorId?: string;
  history?: ActuatorHistory;
  liveStatus:
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'waiting'
    | 'reconnecting'
    | 'stale'
    | 'error';
  liveError: string;
  liveUpdatedAt: number | null;
  liveMotors: {
    name: string;
    port: number;
    ticks: number;
    ticksPerSecond: number;
    ticksPerRev: number;
    rpm: number;
  }[];
  liveServos: LiveServo[];
  liveHistory: Record<string, { time: number; ticks: number; rpm: number }[]>;
  diagnostics: Record<string, DiagnosticAlert>;
  diagnosticSettings: DiagnosticSettings;
  onDiagnosticSettingsChange: (settings: DiagnosticSettings) => void;

  onSave: (name: string, configName: string) => void;
  onAddIssue: (title: string, description: string) => void;
  onUpdateIssue: (id: string, status: MaintenanceStatus) => void;
  onDeleteIssue: (id: string) => void;
  onAddMaintenance: (
    type: InterventionType,
    title: string,
    description: string,
    relatedIssueId?: string
  ) => void;
  onUpdateMaintenance: (id: string, status: MaintenanceStatus) => void;
  onDeleteMaintenance: (id: string) => void;
  onDelete: () => void;
  onClose: () => void;
};
const statusLabels: Record<MaintenanceStatus, string> = {
  open: 'Aberto',
  monitoring: 'Em observação',
  resolved: 'Resolvido',
};
const interventionLabels: Record<InterventionType, string> = {
  inspection: 'Inspeção',
  maintenance: 'Manutenção / Reparo',
  replacement: 'Substituição',
};
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : date.toLocaleString('pt-BR');
}
function formatModel(model?: string): string {
  if (!model) return 'Modelo não informado';
  const names: Record<string, string> = {
    RevRoboticsCoreHexMotor: 'REV Core Hex Motor',
    RevRobotics40HDHexMotor: 'REV 40 HD Hex Motor',
    RevRobotics20HDHexMotor: 'REV 20 HD Hex Motor',
    RevRoboticsUltraplanetaryHDHexMotor: 'REV HD Hex + UltraPlanetary',
    Servo: 'Servo',
    ContinuousRotationServo: 'Servo de Rotação Contínua',
  };
  return names[model] ?? model;
}
export default function ActuatorPanel({
  type,
  name,
  configName,
  model,
  port,
  hubName,
  source,
  actuatorId,
  history,
  liveStatus,
  liveError,
  liveUpdatedAt,
  liveMotors,
  liveHistory,
  onSave,
  onAddIssue,
  onUpdateIssue,
  onDeleteIssue,
  onAddMaintenance,
  onUpdateMaintenance,
  onDeleteMaintenance,
  onDelete,
  onClose,
}: Props) {
  const [tab, setTab] = useState<PanelTab>('general');
  const profileKey = actuatorId || `${hubName}:${port}:${configName}`;
  const [motorProfile, setMotorProfile] = useState<MotorProfile | null>(
    () => loadMotorProfiles()[profileKey] ?? null
  );
  useEffect(() => {
    setMotorProfile(loadMotorProfiles()[profileKey] ?? null);
  }, [profileKey]);
  function updateMotorProfile(stages: GearStage[] | null) {
    const profiles = loadMotorProfiles();
    if (stages === null) delete profiles[profileKey];
    else profiles[profileKey] = { kind: 'hd-hex-ultraplanetary', stages };
    saveMotorProfiles(profiles);
    setMotorProfile(stages === null ? null : profiles[profileKey]);
  }

  const [draftName, setDraftName] = useState(name);
  const [draftConfigName, setDraftConfigName] = useState(configName);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [maintenanceType, setMaintenanceType] =
    useState<InterventionType>('inspection');
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [relatedIssueId, setRelatedIssueId] = useState('');
  useEffect(() => {
    setDraftName(name);
    setDraftConfigName(configName);
    setTab('general');
    setIssueTitle('');
    setIssueDescription('');
    setMaintenanceType('inspection');
    setMaintenanceTitle('');
    setMaintenanceDescription('');
    setRelatedIssueId('');
  }, [actuatorId, name, configName]);
  const records = history?.maintenance ?? [];
  const issues = records
    .filter((record) => record.type === 'problem')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const interventions = records
    .filter((record) => record.type !== 'problem')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pendingIssues = issues.filter(
    (record) => record.status !== 'resolved'
  ).length;
  const pendingMaintenance = interventions.filter(
    (record) => record.status !== 'resolved'
  ).length;
  // Associa pelo nome da configuração; nunca usa só a porta (pode haver dois Hubs).
  const matchingName = configName.trim().toLowerCase();
  const motorMatches = matchingName
    ? liveMotors.filter((m) => m.name.trim().toLowerCase() === matchingName)
    : [];
  const liveMotor = motorMatches.length === 1 ? motorMatches[0] : undefined;
  const points = liveMotor
    ? liveHistory[liveMotor.name.trim().toLowerCase()] ?? []
    : [];
  const rpmRange = Math.max(1, ...points.map((p) => Math.abs(p.rpm)));
  const rpmPolyline = points
    .map(
      (p, i) =>
        `${points.length === 1 ? 0 : (i / (points.length - 1)) * 300},${
          60 - ((p.rpm + rpmRange) / (2 * rpmRange)) * 60
        }`
    )
    .join(' ');

  const portLabel = (type === 'motor' ? 'M' : 'S') + port;
  function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issueTitle.trim()) return;
    onAddIssue(issueTitle.trim(), issueDescription.trim());
    setIssueTitle('');
    setIssueDescription('');
  }
  function submitMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!maintenanceTitle.trim()) {
      return;
    }
    onAddMaintenance(
      maintenanceType,
      maintenanceTitle.trim(),
      maintenanceDescription.trim(),
      relatedIssueId || undefined
    );
    setMaintenanceTitle('');
    setMaintenanceDescription('');
    setRelatedIssueId('');
  }
  function findRelatedIssue(record: MaintenanceRecord) {
    const linkedId = (record as RecordWithLink).relatedIssueId;
    return issues.find((issue) => issue.id === linkedId);
  }
  return (
    <aside className="actuator-panel">
      <div className="actuator-panel-header">
        <div>
          <span className="actuator-eyebrow">FICHA DO ATUADOR</span>
          <h2>{name || (type === 'motor' ? 'Motor' : 'Servo')}</h2>
          <small>{formatModel(model)}</small>
        </div>
        <button
          type="button"
          className="actuator-close"
          onClick={onClose}
          aria-label="Fechar ficha"
        >
          ×
        </button>
      </div>
      <div className="actuator-summary">
        <div>
          <span>TIPO</span>
          <strong>{type === 'motor' ? 'Motor' : 'Servo'}</strong>
        </div>
        <div>
          <span>PORTA</span>
          <strong className="actuator-port">{portLabel}</strong>
        </div>
        <div>
          <span>HUB</span>
          <strong>{hubName}</strong>
        </div>
        <div>
          <span>ORIGEM</span>
          <strong>
            {source === 'ftc-import' ? 'Importado do FTC' : 'Cadastro manual'}
          </strong>
        </div>
      </div>
      <div className="actuator-tabs">
        <button
          type="button"
          className={tab === 'general' ? 'active' : ''}
          onClick={() => setTab('general')}
        >
          Geral
        </button>
        <button
          type="button"
          className={tab === 'encoder' ? 'active' : ''}
          onClick={() => setTab('encoder')}
        >
          Encoder
        </button>
        {type === 'motor' && (
          <button
            type="button"
            className={tab === 'profile' ? 'active' : ''}
            onClick={() => setTab('profile')}
          >
            Perfil técnico
          </button>
        )}
        <button
          type="button"
          className={tab === 'issues' ? 'active' : ''}
          onClick={() => setTab('issues')}
        >
          Ocorrências
          {pendingIssues > 0 && (
            <span className="actuator-tab-count">{pendingIssues}</span>
          )}
        </button>
        <button
          type="button"
          className={tab === 'maintenance' ? 'active' : ''}
          onClick={() => setTab('maintenance')}
        >
          Manutenção
          {pendingMaintenance > 0 && (
            <span className="actuator-tab-count">{pendingMaintenance}</span>
          )}
        </button>
      </div>
      <div className="actuator-panel-content">
        {/* =========================
            GERAL
           ========================= */}
        {tab === 'general' && (
          <div className="actuator-section">
            <h3>Informações gerais</h3>
            <label htmlFor="act-name">Nome do componente</label>
            <input
              id="act-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <label htmlFor="act-config">Nome na configuração FTC</label>
            <input
              id="act-config"
              value={draftConfigName}
              onChange={(event) => setDraftConfigName(event.target.value)}
            />
            <div className="actuator-info">
              <span>Modelo</span>
              <strong>{formatModel(model)}</strong>
            </div>
            <div className="actuator-info">
              <span>Conexão</span>
              <strong>
                {hubName} / {portLabel}
              </strong>
            </div>
            <div className="actuator-info actuator-identity">
              <span>Identidade do atuador</span>
              <code>{actuatorId ?? 'Indisponível'}</code>
            </div>
            <button
              type="button"
              className="actuator-primary"
              disabled={!draftName.trim()}
              onClick={() => onSave(draftName.trim(), draftConfigName.trim())}
            >
              Salvar alterações
            </button>
            <button
              type="button"
              className="actuator-danger"
              onClick={onDelete}
            >
              Excluir componente do mapa
            </button>
          </div>
        )}
        {tab === 'profile' && type === 'motor' && (
          <div className="actuator-section">
            <h3>Perfil técnico do motor</h3>
            <p className="actuator-muted">
              Configuração informativa, sem comandar o motor ou alterar o FTC
              SDK.
            </p>
            <label htmlFor="motor-profile-model">Modelo</label>
            <select
              id="motor-profile-model"
              value={motorProfile ? 'hd' : 'none'}
              onChange={(event) =>
                updateMotorProfile(event.target.value === 'hd' ? [] : null)
              }
            >
              <option value="none">Não configurado</option>
              <option value="hd">REV HD Hex (configurar redução)</option>
            </select>
            {motorProfile && (
              <>
                <MotorAssemblyPreview stages={motorProfile.stages} />
                <h3>Módulos disponíveis</h3>
                <p className="actuator-muted">
                  Selecione as caixas de redução instaladas. A prévia muda
                  automaticamente.
                </p>
                <div className="motor-profile-visual-controls">
                  {([3, 4, 5] as GearStage[]).map((stage) => (
                    <label key={stage} className="motor-profile-stage">
                      <input
                        type="checkbox"
                        checked={motorProfile.stages.includes(stage)}
                        onChange={(event) =>
                          updateMotorProfile(
                            event.target.checked
                              ? [...motorProfile.stages, stage]
                              : motorProfile.stages.filter((s) => s !== stage)
                          )
                        }
                      />
                      {stage}:1
                    </label>
                  ))}
                </div>
                <div className="actuator-info">
                  <span>Redução nominal</span>
                  <strong>{nominalGearRatio(motorProfile.stages)}:1</strong>
                </div>
                <div className="actuator-info">
                  <span>RPM sem carga estimado</span>
                  <strong>
                    {(6000 / nominalGearRatio(motorProfile.stages)).toFixed(1)}
                  </strong>
                </div>
                <div className="actuator-info">
                  <span>Ticks/volta estimados na saída</span>
                  <strong>{28 * nominalGearRatio(motorProfile.stages)}</strong>
                </div>
                {liveMotor && (
                  <div className="actuator-info">
                    <span>Ticks/volta informados pelo SDK</span>
                    <strong>{liveMotor.ticksPerRev}</strong>
                  </div>
                )}
                <p className="actuator-muted">
                  Valores nominais ilustrativos. A relação real das engrenagens
                  e a configuração do motor no SDK devem ser verificadas antes
                  de comparar RPM ou encoder. Não aplicamos multiplicação extra
                  aos dados já calculados pelo SDK.
                </p>
              </>
            )}
          </div>
        )}
        {/* =========================
            ENCODER
           ========================= */}
        {tab === 'encoder' && (
          <div className="actuator-section">
            <h3>Encoder ao vivo</h3>
            {type === 'servo' ? (
              <p className="actuator-muted">
                O monitoramento atual atende motores DC com encoder, não servos.
              </p>
            ) : (
              <>
                <p className="actuator-muted">
                  A conexão é gerenciada pelo menu Conectividade na barra
                  superior.
                </p>
                <div className="actuator-info">
                  <span>Conexão</span>
                  <strong>
                    {liveStatus === 'connected'
                      ? '● Conectado'
                      : liveStatus === 'connecting'
                      ? 'Conectando...'
                      : liveStatus === 'error'
                      ? '● Desconectado'
                      : 'Conecte o robô pelo menu superior'}
                  </strong>
                </div>
                {liveStatus === 'error' && (
                  <p className="actuator-muted">
                    {liveError}. Verifique a porta e se o OpMode está ativo. O
                    navegador pode bloquear HTTP.
                  </p>
                )}
                <div className="actuator-info">
                  <span>Nome FTC procurado</span>
                  <strong>{configName || 'Não informado'}</strong>
                </div>
                {liveStatus === 'connected' && !liveMotor && (
                  <p className="actuator-muted">
                    {!matchingName
                      ? 'Preencha o Nome na configuração FTC na aba Geral para associar o motor.'
                      : motorMatches.length > 1
                      ? 'Nome duplicado nas leituras. Não é possível associar com segurança.'
                      : `Nenhum motor com esse nome no JSON. Disponíveis: ${
                          liveMotors.map((m) => m.name).join(', ') || 'nenhum'
                        }.`}
                  </p>
                )}
                {liveMotor && liveStatus === 'connected' && (
                  <>
                    <div className="actuator-info">
                      <span>Ticks</span>
                      <strong>{liveMotor.ticks.toLocaleString('pt-BR')}</strong>
                    </div>
                    <div className="actuator-info">
                      <span>RPM</span>
                      <strong>{liveMotor.rpm.toFixed(2)}</strong>
                    </div>
                    <div className="actuator-info">
                      <span>Ticks por segundo</span>
                      <strong>{liveMotor.ticksPerSecond.toFixed(2)}</strong>
                    </div>
                    <div className="actuator-info">
                      <span>Ticks por volta (SDK)</span>
                      <strong>{liveMotor.ticksPerRev}</strong>
                    </div>
                    <div className="actuator-info">
                      <span>Porta informada pelo Hub</span>
                      <strong>M{liveMotor.port}</strong>
                    </div>
                    <div className="actuator-info">
                      <span>Última leitura</span>
                      <strong>
                        {liveUpdatedAt
                          ? new Date(liveUpdatedAt).toLocaleTimeString('pt-BR')
                          : '—'}
                      </strong>
                    </div>
                    <h4>Histórico de RPM (últimas 80 leituras)</h4>
                    <svg
                      viewBox="0 0 300 60"
                      role="img"
                      aria-label="Gráfico de RPM em tempo real"
                      style={{
                        width: '100%',
                        height: 100,
                        background: '#14231d',
                        borderRadius: 8,
                      }}
                    >
                      <line
                        x1="0"
                        y1="30"
                        x2="300"
                        y2="30"
                        stroke="#64776d"
                        strokeDasharray="4 4"
                      />
                      <polyline
                        points={rpmPolyline}
                        fill="none"
                        stroke="#71e6a4"
                        strokeWidth="2"
                      />
                    </svg>
                    <p className="actuator-muted">
                      Amostras temporárias: não são gravadas no histórico de
                      manutenção.
                    </p>
                  </>
                )}
                <h4>Último registro salvo</h4>
                <div className="actuator-info">
                  <span>Estado</span>
                  <strong>
                    {history?.encoder.enabled
                      ? 'Habilitado'
                      : 'Não configurado'}
                  </strong>
                </div>
                <div className="actuator-info">
                  <span>Ticks por revolução</span>
                  <strong>{history?.encoder.ticksPerRevolution ?? '—'}</strong>
                </div>
                <div className="actuator-info">
                  <span>Posição registrada</span>
                  <strong>{history?.encoder.currentPosition ?? '—'}</strong>
                </div>
              </>
            )}
          </div>
        )}

        {/* =========================
            OCORRÊNCIAS
           ========================= */}
        {tab === 'issues' && (
          <div className="actuator-section">
            <h3>Ocorrências</h3>
            <div className="actuator-count">
              <strong>{pendingIssues}</strong>
              <span>ocorrência(s) pendente(s)</span>
            </div>
            <form className="actuator-issue-form" onSubmit={submitIssue}>
              <h4>Registrar problema</h4>
              <label htmlFor="issue-title">Título</label>
              <input
                id="issue-title"
                value={issueTitle}
                onChange={(event) => setIssueTitle(event.target.value)}
                placeholder="Ex: Motor travando"
                maxLength={100}
                required
              />
              <label htmlFor="issue-desc">Descrição</label>
              <textarea
                id="issue-desc"
                value={issueDescription}
                onChange={(event) => setIssueDescription(event.target.value)}
                placeholder="Descreva os sintomas observados..."
                rows={4}
              />
              <button
                type="submit"
                className="actuator-primary"
                disabled={!issueTitle.trim()}
              >
                + Registrar ocorrência
              </button>
            </form>
            <div className="actuator-record-list">
              <h4>Histórico de ocorrências ({issues.length})</h4>
              {issues.length === 0 && (
                <p className="actuator-muted">Nenhuma ocorrência registrada.</p>
              )}
              {issues.map((record) => (
                <article className="actuator-record" key={record.id}>
                  <div className="actuator-record-heading">
                    <strong>{record.title}</strong>
                    <span className={'actuator-status status-' + record.status}>
                      {statusLabels[record.status]}
                    </span>
                  </div>
                  <small>Registrado em {formatDate(record.createdAt)}</small>
                  {record.description && <p>{record.description}</p>}
                  {record.resolvedAt && (
                    <small>Resolvido em {formatDate(record.resolvedAt)}</small>
                  )}
                  <label>Situação</label>
                  <select
                    className="actuator-select"
                    value={record.status}
                    onChange={(event) =>
                      onUpdateIssue(
                        record.id,
                        event.target.value as MaintenanceStatus
                      )
                    }
                  >
                    <option value="open">Aberto</option>
                    <option value="monitoring">Em observação</option>
                    <option value="resolved">Resolvido</option>
                  </select>
                  <button
                    type="button"
                    className="actuator-record-delete"
                    onClick={() => {
                      if (window.confirm('Excluir esta ocorrência?')) {
                        onDeleteIssue(record.id);
                      }
                    }}
                  >
                    Excluir ocorrência
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}
        {/* =========================
            MANUTENÇÃO
           ========================= */}
        {tab === 'maintenance' && (
          <div className="actuator-section">
            <h3>Histórico de manutenção</h3>
            <div className="actuator-count">
              <strong>{pendingMaintenance}</strong>
              <span>intervenção(ões) pendente(s)</span>
            </div>
            <form className="actuator-issue-form" onSubmit={submitMaintenance}>
              <h4>Registrar intervenção</h4>
              <label htmlFor="maintenance-type">Tipo de intervenção</label>
              <select
                id="maintenance-type"
                className="actuator-select"
                value={maintenanceType}
                onChange={(event) =>
                  setMaintenanceType(event.target.value as InterventionType)
                }
              >
                <option value="inspection">Inspeção</option>
                <option value="maintenance">Manutenção / Reparo</option>
                <option value="replacement">Substituição</option>
              </select>
              <label htmlFor="maintenance-title">Título</label>
              <input
                id="maintenance-title"
                value={maintenanceTitle}
                onChange={(event) => setMaintenanceTitle(event.target.value)}
                placeholder="Ex: Substituição do cabo"
                maxLength={100}
                required
              />
              <label htmlFor="maintenance-desc">Descrição da intervenção</label>
              <textarea
                id="maintenance-desc"
                value={maintenanceDescription}
                onChange={(event) =>
                  setMaintenanceDescription(event.target.value)
                }
                placeholder="O que foi inspecionado, reparado ou substituído?"
                rows={4}
              />
              <label htmlFor="related-issue">
                Ocorrência relacionada (opcional)
              </label>
              <select
                id="related-issue"
                className="actuator-select"
                value={relatedIssueId}
                onChange={(event) => setRelatedIssueId(event.target.value)}
              >
                <option value="">Nenhuma ocorrência</option>
                {issues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.title}
                  </option>
                ))}
              </select>
              <p className="actuator-muted">
                Vincular uma ocorrência não a resolve automaticamente.
              </p>
              <button
                type="submit"
                className="actuator-primary"
                disabled={!maintenanceTitle.trim()}
              >
                + Registrar intervenção
              </button>
            </form>
            <div className="actuator-record-list">
              <h4>Intervenções registradas ({interventions.length})</h4>
              {interventions.length === 0 && (
                <p className="actuator-muted">
                  Nenhuma intervenção registrada.
                </p>
              )}
              {interventions.map((record) => {
                const relatedIssue = findRelatedIssue(record);
                return (
                  <article className="actuator-record" key={record.id}>
                    <div className="actuator-record-heading">
                      <strong>{record.title}</strong>
                      <span
                        className={'actuator-status status-' + record.status}
                      >
                        {record.status === 'resolved'
                          ? 'Concluído'
                          : record.status === 'monitoring'
                          ? 'Em andamento'
                          : 'Pendente'}
                      </span>
                    </div>
                    <small>
                      {interventionLabels[record.type as InterventionType] ??
                        record.type}
                      {' • '}
                      {formatDate(record.createdAt)}
                    </small>
                    {record.description && <p>{record.description}</p>}
                    {relatedIssue && (
                      <p className="actuator-related-issue">
                        Ocorrência relacionada:{' '}
                        <strong>{relatedIssue.title}</strong>
                      </p>
                    )}
                    {record.resolvedAt && (
                      <small>
                        Concluído em {formatDate(record.resolvedAt)}
                      </small>
                    )}
                    <label>Situação da intervenção</label>
                    <select
                      className="actuator-select"
                      value={record.status}
                      onChange={(event) =>
                        onUpdateMaintenance(
                          record.id,
                          event.target.value as MaintenanceStatus
                        )
                      }
                    >
                      <option value="open">Pendente</option>
                      <option value="monitoring">Em andamento</option>
                      <option value="resolved">Concluída</option>
                    </select>
                    <button
                      type="button"
                      className="actuator-record-delete"
                      onClick={() => {
                        if (
                          window.confirm('Excluir este registro de manutenção?')
                        ) {
                          onDeleteMaintenance(record.id);
                        }
                      }}
                    >
                      Excluir registro
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
