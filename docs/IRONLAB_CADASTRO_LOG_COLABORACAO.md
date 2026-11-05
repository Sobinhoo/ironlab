# IRONLab — cadastro com aprovação, importação FTC e colaboração

## Implantação no projeto Supabase existente

Não execute `supabase/schema.sql` novamente. Faça backup e revise a migração
[`supabase/migrations/20261105_iron_signup_approval_realtime.sql`](../supabase/migrations/20261105_iron_signup_approval_realtime.sql)
antes de executá-la **uma vez** no SQL Editor do projeto **existente**.

Ela:
- cria perfil `member` com `active=false` para novas contas;
- mantém aprovações/revogações na tabela `profiles`, com auditoria das mudanças;
- substitui a checagem de equipe na criação por `public.is_active()`;
- concede acesso de edição de projetos a integrantes ativos com papéis
  `admin`, `mentor`, `member`; `viewer` é só leitura;
- habilita publicação de `iron_projects` para eventos Postgres Changes;
- permite que administradores de equipe adicionem **contas aprovadas** por
  e-mail via RPC protegida;
- permite upserts de perfil exclusivamente pela Edge Function que utiliza
  chave `service_role` no servidor.

No Dashboard, ative **Authentication → Providers → Email → Allow new users
to sign up**, e mantenha a confirmação de e-mail habilitada. O sign-up pela
tela do aplicativo **não** libera acesso: perfil nasce inativo.

Se sua equipe usa a função `invite-member`, publique novamente a versão
modificada em `supabase/functions/invite-member/index.ts`. Nunca instale
a chave de serviço no frontend.

## Fluxo de uso

1. Novo integrante clica em **Solicitar acesso**, cadastra nome, e-mail e
   senha e confirma o e-mail, caso solicitado.
2. Proprietário/administrador global acessa **Gerenciar usuários e acessos**
   e clica **Aprovar / reativar** no perfil pendente.
3. Administrador da equipe abre **Projetos** e adiciona o e-mail aprovado à
   equipe, escolhendo `member`, `mentor`, `viewer` ou `admin` (criador).
4. Integrantes abrem o mesmo projeto compartilhado em computadores distintos.
   Atualizações de um participante aparecem via Realtime nos demais,
   quando não há alterações locais pendentes.
5. Projetos compartilhados abertos salvam após 1,2s de inatividade; o RPC
   `iron_save_project` compara a revisão anterior e grava histórico.
6. Se dois usuários alterarem a mesma revisão ao mesmo tempo, o IRONLab
   exibe **conflito**, preserva o trabalho local e oferece **exportar backup**
   antes de abrir a versão recente. Não faz merge CRDT estilo Google Docs.

A verificação administrativa de e-mail confirmado usa a RPC restrita
`iron_admin_list_accounts` após a migração. Usuários com e-mail não confirmado
não podem ser aprovados pelo frontend e a política do banco bloqueia a
ativação enquanto faltar confirmação. O Supabase exige configuração de SMTP
para envio confiável dos e-mails de cadastro.

O frontend verifica as listas de equipes a cada 15s e de projetos a cada
10s. A revisão ativa é verificada a cada 5s caso um evento Realtime seja
perdido durante mudança de rede. Salvamentos pendentes são tentados
novamente após falhas temporárias de conexão.

## Logs FTC

**IMPORTAR FTC (LOG/XML)** aceita:
- arquivos XML de configuração de robô FTC, raiz `<Robot>`;
- `robotControllerLog.txt` que inclua algum bloco XML completo;
- logs com prefixo de timestamp e tag de processo em cada linha XML.

Os logs FTC SDK que não contenham XML também podem ser importados **quando
incluem a tabela `Device Information`**. Esse formato revela nomes, módulos
e portas de motores/servos; não revela necessariamente modelo exato, todos os
dispositivos ou parâmetros não exibidos. Se nem XML nem a tabela estiverem
presentes, exporte o XML de configuração do Robot Controller.

O formato `Device Information` foi validado com um log real da IronHide.
Não use dados inferidos do log como substituto de confirmação física da
pinagem antes de energizar ou testar componentes.

## Validações indispensáveis antes de liberar a produção

- Primeiro: criar conta nova, confirmar perfil `active=false`, testar que
  a conta não abre o workspace, depois aprovar via administrador.
- Segundo: atribuir a conta a uma equipe e testar que uma conta não
  pertencente à equipe recebe RLS 403/sem dados.
- Terceiro: abrir o mesmo projeto em duas instalações, editar no PC A e
  verificar atualização no PC B, com status Realtime ativo.
- Quarto: editar em ambos antes de sincronizar; verificar que o conflito
  não descarta dados e que exportar backup funciona.
- Quinto: enviar um `robotControllerLog.txt` com XML e um arquivo
  `.xml` individual, verificando a associação dos motores ao módulo.

O modo offline local oferece tolerância de até 24 horas após uma verificação
válida. Não libera acesso aos projetos da nuvem nem administração. Por depender
de cache local, é inadequado em computadores não confiáveis ou compartilhados
sem proteção do sistema operacional; a RLS continua sendo a autorização do
Supabase para todas as operações remotas.

A build aprovada em CI comprova sintaxe e compilação; não substitui os
testes de regras RLS no Supabase de produção ou de uso em duas máquinas.
