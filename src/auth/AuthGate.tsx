import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import './auth.css';

type Role = 'owner' | 'admin' | 'mentor' | 'member' | 'viewer';
type Profile = { id: string; display_name: string; role: Role; active: boolean };
type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } };
const endpoint = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const storageKey = 'ironlab.auth.session.v1';
const roleLabels: Record<Role,string> = {owner:'Proprietário',admin:'Administrador',mentor:'Mentor',member:'Integrante',viewer:'Leitor'};
function readSession(): Session | null { try { return JSON.parse(localStorage.getItem(storageKey) || 'null') as Session | null; } catch { return null; } }
function authHeaders(token?: string): Record<string,string> { return {'apikey':publicKey || '', 'Authorization':`Bearer ${token || publicKey || ''}`, 'Content-Type':'application/json'}; }
async function rest<T>(path:string, token:string, init:RequestInit={}):Promise<T> {
  const response=await fetch(`${endpoint}/rest/v1/${path}`, {...init,headers:{...authHeaders(token),...init.headers}});
  const raw=await response.text();
  if(!response.ok) throw new Error(`Banco de dados: ${response.status} — ${raw.slice(0,300)}`);
  return raw ? JSON.parse(raw) as T : [] as T;
}
function errorMessage(e:unknown):string { return e instanceof Error ? e.message : 'Ocorreu um erro inesperado.'; }
export default function AuthGate({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(readSession);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(Boolean(readSession()));
  const [error,setError]=useState('');
  const [email,setEmail]=useState('');
  const [signup,setSignup]=useState(false);
  const [signupName,setSignupName]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [adminOpen,setAdminOpen]=useState(false);
  const [users,setUsers]=useState<Profile[]>([]);
  const [inviteName,setInviteName]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteRole,setInviteRole]=useState<Role>('member');
  const [notice,setNotice]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [recovery,setRecovery]=useState(false);
  const [recoveryEmail,setRecoveryEmail]=useState('');

  const signOut=useCallback(()=>{localStorage.removeItem(storageKey);setSession(null);setProfile(null);setAdminOpen(false);setError('');},[]);
  useEffect(()=>{
    if(!session || !endpoint || !publicKey) {setLoading(false);return;}
    let cancelled=false;
    (async()=>{
      setLoading(true);
      try {
        let current=session;
        if(current.expires_at < Date.now()/1000+120) {
          const response=await fetch(`${endpoint}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:authHeaders(),body:JSON.stringify({refresh_token:current.refresh_token})});
          const data=await response.json();
          if(!response.ok) throw new Error('Sua sessão expirou. Entre novamente.');
          current={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Math.floor(Date.now()/1000)+data.expires_in,user:data.user};
          localStorage.setItem(storageKey,JSON.stringify(current));
          if(!cancelled) setSession(current);
        }
        const response=await fetch(`${endpoint}/auth/v1/user`,{headers:authHeaders(current.access_token)});
        if(!response.ok) throw new Error('Sessão inválida. Entre novamente.');
        const verified=await response.json();
        if(verified.id!==current.user.id) throw new Error('Identidade da sessão não corresponde.');
        const rows=await rest<Profile[]>(`profiles?select=id,display_name,role,active&id=eq.${encodeURIComponent(verified.id)}`,current.access_token);
        if(!cancelled){setProfile(rows[0]||null);setError(rows[0]?'':'Não existe um perfil autorizado para esta conta.');}
      } catch(e){if(!cancelled){signOut();setError(errorMessage(e));}}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[session?.access_token,signOut]);

  // A suspended account must lose workspace access even if its JWT is still valid.
  // A temporary network outage does not itself revoke a locally opened session.
  useEffect(() => {
    if (!session || !endpoint || !publicKey) return;
    let disposed = false;
    const timer = window.setInterval(async () => {
      try {
        const current = readSession();
        if (!current || current.access_token !== session.access_token) return;
        const rows = await rest<Profile[]>(
          `profiles?select=id,display_name,role,active&id=eq.${encodeURIComponent(session.user.id)}`,
          current.access_token
        );
        if (disposed) return;
        setProfile(rows[0] ?? null);
        if (!rows.length) setError('A conta não possui perfil autorizado.');
        else if (!rows[0].active) setError('Acesso suspenso ou ainda não aprovado.');
      } catch { /* Network outage: retry; server RLS still protects cloud operations. */ }
    }, 30000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [session?.access_token, session?.user.id]);

  // Sessions must stay valid while the notebook uses USB tethering and Wi-Fi
  // for the Control Hub. Refresh ahead of token expiration, not only at startup.
  useEffect(() => {
    if (!session || !endpoint || !publicKey) return;
    let busyRefreshing = false;
    const timer = window.setInterval(async () => {
      const current = readSession();
      if (!current || current.access_token !== session.access_token ||
          current.expires_at > Date.now() / 1000 + 180 || busyRefreshing) return;
      busyRefreshing = true;
      try {
        const response = await fetch(`${endpoint}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ refresh_token: current.refresh_token })
        });
        if (!response.ok) return; // Network interruption: retry when internet returns.
        const data = await response.json();
        const updated: Session = {
          access_token: data.access_token, refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
          user: data.user
        };
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setSession(updated);
      } catch { /* retry on next interval */ }
      finally { busyRefreshing = false; }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [session?.access_token]);

  async function resendConfirmation() {
    if (!email.trim() || !email.includes('@')) {
      setError('Digite o e-mail da conta antes de reenviar a confirmação.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`${endpoint}/auth/v1/resend`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: 'signup', email: email.trim().toLowerCase() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = String(result.message || result.msg || result.error_description || '');
        if (response.status === 429 || /rate limit/i.test(message)) {
          throw new Error('Limite de e-mails do Supabase atingido. Tente novamente mais tarde ou peça ao administrador para configurar SMTP.');
        }
        throw new Error(message || 'Falha ao reenviar a confirmação.');
      }
      setNotice('Se o cadastro estiver pendente, será enviada uma nova mensagem de confirmação.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function login(e:FormEvent){e.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch(`${endpoint}/auth/v1/token?grant_type=password`,{method:'POST',headers:authHeaders(),body:JSON.stringify({email:email.trim(),password})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error_description||data.msg||data.message||'Não foi possível autenticar.');
      const next:Session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Math.floor(Date.now()/1000)+data.expires_in,user:data.user};
      localStorage.setItem(storageKey,JSON.stringify(next));setSession(next);setProfile(null);setPassword('');
    }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function register(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const displayName = signupName.trim();
      if (displayName.length < 1 || displayName.length > 120 || password.length < 8)
        throw new Error('Informe um nome válido e senha de pelo menos 8 caracteres.');
      const response = await fetch(`${endpoint}/auth/v1/signup`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          email: email.trim().toLowerCase(), password,
          data: { display_name: displayName }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Cadastro indisponível.');
      // Never grant access on the basis of the sign-up response. Profiles start inactive.
      setPassword(''); setSignup(false);
      setNotice('Solicitação recebida. Confirme seu e-mail, se solicitado, e aguarde a aprovação do administrador.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function loadUsers(){if(!session)return;setError('');try{const rows=await rest<Profile[]>('profiles?select=id,display_name,role,active&order=display_name',session.access_token);setUsers(rows);setAdminOpen(true);}catch(e){setError(errorMessage(e));}}
  async function updateUser(user:Profile,patch:Partial<Profile>){if(!session)return;setBusy(true);setError('');
    try{await rest(`profiles?id=eq.${encodeURIComponent(user.id)}`,session.access_token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});await loadUsers();}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function invite(e:FormEvent){e.preventDefault();if(!session)return;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`${endpoint}/functions/v1/invite-member`,{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({email:inviteEmail.trim(),display_name:inviteName.trim(),role:inviteRole})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||`Convite indisponível (HTTP ${response.status}). Publique a função invite-member.`);
      setNotice('Convite enviado. O usuário receberá um e-mail para definir o acesso.');setInviteEmail('');setInviteName('');await loadUsers();
    }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function resetPassword(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');
    try{const response=await fetch(`${endpoint}/auth/v1/recover`,{method:'POST',headers:authHeaders(),body:JSON.stringify({email:recoveryEmail.trim()})});if(!response.ok)throw new Error('Não foi possível solicitar a recuperação.');setNotice('Se o e-mail estiver cadastrado, você receberá instruções para recuperar o acesso.');}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function changePassword(e:FormEvent){e.preventDefault();if(!session)return;setBusy(true);setError('');
    try{const response=await fetch(`${endpoint}/auth/v1/user`,{method:'PUT',headers:authHeaders(session.access_token),body:JSON.stringify({password:newPassword})});if(!response.ok)throw new Error('Não foi possível atualizar a senha.');setNewPassword('');setNotice('Senha atualizada.');}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  if(!endpoint||!publicKey)return <main className="iron-login"><section className="iron-login-card"><img className="iron-login-logo" src="/branding/ironlab-logo.png" alt="IRONLab — MCI Lab" /><p>Configuração pendente.</p><p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code> e reinicie o Vite.</p><small>O mapa está protegido até a autenticação ser configurada.</small></section></main>;
  if(loading)return <main className="iron-login"><section className="iron-login-card"><img className="iron-login-logo" src="/branding/ironlab-logo.png" alt="IRONLab — MCI Lab" /><p>Verificando sessão e permissões…</p></section></main>;
  if(session && profile && !profile.active)
    return <main className="iron-login"><section className="iron-login-card" role="status">
      <img className="iron-login-logo" src="/branding/ironlab-logo.png" alt="IRONLab"/>
      <h2>Aguardando aprovação</h2>
      <p>Seu cadastro foi recebido. Apenas um administrador pode habilitar seu acesso ao IRONLab.</p>
      <p>Após a aprovação, entre novamente para validar as permissões.</p>
      <button type="button" onClick={signOut}>Sair / verificar novamente</button>
    </section></main>;
  if(!session||!profile?.active)return <main className="iron-login"><form className="iron-login-card" onSubmit={recovery?resetPassword:signup?register:login}><div className="iron-brand"><img className="iron-login-logo" src="/branding/ironlab-logo.png" alt="IRONLab — MCI Lab" /><small>ENGINEERING WORKSPACE</small></div><h2>{recovery?'Recuperar acesso':signup?'Solicitar cadastro':'Acesso à plataforma'}</h2>{signup&&<label>Nome completo<input required minLength={1} maxLength={120} value={signupName} onChange={e=>setSignupName(e.target.value)}/></label>}<label>E-mail<input type="email" required autoComplete="username" value={recovery?recoveryEmail:email} onChange={e=>recovery?setRecoveryEmail(e.target.value):setEmail(e.target.value)}/></label>{!recovery&&<label>Senha<input type="password" required minLength={signup?8:undefined} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>}{error&&<p className="iron-error" role="alert">{error}</p>}{notice&&<p className="iron-notice">{notice}</p>}<button type="submit" disabled={busy}>{busy?'Aguarde…':recovery?'Enviar recuperação':signup?'Solicitar aprovação':'Entrar no IRONLab'}</button><button type="button" className="iron-link" onClick={()=>{setRecovery(!recovery);setSignup(false);setError('');setNotice('');}}>{recovery?'Voltar ao login':'Esqueci minha senha'}</button><button type="button" className="iron-link" onClick={()=>{setSignup(!signup);setRecovery(false);setError('');setNotice('');}}>{signup?'Já tenho uma conta':'Solicitar acesso'}</button>{!recovery&&<button type="button" className="iron-link" disabled={busy} onClick={()=>void resendConfirmation()}>Reenviar confirmação de e-mail</button>}<p className="iron-hint">Acesso exclusivo a integrantes autorizados.</p>{session&&<button type="button" className="iron-link" onClick={signOut}>Trocar de conta</button>}</form></main>;
  return <><details className="iron-account-menu"><summary aria-label="Abrir menu da conta"><span className="iron-account-avatar" aria-hidden="true">{profile.display_name.trim().slice(0,1).toUpperCase()}</span><span className="iron-account-name">{profile.display_name}</span><span className="iron-account-chevron" aria-hidden="true">⌄</span></summary><div className="iron-account-dropdown"><div className="iron-account-info"><span className="iron-account-avatar iron-account-avatar-large" aria-hidden="true">{profile.display_name.trim().slice(0,1).toUpperCase()}</span><div><strong>{profile.display_name}</strong><small>{roleLabels[profile.role]}</small><small className="iron-account-email">{session.user.email}</small></div></div>{(['owner','admin'] as Role[]).includes(profile.role)&&<button type="button" onClick={()=>void loadUsers()}>Gerenciar usuários e acessos</button>}<button type="button" onClick={signOut}>Sair da conta</button></div></details>{children}{adminOpen&&<div className="iron-overlay" role="presentation"><section className="iron-admin" role="dialog" aria-modal="true" aria-label="Administração de usuários"><header><div><small>IRONLAB / ACESSO</small><h2>Gestão de usuários</h2><p>Permissões, convites e suspensão de contas</p></div><button onClick={()=>{setAdminOpen(false);setError('');}}>Fechar</button></header>{error&&<p className="iron-error" role="alert">{error}</p>}{notice&&<p className="iron-notice">{notice}</p>}<div className="iron-admin-section-heading"><div><h3>Integrantes</h3><p>{users.length} conta(s) cadastrada(s) · {users.filter(u=>u.active).length} ativa(s)</p></div></div><div className="iron-users">{users.map(u=><div className="iron-user-row" key={u.id}><div><strong>{u.display_name}</strong><small>{u.active?'Ativo':'Suspenso'} · {u.id.slice(0,8)}</small></div><select aria-label={`Função de ${u.display_name}`} value={u.role} disabled={busy||u.role==='owner'||u.id===session.user.id} onChange={e=>void updateUser(u,{role:e.target.value as Role})}>{Object.entries(roleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button disabled={busy||u.role==='owner'||u.id===session.user.id} onClick={()=>void updateUser(u,{active:!u.active})}>{u.active?'Suspender': 'Aprovar / reativar'}</button></div>)}</div><h3 className="iron-admin-section-title">Convidar integrante</h3><form className="iron-invite" onSubmit={invite}><input required placeholder="Nome do integrante" value={inviteName} onChange={e=>setInviteName(e.target.value)}/><input required type="email" placeholder="E-mail institucional ou pessoal" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as Role)}>{(['viewer','member','mentor','admin'] as Role[]).map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select><button disabled={busy}>Convidar</button></form><h3 className="iron-admin-section-title">Segurança da minha conta</h3><form className="iron-password" onSubmit={changePassword}><input type="password" minLength={8} required placeholder="Nova senha (mínimo 8 caracteres)" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button disabled={busy}>Alterar senha</button></form></section></div>}</>;
}
