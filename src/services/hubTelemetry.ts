/** Comunicação somente leitura com a ponte HTTP do FTC Electrical Lab. */
export type LiveMotor = {
  name: string;
  port: number;
  ticks: number;
  ticksPerSecond: number;
  ticksPerRev: number;
  rpm: number;
  power?: number;
  connection?: string;
};

export type LiveServo = {
  name: string;
  port: number;
  type: 'standard' | 'continuous';
  position?: number;
  power?: number;
  connection?: string;
};

export type HubTelemetry = {
  motors: LiveMotor[];
  servos: LiveServo[];
  voltage: unknown;
  timestamp: number | null;
  profile: 'light' | 'lab' | null;
  status: 'running' | 'waiting' | 'stale';
};

/** Uma requisição HTTP. O agendamento de polling permanece no App.tsx. */
export async function fetchHubTelemetry(
  hubIp: string,
  port: number,
  signal: AbortSignal
): Promise<HubTelemetry> {
  const response = await fetch(`http://${hubIp.trim()}:${port}/`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Resposta JSON inválida do Control Hub.');
  }
  const payload = data as Record<string, unknown>;
  if (payload.status !== 'running' && payload.status !== 'waiting' && payload.status !== 'stale') {
    throw new Error('Estado desconhecido no servidor de telemetria.');
  }
  if (payload.status === 'running' && !Array.isArray(payload.motors)) {
    throw new Error('Lista de motores ausente ou inválida.');
  }
  if (payload.status === 'stale' || payload.fresh === false) {
    return { status: 'stale', motors: [], servos: [], voltage: null, timestamp: null, profile: null };
  }
  if (payload.status === 'waiting') {
    return {
      status: 'waiting', motors: [], servos: [], voltage: null,
      timestamp: null, profile: null,
    };
  }
  const motors = (data as { motors: unknown[] }).motors.filter(
    (motor): motor is LiveMotor => {
      if (!motor || typeof motor !== 'object') return false;
      const m = motor as Record<string, unknown>;
      return (
        typeof m.name === 'string' &&
        ['port', 'ticks', 'ticksPerSecond', 'ticksPerRev', 'rpm'].every(
          (key) => typeof m[key] === 'number' && Number.isFinite(m[key])
        )
      );
    }
  );
  for (const motor of motors) {
    if (typeof motor.power !== 'number' || !Number.isFinite(motor.power)) {
      delete motor.power;
    }
  }
  const rawServos = (data as { servos?: unknown }).servos;
  const servos: LiveServo[] = Array.isArray(rawServos)
    ? rawServos.filter((item): item is LiveServo => {
        if (!item || typeof item !== 'object') return false;
        const s = item as Record<string, unknown>;
        return (
          typeof s.name === 'string' &&
          typeof s.port === 'number' &&
          (s.type === 'standard' || s.type === 'continuous') &&
          (s.type === 'standard'
            ? typeof s.position === 'number'
            : typeof s.power === 'number')
        );
      })
    : [];
  const rawTimestamp = (data as { timestamp?: unknown }).timestamp;
  const timestamp = typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? rawTimestamp : null;
  const monitor = (data as { monitor?: { profile?: unknown } }).monitor;
  const profile = monitor?.profile === 'light' || monitor?.profile === 'lab' ? monitor.profile : null;
  return {
    status: 'running',
    timestamp,
    profile,
    motors,
    servos,
    voltage: (data as { batteryVoltage?: unknown }).batteryVoltage,
  };
}

/** Health probe for bridge v2; older bridges return 404 and use the legacy root. */
export async function probeHubHealth(hubIp: string, port: number, signal: AbortSignal): Promise<'running' | 'waiting' | 'stale' | 'legacy'> {
  const base = `http://${hubIp.trim()}:${port}`;
  const response = await fetch(base + '/health', { cache: 'no-store', signal });
  if (response.status === 404) {
    const legacy = await fetch(base + '/', { cache: 'no-store', signal });
    if (!legacy.ok) throw new Error(`HTTP ${legacy.status}`);
    return 'legacy';
  }
  if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('Health JSON inválido.');
  const health = payload as Record<string, unknown>;
  if (health.status === 'waiting') return 'waiting';
  if (health.status === 'stale' || health.fresh === false) return 'stale';
  if (health.status === 'running' && health.fresh === true) return 'running';
  throw new Error('Estado de saúde desconhecido.');
}
