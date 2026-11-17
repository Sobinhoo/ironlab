import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMaintenanceReportEntries,
  summarizeMaintenanceReport,
} from '../src/utils/maintenanceReports.ts';

const snapshot = {
  schemaVersion: 1,
  robot: { id: 'robot-1', name: 'IronHide', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
  ftcConfigurationName: 'IronHideConfig',
  nodes: [
    { id: 'control-hub', type: 'controlHub', position: { x: 0, y: 0 }, data: { name: 'Control Hub' } },
    { id: 'motor-1', type: 'motor', position: { x: 0, y: 0 }, data: { actuatorId: 'actuator-1', name: 'Left Drive', configName: 'leftDrive', hubId: 'control-hub', port: 0, model: 'RevRobotics40HDHexMotor' } },
  ],
  edges: [],
  actuators: {
    'actuator-1': {
      actuatorId: 'actuator-1',
      encoder: { enabled: false },
      telemetry: [],
      maintenance: [
        { id: 'issue-1', createdAt: '2026-11-10T12:00:00.000Z', type: 'problem', title: 'Ruído no motor', description: 'Ruído após partida.', status: 'resolved', resolvedAt: '2026-11-10T14:00:00.000Z' },
        { id: 'repair-1', createdAt: '2026-11-11T12:00:00.000Z', type: 'maintenance', title: 'Inspeção da caixa', description: 'A caixa foi aberta e inspecionada.', status: 'monitoring', relatedIssueId: 'issue-1' },
        { id: 'inspection-1', createdAt: '2026-11-12T12:00:00.000Z', type: 'inspection', title: 'Verificação de fixação', description: '', status: 'open' },
      ],
    },
    'actuator-orphan': {
      actuatorId: 'actuator-orphan',
      encoder: { enabled: false },
      telemetry: [],
      maintenance: [
        { id: 'orphan-1', createdAt: '2026-11-13T12:00:00.000Z', type: 'problem', title: 'Registro preservado', description: 'Atuador removido do mapa.', status: 'open' },
      ],
    },
  },
};

const base = { kind: 'complete', status: 'all', componentId: '', from: '', to: '' };

test('coleta registros, identifica componente e preserva histórico órfão', () => {
  const entries = buildMaintenanceReportEntries(snapshot, base);
  assert.equal(entries.length, 4);
  assert.equal(entries[0].id, 'orphan-1');
  assert.equal(entries.find((entry) => entry.id === 'repair-1').componentName, 'Left Drive');
  assert.equal(entries.find((entry) => entry.id === 'repair-1').hubName, 'Control Hub');
  assert.equal(entries.find((entry) => entry.id === 'repair-1').portLabel, 'M0');
  assert.equal(entries.find((entry) => entry.id === 'repair-1').relatedIssueTitle, 'Ruído no motor');
  assert.equal(entries.find((entry) => entry.id === 'orphan-1').componentType, 'unknown');
});

test('separa ocorrências e intervenções e filtra por situação', () => {
  const occurrences = buildMaintenanceReportEntries(snapshot, { ...base, kind: 'occurrences' });
  assert.deepEqual(occurrences.map((entry) => entry.id), ['orphan-1', 'issue-1']);
  const interventions = buildMaintenanceReportEntries(snapshot, { ...base, kind: 'maintenance', status: 'monitoring' });
  assert.deepEqual(interventions.map((entry) => entry.id), ['repair-1']);
});

test('filtra por componente e intervalo de datas local inclusivo', () => {
  const entries = buildMaintenanceReportEntries(snapshot, {
    ...base,
    componentId: 'motor-1',
    from: '2026-11-11',
    to: '2026-11-11',
  });
  assert.deepEqual(entries.map((entry) => entry.id), ['repair-1']);
});

test('resume corretamente os registros filtrados', () => {
  const summary = summarizeMaintenanceReport(buildMaintenanceReportEntries(snapshot, base));
  assert.deepEqual(summary, {
    total: 4,
    occurrences: 2,
    interventions: 2,
    open: 2,
    monitoring: 1,
    resolved: 1,
    inspections: 1,
    repairs: 1,
    replacements: 0,
  });
});
