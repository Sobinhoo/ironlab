import { useEffect, useState } from 'react';
import type { SavedProject } from '../utils/projectStorage';

type Props = {
  robotName: string; saveStatus: string; snapshot: SavedProject;
  onOpenProject: (p: SavedProject) => void; onRename: (n: string) => void;
  snapToGrid: boolean; onSnapChange: (v: boolean) => void;
  gridVisible: boolean; onGridChange: (v: boolean) => void;
  hubIp: string; onHubIpChange: (v: string) => void;
  hubPort: string; onHubPortChange: (v: string) => void;
  pingMs: number | null; connected: boolean; voltage: number | null;
  warning: number; critical: number; onThresholdsChange: (w: number, c: number) => void;
  onSave: () => void;
};
const KEY = 'ironlab-project-library-v1';
type LibraryItem = { id: string; name: string; updatedAt: string; project: SavedProject };
function readLibrary(): LibraryItem[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(data) ? data as LibraryItem[] : []; }
  catch { return []; }
}
export default function WorkspaceTools(p: Props) {
  const [panel, setPanel] = useState<'projects' | 'settings' | 'help' | null>(null);
  const [library, setLibrary] = useState(readLibrary);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('ironlab-theme') || 'dark');
  const [notice, setNotice] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  // Atalhos globais do workspace: evita o diálogo de salvar página do navegador.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(current => current === null ? current : null);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        p.onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [p.onSave]);
  useEffect(() => {
    const entry = `${new Date().toLocaleTimeString()} · ${p.connected ? 'Hub conectado' : 'Hub desconectado'} · ${p.pingMs ?? '—'} ms`;
    setLogs(prev => prev.at(-1) === entry ? prev : [...prev.slice(-39), entry]);
  }, [p.connected, p.pingMs]);
  const persist = (items: LibraryItem[]) => { try {localStorage.setItem(KEY, JSON.stringify(items));setLibrary(items);setNotice('Biblioteca atualizada neste dispositivo.');} catch {setNotice('Sem espaço para salvar no navegador. Exporte seus projetos.');} };
  const saveAs = (duplicate = false) => {
    const name = window.prompt(duplicate ? 'Nome da cópia:' : 'Salvar projeto como:', duplicate ? `${p.robotName} — cópia` : p.robotName)?.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const project = structuredClone(p.snapshot);
    project.robot = {...project.robot, id, name, updatedAt: new Date().toISOString()};
    persist([{id, name, updatedAt: project.robot.updatedAt, project}, ...library]);
    if (!duplicate) p.onOpenProject(project);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(p.snapshot, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');a.href=url;a.download=`${p.robotName.replace(/[^a-z0-9_-]/gi,'_')}.ironlab.json`;a.click();URL.revokeObjectURL(url);
  };
  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const project: SavedProject = JSON.parse(await file.text());
      if (project.schemaVersion !== 1 || !Array.isArray(project.nodes) || !Array.isArray(project.edges) || !project.robot?.id) throw new Error('Formato incompatível');
      p.onOpenProject(project);setNotice('Projeto importado.');setPanel(null);
    } catch {setNotice('Arquivo inválido ou incompatível.'); }
  };
  const batteryColor = p.voltage == null || !p.connected ? 'muted' : p.voltage < p.critical ? 'critical' : p.voltage < p.warning ? 'warning' : 'good';
  return <>
    <nav className="iron-workspace-dock" aria-label="Ferramentas do workspace">
      <div className="iron-dock-left">
        <button onClick={() => setPanel(panel === 'projects' ? null : 'projects')} title="Projetos e arquivos">▤ <span>Projetos</span></button>
        <span className="iron-dock-name" title={p.robotName}>{p.robotName}</span>
        <button className="iron-dock-save" onClick={p.onSave} title="Salvar projeto localmente">↧ <span>Salvar</span></button>
        <span className="iron-dock-status" title="Salvamento local; não significa sincronização com Supabase">{p.saveStatus}</span>
      </div>
      <div className="iron-dock-right">
        <span className={p.connected ? 'iron-telemetry good' : 'iron-telemetry muted'} title="Tempo de resposta HTTP; não é intensidade do sinal Wi-Fi">◉ {p.connected ? (p.pingMs == null ? 'Ping —' : `${p.pingMs} ms`) : 'Offline'}</span>
        <span className={`iron-telemetry ${batteryColor}`} title="Tensão medida, não percentual de carga">⚡ {p.connected && p.voltage != null ? `${p.voltage.toFixed(2)} V` : '— V'}</span>
        <button onClick={() => setPanel(panel === 'help' ? null : 'help')} title="Ajuda e documentação">?</button>
        <button onClick={() => setPanel(panel === 'settings' ? null : 'settings')} title="Preferências e comunicação">⚙</button>
      </div>
    </nav>
    {panel && <div className="iron-panel-backdrop" onClick={() => setPanel(null)}>
      <aside className="iron-workspace-panel" onClick={e => e.stopPropagation()} aria-label={panel === 'settings' ? 'Configurações' : panel === 'projects' ? 'Projetos' : 'Ajuda'}>
        <div className="iron-panel-heading"><div><small>IRONLAB / WORKSPACE</small><h2>{panel === 'projects' ? 'Projetos e arquivos' : panel === 'settings' ? 'Preferências' : 'Centro de ajuda'}</h2></div><button onClick={() => setPanel(null)} aria-label="Fechar">×</button></div>
        {notice && <p className="iron-panel-notice" role="status">{notice}</p>}
        {panel === 'projects' && <div className="iron-panel-section">
          <label>Projeto atual<input value={p.robotName} onChange={e => p.onRename(e.target.value)} /></label>
          <div className="iron-panel-actions"><button onClick={p.onSave}>Salvar</button><button onClick={() => saveAs()}>Salvar como</button><button onClick={() => saveAs(true)}>Duplicar</button></div>
          <div className="iron-panel-actions"><button onClick={exportJson}>Exportar JSON</button><label className="iron-file-button">Importar JSON<input hidden type="file" accept=".json" onChange={e => {void importJson(e.target.files?.[0]);e.target.value='';}} /></label></div>
          <h3>Biblioteca local ({library.length})</h3><input placeholder="Buscar robôs..." value={search} onChange={e => setSearch(e.target.value)} />
          {library.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).map(i => <div className="iron-project-entry" key={i.id}><div><strong>{i.name}</strong><small>{new Date(i.updatedAt).toLocaleString()}</small></div><div><button onClick={() => {p.onOpenProject(i.project);setPanel(null);}}>Abrir</button><button title="Excluir da biblioteca" onClick={() => {if(confirm(`Excluir ${i.name} da biblioteca local?`)) persist(library.filter(x => x.id !== i.id));}}>×</button></div></div>)}
          <p className="iron-panel-hint">A biblioteca usa o armazenamento deste navegador. Para transferência ou backup, exporte o JSON. Ainda não há sincronização de projetos com Supabase.</p>
        </div>}
        {panel === 'settings' && <div className="iron-panel-section">
          <h3>Área de trabalho</h3>
          <label className="iron-toggle"><input type="checkbox" checked={p.snapToGrid} onChange={e => p.onSnapChange(e.target.checked)} /> Grade magnética (20 px)</label>
          <label className="iron-toggle"><input type="checkbox" checked={p.gridVisible} onChange={e => p.onGridChange(e.target.checked)} /> Mostrar grade</label>
          <label>Visualização<select value={theme} onChange={e => {setTheme(e.target.value);localStorage.setItem('ironlab-theme',e.target.value);document.documentElement.dataset.ironTheme=e.target.value;}}><option value="dark">Escuro (padrão)</option><option value="contrast">Alto contraste</option></select></label>
          <h3>Comunicação HTTP</h3><label>IP do Hub<input value={p.hubIp} onChange={e => p.onHubIpChange(e.target.value)} /></label><label>Porta<input inputMode="numeric" value={p.hubPort} onChange={e => p.onHubPortChange(e.target.value)} /></label>
          <p className="iron-panel-hint">As alterações de endereço passam a valer na próxima conexão. O navegador pode bloquear HTTP por políticas de segurança.</p>
          <h3>Alertas de bateria</h3><label>Aviso abaixo de (V)<input type="number" step="0.1" value={p.warning} onChange={e => p.onThresholdsChange(Number(e.target.value), p.critical)} /></label><label>Crítico abaixo de (V)<input type="number" step="0.1" value={p.critical} onChange={e => p.onThresholdsChange(p.warning, Number(e.target.value))} /></label>
          <p className="iron-panel-hint">Limiares operacionais configuráveis. Tensão instantânea não equivale a estado de carga.</p>
        </div>}
        {panel === 'help' && <div className="iron-panel-section">
          <h3>Referências REV / FTC</h3>
          <p>Portas de motor M0–M3; servos S0–S5; conexões de encoder, I²C, digital e analógico. Confira orientação, pinagem e tensão na documentação oficial antes de conectar componentes.</p>
          <a href="https://docs.revrobotics.com/duo-control/" target="_blank" rel="noreferrer">Documentação REV DUO ↗</a>
          <a href="https://docs.revrobotics.com/duo-control/control-system-overview/control-hub-basics" target="_blank" rel="noreferrer">Control Hub — documentação ↗</a>
          <h3>Atalhos</h3><p><strong>Ctrl+S</strong> (ou Cmd+S no macOS): salvar o projeto atual. <strong>Esc</strong>: fechar o painel lateral. Arraste para mover nós; use a roda do mouse para zoom; use os controles do mapa para ajustar a visualização.</p>
          <h3>Registro local de conexão</h3><pre className="iron-connection-log">{logs.join('\n') || 'Sem eventos nesta sessão.'}</pre>
          <button onClick={() => {const blob=new Blob([logs.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ironlab-connection-log.txt';a.click();URL.revokeObjectURL(url);}}>Exportar log</button>
          <p className="iron-panel-hint">O registro acima é local e temporário. Não substitui logs do Robot Controller.</p>
        </div>}
      </aside>
    </div>}
  </>;
}
