# IRONLab v0.28.2 — Login e administração (React + Supabase)

## O que mudou
- `src/main.tsx` agora monta `AuthGate` ANTES do mapa: sem sessão ativa, o mapa não abre.
- `src/auth/AuthGate.tsx` implementa login, renovação de sessão, validação do usuário no Supabase, consulta do perfil, logout, recuperação de senha, administração de perfis e formulário de convite.
- `src/auth/auth.css` contém a interface preto/verde.
- `supabase/grants.sql` corrige os GRANTs para projetos que desativaram exposição automática de tabelas.
- `supabase/functions/invite-member/index.ts` é o backend de convite, separado do React.

## Para o seu projeto Supabase existente
1. **Não execute `schema.sql` novamente**. Ele já foi aplicado e seu perfil `owner` já existe.
2. SQL Editor: execute o conteúdo de `supabase/grants.sql` uma vez.
3. Authentication > Providers > Email: desative a opção de cadastro público (*Allow new users to sign up*), mantendo login por e-mail.
4. Confirme que `.env` na raiz contém `VITE_SUPABASE_URL=https://...supabase.co` e `VITE_SUPABASE_ANON_KEY=...` com **chave publishable ou anon pública**, nunca uma chave secreta. O ZIP distribuído inclui apenas `.env.example`, NÃO o `.env` real.
5. No StackBlitz: `npm install` e `npm run dev`. Reinicie o Vite após alterar `.env`.
6. Faça login com a conta criada em Authentication > Users. Deve aparecer o mapa e a barra de usuário `Proprietário`.
7. Clique em **Administração** para ver os usuários. Teste logout e login.

## Convites (etapa adicional)
Para ativar o botão "Convidar":
1. Publique a função `invite-member` com o código em `supabase/functions/invite-member/index.ts` (via Supabase CLI ou painel Edge Functions).
2. Mantenha a verificação JWT da função habilitada, quando compatível com a chave JWT do projeto.
3. Garanta que `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sejam **segredos do ambiente da função**, nunca variáveis `VITE_` nem arquivos enviados ao frontend.
4. Configure as URLs de redirecionamento e os modelos de e-mail em Authentication > URL Configuration e Email Templates.
5. Teste um convite para um e-mail diferente antes de usar com alunos.

**Limitação:** o fluxo de convite depende da função Edge publicada e dos modelos/URLs de confirmação configurados no Supabase. A tela React por si só não envia convites sem esse backend.

## Segurança e limites atuais
- A API REST é protegida por JWT e RLS. A verificação de papel não depende apenas de ocultar botões.
- O perfil `owner` é protegido pelo trigger original; outros perfis são administrados via RLS/trigger.
- O aplicativo exige rede para validar uma sessão. O modo offline e a sincronização serão implementados em fase posterior.
- Não há ainda vínculo de ocorrências/manutenções com usuários: esta entrega é a **etapa de login e gestão de contas**.
- O código do app e a lógica de telemetria não foram alterados, além de envolver o App com AuthGate.
- Se aparecer `permission denied for table profiles`, execute `supabase/grants.sql`.
- Se o convite retornar 404, a função Edge ainda não foi publicada.
