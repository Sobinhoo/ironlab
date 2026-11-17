import type {
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  SavedProject,
} from './projectStorage';

export type MaintenanceReportKind = 'occurrences' | 'maintenance' | 'complete';
export type MaintenanceReportStatus = 'all' | MaintenanceStatus;

export type MaintenanceReportFilters = {
  kind: MaintenanceReportKind;
  status: MaintenanceReportStatus;
  componentId: string;
  from: string;
  to: string;
};

export type MaintenanceReportEntry = {
  id: string;
  actuatorId: string;
  componentId: string;
  componentName: string;
  componentType: 'motor' | 'servo' | 'unknown';
  model: string;
  hubName: string;
  portLabel: string;
  createdAt: string;
  resolvedAt?: string;
  type: MaintenanceType;
  title: string;
  description: string;
  status: MaintenanceStatus;
  relatedIssueId?: string;
  relatedIssueTitle?: string;
};

type ComponentInfo = Omit<
  MaintenanceReportEntry,
  'id' | 'createdAt' | 'resolvedAt' | 'type' | 'title' | 'description' | 'status' | 'relatedIssueId' | 'relatedIssueTitle'
>;

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function localDateBoundary(value: string, endOfDay: boolean): number | null {
  if (!value) return null;
  const date = new Date(value + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function formatMaintenanceType(type: MaintenanceType): string {
  switch (type) {
    case 'problem': return 'Ocorrência';
    case 'inspection': return 'Inspeção';
    case 'maintenance': return 'Manutenção / Reparo';
    case 'replacement': return 'Substituição';
  }
}

export function formatMaintenanceStatus(status: MaintenanceStatus): string {
  switch (status) {
    case 'open': return 'Aberto';
    case 'monitoring': return 'Em observação';
    case 'resolved': return 'Resolvido';
  }
}

export function formatReportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : date.toLocaleString('pt-BR');
}

function getComponentInfo(snapshot: SavedProject): Map<string, ComponentInfo> {
  const byNodeId = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const result = new Map<string, ComponentInfo>();

  for (const node of snapshot.nodes) {
    if (node.type !== 'motor' && node.type !== 'servo') continue;
    const data = node.data as Record<string, unknown>;
    const actuatorId = textValue(data.actuatorId);
    if (!actuatorId || result.has(actuatorId)) continue;

    const hubId = textValue(data.hubId);
    const hubNode = byNodeId.get(hubId);
    const hubData = hubNode?.data as Record<string, unknown> | undefined;
    const port = Number(data.port);
    const type = node.type;

    result.set(actuatorId, {
      actuatorId,
      componentId: node.id,
      componentName: textValue(data.name) || textValue(data.configName) || 'Componente sem nome',
      componentType: type,
      model: textValue(data.model),
      hubName: textValue(hubData?.name) || hubId || 'Hub não identificado',
      portLabel: Number.isFinite(port) ? (type === 'motor' ? 'M' : 'S') + port : 'Porta não informada',
    });
  }

  return result;
}

export function buildMaintenanceReportEntries(
  snapshot: SavedProject,
  filters: MaintenanceReportFilters
): MaintenanceReportEntry[] {
  const components = getComponentInfo(snapshot);
  const entries: MaintenanceReportEntry[] = [];
  const from = localDateBoundary(filters.from, false);
  const to = localDateBoundary(filters.to, true);

  for (const [historyKey, history] of Object.entries(snapshot.actuators ?? {})) {
    if (!history || !Array.isArray(history.maintenance)) continue;
    const actuatorId = textValue(history.actuatorId) || historyKey;
    const component = components.get(actuatorId);
    const records = history.maintenance as (MaintenanceRecord & { relatedIssueId?: string })[];
    const issueTitles = new Map(
      records.filter((record) => record.type === 'problem').map((record) => [record.id, record.title])
    );

    for (const record of records) {
      if (!record || typeof record.id !== 'string') continue;
      if (filters.kind === 'occurrences' && record.type !== 'problem') continue;
      if (filters.kind === 'maintenance' && record.type === 'problem') continue;
      if (filters.status !== 'all' && record.status !== filters.status) continue;
      if (filters.componentId && component?.componentId !== filters.componentId) continue;

      const createdAt = Date.parse(record.createdAt);
      if (from !== null && (!Number.isFinite(createdAt) || createdAt < from)) continue;
      if (to !== null && (!Number.isFinite(createdAt) || createdAt > to)) continue;

      entries.push({
        id: record.id,
        actuatorId,
        componentId: component?.componentId ?? '',
        componentName: component?.componentName ?? 'Componente não localizado no mapa',
        componentType: component?.componentType ?? 'unknown',
        model: component?.model ?? '',
        hubName: component?.hubName ?? 'Hub não identificado',
        portLabel: component?.portLabel ?? 'Porta não identificada',
        createdAt: record.createdAt,
        resolvedAt: record.resolvedAt,
        type: record.type,
        title: record.title,
        description: record.description,
        status: record.status,
        relatedIssueId: record.relatedIssueId,
        relatedIssueTitle: record.relatedIssueId ? issueTitles.get(record.relatedIssueId) : undefined,
      });
    }
  }

  return entries.sort((a, b) => {
    const aDate = Date.parse(a.createdAt);
    const bDate = Date.parse(b.createdAt);
    if (!Number.isFinite(aDate)) return 1;
    if (!Number.isFinite(bDate)) return -1;
    return bDate - aDate;
  });
}

export function summarizeMaintenanceReport(entries: MaintenanceReportEntry[]) {
  return {
    total: entries.length,
    occurrences: entries.filter((entry) => entry.type === 'problem').length,
    interventions: entries.filter((entry) => entry.type !== 'problem').length,
    open: entries.filter((entry) => entry.status === 'open').length,
    monitoring: entries.filter((entry) => entry.status === 'monitoring').length,
    resolved: entries.filter((entry) => entry.status === 'resolved').length,
    inspections: entries.filter((entry) => entry.type === 'inspection').length,
    repairs: entries.filter((entry) => entry.type === 'maintenance').length,
    replacements: entries.filter((entry) => entry.type === 'replacement').length,
  };
}
