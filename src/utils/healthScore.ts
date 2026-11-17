/**
 * IRONLab Health Score (experimental).
 * Heuristic condition estimate, not a validated failure probability.
 * Never use this value as the sole basis for hardware safety decisions.
 */
export type HealthReading = { rpm: number; power?: number | null; ticks?: number | null; time?: number };
export type HealthIssue = { code: 'low_rpm' | 'rpm_variation' | 'encoder_stalled' | 'maintenance_open' | 'insufficient_data'; label: string; penalty: number };
export type HealthResult = { score: number | null; status: 'unknown' | 'good' | 'attention' | 'critical'; issues: HealthIssue[]; sampleCount: number };

export function evaluateHealth(
  readings: HealthReading[],
  openMaintenanceCount = 0,
): HealthResult {
  const valid = readings.filter(r => Number.isFinite(r.rpm) && (r.power == null || Number.isFinite(r.power)));
  const issues: HealthIssue[] = [];
  if (valid.length < 5) {
    return { score: null, status: 'unknown', issues: [{ code: 'insufficient_data', label: 'Pelo menos cinco amostras válidas são necessárias.', penalty: 0 }], sampleCount: valid.length };
  }
  const powered = valid.filter(r => typeof r.power === 'number' && Math.abs(r.power) >= 0.5);
  if (powered.length >= 3 && powered.filter(r => Math.abs(r.rpm) <= 5).length / powered.length >= 0.6)
    issues.push({ code: 'low_rpm', label: 'RPM baixo durante potência comandada elevada.', penalty: 35 });

  const moving = valid.filter(r => Math.abs(r.rpm) > 5);
  if (moving.length >= 5) {
    const magnitudes = moving.map(r => Math.abs(r.rpm));
    const mean = magnitudes.reduce((a,b) => a+b, 0) / magnitudes.length;
    const variance = magnitudes.reduce((a,b) => a + (b-mean)**2, 0) / magnitudes.length;
    // RPM variation is meaningful only for approximately constant commanded power.
    const powers = moving.map(r => r.power).filter((p): p is number => typeof p === 'number');
    const steadyPower = powers.length === moving.length && Math.max(...powers) - Math.min(...powers) < 0.1;
    if (steadyPower && mean > 0 && Math.sqrt(variance) / mean > 0.3)
      issues.push({ code: 'rpm_variation', label: 'Variação elevada de RPM sob comando estável.', penalty: 20 });
  }

  const encoded = powered.filter(r => typeof r.ticks === 'number' && Number.isFinite(r.ticks));
  if (encoded.length >= 3 && encoded.every(r => r.ticks === encoded[0].ticks))
    issues.push({ code: 'encoder_stalled', label: 'Encoder sem alteração durante comando de movimento.', penalty: 25 });

  const count = Math.max(0, Math.floor(Number.isFinite(openMaintenanceCount) ? openMaintenanceCount : 0));
  if (count) issues.push({ code: 'maintenance_open', label: count + ' ocorrência(s) de manutenção aberta(s).', penalty: Math.min(30, count * 10) });
  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + issue.penalty, 0));
  return { score, status: score < 50 ? 'critical' : score < 80 ? 'attention' : 'good', issues, sampleCount: valid.length };
}
