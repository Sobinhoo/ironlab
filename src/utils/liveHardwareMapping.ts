import type { Edge, Node } from '@xyflow/react';
import type { LiveMotor, LiveServo } from '../services/hubTelemetry';

type Kind = 'motor' | 'servo';
type LiveDevice = { kind: Kind; name: string; port: number; connection?: string; model?: string };

export type LiveHardwarePlan = {
  nodes: Node[];
  edges: Edge[];
  unresolved: number;
  inferred: number;
};

/**
 * Converts read-only FTC telemetry into *new* workspace nodes.
 * Never changes a saved device, its position, or its actuator history.
 */
export function planLiveHardwareMapping(
  existing: readonly Node[],
  motors: readonly LiveMotor[],
  servos: readonly LiveServo[],
  newActuatorId: () => string,
  excludedIds: ReadonlySet<string> = new Set<string>()
): LiveHardwarePlan {
  const hubs = existing.filter(n => n.type === 'controlHub' || n.type === 'expansionHub');
  const devices: LiveDevice[] = [
    ...motors.map(m => ({ kind: 'motor' as const, name: m.name, port: m.port, connection: m.connection })),
    ...servos.map(s => ({ kind: 'servo' as const, name: s.name, port: s.port, connection: s.connection,
      model: s.type === 'continuous' ? 'ContinuousRotationServo' : 'Servo' })),
  ];
  const result: LiveHardwarePlan = { nodes: [], edges: [], unresolved: 0, inferred: 0 };
  if (!hubs.length) {
    result.unresolved = devices.length;
    return result;
  }

  // A port number is only unique *within* a hub. A collision without hub identity
  // is evidence that the workspace cannot safely guess which physical hub owns it.
  const collisions = new Map<string, number>();
  for (const d of devices) {
    const key = d.kind + ':' + d.port;
    collisions.set(key, (collisions.get(key) ?? 0) + 1);
  }

  function matchingHub(connection?: string): { hub: Node; inferred: boolean } | null {
    const info = (connection ?? '').trim().toLowerCase();
    const explicit = hubs.filter(h => {
      const serial = String(h.data.serialNumber ?? '').trim().toLowerCase();
      const moduleAddress = String(h.data.moduleAddress ?? '').trim();
      if (serial.length >= 5 && info.includes(serial)) return true;
      if (moduleAddress && /^\\d+$/.test(moduleAddress)) {
        const match = info.match(/module(?:\\s+address)?\\s*[:=#-]?\\s*(\\d+)\\b/);
        if (match && match[1] === moduleAddress) return true;
      }
      if (/\\bcontrol\\s+hub\\b/.test(info) && h.type === 'controlHub') return true;
      if (/\\bexpansion\\s+hub\\b/.test(info) && h.type === 'expansionHub' &&
          hubs.filter(x => x.type === 'expansionHub').length === 1) return true;
      return false;
    });
    if (explicit.length === 1) return { hub: explicit[0], inferred: false };
    if (explicit.length > 1) return null;
    if (hubs.length !== 1) return null;
    const only = hubs[0];
    // Do not attribute an explicitly named external Expansion Hub to a Control Hub.
    if ((/\\bexpansion\\s+hub\\b/.test(info) && only.type === 'controlHub') ||
        (/\\bcontrol\\s+hub\\b/.test(info) && only.type !== 'controlHub')) return null;
    return { hub: only, inferred: true };
  }

  for (const d of devices) {
    const maxPort = d.kind === 'motor' ? 3 : 5;
    if (!d.name.trim() || !Number.isInteger(d.port) || d.port < 0 || d.port > maxPort ||
        (collisions.get(d.kind + ':' + d.port) ?? 0) > 1) {
      result.unresolved++;
      continue;
    }
    const match = matchingHub(d.connection);
    if (!match) {
      result.unresolved++;
      continue;
    }
    const { hub, inferred } = match;
    const id = hub.id + '-' + d.kind + '-' + d.port;
    const occupied = [...existing, ...result.nodes].some(n =>
      n.id === id ||
      (n.type === d.kind && n.data.hubId === hub.id && Number(n.data.port) === d.port));
    if (occupied || excludedIds.has(id)) continue;

    const actuatorId = newActuatorId();
    result.nodes.push({
      id, type: d.kind,
      position: d.kind === 'motor'
        ? { x: hub.position.x - 300, y: hub.position.y + 20 + d.port * 100 }
        : { x: hub.position.x + 50 + d.port * 45, y: hub.position.y + 400 },
      data: { actuatorId, hubId: hub.id, source: 'http-telemetry', name: d.name.trim(),
        configName: d.name.trim(), port: d.port, ...(d.model ? { model: d.model } : {}),
        connection: d.connection ?? '', inferredHub: inferred },
    });
    result.edges.push({
      id: 'cable-' + id, source: hub.id, sourceHandle: d.kind + '-' + d.port,
      target: id, type: 'smoothstep',
    });
    if (inferred) result.inferred++;
  }
  return result;
}
