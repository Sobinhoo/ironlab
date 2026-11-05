import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SavedProject } from '../utils/projectStorage';
import {
  addCloudMember, listCloudMembers, type CloudMember, createCloudProject, createCloudTeam, getCloudProject, listCloudProjects,
  listCloudTeams, updateCloudProject, type CloudProject, type CloudTeam,
} from '../services/cloudProjects';
import './CloudProjects.css';

type Props = { snapshot: SavedProject; onOpenProject: (project: SavedProject) => void };
type Session = { access_token: string; expires_at: number; user: { id: string } };
const sessionKey = 'ironlab.auth.session.v1';

/** updatedAt changes on every render; it is not an edit to the shared document. */
function fingerprint(document: SavedProject): string {
  return JSON.stringify({
    ...document,
    robot: { ...document.robot, updatedAt: null },
  });
}

export default function CloudProjects({ snapshot, onOpenProject }: Props) {
  const [teams, setTeams] = useState<CloudTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [members, setMembers] = useState<CloudMember[]>([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<CloudMember['role']>('member');
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [current, setCurrent] = useState<CloudProject | null>(null);
  const [conflict, setConflict] = useState<CloudProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const signature = fingerprint(snapshot);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const onOpenRef = useRef(onOpenProject);
  onOpenRef.current = onOpenProject;
  const currentRef = useRef(current);
  currentRef.current = current;
  const savingRef = useRef(false);
  const baselineRef = useRef<string | null>(null);
  const awaitingOpenRef = useRef<string | null>(null);

  const credentials = useCallback(() => {
    if (!url || !anonKey) throw new Error('Supabase não configurado.');
    let session: Session | null = null;
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null') as Session | null; }
    catch { /* invalid session */ }
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

  const refreshProjects = useCallback(async () => {
    if (!teamId) { setProjects([]); return; }
    const { auth } = credentials();
    setProjects(await listCloudProjects(auth, teamId));
  }, [credentials, teamId]);

  useEffect(() => { void refreshTeams().catch(e => setError(String(e))); }, [refreshTeams]);
  useEffect(() => { void refreshProjects().catch(e => setError(String(e))); }, [refreshProjects]);
  const refreshMembers = useCallback(async () => {
    if (!teamId) { setMembers([]); return; }
    const { auth } = credentials();
    setMembers(await listCloudMembers(auth, teamId));
  }, [credentials, teamId]);
  useEffect(() => { void refreshMembers().catch(e => setError(String(e))); }, [refreshMembers]);

  let userId = '';
  try { userId = credentials().userId; } catch { /* not authenticated */ }
  const teamCreator = teams.find(t => t.id === teamId)?.created_by === userId;
  const myTeamRole = members.find(m => m.user_id === userId)?.role;
  const canManageMembers = teamCreator || myTeamRole === 'admin';
  const canWrite = teamCreator || myTeamRole === 'admin' ||
    myTeamRole === 'mentor' || myTeamRole === 'member';


  const openShared = useCallback((project: CloudProject) => {
    awaitingOpenRef.current = fingerprint(project.document);
    baselineRef.current = awaitingOpenRef.current;
    setConflict(null);
    setCurrent(project);
    currentRef.current = project;
    onOpenRef.current(project.document);
  }, []);

  const reconcileRemote = useCallback(async () => {
    const opened = currentRef.current;
    if (!opened || savingRef.current) return;
    const { auth } = credentials();
    const remote = await getCloudProject(auth, opened.id);
    if (!remote || remote.revision <= opened.revision) return;
    if (signatureRef.current !== baselineRef.current) {
      setConflict(remote);
      setNotice('Outra pessoa alterou o projeto. Há mudanças locais pendentes.');
      return;
    }
    openShared(remote);
    setNotice('Atualizado automaticamente da revisão ' + remote.revision + '.');
    void refreshProjects().catch(() => {});
  }, [credentials, openShared, refreshProjects]);

  // Subscriptions receive only rows allowed by the projects SELECT RLS policy.
  // Polling is also used to recover missed events during Wi-Fi changes/reconnects.
  useEffect(() => {
    if (!current?.id || !url || !anonKey) { setOnline(false); return; }
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | undefined;
    let supabase: ReturnType<typeof createClient> | undefined;
    try {
      const { auth } = credentials();
      supabase = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      void supabase.realtime.setAuth(auth.accessToken);
      channel = supabase.channel('iron-project-' + current.id);
      channel.on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'iron_projects',
        filter: 'id=eq.' + current.id,
      }, () => { if (!cancelled) void reconcileRemote().catch(e => setError(String(e))); });
      channel.subscribe(status => { if (!cancelled) setOnline(status === 'SUBSCRIBED'); });
    } catch (e) { setError(String(e)); }
    const poll = window.setInterval(() => {
      if (!cancelled) void reconcileRemote().catch(e => setError(String(e)));
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      setOnline(false);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [current?.id, url, anonKey, credentials, reconcileRemote]);

  // Do not auto-save until opening a remote project has reached the local editor.
  // Atomic RPC rejects simultaneous writes against an older revision.
  useEffect(() => {
    if (!current || conflict || !canWrite) return;
    if (awaitingOpenRef.current) {
      if (signature === awaitingOpenRef.current) awaitingOpenRef.current = null;
      return;
    }
    if (!baselineRef.current || signature === baselineRef.current || savingRef.current) return;
    const timer = window.setTimeout(async () => {
      if (savingRef.current || awaitingOpenRef.current || conflict) return;
      const opened = currentRef.current;
      if (!opened) return;
      const captured = snapshotRef.current;
      const capturedFingerprint = fingerprint(captured);
      if (capturedFingerprint === baselineRef.current) return;
      savingRef.current = true;
      setSyncing(true);
      try {
        const { auth, userId } = credentials();
        const saved = await updateCloudProject(auth, opened, captured, userId);
        baselineRef.current = capturedFingerprint;
        currentRef.current = saved;
        setCurrent(saved);
        setNotice('Revisão ' + saved.revision + ' sincronizada.');
        setError('');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        if (/Revision conflict|40001|409|conflito/i.test(message)) {
          const openedAgain = currentRef.current;
          if (openedAgain) {
            try {
              const { auth } = credentials();
              setConflict(await getCloudProject(auth, openedAgain.id));
            } catch { /* keep local changes */ }
          }
        }
      } finally {
        savingRef.current = false;
        setSyncing(false);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [signature, current?.id, current?.revision, conflict, credentials, canWrite]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function backupLocal() {
    const json = JSON.stringify(snapshotRef.current, null, 2);
    const file = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    const href = URL.createObjectURL(file);
    a.href = href; a.download = 'ironlab-unsynced-backup.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return <section className="iron-cloud" aria-label="Projetos compartilhados">
    <h3>Projetos compartilhados</h3>
    <p>Salvamento automático de revisões após abrir um projeto compartilhado. Sincronização com controle de conflitos.</p>
    {error && <p className="iron-cloud-error" role="alert">{error}</p>}
    {notice && <p className="iron-cloud-notice" role="status">{notice}</p>}
    {current && <p role="status">{online ? 'Canal em tempo real ativo' : 'Reconectando; verificando alterações a cada 5 segundos'} · {syncing ? 'Salvando...' : 'Pronto'}</p>}
    {conflict && <div className="iron-cloud-current" role="alert">
      <strong>Conflito de edição — revisão {conflict.revision}</strong>
      <p>Não sobrescrevemos mudanças simultâneas. Exporte seu trabalho antes de recarregar a versão da equipe.</p>
      <button onClick={backupLocal}>Exportar alterações locais</button>
      <button onClick={() => openShared(conflict)}>Abrir versão mais recente</button>
    </div>}
    <label>Equipe<select value={teamId} disabled={busy} onChange={e => {
      setTeamId(e.target.value); setCurrent(null); currentRef.current = null;
      baselineRef.current = null; awaitingOpenRef.current = null; setConflict(null);
    }}>
      <option value="">Selecione uma equipe</option>
      {teams.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}
    </select></label>
    {teamId && <>
      <h4>Integrantes da equipe ({members.length})</h4>
      <div className="iron-cloud-list">
        {members.map(m => <div className="iron-cloud-item" key={m.user_id}>
          <strong>{m.display_name}</strong><small>{m.role === 'viewer' ? 'Leitura' : m.role}</small>
        </div>)}
      </div>
      {canManageMembers && <div className="iron-cloud-actions">
        <input aria-label="E-mail de integrante aprovado" type="email" placeholder="E-mail da conta aprovada"
          value={memberEmail} onChange={e => setMemberEmail(e.target.value)} />
        <select aria-label="Papel na equipe" value={memberRole}
          onChange={e => setMemberRole(e.target.value as CloudMember['role'])}>
          <option value="member">Integrante (edita)</option>
          <option value="mentor">Mentor (edita)</option>
          <option value="viewer">Leitor</option>
          {teamCreator && <option value="admin">Administrador da equipe</option>}
        </select>
        <button disabled={busy || !memberEmail.includes('@')} onClick={() => void run(async () => {
          const {auth}=credentials();
          await addCloudMember(auth,teamId,memberEmail,memberRole);
          setMemberEmail(''); await refreshMembers();
          setNotice('Integrante autorizado a acessar os projetos da equipe.');
        })}>Adicionar integrante</button>
      </div>}
    </>}
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
      <button disabled={busy || !canWrite} onClick={() => void run(async () => {
        const { auth, userId } = credentials();
        const created = await createCloudProject(auth, teamId, snapshotRef.current, userId);
        if (created[0]) {
          baselineRef.current = fingerprint(snapshotRef.current);
          awaitingOpenRef.current = null;
          currentRef.current = created[0];
          setCurrent(created[0]);
        }
        await refreshProjects();
        setNotice('Projeto criado e vinculado. Sincronização automática ativa.');
      })}>Enviar projeto atual como novo</button>
    </div>}
    {current && <div className="iron-cloud-current">
      {!canWrite && <p>Seu acesso é somente leitura; alterações locais não serão enviadas à equipe.</p>}
      <strong>Projeto ativo: {current.name}</strong><small>Revisão {current.revision}</small>
      <button disabled={busy || syncing || Boolean(conflict) || !canWrite} onClick={() => void run(async () => {
        const opened = currentRef.current;
        if (!opened) return;
        const { auth, userId } = credentials();
        const captured = snapshotRef.current;
        const updated = await updateCloudProject(auth, opened, captured, userId);
        baselineRef.current = fingerprint(captured);
        currentRef.current = updated; setCurrent(updated); await refreshProjects();
        setNotice('Revisão ' + updated.revision + ' salva.');
      })}>Salvar revisão agora</button>
      <button onClick={() => {
        setCurrent(null); currentRef.current = null; baselineRef.current = null;
        awaitingOpenRef.current = null; setConflict(null);
      }}>Desvincular</button>
    </div>}
    <div className="iron-cloud-list">{projects.map(project => <div className="iron-cloud-item" key={project.id}>
      <div><strong>{project.name}</strong><small>Rev. {project.revision} · {new Date(project.updated_at).toLocaleString()}</small></div>
      <button disabled={busy} onClick={() => {
        if (!window.confirm('Abrir projeto compartilhado? Salve ou exporte alterações locais antes de continuar.')) return;
        openShared(project);
        setNotice('Projeto aberto; sincronização automática ativa.');
      }}>Abrir</button>
    </div>)}
    {teamId && !projects.length && <p>Nenhum projeto nesta equipe.</p>}</div>
    <p className="iron-cloud-footnote">Edições simultâneas são sincronizadas por revisão, não por caractere. Em conflito, o IRONLab preserva suas alterações locais para exportação.</p>
  </section>;
}
