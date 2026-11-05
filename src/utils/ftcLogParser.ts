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
export type FTCConfiguration = { name: string; hubs: ImportedHub[] };

/** Accept both Robot Controller logcat lines and standalone FTC robot XML files. */
function findLatestRobotXml(text: string): string {
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
 * Parse actual robot configuration XML, either as a standalone .xml file or
 * the newest complete <Robot> block found in robotControllerLog.txt.
 * Runtime telemetry is not a replacement for FTC device configuration files.
 */
export function parseFTCLog(text: string): FTCConfiguration {
  const xmlText = findLatestRobotXml(text);
  if (!xmlText) {
    throw new Error(
      'Este arquivo não contém um bloco <Robot> completo. Exporte a configuração XML pela Driver Station/Robot Controller, ou forneça um log que registre a configuração.'
    );
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
  return { name: configurationName(text), hubs };
}
