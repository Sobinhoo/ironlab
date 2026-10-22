/** Avaliação de anomalias potenciais. Não executa comandos no robô. */
export type MotorReading = { name: string; rpm: number; power?: number };
export type DiagnosticSettings = { minPower: number; maxRpm: number; durationMs: number };
export type DiagnosticAlert = { since: number; active: boolean; message: string };

export function evaluateMotorDiagnostics(
  motors: MotorReading[],
  settings: DiagnosticSettings,
  previousTimers: Record<string, number>,
  now: number
): { alerts: Record<string, DiagnosticAlert>; timers: Record<string, number> } {
  const alerts: Record<string, DiagnosticAlert> = {};
  const timers: Record<string, number> = {};
  for (const motor of motors) {
    const key = motor.name.trim().toLowerCase();
    if (typeof motor.power !== 'number' || !Number.isFinite(motor.power) || !Number.isFinite(motor.rpm)) continue;
    if (Math.abs(motor.power) >= settings.minPower && Math.abs(motor.rpm) <= settings.maxRpm) {
      const since = previousTimers[key] ?? now;
      timers[key] = since;
      alerts[key] = {
        since,
        active: now - since >= settings.durationMs,
        message: 'Potência comandada elevada e RPM baixo. Verifique transmissão, travamento e encoder.',
      };
    }
  }
  return { alerts, timers };
}
