import { useCallback, useEffect, useState } from 'react';
import type { SavedProject } from '../utils/projectStorage';
import { createCloudProject, createCloudTeam, listCloudProjects, listCloudTeams, updateCloudProject, type CloudProject, type CloudTeam } from '../services/cloudProjects';
import './CloudProjects.css';

type Props = { snapshot: SavedProject; onOpenProject: (project: SavedProject) => void };
type Session = { access_token: string; expires_at: number; user: { id: string } };
const sessionKey = 'ironlab.auth.session.v1';

export default function CloudProjects({ snapshot, onOpenProject }: Props) {
  const [teams, setTeams] = useState<CloudTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [current, setCurrent] = useState<CloudProject | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const credentials = useCallback(() => {
    if (!url || !anonKey) throw new Error('Supabase não configurado.');
    let session: Session | null = null;
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null') as Session | null; } catch { /* no session */ }
    if (!session?.access_token || !session.user?.id || session.expires_at <= Date.now() / 1000 + 30)
      throw new Error('Sessão ausente ou expirada. Entre novamente para sincronizar.');
    return { auth: { endpoint: url, anonKey, accessToken: session.access_token }, userId: session.user.id };
  }, [url, anonKey]);

  const refreshTeams = useCallback(async () => {
    const { auth } = credentials();
    const result = await listCloudTeams(auth);
    setTeams(result);
    setTeamId(old => result.some(t => t.id === old) ? old : result[0]?.id || '');
  }, [credentials]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await refreshTeams(); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { cancelled = true; };
  }, [refreshTeams]);

  const refreshProjects = useCallback(async () => {
    if (!teamId) { setProjects([]); return; }
    const { auth } = credentials();
    setProjects(await listCloudProjects(auth, teamId));
  }, [credentials, teamId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!teamId) { setProjects([]); return; }
        const { auth } = credentials();
        const result = await listCloudProjects(auth, teamId);
        if (!cancelled) setProjects(result);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { cancelled = true; };
  }, [credentials, teamId]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice(''); setConflict(false);
    try { await action(); } catch (e) { const message = e instanceof Error ? e.message : String(e); setError(message); setConflict(/Revision conflict|40001|409|conflito/i.test(message)); }
    finally { setBusy(false); }
  }

  return <section className="iron-cloud" aria-label="Projetos compartilhados">
    <h3>Projetos compartilhados</h3>
    <p>Sincronização manual. Salvar localmente não envia alterações à nuvem.</p>
    {error && <p className="iron-cloud-error" role="alert">{error}</p>}
    {notice && <p className="iron-cloud-notice" role="status">{notice}</p>}
    {conflict && <div className="iron-cloud-current" role="alert"><strong>Outra pessoa salvou uma versão mais recente.</strong><p>Exporte o seu projeto como JSON antes de abrir a versão atualizada. O IRONLab não mescla alterações automaticamente.</p><button disabled={busy} onClick={() => void run(refreshProjects)}>Atualizar projetos</button></div>}
    <label>Equipe
      <select value={teamId} disabled={busy} onChange={e => { setTeamId(e.target.value); setCurrent(null); }}>
        <option value="">Selecione uma equipe</option>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
    </label>
    <div className="iron-cloud-actions">
      <button disabled={busy} onClick={() => void run(async () => {
        const name = window.prompt('Nome da nova equipe:')?.trim();
        if (!name) return;
        const { auth, userId } = credentials();
        const created = await createCloudTeam(auth, name, userId);
        await refreshTeams();
        if (created[0]) setTeamId(created[0].id);
        setNotice('Equipe criada.');
      })}>Nova equipe</button>
      <button disabled={busy || !teamId} onClick={() => void run(refreshProjects)}>Atualizar lista</button>
    </div>
    {teamId && <div className="iron-cloud-actions">
      <button disabled={busy} onClick={() => void run(async () => {
        const { auth, userId } = credentials();
        const created = await createCloudProject(auth, teamId, snapshot, userId);
        setCurrent(created[0] || null);
        await refreshProjects();
        setNotice('Cópia do projeto atual criada na nuvem.');
      })}>Enviar projeto atual como novo</button>
    </div>}
    {current && <div className="iron-cloud-current">
      <strong>Vinculado: {current.name}</strong><small>Revisão {current.revision}</small>
      <button disabled={busy} onClick={() => void run(async () => {
        const { auth, userId } = credentials();
        const updated = await updateCloudProject(auth, current, snapshot, userId);
        setCurrent(updated);
        await refreshProjects();
        setNotice('Revisão ' + updated.revision + ' salva na nuvem.');
      })}>Salvar revisão na nuvem</button>
      <button disabled={busy} onClick={() => setCurrent(null)}>Desvincular</button>
    </div>}
    <div className="iron-cloud-list">
      {projects.map(project => <div className="iron-cloud-item" key={project.id}>
        <div><strong>{project.name}</strong><small>Rev. {project.revision} · {new Date(project.updated_at).toLocaleString()}</small></div>
        <button disabled={busy} onClick={() => {
          if (!window.confirm('Abrir este projeto? Alterações locais não salvas podem ser perdidas.')) return;
          onOpenProject(project.document);
          setCurrent(project);
          setNotice('Projeto carregado. Alterações permanecem locais até salvar uma revisão na nuvem.');
        }}>Abrir</button>
      </div>)}
      {teamId && projects.length === 0 && <p>Nenhum projeto compartilhado nesta equipe.</p>}
    </div>
    <p className="iron-cloud-footnote">Em caso de conflito de revisão, atualize a lista e abra a versão mais recente antes de tentar novamente. Exporte um backup local antes de descartar alterações.</p>
  </section>;
}
