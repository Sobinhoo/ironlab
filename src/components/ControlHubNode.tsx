import { Handle, Position } from '@xyflow/react';

type PortType = 'motor' | 'servo';

type ControlHubData = {
  onAddComponent?: (type: PortType, port: number) => void;

  occupiedMotors?: number[];
  occupiedServos?: number[];
};

const motorPorts = [
  { port: 0, left: '4.5%', top: '35%' },
  { port: 1, left: '4.5%', top: '48%' },
  { port: 2, left: '4.5%', top: '62%' },
  { port: 3, left: '4.5%', top: '75%' },
];

const servoPorts = [
  { port: 0, left: '23%', top: '91%' },
  { port: 1, left: '30%', top: '91%' },
  { port: 2, left: '37%', top: '91%' },
  { port: 3, left: '44%', top: '91%' },
  { port: 4, left: '51%', top: '91%' },
  { port: 5, left: '58%', top: '91%' },
];

export default function ControlHubNode({ data }: { data: ControlHubData }) {
  const occupiedMotors = data.occupiedMotors ?? [];

  const occupiedServos = data.occupiedServos ?? [];

  function renderPort(
    type: PortType,
    port: number,
    left: string,
    top: string,
    occupied: boolean
  ) {
    return (
      <div
        key={type + '-' + port}
        className={'hub-port-hotspot ' + type + (occupied ? ' occupied' : '')}
        style={{
          left: left,
          top: top,
        }}
      >
        <button
          className="hub-port-button nodrag"
          title={type.toUpperCase() + ' ' + port}
          disabled={occupied}
          onClick={(event) => {
            event.stopPropagation();

            if (!occupied) {
              data.onAddComponent?.(type, port);
            }
          }}
        >
          <span>{occupied ? '✓' : '+'}</span>
        </button>

        <Handle
          type="source"
          position={type === 'servo' ? Position.Bottom : Position.Left}
          id={type + '-' + port}
          className="hub-real-handle"
        />
      </div>
    );
  }

  return (
    <div className="real-hub">
      <img
        src="/control-hub.png"
        alt="REV Control Hub"
        className="real-hub-image"
        draggable={false}
      />

      {motorPorts.map((item) =>
        renderPort(
          'motor',
          item.port,
          item.left,
          item.top,
          occupiedMotors.includes(item.port)
        )
      )}

      {servoPorts.map((item) =>
        renderPort(
          'servo',
          item.port,
          item.left,
          item.top,
          occupiedServos.includes(item.port)
        )
      )}
    </div>
  );
}
