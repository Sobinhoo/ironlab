// Supabase Edge Function: deploy with JWT verification enabled.
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY as server-side secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Método não permitido'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL')!;
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer=request.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))return json({error:'Não autenticado'},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authError}=await caller.auth.getUser();
  if(authError||!user)return json({error:'Sessão inválida'},401);
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:actor,error:actorError}=await admin.from('profiles').select('role,active').eq('id',user.id).single();
  if(actorError||!actor?.active||!['owner','admin'].includes(actor.role))return json({error:'Sem permissão'},403);
  const body=await request.json();
  const email=String(body.email||'').trim().toLowerCase();
  const displayName=String(body.display_name||'').trim();
  const role=String(body.role||'member');
  if(!/^\S+@\S+\.\S+$/.test(email)||displayName.length<1||displayName.length>120||!['viewer','member','mentor','admin'].includes(role))return json({error:'Dados inválidos'},400);
  if(actor.role==='admin'&&role==='admin')return json({error:'Somente o proprietário pode convidar administradores'},403);
  // Create user with a temporary profile BEFORE sending the invite email.
  const {data:created,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:displayName}});
  if(inviteError||!created.user)return json({error:inviteError?.message||'Falha no convite'},400);
  const {error:profileError}=await admin.from('profiles').upsert({id:created.user.id,display_name:displayName,role,active:true},{onConflict:'id'});
  if(profileError)return json({error:`Usuário convidado, mas falhou a criação do perfil: ${profileError.message}`},500);
  await admin.from('audit_logs').insert({actor_id:user.id,target_id:created.user.id,action:'profile.invite',after_state:{role,display_name:displayName}});
  return json({ok:true});
 }catch(e){return json({error:e instanceof Error?e.message:'Erro interno'},500)}
});
