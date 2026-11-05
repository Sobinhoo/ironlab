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

O frontend verifica as listas de equipes a cada 15s e de projetos a cada
10s. A revisão ativa é verificada a cada 5s caso um evento Realtime seja
perdido durante mudança de rede. Salvamentos pendentes são tentados
novamente após falhas temporárias de conexão.

## Logs FTC

**IMPORTAR FTC (LOG/XML)** aceita:
- arquivos XML de configuração de robô FTC, raiz `<Robot>`;
- `robotControllerLog.txt` que inclua algum bloco XML completo;
- logs com prefixo de timestamp e tag de processo em cada linha XML.

Se o log não contém um bloco `<Robot>...</Robot>`, a configuração **não
pode ser reconstruída somente pelo log**. Exporte o XML da configuração
pelo Robot Controller / Driver Station. A telemetria HTTP pode preencher
o mapa visual em separado, mas não equivale à configuração exportada.

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

A build aprovada em CI comprova sintaxe e compilação; não substitui os
testes de regras RLS no Supabase de produção ou de uso em duas máquinas.
