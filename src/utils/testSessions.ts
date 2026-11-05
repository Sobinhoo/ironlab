import { scopedStorageKey } from './scopedStorage';
export type SessionSample = {
  time: number;
  voltage: number | null;
  motors: { name: string; port: number; rpm: number; ticks: number; power: number | null }[];
  alerts: string[];
};

export type TestSession = {
  id: string;
  robotId: string;
  robotName: string;
  label: string;
  startedAt: number;
  endedAt: number | null;
  samples: SessionSample[];
};

export const SESSION_KEY = 'ftc-electrical-lab-sessions-v021';
export const MAX_SESSIONS = 12;
export const MAX_SAMPLES = 1800; // 30 minutos, uma amostra por segundo

export function loadSessions(): TestSession[] {
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(SESSION_KEY));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is TestSession =>
      Boolean(s && typeof s === 'object' && typeof s.id === 'string' &&
      typeof s.startedAt === 'number' && Array.isArray(s.samples))
    ).slice(0, MAX_SESSIONS);
  } catch { return []; }
}

export function sessionMetrics(session: TestSession) {
  const motorStats = new Map<string, { name: string; rpmSum: number; rpmPeak: number; powerSum: number; powerCount: number; count: number }>();
  const alertSet = new Set<string>();
  let voltageSum = 0;
  let voltageCount = 0;
  for (const sample of session.samples) {
    if (sample.voltage !== null) { voltageSum += sample.voltage; voltageCount++; }
    for (const alert of sample.alerts) alertSet.add(alert);
    for (const motor of sample.motors) {
      const key = motor.name.trim().toLowerCase();
      const current = motorStats.get(key) ?? { name: motor.name, rpmSum: 0, rpmPeak: 0, powerSum: 0, powerCount: 0, count: 0 };
      current.rpmSum += Math.abs(motor.rpm);
      current.rpmPeak = Math.max(current.rpmPeak, Math.abs(motor.rpm));
      current.count++;
      if (motor.power !== null) { current.powerSum += Math.abs(motor.power); current.powerCount++; }
      motorStats.set(key, current);
    }
  }
  return {
    voltageAvg: voltageCount ? voltageSum / voltageCount : null,
    alerts: [...alertSet],
    motors: [...motorStats.values()].map(m => ({
      name: m.name, avgRpm: m.rpmSum / m.count, peakRpm: m.rpmPeak,
      avgPower: m.powerCount ? m.powerSum / m.powerCount : null,
    })),
  };
}

export function exportSessionCSV(session: TestSession) {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows: string[][] = [['data_hora', 'sessao', 'robo', 'motor', 'porta', 'rpm', 'ticks', 'potencia_comandada', 'tensao_bateria_v', 'alertas']];
  for (const sample of session.samples) {
    const base = [new Date(sample.time).toISOString(), session.label, session.robotName];
    if (!sample.motors.length) rows.push([...base, '', '', '', '', '', sample.voltage?.toString() ?? '', sample.alerts.join(' | ')]);
    for (const motor of sample.motors) rows.push([...base, motor.name, String(motor.port), String(motor.rpm), String(motor.ticks), motor.power?.toString() ?? '', sample.voltage?.toString() ?? '', sample.alerts.join(' | ')]);
  }
  const csv = '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `electrical-lab-${session.id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

