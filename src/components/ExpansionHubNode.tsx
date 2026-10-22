import {
  Handle,
  Position,
} from '@xyflow/react';

type PortType =
  | 'motor'
  | 'servo';

type ExpansionHubData = {
  hubId?: string;

  onAddComponent?: (
    type: PortType,
    port: number
  ) => void;

  occupiedMotors?: number[];
  occupiedServos?: number[];
};

/*
 * ========================================
 * PORTAS DOS MOTORES
 * ========================================
 *
 * Ordem física:
 *
 * M0
 * M1
 * M2
 * M3
 *
 * de cima para baixo.
 */

const motorPorts = [
  {
    port: 0,
    left: '4%',
    top: '40%',
  },

  {
    port: 1,
    left: '4%',
    top: '49%',
  },

  {
    port: 2,
    left: '4%',
    top: '58%',
  },

  {
    port: 3,
    left: '4%',
    top: '67%',
  },
];

/*
 * ========================================
 * PORTAS DOS SERVOS
 * ========================================
 *
 * S0 → S5
 *
 * da esquerda para a direita.
 */

const servoPorts = [
  {
    port: 0,
    left: '25%',
    top: '91%',
  },

  {
    port: 1,
    left: '33%',
    top: '91%',
  },

  {
    port: 2,
    left: '41%',
    top: '91%',
  },

  {
    port: 3,
    left: '49%',
    top: '91%',
  },

  {
    port: 4,
    left: '57%',
    top: '91%',
  },

  {
    port: 5,
    left: '65%',
    top: '91%',
  },
];

export default function ExpansionHubNode({
  data,
}: {
  data: ExpansionHubData;
}) {
  /*
   * Portas atualmente ocupadas.
   */

  const occupiedMotors =
    data.occupiedMotors ?? [];

  const occupiedServos =
    data.occupiedServos ?? [];

  /*
   * ========================================
   * RENDERIZAR PORTA
   * ========================================
   */

  function renderPort(
    type: PortType,
    port: number,
    left: string,
    top: string,
    occupied: boolean
  ) {
    return (
      <div
        key={
          type +
          '-' +
          port
        }
        className={
          'hub-port-hotspot ' +
          type +
          (occupied
            ? ' occupied'
            : '')
        }
        style={{
          left: left,
          top: top,
        }}
      >
        {/* BOTÃO DA PORTA */}

        <button
          type="button"
          className="hub-port-button nodrag nopan"
          title={
            type.toUpperCase() +
            ' ' +
            port
          }
          disabled={occupied}
          onMouseDown={(event) => {
            /*
             * Impede o React Flow
             * de começar a arrastar
             * o Hub ao clicar.
             */

            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();

            if (occupied) {
              return;
            }

            data.onAddComponent?.(
              type,
              port
            );
          }}
        >
          <span>
            {occupied
              ? '✓'
              : '+'}
          </span>
        </button>

        {/* CONECTOR DO CABO */}

        <Handle
          type="source"
          position={
            type === 'servo'
              ? Position.Bottom
              : Position.Left
          }
          id={
            type +
            '-' +
            port
          }
          className="hub-real-handle"
        />
      </div>
    );
  }

  /*
   * ========================================
   * HUB
   * ========================================
   */

  return (
    <div className="real-hub expansion-hub">

      {/* IMAGEM */}

      <img
        src="/expansion-hub.png"
        alt="REV Expansion Hub"
        className="real-hub-image"
        draggable={false}
      />

      {/* MOTORES */}

      {motorPorts.map(
        (item) =>
          renderPort(
            'motor',
            item.port,
            item.left,
            item.top,
            occupiedMotors.includes(
              item.port
            )
          )
      )}

      {/* SERVOS */}

      {servoPorts.map(
        (item) =>
          renderPort(
            'servo',
            item.port,
            item.left,
            item.top,
            occupiedServos.includes(
              item.port
            )
          )
      )}

    </div>
  );
}