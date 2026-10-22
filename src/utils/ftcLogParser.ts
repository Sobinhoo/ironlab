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

export type ImportedComponent =
  | ImportedMotor
  | ImportedServo;

export type ImportedHub = {
  name: string;
  moduleAddress: number;
  components: ImportedComponent[];
};

export type FTCConfiguration = {
  name: string;
  hubs: ImportedHub[];
};

function cleanLogLine(line: string) {
  const xmlStart = line.indexOf('<');

  if (xmlStart === -1) {
    return '';
  }

  return line
    .substring(xmlStart)
    .trim();
}

function getConfigurationName(
  text: string
) {
  const matches = [
    ...text.matchAll(
      /CMD_(?:SAVE|ACTIVATE)_CONFIGURATION[^\n]*"name":"([^"]+)"/g
    ),
  ];

  if (matches.length === 0) {
    return 'Configuração importada';
  }

  return matches[
    matches.length - 1
  ][1];
}

function findLatestRobotXml(
  text: string
) {
  const lines =
    text.split(/\r?\n/);

  let currentXml:
    string[] | null = null;

  let latestXml = '';

  for (const line of lines) {
    if (
      line.includes('<Robot')
    ) {
      currentXml = [
        cleanLogLine(line),
      ];

      continue;
    }

    if (currentXml !== null) {
      const cleaned =
        cleanLogLine(line);

      if (cleaned !== '') {
        currentXml.push(
          cleaned
        );
      }

      if (
        line.includes('</Robot>')
      ) {
        latestXml =
          currentXml.join('\n');

        currentXml = null;
      }
    }
  }

  return latestXml;
}

function isMotorTag(
  tagName: string
) {
  const lower =
    tagName.toLowerCase();

  return (
    lower.includes('motor') &&
    !lower.includes(
      'controller'
    )
  );
}

function isServoTag(
  tagName: string
) {
  const lower =
    tagName.toLowerCase();

  return (
    lower.includes('servo') &&
    !lower.includes(
      'controller'
    )
  );
}

export function parseFTCLog(
  text: string
): FTCConfiguration {
  const configurationName =
    getConfigurationName(text);

  const xmlText =
    findLatestRobotXml(text);

  if (xmlText === '') {
    throw new Error(
      'Nenhuma configuração FTC foi encontrada no log.'
    );
  }

  const parser =
    new DOMParser();

  const xml =
    parser.parseFromString(
      xmlText,
      'application/xml'
    );

  if (
    xml.querySelector(
      'parsererror'
    )
  ) {
    throw new Error(
      'A configuração foi encontrada, mas o XML não pôde ser interpretado.'
    );
  }

  const moduleElements = [
    ...xml.querySelectorAll(
      'LynxModule'
    ),
  ];

  if (
    moduleElements.length === 0
  ) {
    throw new Error(
      'Nenhum Control Hub ou Expansion Hub foi encontrado.'
    );
  }

  const hubs:
    ImportedHub[] =
    moduleElements.map(
      (moduleElement) => {
        const hubName =
          moduleElement.getAttribute(
            'name'
          ) ??
          'REV Hub';

        const moduleAddress =
          Number(
            moduleElement.getAttribute(
              'port'
            ) ?? 0
          );

        const components:
          ImportedComponent[] =
          [];

        for (
          const child of
          Array.from(
            moduleElement.children
          )
        ) {
          const tagName =
            child.tagName;

          const name =
            child.getAttribute(
              'name'
            );

          const portText =
            child.getAttribute(
              'port'
            );

          if (
            name === null ||
            portText === null
          ) {
            continue;
          }

          const port =
            Number(portText);

          if (
            Number.isNaN(port)
          ) {
            continue;
          }

          if (
            isMotorTag(tagName)
          ) {
            components.push({
              type: 'motor',
              name: name,
              port: port,
              model: tagName,
              hubName: hubName,
              moduleAddress:
                moduleAddress,
            });

            continue;
          }

          if (
            isServoTag(tagName)
          ) {
            components.push({
              type: 'servo',
              name: name,
              port: port,
              model: tagName,
              hubName: hubName,
              moduleAddress:
                moduleAddress,
            });
          }
        }

        return {
          name: hubName,
          moduleAddress:
            moduleAddress,
          components: components,
        };
      }
    );

  return {
    name: configurationName,
    hubs: hubs,
  };
}