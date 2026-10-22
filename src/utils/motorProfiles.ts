/** Perfis de transmissão; relações nominais até conferência da ficha de cada estágio. */
export type GearStage = 3 | 4 | 5;
export type MotorProfile = { kind: 'hd-hex-ultraplanetary'; stages: GearStage[] };
const KEY = 'ftc-electrical-lab-motor-profiles-v1';
export function loadMotorProfiles(): Record<string, MotorProfile> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, MotorProfile> = {};
    for (const [id, raw] of Object.entries(value)) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Partial<MotorProfile>;
      if (p.kind === 'hd-hex-ultraplanetary' && Array.isArray(p.stages) &&
          p.stages.length <= 3 && p.stages.every(s => s === 3 || s === 4 || s === 5) &&
          new Set(p.stages).size === p.stages.length) result[id] = {kind: p.kind, stages: p.stages};
    }
    return result;
  } catch { return {}; }
}
export function saveMotorProfiles(profiles: Record<string, MotorProfile>): void {
  try { localStorage.setItem(KEY, JSON.stringify(profiles)); } catch { /* armazenamento indisponível */ }
}
export function nominalGearRatio(stages: GearStage[]): number {
  return stages.reduce((ratio, stage) => ratio * stage, 1);
}
