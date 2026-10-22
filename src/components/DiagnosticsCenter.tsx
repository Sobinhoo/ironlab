import { useState } from 'react';

export type DiagnosticMotor = {
  name: string;
  port: number;
  rpm: number;
  ticks: number;
  power?: number;
};
export type DiagnosticAlert = { since: number; active: boolean; message: string };
export type DiagnosticNode = {
  id: string;
  type?: string;
  data: { name?: unknown; configName?: unknown };
};

type Props = {
  nodes: DiagnosticNode[];
  liveMotors: DiagnosticMotor[];
  diagnostics: Record<string, DiagnosticAlert>;
  connectionStatus: string;
  onClose: () => void;
  onSelectMotor: (nodeId: string) => void;
};

/** Painel apenas de apresentação: não consulta o Control Hub. */
export default function DiagnosticsCenter({ nodes, liveMotors, diagnostics, connectionStatus, onClose, onSelectMotor }: Props) {
  const [comparisonA, setComparisonA] = useState('');
  const [comparisonB, setComparisonB] = useState('');
  return (
        (
          <div role="dialog" aria-modal="true" aria-label="Central de diagnósticos" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.72)', display: 'grid', placeItems: 'center', padding: 18 }}>
            <div style={{ background: '#102019', color: '#e2e8f0', border: '1px solid #416552', borderRadius: 14, width: 'min(1050px, 96vw)', maxHeight: '88vh', overflowY: 'auto', padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div><h2 style={{ margin: 0 }}>Central de Diagnósticos</h2><small>Leitura passiva dos motores · Dados em tempo real</small></div>
                <button type="button" onClick={() => onClose()} aria-label="Fechar central">FECHAR ×</button>
              </div>
              <p style={{ color: '#a7c3b3' }}>Conexão: {connectionStatus === 'connected' ? 'Ativa' : 'Sem telemetria ativa'} • {liveMotors.length} motor(es) na transmissão • {Object.values(diagnostics).filter(d => d.active).length} alerta(s) ativo(s)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 12 }}>
                {nodes.filter(n => n.type === 'motor').map(n => {
                  const config = String(n.data.configName ?? '').trim().toLowerCase();
                  const matches = config ? liveMotors.filter(m => m.name.trim().toLowerCase() === config) : [];
                  const motor = matches.length === 1 ? matches[0] : undefined;
                  const warning = motor ? diagnostics[motor.name.trim().toLowerCase()] : undefined;
                  const active = connectionStatus === 'connected' && Boolean(warning?.active);
                  return <div key={n.id} style={{ padding: 14, background: '#172c23', border: `1px solid ${active ? '#f59e0b' : '#345544'}`, borderRadius: 10 }}>
                    <strong>{String(n.data.name || n.data.configName || 'Motor')}</strong>
                    <div style={{ color: active ? '#fbbf24' : '#9fc5ae', marginTop: 6 }}>{connectionStatus !== 'connected' ? 'SEM CONEXÃO' : !config ? 'NOME FTC NÃO DEFINIDO' : matches.length > 1 ? 'NOME FTC DUPLICADO' : !motor ? 'SEM LEITURA' : active ? 'POSSÍVEL ANOMALIA' : 'TELEMETRIA RECEBIDA'}</div>
                    <div style={{ marginTop: 8 }}>Potência: {motor?.power === undefined ? '—' : motor.power.toFixed(2)} | RPM: {motor ? motor.rpm.toFixed(2) : '—'}</div>
                    <div>Ticks: {motor ? motor.ticks.toLocaleString('pt-BR') : '—'}</div>
                    {active && <p style={{ color: '#fbbf24' }}>{warning?.message}</p>}
                    <button type="button" style={{ marginTop: 12 }} onClick={() => { onClose(); onSelectMotor(n.id); }}>ABRIR FICHA</button>
                  </div>;
                })}
              </div>
              {nodes.filter(n => n.type === 'motor').length === 0 && <p>Cadastre ou importe motores no mapa para iniciar o diagnóstico.</p>}
              <h3>Comparação rápida de motores</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[comparisonA, comparisonB].map((value, index) => <select key={index} aria-label={`Motor ${index + 1}`} value={value} onChange={e => index === 0 ? setComparisonA(e.target.value) : setComparisonB(e.target.value)} style={{ padding: 8, minWidth: 210 }}>
                  <option value="">Selecionar motor {index + 1}</option>
                  {liveMotors.map((m, i) => <option key={`${m.name}-${i}`} value={`${m.name}::${i}`}>{m.name} (M{m.port})</option>)}
                </select>)}
              </div>
              {(() => {
                const a = liveMotors[Number(comparisonA.split('::').pop())];
                const b = liveMotors[Number(comparisonB.split('::').pop())];
                if (!comparisonA || !comparisonB || !a || !b || comparisonA === comparisonB) return <p style={{ color: '#9fc5ae' }}>Selecione dois motores diferentes para comparar RPM e potência comandada.</p>;
                return <div style={{ marginTop: 12, padding: 12, background: '#172c23', borderRadius: 8 }}>
                  <strong>{a.name} × {b.name}</strong>
                  <p>RPM: {a.rpm.toFixed(2)} × {b.rpm.toFixed(2)} | Diferença absoluta: {Math.abs(a.rpm - b.rpm).toFixed(2)} RPM</p>
                  <p>Potência: {a.power === undefined ? '—' : a.power.toFixed(2)} × {b.power === undefined ? '—' : b.power.toFixed(2)}</p>
                  <small>Diferenças não indicam defeito por si só: verifique modelo, redução, carga e comandos.</small>
                </div>;
              })()}
              <p style={{ fontSize: 12, color: '#a7c3b3' }}>Avisos são hipóteses baseadas em potência e encoder; não substituem inspeção física. Para registrar uma ocorrência, abra a ficha do motor.</p>
            </div>
          </div>
        )

  );
}
