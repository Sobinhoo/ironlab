import type { TestSession } from '../utils/testSessions';

export type GraphMetric = 'rpm' | 'voltage';

export default function SessionGraph({ session, metric, motorName }: { session: TestSession; metric: GraphMetric; motorName?: string }) {
  const width = 850, height = 230;
  const left = 58, right = 18, top = 18, bottom = 36;
  const samples = session.samples;
  const points = samples.map(sample => {
    if (metric === 'voltage') return { time: sample.time, value: typeof sample.voltage === 'number' && Number.isFinite(sample.voltage) ? sample.voltage : null };
    const motor = sample.motors.find(m => m.name === motorName);
    return { time: sample.time, value: motor && typeof motor.rpm === 'number' && Number.isFinite(motor.rpm) ? motor.rpm : null };
  });
  const valid = points.filter((p): p is {time: number; value: number} => p.value !== null);
  if (!valid.length) return <p style={{ color: '#a7c3b3' }}>Sem leituras válidas para este gráfico.</p>;
  const first = samples[0].time;
  const last = samples[samples.length - 1].time;
  const duration = Math.max(1000, last - first);
  const minValue = Math.min(...valid.map(p => p.value));
  const maxValue = Math.max(...valid.map(p => p.value));
  const spread = Math.max(1, maxValue - minValue);
  const yMin = minValue - spread * .12;
  const yMax = maxValue + spread * .12;
  const x = (t: number) => left + (t - first) / duration * (width - left - right);
  const y = (v: number) => top + (yMax - v) / (yMax - yMin) * (height - top - bottom);
  // Se a amostragem parar, quebramos a linha; nunca substituímos ausências por zero.
  const segments: {time: number; value: number}[][] = [];
  let current: {time: number; value: number}[] = [];
  const expectedGap = 2500;
  for (const p of points) {
    if (p.value === null) { if (current.length) segments.push(current); current = []; continue; }
    if (current.length && p.time - current[current.length - 1].time > expectedGap) {
      segments.push(current); current = [];
    }
    current.push({time: p.time, value: p.value});
  }
  if (current.length) segments.push(current);
  const ticks = [0, 1, 2, 3, 4];
  return <div style={{ width: '100%', overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric === 'voltage' ? 'Tensão da bateria' : `RPM do motor ${motorName}`} ao longo da sessão`} style={{ width: '100%', minWidth: 430, display: 'block', background: '#08120e', borderRadius: 8, border: '1px solid #345544' }}>
      {ticks.map(i => { const val = yMin + (yMax - yMin) * i / 4; return <g key={i}>
        <line x1={left} x2={width-right} y1={y(val)} y2={y(val)} stroke="#284737" strokeDasharray="4 5" />
        <text x={left-9} y={y(val)+4} textAnchor="end" fontSize="12" fill="#b4c9bd">{val.toFixed(metric === 'voltage' ? 2 : 0)}</text>
      </g>; })}
      {ticks.map(i => <text key={i} x={left + i / 4 * (width-left-right)} y={height-12} textAnchor="middle" fontSize="12" fill="#b4c9bd">{Math.round(i * duration / 4000)}s</text>)}
      {segments.map((segment, i) => <g key={i}>
        {segment.length > 1 && <polyline fill="none" stroke={metric === 'voltage' ? '#facc15' : '#4ade80'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={segment.map(p => `${x(p.time)},${y(p.value)}`).join(' ')} />}
        {segment.length === 1 && <circle cx={x(segment[0].time)} cy={y(segment[0].value)} r="3.5" fill={metric === 'voltage' ? '#facc15' : '#4ade80'} />}
      </g>)}
      <text x={width-16} y={height-12} textAnchor="end" fontSize="11" fill="#b4c9bd">Tempo decorrido</text>
    </svg>
    <small style={{ color: '#a7c3b3' }}>{valid.length} leituras válidas de {samples.length} amostras. Lacunas representam dados indisponíveis ou intervalos acima de 2,5 s.</small>
  </div>;
}

