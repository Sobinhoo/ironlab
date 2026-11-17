export type ImportedMotor = {
  type: 'motor';
  name: string;
  port: number;
  model: string;
  hubName: string;
  moduleAddress: number;
};
export type ImportedServo = {
  type: 'servo';
  name: string;
  port: number;
  model: string;
  hubName: string;
  moduleAddress: number;
};
export type ImportedComponent = ImportedMotor | ImportedServo;
export type ImportedHub = {
  name: string;
  moduleAddress: number;
  components: ImportedComponent[];
};
export type FTCConfiguration = { name: string; hubs: ImportedHub[]; source?: 'xml' | 'log-device-info' };

/** Accept both Robot Controller logcat lines and standalone FTC robot XML files. */
export function findLatestRobotXml(text: string): string {
  const xml: string[] = [];
  let current: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    const start = line.indexOf('<Robot');
    if (start !== -1 && /^<Robot(?:\s|>)/.test(line.slice(start))) {
      current = [];
    }
    if (current === null) continue;
    // Logcat prefixes each XML line with timestamp, PID and logger tag.
    const fragmentStart = line.indexOf('<');
    if (fragmentStart !== -1) {
      current.push(line.slice(fragmentStart).trim());
    }
    if (line.includes('</Robot>')) {
      const candidate = current.join('\n');
      if (candidate.includes('<Robot') && candidate.includes('</Robot>')) xml.push(candidate);
      current = null;
    }
  }
  return xml.at(-1) ?? '';
}

function configurationName(text: string): string {
  const commands = [...text.matchAll(/CMD_(?:SAVE|ACTIVATE)_CONFIGURATION[^\n]*?["']name["']\s*:\s*["']([^"'\n]+)["']/g)];
  if (commands.length) return commands.at(-1)![1];
  const name = text.match(/<Robot\b[^>]*\bname\s*=\s*["']([^"']+)["']/);
  return name?.[1] ?? 'Configuração FTC importada';
}

function componentType(tag: string): 'motor' | 'servo' | null {
  const normalized = tag.toLowerCase();
  if (normalized.includes('controller')) return null;
  if (normalized.includes('motor')) return 'motor';
  if (normalized.includes('servo')) return 'servo';
  return null;
}

/**
 * Robot Controller logs do not necessarily contain the <Robot> XML.
 * FTC SDK also prints an authoritative HardwareMap table:
 *   I RobotCore: ========= Device Information =========
 *   I RobotCore: Type          Name          Connection
 *   I RobotCore: Motor         left          USB (embedded); module 173; port 1
 *
 * The table is a partial configuration: device names, hub and port are known;
 * motor model, unmapped devices and complete XML settings are not.
 */
export function parseFTCDeviceInfoLog(text: string): FTCConfiguration | null {
  type Row = { kind: 'motor' | 'servo'; name: string; port: number; module: number; embedded: boolean; bus: string };
  let rows: Row[] | null = null;
  let latest: Row[] = [];
  let hasHeader = false;
  const finish = () => {
    if (hasHeader && rows && rows.length > 0) latest = rows;
    rows = null;
    hasHeader = false;
  };

  for (const line of text.split(/\r?\n/)) {
    const message = line.match(/\bI\s+RobotCore:\s+(.+)$/)?.[1];
    if (message?.includes('Device Information') && /=+\s*Device Information\s*=+/.test(message)) {
      finish();
      rows = [];
      continue;
    }
    if (rows === null) continue;
    if (!message) { finish(); continue; }
    if (!hasHeader) {
      if (/^Type\s{2,}Name\s{2,}Connection\s*$/.test(message.trim())) {
        hasHeader = true;
      } else {
        finish();
      }
      continue;
    }
    const columns = message.trim().split(/\s{2,}/);
    if (columns.length < 3) { finish(); continue; }
    const [label, name, ...rest] = columns;
    let kind: Row['kind'] | null = null;
    if (label === 'Motor') kind = 'motor';
    else if (/^(?:Servo|CRServo|Continuous Rotation Servo|Continuous Servo)$/i.test(label)) kind = 'servo';
    if (!kind) continue; // Controllers, IMUs and hubs are not mapped as actuators.
    const connection = rest.join('  ');
    const identity = connection.match(/\bmodule\s+(\d+)\s*;\s*port\s+(\d+)\b/i);
    if (!identity || !name.trim()) continue;
    const module = Number(identity[1]);
    const port = Number(identity[2]);
    if (!Number.isInteger(module) || !Number.isInteger(port) || module < 0 ||
        port < 0 || port > (kind === 'motor' ? 3 : 5)) continue;
    const bus = connection.slice(0, identity.index).trim();
    rows.push({ kind, name: name.trim(), port, module,
      embedded: /\(embedded\)/i.test(bus), bus });
  }
  finish();
  if (!latest.length) return null;

  // A Lynx module address alone may repeat on two USB buses.
  // Our workspace currently identifies expansion hubs by module address,
  // so reject ambiguous imports instead of connecting devices incorrectly.
  const addressBus = new Map<number, string>();
  const hubs = new Map<string, ImportedHub>();
  for (const row of latest) {
    const busKey = row.bus.toLowerCase();
    const previous = addressBus.get(row.module);
    if (previous !== undefined && previous !== busKey) {
      throw new Error('O log contém módulos REV com o mesmo endereço em conexões distintas. Importe o XML para identificá-los sem ambiguidade.');
    }
    addressBus.set(row.module, busKey);
    const key = busKey + '|' + row.module;
    let hub = hubs.get(key);
    if (!hub) {
      hub = {
        name: row.embedded ? 'Control Hub' : 'Expansion Hub ' + row.module,
        moduleAddress: row.module, components: [],
      };
      hubs.set(key, hub);
    }
    if (hub.components.some(item => item.type === row.kind && item.port === row.port)) {
      // HardwareMap aliases to the same physical port must not create two nodes.
      continue;
    }
    hub.components.push({
      type: row.kind, name: row.name, port: row.port,
      model: row.kind === 'motor' ? 'Motor' : 'Servo',
      hubName: hub.name, moduleAddress: row.module,
    });
  }

  const names = [...text.matchAll(/pref_hardware_config_filename[^\n]*?value=(\{[^\n]*\})/g)];
  let configName = 'Hardware identificado no log';
  for (const match of names) {
    try {
      const metadata: unknown = JSON.parse(match[1]);
      const name = (metadata as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) configName = name.trim();
    } catch { /* unrelated or truncated preference */ }
  }
  return { name: configName, hubs: [...hubs.values()], source: 'log-device-info' };
}

/**
 * Parse actual robot configuration XML, either as a standalone .xml file or
 * the newest complete <Robot> block found in robotControllerLog.txt.
 * Runtime telemetry is not a replacement for FTC device configuration files.
 */
export function parseFTCLog(text: string): FTCConfiguration {
  const xmlText = findLatestRobotXml(text);
  if (!xmlText) {
    const fromTable = parseFTCDeviceInfoLog(text);
    if (fromTable) return fromTable;
    throw new Error('Não foi encontrada configuração FTC: nem XML <Robot> completo nem tabela Device Information com motores/servos.');
  }
  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('XML da configuração FTC inválido ou incompleto.');
  }
  const robot = document.documentElement;
  if (robot.tagName !== 'Robot') throw new Error('Arquivo não é uma configuração FTC (raiz Robot ausente).');
  const modules = Array.from(robot.getElementsByTagName('LynxModule'));
  if (!modules.length) throw new Error('Configuração FTC sem módulos REV Lynx.');
  const hubs: ImportedHub[] = modules.map(module => {
    const address = Number(module.getAttribute('port'));
    if (!Number.isInteger(address) || address < 0) {
      throw new Error('Endereço de módulo REV inválido na configuração.');
    }
    const parent = module.parentElement;
    const embedded = parent?.getAttribute('serialNumber') === '(embedded)';
    const name = module.getAttribute('name') ||
      (embedded ? 'Control Hub' : 'Expansion Hub ' + address);
    const components: ImportedComponent[] = [];
    for (const child of Array.from(module.children)) {
      const type = componentType(child.tagName);
      if (!type) continue;
      const componentName = child.getAttribute('name')?.trim();
      const port = Number(child.getAttribute('port'));
      if (!componentName || !Number.isInteger(port) ||
          port < 0 || port > (type === 'motor' ? 3 : 5)) continue;
      components.push({
        type, name: componentName, port,
        model: child.tagName, hubName: name, moduleAddress: address,
      });
    }
    return { name, moduleAddress: address, components };
  });
  return { name: configurationName(text), hubs, source: 'xml' };
}
