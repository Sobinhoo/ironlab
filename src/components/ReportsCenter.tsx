import { useMemo, useState } from 'react';
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { SavedProject } from '../utils/projectStorage';
import { buildMaintenanceReportEntries, formatMaintenanceStatus, formatMaintenanceType, formatReportDate, summarizeMaintenanceReport, type MaintenanceReportKind, type MaintenanceReportStatus } from '../utils/maintenanceReports';
import './ReportsCenter.css';

type Props = { snapshot: SavedProject; onClose: () => void };
const kindLabels: Record<MaintenanceReportKind, string> = { occurrences: 'Relatório de ocorrências', maintenance: 'Relatório de manutenção', complete: 'Relatório técnico completo' };
const statusLabels: Record<MaintenanceReportStatus, string> = { all: 'Todas as situações', open: 'Aberto', monitoring: 'Em observação', resolved: 'Resolvido' };
const border = { style: BorderStyle.SINGLE, size: 1, color: 'D8E1DA' };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'IRONLab';
}
function cell(text: string, header = false, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    borders: cellBorders,
    shading: header ? { fill: '18382A', type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: (text || '—').split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line || '—', bold: header, color: header ? 'FFFFFF' : '24352C', size: header ? 18 : 17, font: 'Aptos' })] })),
  });
}

export default function ReportsCenter({ snapshot, onClose }: Props) {
  const [kind, setKind] = useState<MaintenanceReportKind>('complete');
  const [status, setStatus] = useState<MaintenanceReportStatus>('all');
  const [componentId, setComponentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const components = useMemo(() => snapshot.nodes
    .filter((node) => node.type === 'motor' || node.type === 'servo')
    .map((node) => ({ id: node.id, name: String(node.data.name ?? node.data.configName ?? 'Componente'), port: (node.type === 'motor' ? 'M' : 'S') + Number(node.data.port ?? 0) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [snapshot.nodes]);
  const entries = useMemo(() => buildMaintenanceReportEntries(snapshot, { kind, status, componentId, from, to }), [snapshot, kind, status, componentId, from, to]);
  const summary = useMemo(() => summarizeMaintenanceReport(entries), [entries]);

  async function exportDocx() {
    if (!entries.length || busy) return;
    setBusy(true); setNotice('');
    try {
      const issuedAt = new Date();
      const period = from || to
        ? (from ? new Date(from + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início não definido') + ' até ' + (to ? new Date(to + 'T00:00:00').toLocaleDateString('pt-BR') : 'Hoje')
        : 'Todo o histórico disponível';
      const children: (Paragraph | Table)[] = [
        new Paragraph({ children: [new TextRun({ text: 'IRONLAB  /  MCI LAB', bold: true, color: '18784B', size: 20 })], spacing: { after: 180 } }),
        new Paragraph({ text: kindLabels[kind], heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: snapshot.robot.name, bold: true, size: 26, color: '18382A' })], spacing: { after: 80 } }),
        new Paragraph({ text: 'Emitido em ' + issuedAt.toLocaleString('pt-BR') + '  •  Projeto ' + snapshot.robot.id, style: 'Caption', spacing: { after: 240 } }),
        new Paragraph({ text: '1. Identificação técnica', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: 'Robô: ', bold: true }), new TextRun(snapshot.robot.name)] }),
        new Paragraph({ children: [new TextRun({ text: 'Configuração FTC: ', bold: true }), new TextRun(snapshot.ftcConfigurationName || 'Não informada')] }),
        new Paragraph({ children: [new TextRun({ text: 'Período: ', bold: true }), new TextRun(period)] }),
        new Paragraph({ children: [new TextRun({ text: 'Situação: ', bold: true }), new TextRun(statusLabels[status])] }),
        new Paragraph({ children: [new TextRun({ text: 'Componente: ', bold: true }), new TextRun(components.find((item) => item.id === componentId)?.name ?? 'Todos os componentes')] }),
        new Paragraph({ text: '2. Resumo', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: 'Registros: ' + summary.total + '    ', bold: true }), new TextRun('Ocorrências: ' + summary.occurrences + '    Intervenções: ' + summary.interventions)] }),
        new Paragraph({ text: 'Abertos: ' + summary.open + '    Em observação: ' + summary.monitoring + '    Resolvidos: ' + summary.resolved, spacing: { after: 180 } }),
        new Paragraph({ text: '3. Histórico detalhado', heading: HeadingLevel.HEADING_1 }),
      ];
      const rows = [
        new TableRow({ tableHeader: true, children: [cell('Data', true, 1250), cell('Componente / porta', true, 1900), cell('Tipo / situação', true, 1800), cell('Registro e descrição', true, 5256)] }),
        ...entries.map((entry) => new TableRow({ cantSplit: true, children: [
          cell(formatReportDate(entry.createdAt), false, 1250),
          cell(entry.componentName + '\n' + entry.hubName + ' · ' + entry.portLabel, false, 1900),
          cell(formatMaintenanceType(entry.type) + '\n' + formatMaintenanceStatus(entry.status), false, 1800),
          cell(entry.title + '\n' + (entry.description || 'Sem descrição registrada') + (entry.relatedIssueTitle ? '\nOcorrência relacionada: ' + entry.relatedIssueTitle : '') + (entry.resolvedAt ? '\nResolvido em: ' + formatReportDate(entry.resolvedAt) : ''), false, 5256),
        ] })),
      ];
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1250, 1900, 1800, 5256], rows }));
      children.push(
        new Paragraph({ text: '4. Observações e responsabilidade', heading: HeadingLevel.HEADING_1, spacing: { before: 280 } }),
        new Paragraph({ text: 'Este documento consolida exclusivamente os registros encontrados no projeto selecionado no momento da emissão.' }),
        new Paragraph({ text: 'Campos não registrados no IRONLab não são inferidos ou preenchidos automaticamente.' }),
        new Paragraph({ text: '\n\nResponsável técnico: ______________________________________________' }),
        new Paragraph({ text: 'Assinatura: ______________________________    Data: ____/____/________' }),
      );
      const doc = new Document({
        creator: 'IRONLab — MCI Lab',
        title: kindLabels[kind] + ' — ' + snapshot.robot.name,
        subject: 'Histórico de manutenção e ocorrências do robô',
        description: 'Relatório gerado localmente pelo IRONLab.',
        sections: [{
          properties: { page: { margin: { top: 900, right: 850, bottom: 900, left: 850 } } },
          footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: 'IRONLab · Documento gerado em ' + issuedAt.toLocaleDateString('pt-BR') + '  |  Página ', color: '6B7C72', size: 16 }),
            new TextRun({ children: [PageNumber.CURRENT], color: '6B7C72', size: 16 }),
          ] })] }) },
          children,
        }],
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeFilename(snapshot.robot.name) + '_' + kind + '_' + issuedAt.toISOString().slice(0, 10) + '.docx';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice('Documento Word gerado. Verifique a pasta de downloads.');
    } catch (error) {
      setNotice(error instanceof Error ? 'Não foi possível gerar o documento: ' + error.message : 'Falha ao gerar o documento Word.');
    } finally { setBusy(false); }
  }

  return (
    <div className="iron-reports-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="iron-reports-modal" role="dialog" aria-modal="true" aria-labelledby="iron-reports-title">
        <header className="iron-reports-header">
          <div><small>IRONLAB / DOCUMENTAÇÃO</small><h2 id="iron-reports-title">Central de relatórios</h2><p>Gere documentos técnicos a partir do histórico deste projeto.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar central de relatórios">×</button>
        </header>
        <div className="iron-reports-body">
          <div className="iron-reports-filters">
            <label>Documento<select value={kind} onChange={(event) => setKind(event.target.value as MaintenanceReportKind)}><option value="complete">Relatório técnico completo</option><option value="occurrences">Relatório de ocorrências</option><option value="maintenance">Relatório de manutenção</option></select></label>
            <label>Situação<select value={status} onChange={(event) => setStatus(event.target.value as MaintenanceReportStatus)}><option value="all">Todas as situações</option><option value="open">Aberto</option><option value="monitoring">Em observação</option><option value="resolved">Resolvido</option></select></label>
            <label>Componente<select value={componentId} onChange={(event) => setComponentId(event.target.value)}><option value="">Todos os componentes</option>{components.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.port}</option>)}</select></label>
            <label>De<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>Até<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <div className="iron-reports-summary">
            <div><strong>{summary.total}</strong><span>Registros</span></div><div><strong>{summary.occurrences}</strong><span>Ocorrências</span></div><div><strong>{summary.interventions}</strong><span>Intervenções</span></div><div><strong>{summary.open}</strong><span>Abertos</span></div><div><strong>{summary.resolved}</strong><span>Resolvidos</span></div>
          </div>
          <div className="iron-reports-preview">
            <div className="iron-reports-preview-heading"><strong>Prévia do conteúdo</strong><span>{entries.length} registro(s)</span></div>
            {!entries.length ? <p>Nenhum registro corresponde aos filtros selecionados.</p> : entries.slice(0, 8).map((entry) => (
              <article key={entry.actuatorId + '-' + entry.id}><div><strong>{entry.title}</strong><small>{entry.componentName} · {entry.portLabel} · {formatReportDate(entry.createdAt)}</small></div><span className={'iron-report-status status-' + entry.status}>{formatMaintenanceStatus(entry.status)}</span></article>
            ))}
            {entries.length > 8 && <p>Mais {entries.length - 8} registro(s) serão incluídos no documento.</p>}
          </div>
          {notice && <p className="iron-reports-notice" role="status">{notice}</p>}
        </div>
        <footer className="iron-reports-footer"><span>Formato Microsoft Word · .docx</span><div><button type="button" className="iron-reports-secondary" onClick={onClose}>Fechar</button><button type="button" className="iron-reports-primary" disabled={!entries.length || busy} onClick={() => void exportDocx()}>{busy ? 'Gerando documento…' : 'Exportar DOCX'}</button></div></footer>
      </section>
    </div>
  );
}
