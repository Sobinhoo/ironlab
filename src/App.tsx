import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import './App.css';
import './workspace.css';
import WorkspaceTools from './components/WorkspaceTools';

import ControlHubNode from './components/ControlHubNode';

import ExpansionHubNode from './components/ExpansionHubNode';

import MotorNode from './components/MotorNode';

import ServoNode from './components/ServoNode';

import ActuatorPanel from './components/ActuatorPanel';

import {
  parseFTCLog,
  type FTCConfiguration,
  type ImportedHub,
} from './utils/ftcLogParser';

import {
  SCHEMA_VERSION,
  createActuatorId,
  createEmptyHistory,
  createRobotId,
  deleteSavedProject,
  loadProject,
  saveProject,
  type ActuatorHistory,
  type MaintenanceRecord,
  type MaintenanceStatus,
  type MaintenanceType,
} from './utils/projectStorage';

const nodeTypes = {
  controlHub: ControlHubNode,

  expansionHub: ExpansionHubNode,

  motor: MotorNode,

  servo: ServoNode,
};

type ComponentType = 'motor' | 'servo';

type InterventionType = Exclude<MaintenanceType, 'problem'>;

type NewComponent = {
  hubId: string;

  type: ComponentType;

  port: number;
};

function createInitialNodes(): Node[] {
  return [
    {
      id: 'control-hub',

      type: 'controlHub',

      position: { x: 500, y: 180 },

      data: {
        hubId: 'control-hub',

        name: 'Control Hub',
      },
    },
  ];
}

function createRecordId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return 'record-' + crypto.randomUUID();
  }

  return (
    'record-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2)
  );
}

import SessionGraph from './components/SessionGraph';
import DiagnosticsCenter from './components/DiagnosticsCenter';
import { evaluateMotorDiagnostics } from './utils/motorDiagnostics';
import { planLiveHardwareMapping } from './utils/liveHardwareMapping';
import {
  fetchHubTelemetry,
  probeHubHealth,
  type LiveMotor,
  type LiveServo,
} from './services/hubTelemetry';
import {
  SESSION_KEY,
  MAX_SESSIONS,
  MAX_SAMPLES,
  loadSessions,
  sessionMetrics,
  exportSessionCSV,
  type TestSession,
  type SessionSample,
} from './utils/testSessions';

function App() {
  // =====================================================

  // CARREGAMENTO DO PROJETO

  // =====================================================

  const savedProjectRef = useRef(loadProject());

  const savedProject = savedProjectRef.current;

  const [nodes, setNodes, onNodesChange] = useNodesState(
    savedProject?.nodes ?? createInitialNodes()
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    savedProject?.edges ?? []
  );

  const [robotId, setRobotId] = useState(
    savedProject?.robot.id ?? createRobotId()
  );

  const [robotName, setRobotName] = useState(
    savedProject?.robot.name ?? 'Robot 01'
  );

  const [robotCreatedAt, setRobotCreatedAt] = useState(
    savedProject?.robot.createdAt ?? new Date().toISOString()
  );

  const [actuatorHistory, setActuatorHistory] = useState<
    Record<string, ActuatorHistory>
  >(savedProject?.actuators ?? {});

  // =====================================================

  // INTERFACE

  // =====================================================

  const [newComponent, setNewComponent] = useState<NewComponent | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [name, setName] = useState('');

  const [configName, setConfigName] = useState('');

  const [ftcConfigurationName, setFtcConfigurationName] = useState<
    string | null
  >(savedProject?.ftcConfigurationName ?? null);

  const [importError, setImportError] = useState('');

  const [saveStatus, setSaveStatus] = useState(
    savedProject ? 'Projeto restaurado' : 'Novo projeto'
  );

  useEffect(() => { setProjectRevision(n => n + 1); }, [nodes, edges, robotName, actuatorHistory]);

  // TELEMETRIA VOLÁTIL: não entra no salvamento automático.

  const [liveServos, setLiveServos] = useState<LiveServo[]>([]);

  const [batteryVoltage, setBatteryVoltage] = useState<number | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(() => localStorage.getItem('ironlab-snap') === 'true');
  const [gridVisible, setGridVisible] = useState(() => localStorage.getItem('ironlab-grid') !== 'false');
  const [batteryWarning, setBatteryWarning] = useState(() => Number(localStorage.getItem('ironlab-warning') || '12.5'));
  const [batteryCritical, setBatteryCritical] = useState(() => Number(localStorage.getItem('ironlab-critical') || '11.5'));
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saveError, setSaveError] = useState('');

  const [hubPort, setHubPort] = useState(
    () => window.localStorage.getItem('ftc-electrical-lab-http-port') ?? '8765'
  );

  const [hubIp, setHubIp] = useState(
    () => window.localStorage.getItem('ftc-electrical-lab-ip') ?? '192.168.43.1'
  );

  const [connectionPanelOpen, setConnectionPanelOpen] = useState(false);

  const [connectionEnabled, setConnectionEnabled] = useState(false);

  const [liveStatus, setLiveStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'waiting' | 'stale' | 'error'
  >('idle');

  const [liveError, setLiveError] = useState('');

  const [liveMotors, setLiveMotors] = useState<LiveMotor[]>([]);

  const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null);

  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<TestSession[]>(loadSessions);
  const [sessionLabel, setSessionLabel] = useState('Teste de motores');
  const [activeSession, setActiveSession] = useState<TestSession | null>(null);
  const activeSessionRef = useRef<TestSession | null>(null);
  const lastSessionSampleRef = useRef(0);
  const [sessionStorageError, setSessionStorageError] = useState('');
  const [sessionCompareA, setSessionCompareA] = useState('');
  const [sessionCompareB, setSessionCompareB] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null
  );
  const [graphMotor, setGraphMotor] = useState<Record<string, string>>({});
  const [diagnosticCenterOpen, setDiagnosticCenterOpen] = useState(false);

  const [diagnosticSettings, setDiagnosticSettings] = useState({
    minPower: 0.5,
    maxRpm: 5,
    durationMs: 3000,
  });
  const [diagnostics, setDiagnostics] = useState<
    Record<string, { since: number; active: boolean; message: string }>
  >({});
  const diagnosticTimers = useRef<Record<string, number>>({});
  const diagnosticSettingsRef = useRef(diagnosticSettings);
  diagnosticSettingsRef.current = diagnosticSettings;

  const [liveHistory, setLiveHistory] = useState<
    Record<string, { time: number; ticks: number; rpm: number }[]>
  >({});

  function finishSession() {
    const running = activeSessionRef.current;
    if (!running) return;
    const finished = { ...running, endedAt: Date.now() };
    activeSessionRef.current = null;
    setActiveSession(null);
    setSessions((prev) => [finished, ...prev].slice(0, MAX_SESSIONS));
  }

  function beginSession() {
    if (liveStatus !== 'connected' || activeSessionRef.current) return;
    const now = Date.now();
    const session: TestSession = {
      id: `teste-${now.toString(36)}`,
      robotId,
      robotName,
      label: sessionLabel.trim() || 'Teste de motores',
      startedAt: now,
      endedAt: null,
      samples: [],
    };
    lastSessionSampleRef.current = 0;
    activeSessionRef.current = session;
    setActiveSession(session);
    setSessionStorageError('');
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
      setSessionStorageError('');
    } catch {
      setSessionStorageError(
        'Armazenamento do navegador cheio ou bloqueado. Exporte os testes em CSV antes de fechar a página.'
      );
    }
  }, [sessions]);

  useEffect(() => {
    window.localStorage.setItem('ftc-electrical-lab-http-port', hubPort);

    window.localStorage.setItem('ftc-electrical-lab-ip', hubIp);

    if (!connectionEnabled) {
      if (activeSessionRef.current) {
        const finished = { ...activeSessionRef.current, endedAt: Date.now() };
        activeSessionRef.current = null;
        setActiveSession(null);
        setSessions((prev) => [finished, ...prev].slice(0, MAX_SESSIONS));
      }

      setLiveStatus('idle');

      setLiveError('');

      setLiveMotors([]);

      setLiveServos([]);

      setBatteryVoltage(null);

      setLiveHistory({});
      setDiagnostics({});
      diagnosticTimers.current = {};

      setLiveUpdatedAt(null);

      return;
    }

    const port = Number(hubPort);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setLiveStatus('idle');

      setLiveMotors([]);

      setLiveServos([]);

      setBatteryVoltage(null);

      setLiveHistory({});

      return;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let lastTimestamp: number | null = null;
    let lastTimestampSeenAt = 0;
    let activeController: AbortController | null = null;
    let consecutiveFailures = 0;
    let pollingDelay = 1000; // Conservador até conhecer o perfil do Bridge.

    setLiveStatus('connecting');
    setLiveError('');
    setLiveMotors([]);
    setLiveServos([]);
    setBatteryVoltage(null);
    setLiveHistory({});
    setDiagnostics({});
    diagnosticTimers.current = {};
    setLiveUpdatedAt(null);

    async function poll() {
      if (cancelled) return;
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 4500);
      try {
        const { motors, servos, voltage, timestamp, profile, status } =
          await fetchHubTelemetry(hubIp, port, controller.signal);
        if (cancelled) return;
        consecutiveFailures = 0;
        pollingDelay = profile === 'lab' ? 250 : 1000;
        const now = Date.now();
        if (status === 'stale') {
          lastTimestamp = null;
          lastTimestampSeenAt = 0;
          setLiveStatus('stale');
          setLiveError('Control Hub acessível, mas a última telemetria está desatualizada. Verifique o OpMode.');
          setLiveMotors([]);
          setLiveServos([]);
          setBatteryVoltage(null);
          setLiveUpdatedAt(null);
          setDiagnostics({});
          diagnosticTimers.current = {};
          return;
        }
        // O servidor pode continuar online depois de o OpMode parar.
        // Não confundir HTTP disponível com telemetria ativa.
        if (status === 'waiting' || timestamp === null) {
          lastTimestamp = null;
          lastTimestampSeenAt = 0;
          setLiveStatus('waiting');
          setLiveError(status === 'waiting'
            ? 'Control Hub acessível. Aguardando o OpMode iniciar a coleta.'
            : 'Servidor acessível, mas não enviou timestamp válido. Aguardando novas leituras.');
          setLiveMotors([]);
          setLiveServos([]);
          setBatteryVoltage(null);
          setLiveUpdatedAt(null);
          setDiagnostics({});
          diagnosticTimers.current = {};
          return;
        }
        // O Bridge pode devolver o mesmo snapshot várias vezes. Não o registrar novamente.
        if (timestamp !== null && timestamp === lastTimestamp) {
          if (now - lastTimestampSeenAt > Math.max(3500, pollingDelay * 4)) {
            setLiveStatus('stale');
            setLiveError('Servidor acessível, mas o timestamp não mudou. Verifique se o OpMode está ativo.');
            setLiveMotors([]);
            setLiveServos([]);
            setBatteryVoltage(null);
            setDiagnostics({});
            diagnosticTimers.current = {};
            setLiveUpdatedAt(null);
            return;
          }
          setLiveStatus('connected');
          setLiveError('');
          return;
        }
        lastTimestamp = timestamp;
        lastTimestampSeenAt = now;
        setLiveServos(servos);
        setBatteryVoltage(
          typeof voltage === 'number' && Number.isFinite(voltage) && voltage > 0
            ? voltage
            : null
        );
        const { alerts: nextDiagnostics, timers: nextTimers } =
          evaluateMotorDiagnostics(
            motors,
            diagnosticSettingsRef.current,
            diagnosticTimers.current,
            now
          );
        diagnosticTimers.current = nextTimers;
        setDiagnostics(nextDiagnostics);
        const running = activeSessionRef.current;
        if (running && now - lastSessionSampleRef.current >= 1000) {
          lastSessionSampleRef.current = now;
          const sample: SessionSample = {
            time: now,
            voltage:
              typeof voltage === 'number' &&
              Number.isFinite(voltage) &&
              voltage > 0
                ? voltage
                : null,
            motors: motors.map((m) => ({
              name: m.name,
              port: m.port,
              rpm: m.rpm,
              ticks: m.ticks,
              power:
                typeof m.power === 'number' && Number.isFinite(m.power)
                  ? m.power
                  : null,
            })),
            alerts: Object.entries(nextDiagnostics)
              .filter(([, d]) => d.active)
              .map(([name]) => name),
          };
          const updated = {
            ...running,
            samples: [...running.samples, sample].slice(-MAX_SAMPLES),
          };
          activeSessionRef.current = updated;
          setActiveSession(updated);
        }
        setLiveMotors(motors);
        setLiveUpdatedAt(now);
        setLiveStatus('connected');
        setLiveError('');
        setLiveHistory((previous) => {
          const next = { ...previous };
          for (const motor of motors) {
            const key = motor.name.trim().toLowerCase();
            next[key] = [
              ...(next[key] ?? []),
              { time: now, ticks: motor.ticks, rpm: motor.rpm },
            ].slice(-80);
          }
          return next;
        });
      } catch (error) {
        if (cancelled) return;
        // Nunca mostrar dados antigos como se o Control Hub ainda estivesse conectado.
        lastTimestamp = null;
        lastTimestampSeenAt = 0;
        consecutiveFailures += 1;
        pollingDelay = Math.min(5000, 1000 * Math.pow(2, Math.min(consecutiveFailures - 1, 3)));
        diagnosticTimers.current = {};
        setDiagnostics({});
        setLiveMotors([]);
        setLiveServos([]);
        setBatteryVoltage(null);
        setLiveHistory({});
        setLiveUpdatedAt(null);
        if (activeSessionRef.current) {
          const finished = { ...activeSessionRef.current, endedAt: Date.now() };
          activeSessionRef.current = null;
          setActiveSession(null);
          setSessions((prev) => [finished, ...prev].slice(0, MAX_SESSIONS));
        }
        const message = error instanceof Error ? error.message : 'Falha de conexão';
        const awaitingOpMode = message.includes('ainda não enviou leituras válidas');
        setLiveStatus(awaitingOpMode ? 'waiting' : 'reconnecting');
        setLiveError(
          awaitingOpMode
            ? 'Servidor acessível. Aguardando iniciar o OpMode de telemetria.'
            : error instanceof DOMException && error.name === 'AbortError'
              ? 'Tempo limite da requisição. Tentando novamente automaticamente.'
              : `${message}. Nova tentativa automática em ${pollingDelay / 1000}s.`
        );
      } finally {
        window.clearTimeout(timeout);
        if (activeController === controller) activeController = null;
        if (!cancelled)
          retryTimer = window.setTimeout(() => {
            void poll();
          }, pollingDelay);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      activeController?.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [hubPort, hubIp, connectionEnabled]);

  function connectToHub() {
    const port = Number(hubPort);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setLiveError('Informe uma porta HTTP válida.');

      setLiveStatus('error');

      return;
    }

    const parts = hubIp.trim().split('.');

    if (
      parts.length !== 4 ||
      parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
    ) {
      setLiveError('Informe um endereço IPv4 válido.');

      setLiveStatus('error');

      return;
    }

    setConnectionEnabled(true);
  }

  function disconnectFromHub() {
    setConnectionEnabled(false);
  }

  // A configuração visual é criada apenas uma vez por porta; o polling só atualiza telemetria.
  // O usuário pode excluir um nó automático sem que ele seja recriado durante esta sessão.
  const excludedAutoNodes = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (liveStatus !== 'connected') return;
    const plan = planLiveHardwareMapping(
      nodes, liveMotors, liveServos, createActuatorId, excludedAutoNodes.current
    );
    if (plan.nodes.length === 0) return;
    setNodes(current => [...current, ...plan.nodes.filter(node =>
      !current.some(existing => existing.id === node.id ||
        (existing.type === node.type && existing.data.hubId === node.data.hubId &&
          Number(existing.data.port) === Number(node.data.port))))]);
    setEdges(current => [...current, ...plan.edges.filter(edge =>
      !current.some(existing => existing.id === edge.id))]);
    setActuatorHistory(current => {
      const next = { ...current };
      for (const node of plan.nodes) {
        const id = String(node.data.actuatorId);
        if (!next[id]) next[id] = createEmptyHistory(id);
      }
      return next;
    });
  }, [liveStatus, liveMotors, liveServos, nodes, setNodes, setEdges]);

  // =====================================================

  // SALVAMENTO AUTOMÁTICO

  // =====================================================

  const firstSave = useRef(true);

  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;

      return;
    }

    const timeout = window.setTimeout(() => {
      try {
      saveProject({
        schemaVersion: SCHEMA_VERSION,

        robot: {
          id: robotId,

          name: robotName,

          createdAt: robotCreatedAt,

          updatedAt: new Date().toISOString(),
        },

        ftcConfigurationName,

        nodes,

        edges,

        actuators: actuatorHistory,
      });

      setSaveStatus('Salvo localmente');
      setSavedRevision(projectRevision);
      setSaveError('');
      } catch (error) { setSaveError(error instanceof Error ? error.message : 'Falha ao salvar'); setSaveStatus('Erro no salvamento'); }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    nodes,

    edges,

    robotId,

    robotName,

    robotCreatedAt,

    actuatorHistory,

    ftcConfigurationName,
  ]);

  // =====================================================

  // CRIAÇÃO MANUAL

  // =====================================================

  const openComponentEditor = useCallback(
    (hubId: string, type: ComponentType, port: number) => {
      setNewComponent({ hubId, type, port });

      setSelectedNodeId(null);

      setName('');

      setConfigName('');
    },

    []
  );

  // =====================================================

  // IDENTIDADE DO ATUADOR

  // =====================================================

  function findExistingActuatorId(
    hubId: string,

    type: ComponentType,

    componentConfigName: string,

    port: number
  ): string {
    const exact = nodes.find(
      (node) =>
        node.type === type &&
        node.data.hubId === hubId &&
        String(node.data.configName ?? '') === componentConfigName
    );

    if (exact && typeof exact.data.actuatorId === 'string') {
      return exact.data.actuatorId;
    }

    const samePort = nodes.find(
      (node) =>
        node.type === type &&
        node.data.hubId === hubId &&
        Number(node.data.port) === port
    );

    if (samePort && typeof samePort.data.actuatorId === 'string') {
      return samePort.data.actuatorId;
    }

    return createActuatorId();
  }

  // =====================================================

  // IMPORTAÇÃO DE HUBS

  // =====================================================

  function createImportedHubNode(hub: ImportedHub, index: number): Node {
    const isControlHub = hub.name.toLowerCase().includes('control hub');

    const hubId = isControlHub
      ? 'control-hub'
      : 'expansion-hub-' + hub.moduleAddress;

    const oldHub = nodes.find((node) => node.id === hubId);

    return {
      id: hubId,

      type: isControlHub ? 'controlHub' : 'expansionHub',

      position: oldHub?.position ?? {
        x: 500 + index * 750,

        y: 180,
      },

      data: {
        ...oldHub?.data,

        hubId,

        name: hub.name,

        moduleAddress: hub.moduleAddress,

        source: 'ftc-import',
      },
    };
  }

  // =====================================================

  // CONSTRUIR MAPA FTC

  // =====================================================

  function buildImportedMap(configuration: FTCConfiguration) {
    const importedNodes: Node[] = [];

    const importedEdges: Edge[] = [];

    const nextHistory = { ...actuatorHistory };

    configuration.hubs.forEach((hub, hubIndex) => {
      const hubNode = createImportedHubNode(hub, hubIndex);

      importedNodes.push(hubNode);

      const hubId = hubNode.id;

      hub.components.forEach((component) => {
        const actuatorId = findExistingActuatorId(
          hubId,

          component.type,

          component.name,

          component.port
        );

        if (!nextHistory[actuatorId]) {
          nextHistory[actuatorId] = createEmptyHistory(actuatorId);
        }

        const componentId = hubId + '-' + component.type + '-' + component.port;

        const oldNode = nodes.find(
          (node) => node.data.actuatorId === actuatorId
        );

        let position = oldNode?.position;

        if (!position) {
          position =
            component.type === 'motor'
              ? {
                  x: hubNode.position.x - 300,

                  y: hubNode.position.y + 20 + component.port * 100,
                }
              : {
                  x: hubNode.position.x + 50 + component.port * 45,

                  y: hubNode.position.y + 400,
                };
        }

        const componentNode: Node = {
          id: componentId,

          type: component.type,

          position,

          data: {
            actuatorId,

            hubId,

            source: 'ftc-import',

            name: component.name,

            configName: component.name,

            port: component.port,

            model: component.model,

            moduleAddress: component.moduleAddress,
          },
        };

        const edge: Edge = {
          id: 'cable-' + componentId,

          source: hubId,

          sourceHandle: component.type + '-' + component.port,

          target: componentId,

          type: 'smoothstep',
        };

        importedNodes.push(componentNode);

        importedEdges.push(edge);
      });
    });

    setNodes(importedNodes);

    setEdges(importedEdges);

    setActuatorHistory(nextHistory);

    setSelectedNodeId(null);

    setNewComponent(null);

    setName('');

    setConfigName('');
  }

  async function importFTCLog(file: File) {
    try {
      const text = await file.text();

      const configuration = parseFTCLog(text);

      console.log('FTC CONFIGURATION:', configuration);

      console.table(
        configuration.hubs.flatMap((hub) =>
          hub.components.map((component) => ({
            hub: hub.name,

            moduleAddress: hub.moduleAddress,

            type: component.type,

            name: component.name,

            port: component.port,

            model: component.model,
          }))
        )
      );

      setFtcConfigurationName(configuration.name);

      setImportError('');

      buildImportedMap(configuration);

      setSaveStatus('Configuração FTC importada');
    } catch (error) {
      console.error('Erro ao importar FTC:', error);

      setImportError(
        error instanceof Error
          ? error.message
          : 'Erro ao importar configuração.'
      );
    }
  }

  // =====================================================

  // EXPANSION HUB MANUAL

  // =====================================================

  function addExpansionHub() {
    const expansionHubs = nodes.filter((node) => node.type === 'expansionHub');

    let number = 1;

    while (nodes.some((node) => node.id === 'expansion-hub-' + number)) {
      number++;
    }

    const hubId = 'expansion-hub-' + number;

    const newHub: Node = {
      id: hubId,

      type: 'expansionHub',

      position: {
        x: 1050,

        y: 180 + expansionHubs.length * 420,
      },

      data: {
        hubId,

        name: 'Expansion Hub ' + number,

        source: 'manual',
      },
    };

    setNodes((current) => [...current, newHub]);
  }

  // =====================================================

  // CRIAÇÃO MANUAL DE MOTOR / SERVO

  // =====================================================

  function createComponent() {
    if (!newComponent || !name.trim()) return;

    const { hubId, type, port } = newComponent;

    const componentId = hubId + '-' + type + '-' + port;

    if (nodes.some((node) => node.id === componentId)) {
      return;
    }

    const hubNode = nodes.find((node) => node.id === hubId);

    const hubX = hubNode?.position.x ?? 500;

    const hubY = hubNode?.position.y ?? 180;

    const position =
      type === 'motor'
        ? {
            x: hubX - 300,

            y: hubY + 20 + port * 100,
          }
        : {
            x: hubX + 50 + port * 45,

            y: hubY + 400,
          };

    const actuatorId = createActuatorId();

    const newNode: Node = {
      id: componentId,

      type,

      position,

      data: {
        actuatorId,

        hubId,

        source: 'manual',

        name: name.trim(),

        configName: configName.trim(),

        port,
      },
    };

    const newEdge: Edge = {
      id: 'cable-' + componentId,

      source: hubId,

      sourceHandle: type + '-' + port,

      target: componentId,

      type: 'smoothstep',
    };

    setActuatorHistory((current) => ({
      ...current,

      [actuatorId]: createEmptyHistory(actuatorId),
    }));

    setNodes((current) => [...current, newNode]);

    setEdges((current) => [...current, newEdge]);

    setNewComponent(null);

    setName('');

    setConfigName('');
  }

  // =====================================================

  // SELEÇÃO

  // =====================================================

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type !== 'motor' && node.type !== 'servo') {
      return;
    }

    setSelectedNodeId(node.id);

    setNewComponent(null);

    setName(String(node.data.name ?? ''));

    setConfigName(String(node.data.configName ?? ''));
  }, []);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  function getSelectedActuatorId(): string | null {
    const node = nodes.find((item) => item.id === selectedNodeId);

    return typeof node?.data.actuatorId === 'string'
      ? node.data.actuatorId
      : null;
  }

  // =====================================================

  // HISTÓRICO: FUNÇÕES COMPARTILHADAS

  // =====================================================

  function addRecord(
    type: MaintenanceType,

    title: string,

    description: string,

    relatedIssueId?: string
  ) {
    const actuatorId = getSelectedActuatorId();

    if (!actuatorId || !title.trim()) return;

    const record: MaintenanceRecord & {
      relatedIssueId?: string;
    } = {
      id: createRecordId(),

      createdAt: new Date().toISOString(),

      type,

      title: title.trim(),

      description: description.trim(),

      status: 'open',

      ...(relatedIssueId ? { relatedIssueId } : {}),
    };

    setActuatorHistory((current) => {
      const history = current[actuatorId] ?? createEmptyHistory(actuatorId);

      return {
        ...current,

        [actuatorId]: {
          ...history,

          maintenance: [...history.maintenance, record],
        },
      };
    });
  }

  function updateRecord(
    recordId: string,

    status: MaintenanceStatus,

    kind: 'issue' | 'maintenance'
  ) {
    const actuatorId = getSelectedActuatorId();

    if (!actuatorId) return;

    setActuatorHistory((current) => {
      const history = current[actuatorId];

      if (!history) return current;

      return {
        ...current,

        [actuatorId]: {
          ...history,

          maintenance: history.maintenance.map((record) => {
            const isIssue = record.type === 'problem';

            if (record.id !== recordId || (kind === 'issue') !== isIssue) {
              return record;
            }

            return {
              ...record,

              status,

              resolvedAt:
                status === 'resolved'
                  ? record.resolvedAt ?? new Date().toISOString()
                  : undefined,
            };
          }),
        },
      };
    });
  }

  function deleteRecord(recordId: string, kind: 'issue' | 'maintenance') {
    const actuatorId = getSelectedActuatorId();

    if (!actuatorId) return;

    setActuatorHistory((current) => {
      const history = current[actuatorId];

      if (!history) return current;

      return {
        ...current,

        [actuatorId]: {
          ...history,

          maintenance: history.maintenance.filter((record) => {
            const isIssue = record.type === 'problem';

            const matches =
              record.id === recordId && (kind === 'issue') === isIssue;

            return !matches;
          }),
        },
      };
    });
  }

  // =====================================================

  // OCORRÊNCIAS

  // =====================================================

  function addIssue(title: string, description: string) {
    addRecord('problem', title, description);
  }

  function updateIssue(recordId: string, status: MaintenanceStatus) {
    updateRecord(recordId, status, 'issue');
  }

  function deleteIssue(recordId: string) {
    deleteRecord(recordId, 'issue');
  }

  // =====================================================

  // MANUTENÇÕES

  // =====================================================

  function addMaintenance(
    type: InterventionType,

    title: string,

    description: string,

    relatedIssueId?: string
  ) {
    addRecord(type, title, description, relatedIssueId);
  }

  function updateMaintenance(recordId: string, status: MaintenanceStatus) {
    updateRecord(recordId, status, 'maintenance');
  }

  function deleteMaintenance(recordId: string) {
    deleteRecord(recordId, 'maintenance');
  }

  // =====================================================

  // EDITAR / EXCLUIR ATUADOR

  // =====================================================

  function saveSelectedComponent(
    updatedName: string,

    updatedConfigName: string
  ) {
    if (!selectedNodeId) return;

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,

              data: {
                ...node.data,

                name: updatedName.trim(),

                configName: updatedConfigName.trim(),
              },
            }
          : node
      )
    );

    setSelectedNodeId(null);

    setName('');

    setConfigName('');
  }

  function deleteComponent() {
    if (!selectedNodeId) return;

    // Preserva o histórico por actuatorId.
    const deleting = nodes.find(node => node.id === selectedNodeId);
    if (deleting?.data.source === 'http-telemetry') excludedAutoNodes.current.add(selectedNodeId);

    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));

    setEdges((current) =>
      current.filter((edge) => edge.target !== selectedNodeId)
    );

    setSelectedNodeId(null);

    setName('');

    setConfigName('');
  }

  // =====================================================

  // NOVO ROBÔ

  // =====================================================

  function newRobot() {
    const confirmed = window.confirm(
      'Criar um novo robô? O projeto atual deixará de ser o projeto ativo.'
    );

    if (!confirmed) return;

    deleteSavedProject();
    excludedAutoNodes.current.clear();

    const now = new Date().toISOString();

    setRobotId(createRobotId());

    setRobotName('Robot 01');

    setRobotCreatedAt(now);

    setNodes(createInitialNodes());

    setEdges([]);

    setActuatorHistory({});

    setFtcConfigurationName(null);

    setImportError('');

    setSelectedNodeId(null);

    setNewComponent(null);

    setName('');

    setConfigName('');

    setSaveStatus('Novo projeto');
  }

  // =====================================================

  // HUB

  // =====================================================

  function getHubName(hubId: unknown): string {
    const hub = nodes.find((node) => node.id === hubId);

    return hub ? String(hub.data.name ?? hub.id) : String(hubId ?? '');
  }

  // =====================================================

  // REACT FLOW + INDICADORES DE PENDÊNCIAS

  // =====================================================

  const flowNodes: Node[] = nodes.map((node) => {
    const isActuator = node.type === 'motor' || node.type === 'servo';

    if (isActuator) {
      const actuatorId =
        typeof node.data.actuatorId === 'string' ? node.data.actuatorId : null;

      const records = actuatorId
        ? actuatorHistory[actuatorId]?.maintenance ?? []
        : [];

      const pendingIssues = records.filter(
        (record) => record.type === 'problem' && record.status !== 'resolved'
      ).length;

      const pendingMaintenance = records.filter(
        (record) => record.type !== 'problem' && record.status !== 'resolved'
      ).length;

      // Indicador visual calculado apenas a partir da telemetria atual.

      // Nunca é gravado no projeto.

      const nomeFTC = String(node.data.configName ?? '')
        .trim()

        .toLowerCase();

      const transmitindo =
        (node.type === 'motor' || node.type === 'servo') &&
        liveStatus === 'connected' &&
        nomeFTC.length > 0 &&
        (node.type === 'motor' ? liveMotors : liveServos).some(
          (item) => item.name.trim().toLowerCase() === nomeFTC
        );

      const semLeitura =
        (node.type === 'motor' || node.type === 'servo') &&
        liveStatus === 'connected' &&
        !transmitindo;

      return {
        ...node,

        // React Flow aplica a classe ao contêiner do nó.

        className: [
          node.className ?? '',

          node.type === 'motor' || node.type === 'servo'
            ? 'electrical-motor-node'
            : '',

          transmitindo ? 'electrical-live' : '',

          semLeitura ? 'electrical-missing' : '',
        ]

          .filter(Boolean)

          .join(' '),

        data: {
          ...node.data,

          pendingIssues,

          pendingMaintenance,

          telemetryStatus: transmitindo
            ? 'live'
            : semLeitura
            ? 'missing'
            : 'offline',
        },
      };
    }

    const isHub = node.type === 'controlHub' || node.type === 'expansionHub';

    if (!isHub) return node;

    const hubId = node.id;

    const occupiedMotors = nodes

      .filter(
        (component) =>
          component.type === 'motor' && component.data.hubId === hubId
      )

      .map((component) => Number(component.data.port));

    const occupiedServos = nodes

      .filter(
        (component) =>
          component.type === 'servo' && component.data.hubId === hubId
      )

      .map((component) => Number(component.data.port));

    return {
      ...node,

      data: {
        ...node.data,

        hubId,

        occupiedMotors,

        occupiedServos,

        onAddComponent: (type: ComponentType, port: number) =>
          openComponentEditor(hubId, type, port),
      },
    };
  });

  // =====================================================

  // INTERFACE

  // =====================================================

  useEffect(() => {
    if (liveStatus !== 'connected') { setPingMs(null); return; }
    let cancelled = false;
    const measure = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      const started = performance.now();
      try {
        const health = await probeHubHealth(hubIp, Number(hubPort), controller.signal);
        if (!cancelled) setPingMs(health === 'running' || health === 'legacy' ? Math.round(performance.now() - started) : null);
      } catch { if (!cancelled) setPingMs(null); }
      finally { clearTimeout(timeout); }
    };
    void measure();
    const interval = window.setInterval(() => void measure(), 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [liveStatus, hubIp, hubPort]);

  function currentSnapshot() {
    return {
      schemaVersion: SCHEMA_VERSION,
      robot: { id: robotId, name: robotName, createdAt: robotCreatedAt, updatedAt: new Date().toISOString() },
      ftcConfigurationName, nodes, edges, actuators: actuatorHistory,
    };
  }
  function openSnapshot(snapshot: ReturnType<typeof currentSnapshot>) {
    if (snapshot.schemaVersion !== SCHEMA_VERSION || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
      throw new Error('Projeto incompatível.');
    }
    setRobotId(snapshot.robot.id);
    setRobotName(snapshot.robot.name);
    setRobotCreatedAt(snapshot.robot.createdAt);
    setFtcConfigurationName(snapshot.ftcConfigurationName);
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setActuatorHistory(snapshot.actuators);
    setSelectedNodeId(null);
    setSaveStatus('Projeto carregado');
  }

  return (
    <div className="flow-app">
      <header className="topbar iron-toolbar-v029">
        <div className="iron-header-brand">
          <img src="/branding/ironlab-logo.png" alt="IRONLab — MCI Lab" className="iron-header-logo" />
          <span className="version">VERSÃO 0.30.0</span>
        </div>
        <div className="iron-toolbar-content">
          <div className="iron-toolbar-upper">
          <div className="toolbar-group toolbar-status" aria-label="Estado do robô">
          <button
            type="button"
            className="add-hub-button"
            onClick={() => setConnectionPanelOpen((open) => !open)}
          >
            <span
              style={{
                display: 'inline-block',

                width: 9,

                height: 9,

                borderRadius: '50%',

                marginRight: 8,

                background:
                  liveStatus === 'connected'
                    ? '#22c55e'
                    : liveStatus === 'connecting'
                    ? '#eab308'
                    : '#94a3b8',
              }}
            />
            CONECTIVIDADE
          </button>

          <span
            title="Tensão medida pelo sensor do Hub; não é porcentagem de carga"
            style={{
              fontWeight: 700,

              fontSize: 13,

              padding: '6px 10px',

              borderRadius: 8,

              background: '#14231d',

              color:
                liveStatus === 'connected' && batteryVoltage !== null
                  ? '#86efac'
                  : '#94a3b8',
            }}
          >
            BATERIA:{' '}
            {liveStatus === 'connected' && batteryVoltage !== null
              ? `${batteryVoltage.toFixed(2)} V`
              : '— V'}
          </span>

          <span className="save-indicator">● {saveStatus}</span>

          </div>
          </div>
          <div className="iron-toolbar-lower">
          <div className="toolbar-group toolbar-navigation" aria-label="Áreas de trabalho">
          <button
            type="button"
            className="add-hub-button"
            onClick={() => setSessionsOpen(true)}
          >
            SESSÕES DE TESTE
            {activeSession
              ? ` • GRAVANDO (${activeSession.samples.length})`
              : ''}
          </button>
          <button
            type="button"
            className="add-hub-button"
            onClick={() => setDiagnosticCenterOpen(true)}
          >
            CENTRAL DE DIAGNÓSTICOS
            {liveStatus === 'connected' &&
            Object.values(diagnostics).some((d) => d.active)
              ? ' ⚠'
              : ''}
          </button>

          </div>
          <div className="toolbar-group toolbar-project" aria-label="Gerenciar projeto">
          <label className="import-button">
            IMPORTAR FTC
            <input
              type="file"
              accept=".txt,.log"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  importFTCLog(file);
                }

                event.target.value = '';
              }}
            />
          </label>

          <button className="add-hub-button" onClick={addExpansionHub}>
            + HUB
          </button>

          <button className="new-robot-button" onClick={newRobot}>
            NOVO ROBÔ
          </button>

          <input
            className="robot-name-input"
            aria-label="Nome do robô"
            title="Nome do robô"
            value={robotName}
            onChange={(event) => setRobotName(event.target.value)}
          />
          </div>
          </div>
        </div>
      </header>
      <WorkspaceTools
        robotName={robotName}
        saveStatus={saveError || (projectRevision > savedRevision ? 'Alterações locais' : saveStatus)}
        snapshot={currentSnapshot()}
        onOpenProject={openSnapshot}
        onRename={setRobotName}
        snapToGrid={snapToGrid}
        onSnapChange={(value) => {setSnapToGrid(value);localStorage.setItem('ironlab-snap', String(value));}}
        gridVisible={gridVisible}
        onGridChange={(value) => {setGridVisible(value);localStorage.setItem('ironlab-grid', String(value));}}
        hubIp={hubIp} onHubIpChange={setHubIp}
        hubPort={hubPort} onHubPortChange={setHubPort}
        pingMs={pingMs} connected={liveStatus === 'connected'}
        voltage={batteryVoltage}
        warning={batteryWarning} critical={batteryCritical}
        onThresholdsChange={(warning, critical) => {setBatteryWarning(warning);setBatteryCritical(critical);localStorage.setItem('ironlab-warning', String(warning));localStorage.setItem('ironlab-critical', String(critical));}}
        onSave={() => {try {saveProject(currentSnapshot());setSavedRevision(projectRevision);setSaveStatus('Salvo localmente');setSaveError('');}catch(e){setSaveError(String(e));}}}
      />
      {connectionPanelOpen && (
        <section
          aria-label="Conectividade do robô"
          style={{
            position: 'absolute',

            top: 75,

            right: 20,

            zIndex: 1000,

            width: 330,

            maxWidth: 'calc(100vw - 40px)',

            boxSizing: 'border-box',

            padding: 20,

            background: '#17231e',

            color: '#f1f5f9',

            border: '1px solid #33483b',

            borderRadius: 12,

            boxShadow: '0 12px 32px rgba(0,0,0,.35)',
          }}
        >
          <div
            style={{
              display: 'flex',

              justifyContent: 'space-between',

              alignItems: 'center',

              marginBottom: 16,
            }}
          >
            <strong>Conectividade do robô</strong>

            <button
              type="button"
              aria-label="Fechar conectividade"
              onClick={() => setConnectionPanelOpen(false)}
              style={{
                background: 'transparent',

                border: 0,

                color: 'inherit',

                cursor: 'pointer',

                fontSize: 20,
              }}
            >
              ×
            </button>
          </div>

          <label
            htmlFor="hub-ip"
            style={{ display: 'block', marginBottom: 6, fontSize: 12 }}
          >
            Endereço IP do Control Hub
          </label>

          <input
            id="hub-ip"
            value={hubIp}
            disabled={connectionEnabled}
            onChange={(event) => setHubIp(event.target.value)}
            placeholder="192.168.43.1"
            style={{
              width: '100%',

              boxSizing: 'border-box',

              marginBottom: 14,

              padding: 10,

              borderRadius: 6,

              border: '1px solid #475569',

              background: '#0f1b16',

              color: 'white',
            }}
          />

          <label
            htmlFor="hub-http-port"
            style={{ display: 'block', marginBottom: 6, fontSize: 12 }}
          >
            Porta HTTP
          </label>

          <input
            id="hub-http-port"
            type="number"
            min={1}
            max={65535}
            value={hubPort}
            disabled={connectionEnabled}
            onChange={(event) => setHubPort(event.target.value)}
            placeholder="Porta exibida na Driver Station"
            style={{
              width: '100%',

              boxSizing: 'border-box',

              marginBottom: 14,

              padding: 10,

              borderRadius: 6,

              border: '1px solid #475569',

              background: '#0f1b16',

              color: 'white',
            }}
          />

          <div style={{ marginBottom: 14, fontSize: 13 }}>
            <strong>Estado: </strong>

            {liveStatus === 'connected'
              ? 'Conectado'
              : liveStatus === 'connecting'
              ? 'Conectando...'
              : liveStatus === 'reconnecting'
              ? 'Reconectando automaticamente...'
              : liveStatus === 'waiting'
              ? 'Aguardando OpMode'
              : liveStatus === 'stale'
              ? 'Telemetria desatualizada'
              : liveStatus === 'error'
              ? 'Erro de conexão'
              : 'Desconectado'}
          </div>

          {['error', 'reconnecting', 'waiting', 'stale'].includes(liveStatus) && (
            <p
              style={{
                color: '#fca5a5',

                fontSize: 12,

                overflowWrap: 'anywhere',
              }}
            >
              {liveError}
            </p>
          )}

          <button
            type="button"
            onClick={connectionEnabled ? disconnectFromHub : connectToHub}
            style={{
              width: '100%',

              padding: 11,

              border: 0,

              borderRadius: 7,

              cursor: 'pointer',

              fontWeight: 700,

              background: connectionEnabled ? '#7f1d1d' : '#22c55e',

              color: connectionEnabled ? '#fff' : '#052e16',
            }}
          >
            {connectionEnabled ? 'DESCONECTAR' : 'CONECTAR'}
          </button>

          {liveStatus === 'connected' && (
            <p
              style={{
                marginTop: 12,

                marginBottom: 0,

                fontSize: 12,

                color: '#94a3b8',
              }}
            >
              {liveMotors.length} motor(es) e {liveServos.length} servo(s)
              recebendo telemetria
            </p>
          )}
        </section>
      )}

      <div className="flow-workspace">
        {/* Indicadores de telemetria sobre motores e servos. */}

        <style>{`

          .react-flow__node.electrical-motor-node {

            overflow: visible;

          }

          .react-flow__node.electrical-motor-node::after {

            content: 'SEM CONEXÃO';

            position: absolute;

            top: 7px;

            left: auto;
            right: 10px;

            transform: none;

            z-index: 10;

            pointer-events: none;

            white-space: nowrap;

            border-radius: 999px;

            padding: 2px 6px;

            font: 700 8px/1.3 system-ui, sans-serif;

            letter-spacing: .04em;

            color: #b3c5b8;

            background: #263b30;

            box-shadow: 0 2px 8px rgba(0,0,0,.2);

          }

          .react-flow__node.electrical-motor-node.electrical-live::after {

            content: '● AO VIVO';

            color: #052e16;

            background: #4ade80;

          }

          .react-flow__node.electrical-motor-node.electrical-missing::after {

            content: '● SEM LEITURA';

            color: #450a0a;

            background: #fca5a5;

          }

        `}</style>

        {sessionsOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sessões de teste"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(0,0,0,.76)',
              display: 'grid',
              placeItems: 'center',
              padding: 18,
            }}
          >
            <div
              style={{
                background: '#102019',
                color: '#e2e8f0',
                border: '1px solid #416552',
                borderRadius: 14,
                width: 'min(1050px, 96vw)',
                maxHeight: '88vh',
                overflowY: 'auto',
                padding: 22,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>Sessões de teste</h2>
                  <small>Monitoramento e registro de sessões</small>
                </div>
                <button type="button" onClick={() => setSessionsOpen(false)}>
                  FECHAR ×
                </button>
              </div>
              <p style={{ color: '#a7c3b3' }}>
                As sessões são guardadas neste navegador (até {MAX_SESSIONS}{' '}
                testes e {MAX_SAMPLES} amostras por teste). Exporte CSV para
                arquivar. Não são sincronizadas com o Control Hub.
              </p>
              {sessionStorageError && (
                <p style={{ color: '#fbbf24' }}>{sessionStorageError}</p>
              )}
              <div
                style={{
                  padding: 14,
                  border: '1px solid #345544',
                  borderRadius: 10,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'end',
                }}
              >
                <label>
                  Nome do teste
                  <br />
                  <input
                    value={sessionLabel}
                    disabled={Boolean(activeSession)}
                    onChange={(e) => setSessionLabel(e.target.value)}
                    maxLength={80}
                    style={{ padding: 8, minWidth: 230 }}
                  />
                </label>
                {!activeSession ? (
                  <button
                    type="button"
                    disabled={liveStatus !== 'connected'}
                    onClick={beginSession}
                  >
                    INICIAR COLETA
                  </button>
                ) : (
                  <button type="button" onClick={finishSession}>
                    ENCERRAR E SALVAR
                  </button>
                )}
                <span>
                  {activeSession
                    ? `Gravando: ${activeSession.samples.length} amostras`
                    : liveStatus === 'connected'
                    ? 'Pronto para iniciar'
                    : 'Conecte ao robô para iniciar'}
                </span>
              </div>
              <h3>Testes registrados</h3>
              {!sessions.length && (
                <p>
                  Nenhuma sessão concluída. Conecte ao robô e inicie uma coleta.
                </p>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {sessions.map((session) => {
                  const stats = sessionMetrics(session);
                  return (
                    <div
                      key={session.id}
                      style={{
                        background: '#172c23',
                        border: '1px solid #345544',
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <strong>{session.label}</strong>{' '}
                      <small>— {session.robotName}</small>
                      <p style={{ margin: '6px 0' }}>
                        {new Date(session.startedAt).toLocaleString('pt-BR')} •{' '}
                        {session.samples.length} amostras •{' '}
                        {(((session.endedAt ?? session.startedAt) -
                          session.startedAt) /
                          1000) |
                          0}
                        s • {stats.alerts.length} motor(es) com alertas
                      </p>
                      <p style={{ margin: '6px 0' }}>
                        Bateria média:{' '}
                        {stats.voltageAvg === null
                          ? '—'
                          : `${stats.voltageAvg.toFixed(2)} V`}
                      </p>
                      {stats.motors.map((m) => (
                        <div key={m.name} style={{ fontSize: 13 }}>
                          {m.name}: RPM médio absoluto {m.avgRpm.toFixed(1)} •
                          pico {m.peakRpm.toFixed(1)} • potência média absoluta{' '}
                          {m.avgPower === null ? '—' : m.avgPower.toFixed(2)}
                        </div>
                      ))}
                      {stats.alerts.length > 0 && (
                        <p style={{ color: '#fbbf24' }}>
                          Possíveis anomalias durante a sessão:{' '}
                          {stats.alerts.join(', ')}
                        </p>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: 10,
                          marginTop: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSessionId((prev) =>
                              prev === session.id ? null : session.id
                            )
                          }
                        >
                          {expandedSessionId === session.id
                            ? 'OCULTAR GRÁFICOS'
                            : 'VER GRÁFICOS'}
                        </button>
                        <button
                          type="button"
                          onClick={() => exportSessionCSV(session)}
                        >
                          EXPORTAR CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Excluir esta sessão deste navegador?'
                              )
                            )
                              setSessions((prev) =>
                                prev.filter((s) => s.id !== session.id)
                              );
                          }}
                        >
                          EXCLUIR
                        </button>
                      </div>
                      {expandedSessionId === session.id && (
                        <div
                          style={{ marginTop: 16, display: 'grid', gap: 16 }}
                        >
                          <div>
                            <h4 style={{ color: '#e2f6e8', margin: '0 0 8px' }}>
                              Tensão da bateria (V)
                            </h4>
                            <SessionGraph session={session} metric="voltage" />
                          </div>
                          <div>
                            <h4 style={{ color: '#e2f6e8', margin: '0 0 8px' }}>
                              Rotação dos motores (RPM)
                            </h4>
                            {stats.motors.length ? (
                              <>
                                <label
                                  htmlFor={`graph-motor-${session.id}`}
                                  style={{ display: 'block', marginBottom: 8 }}
                                >
                                  Motor analisado
                                </label>
                                <select
                                  id={`graph-motor-${session.id}`}
                                  value={
                                    stats.motors.some(
                                      (m) => m.name === graphMotor[session.id]
                                    )
                                      ? graphMotor[session.id]
                                      : stats.motors[0].name
                                  }
                                  onChange={(e) =>
                                    setGraphMotor((prev) => ({
                                      ...prev,
                                      [session.id]: e.target.value,
                                    }))
                                  }
                                  style={{ padding: 8, marginBottom: 12 }}
                                >
                                  {stats.motors.map((m) => (
                                    <option key={m.name} value={m.name}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                                <SessionGraph
                                  session={session}
                                  metric="rpm"
                                  motorName={
                                    stats.motors.some(
                                      (m) => m.name === graphMotor[session.id]
                                    )
                                      ? graphMotor[session.id]
                                      : stats.motors[0].name
                                  }
                                />
                              </>
                            ) : (
                              <p>Não há motores nesta sessão.</p>
                            )}
                          </div>
                          <small style={{ color: '#a7c3b3' }}>
                            Os gráficos mostram medições recebidas, não
                            comprovam defeitos. Para comparar sessões, mantenha
                            condições de carga e programação semelhantes.
                          </small>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {sessions.length >= 2 && (
                <>
                  <h3>Comparar sessões</h3>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[sessionCompareA, sessionCompareB].map((value, index) => (
                      <select
                        key={index}
                        aria-label={`Sessão ${index + 1}`}
                        value={value}
                        onChange={(e) =>
                          index === 0
                            ? setSessionCompareA(e.target.value)
                            : setSessionCompareB(e.target.value)
                        }
                        style={{ padding: 8, minWidth: 210 }}
                      >
                        <option value="">Selecionar sessão {index + 1}</option>
                        {sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.label} —{' '}
                            {new Date(session.startedAt).toLocaleDateString(
                              'pt-BR'
                            )}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                  {(() => {
                    const a = sessions.find((s) => s.id === sessionCompareA);
                    const b = sessions.find((s) => s.id === sessionCompareB);
                    if (!a || !b || a.id === b.id)
                      return <p>Escolha duas sessões diferentes.</p>;
                    const ma = sessionMetrics(a),
                      mb = sessionMetrics(b);
                    const names = [
                      ...new Set([
                        ...ma.motors.map((m) => m.name),
                        ...mb.motors.map((m) => m.name),
                      ]),
                    ];
                    return (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          border: '1px solid #345544',
                          borderRadius: 10,
                        }}
                      >
                        <p>
                          Bateria média: {ma.voltageAvg?.toFixed(2) ?? '—'} V ×{' '}
                          {mb.voltageAvg?.toFixed(2) ?? '—'} V
                        </p>
                        {names.map((name) => {
                          const am = ma.motors.find((m) => m.name === name);
                          const bm = mb.motors.find((m) => m.name === name);
                          return (
                            <p key={name}>
                              {name} — RPM médio absoluto:{' '}
                              {am?.avgRpm.toFixed(1) ?? '—'} ×{' '}
                              {bm?.avgRpm.toFixed(1) ?? '—'}; pico:{' '}
                              {am?.peakRpm.toFixed(1) ?? '—'} ×{' '}
                              {bm?.peakRpm.toFixed(1) ?? '—'}
                            </p>
                          );
                        })}
                        <small>
                          Compare testes com mesma carga, programa e
                          configuração. A média de RPM absoluto não mede
                          eficiência nem confirma defeitos.
                        </small>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}
        {diagnosticCenterOpen && (
          <DiagnosticsCenter
            nodes={nodes}
            liveMotors={liveMotors}
            diagnostics={diagnostics}
            connectionStatus={liveStatus}
            onClose={() => setDiagnosticCenterOpen(false)}
            onSelectMotor={(id) => setSelectedNodeId(id)}
          />
        )}

        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          snapToGrid={snapToGrid}
          snapGrid={[20, 20]}
          minZoom={0.3}
          maxZoom={2}
        >
          {gridVisible && <Background gap={20} size={1} />}

          <Controls />
        </ReactFlow>

        {ftcConfigurationName && (
          <div className="import-status success">
            FTC: {ftcConfigurationName}
          </div>
        )}

        {importError !== '' && (
          <div className="import-status error">{importError}</div>
        )}

        {/* CADASTRO MANUAL */}

        {newComponent !== null && (
          <div className="editor-panel">
            <div className="editor-header">
              <div>
                <span>NOVO COMPONENTE</span>

                <h2>
                  {newComponent.type === 'motor' ? 'Motor — M' : 'Servo — S'}

                  {newComponent.port}
                </h2>

                <small>{getHubName(newComponent.hubId)}</small>
              </div>

              <button onClick={() => setNewComponent(null)}>×</button>
            </div>

            <label>Nome do componente</label>

            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                newComponent.type === 'motor' ? 'Ex: Intake' : 'Ex: Garra'
              }
            />

            <label>Nome na configuração FTC</label>

            <input
              value={configName}
              onChange={(event) => setConfigName(event.target.value)}
              placeholder={
                newComponent.type === 'motor'
                  ? 'Ex: intakeMotor'
                  : 'Ex: clawServo'
              }
            />

            <button className="editor-save" onClick={createComponent}>
              {newComponent.type === 'motor'
                ? 'Adicionar motor'
                : 'Adicionar servo'}
            </button>
          </div>
        )}

        {/* FICHA DO ATUADOR */}

        {selectedNodeId !== null &&
          selectedNode &&
          (selectedNode.type === 'motor' || selectedNode.type === 'servo') && (
            <ActuatorPanel
              key={selectedNode.id}
              type={selectedNode.type === 'servo' ? 'servo' : 'motor'}
              name={String(selectedNode.data.name ?? '')}
              configName={String(selectedNode.data.configName ?? '')}
              model={
                typeof selectedNode.data.model === 'string'
                  ? selectedNode.data.model
                  : undefined
              }
              port={Number(selectedNode.data.port ?? 0)}
              hubName={getHubName(selectedNode.data.hubId)}
              source={
                typeof selectedNode.data.source === 'string'
                  ? selectedNode.data.source
                  : undefined
              }
              actuatorId={
                typeof selectedNode.data.actuatorId === 'string'
                  ? selectedNode.data.actuatorId
                  : undefined
              }
              history={
                typeof selectedNode.data.actuatorId === 'string'
                  ? actuatorHistory[selectedNode.data.actuatorId]
                  : undefined
              }
              liveStatus={liveStatus}
              liveError={liveError}
              liveUpdatedAt={liveUpdatedAt}
              liveMotors={liveMotors}
              liveServos={liveServos}
              liveHistory={liveHistory}
              diagnostics={diagnostics}
              diagnosticSettings={diagnosticSettings}
              onDiagnosticSettingsChange={setDiagnosticSettings}
              onSave={saveSelectedComponent}
              onAddIssue={addIssue}
              onUpdateIssue={updateIssue}
              onDeleteIssue={deleteIssue}
              onAddMaintenance={addMaintenance}
              onUpdateMaintenance={updateMaintenance}
              onDeleteMaintenance={deleteMaintenance}
              onDelete={deleteComponent}
              onClose={() => {
                setSelectedNodeId(null);

                setName('');

                setConfigName('');
              }}
            />
          )}
      </div>
    </div>
  );
}

export default App;
