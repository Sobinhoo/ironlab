import {
  useEffect,
  useState,
} from 'react';

type DiagnosticPanelProps = {
  onClose: () => void;
};

type DiagnosticResult = {
  date: string;
  target: string;
  status: string;
  details: string;
};

const CONTROL_HUB_URL =
  'http://192.168.43.1:8080';

const STORAGE_KEY =
  'ftc-electrical-lab-diagnostic';

export default function DiagnosticPanel({
  onClose,
}: DiagnosticPanelProps) {
  const [
    testing,
    setTesting,
  ] = useState(false);

  const [
    status,
    setStatus,
  ] = useState(
    'Aguardando teste...'
  );

  const [
    report,
    setReport,
  ] = useState('');

  /*
   * Recupera o último relatório
   * salvo no navegador.
   */
  useEffect(() => {
    const savedReport =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (savedReport) {
      setReport(savedReport);

      setStatus(
        'Relatório anterior recuperado.'
      );
    }
  }, []);

  /*
   * Salva relatório.
   */
  function saveReport(
    text: string
  ) {
    setReport(text);

    localStorage.setItem(
      STORAGE_KEY,
      text
    );
  }

  /*
   * =====================================
   * TESTAR CONTROL HUB
   * =====================================
   */
  async function testConnection() {
    setTesting(true);

    setStatus(
      'Tentando acessar o Control Hub...'
    );

    const startTime =
      performance.now();

    try {
      /*
       * Abortamos depois de
       * 8 segundos.
       */
      const controller =
        new AbortController();

      const timeout =
        window.setTimeout(
          () => {
            controller.abort();
          },
          8000
        );

      const response =
        await fetch(
          CONTROL_HUB_URL,
          {
            method: 'GET',

            signal:
              controller.signal,

            /*
             * Não precisamos
             * interpretar a página
             * ainda.
             */
            cache: 'no-store',
          }
        );

      window.clearTimeout(
        timeout
      );

      const endTime =
        performance.now();

      const elapsed =
        Math.round(
          endTime - startTime
        );

      let bodyPreview = '';

      try {
        const body =
          await response.text();

        bodyPreview =
          body.substring(
            0,
            1000
          );
      } catch {
        bodyPreview =
          'Não foi possível ler o corpo da resposta.';
      }

      const result:
        DiagnosticResult = {
        date:
          new Date().toISOString(),

        target:
          CONTROL_HUB_URL,

        status:
          'HTTP ' +
          response.status +
          ' ' +
          response.statusText,

        details:
          'Tempo de resposta: ' +
          elapsed +
          ' ms\n\n' +
          'Tipo de resposta: ' +
          (
            response.headers.get(
              'content-type'
            ) ?? 'desconhecido'
          ) +
          '\n\n' +
          'Prévia da resposta:\n' +
          bodyPreview,
      };

      const text =
        buildReport(result);

      saveReport(text);

      setStatus(
        'Control Hub respondeu.'
      );
    } catch (error) {
      const endTime =
        performance.now();

      const elapsed =
        Math.round(
          endTime - startTime
        );

      let errorName =
        'Erro desconhecido';

      let errorMessage =
        String(error);

      if (
        error instanceof Error
      ) {
        errorName =
          error.name;

        errorMessage =
          error.message;
      }

      const result:
        DiagnosticResult = {
        date:
          new Date().toISOString(),

        target:
          CONTROL_HUB_URL,

        status:
          'FALHA',

        details:
          'Tempo até a falha: ' +
          elapsed +
          ' ms\n\n' +
          'Tipo do erro: ' +
          errorName +
          '\n\n' +
          'Mensagem: ' +
          errorMessage +
          '\n\n' +
          'OBSERVAÇÃO:\n' +
          'Uma falha aqui não significa necessariamente que o Control Hub está inacessível. O navegador pode ter bloqueado a requisição por CORS, Mixed Content ou outra política de segurança.',
      };

      const text =
        buildReport(result);

      saveReport(text);

      setStatus(
        'A requisição foi bloqueada ou o Hub não respondeu.'
      );
    } finally {
      setTesting(false);
    }
  }

  /*
   * =====================================
   * GERAR RELATÓRIO
   * =====================================
   */
  function buildReport(
    result: DiagnosticResult
  ) {
    return (
      'FTC ELECTRICAL LAB\n' +
      'DIAGNÓSTICO DO ROBOT CONTROLLER\n' +
      '================================\n\n' +

      'Data: ' +
      result.date +
      '\n\n' +

      'Destino:\n' +
      result.target +
      '\n\n' +

      'Resultado:\n' +
      result.status +
      '\n\n' +

      'Detalhes:\n' +
      result.details +
      '\n\n' +

      '================================\n' +
      'Fim do diagnóstico'
    );
  }

  /*
   * =====================================
   * COPIAR
   * =====================================
   */
  async function copyReport() {
    if (!report) {
      return;
    }

    try {
      await navigator.clipboard
        .writeText(report);

      setStatus(
        'Relatório copiado.'
      );
    } catch {
      setStatus(
        'Não foi possível copiar automaticamente. Selecione o texto manualmente.'
      );
    }
  }

  /*
   * =====================================
   * LIMPAR
   * =====================================
   */
  function clearReport() {
    localStorage.removeItem(
      STORAGE_KEY
    );

    setReport('');

    setStatus(
      'Relatório apagado.'
    );
  }

  return (
    <div className="diagnostic-panel">

      <div className="diagnostic-header">

        <div>
          <span>
            FTC ELECTRICAL LAB
          </span>

          <h2>
            Diagnóstico
          </h2>
        </div>

        <button
          className="diagnostic-close"
          onClick={onClose}
        >
          ×
        </button>

      </div>

      <div className="diagnostic-target">

        <span>
          ROBOT CONTROLLER
        </span>

        <strong>
          Control Hub
        </strong>

        <code>
          192.168.43.1:8080
        </code>

      </div>

      <button
        className="diagnostic-test-button"
        onClick={
          testConnection
        }
        disabled={testing}
      >
        {testing
          ? 'TESTANDO...'
          : 'TESTAR CONEXÃO'}
      </button>

      <div className="diagnostic-status">

        <span>
          STATUS
        </span>

        <p>
          {status}
        </p>

      </div>

      <div className="diagnostic-report-header">

        <span>
          RESULTADO BRUTO
        </span>

        {report && (
          <button
            onClick={
              clearReport
            }
          >
            Limpar
          </button>
        )}

      </div>

      <textarea
        className="diagnostic-report"
        value={report}
        readOnly
        placeholder="O resultado do teste aparecerá aqui."
      />

      <button
        className="diagnostic-copy-button"
        onClick={
          copyReport
        }
        disabled={!report}
      >
        COPIAR RELATÓRIO
      </button>

      <div className="diagnostic-note">
        O último relatório fica salvo
        neste navegador mesmo após
        trocar de rede Wi-Fi.
      </div>

    </div>
  );
}