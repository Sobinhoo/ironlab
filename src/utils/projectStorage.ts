import type {
  Node,
  Edge,
} from '@xyflow/react';

export const STORAGE_KEY =
  'ftc-electrical-lab-project';

export const SCHEMA_VERSION = 1;

export type MaintenanceType =
  | 'problem'
  | 'maintenance'
  | 'inspection'
  | 'replacement';

export type MaintenanceStatus =
  | 'open'
  | 'monitoring'
  | 'resolved';

export type MaintenanceRecord = {
  id: string;
  createdAt: string;
  type: MaintenanceType;
  title: string;
  description: string;
  status: MaintenanceStatus;
  resolvedAt?: string;
};

export type TelemetryRecord = {
  timestamp: string;
  encoderPosition?: number;
  velocity?: number;
  currentAmps?: number;
  power?: number;
};

export type EncoderData = {
  enabled: boolean;
  ticksPerRevolution?: number;
  currentPosition?: number;
  lastUpdated?: string;
};

export type ActuatorHistory = {
  actuatorId: string;
  encoder: EncoderData;
  telemetry: TelemetryRecord[];
  maintenance: MaintenanceRecord[];
};

export type SavedProject = {
  schemaVersion: number;

  robot: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };

  ftcConfigurationName:
    | string
    | null;

  nodes: Node[];
  edges: Edge[];

  actuators: Record<
    string,
    ActuatorHistory
  >;
};

function createId(prefix: string) {
  if (
    typeof crypto !==
      'undefined' &&
    'randomUUID' in crypto
  ) {
    return (
      prefix +
      '-' +
      crypto.randomUUID()
    );
  }

  return (
    prefix +
    '-' +
    Date.now().toString(36) +
    '-' +
    Math.random()
      .toString(36)
      .slice(2)
  );
}

export function createActuatorId() {
  return createId('actuator');
}

export function createRobotId() {
  return createId('robot');
}

export function createEmptyHistory(
  actuatorId: string
): ActuatorHistory {
  return {
    actuatorId: actuatorId,

    encoder: {
      enabled: false,
    },

    telemetry: [],

    maintenance: [],
  };
}

export function saveProject(
  project: SavedProject
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(project)
  );
}

export function loadProject():
  | SavedProject
  | null {
  const raw =
    localStorage.getItem(
      STORAGE_KEY
    );

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(raw);

    if (
      parsed.schemaVersion !==
      SCHEMA_VERSION
    ) {
      console.warn(
        'Versão de projeto incompatível:',
        parsed.schemaVersion
      );

      return null;
    }

    return parsed as SavedProject;
  } catch (error) {
    console.error(
      'Não foi possível carregar o projeto:',
      error
    );

    return null;
  }
}

export function deleteSavedProject() {
  localStorage.removeItem(
    STORAGE_KEY
  );
}