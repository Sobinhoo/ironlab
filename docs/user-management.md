# Gestão de integrantes — IRONLab

## Publicação

1. Revise e aplique as migrações SQL existentes ao banco Supabase.
2. Publique a Edge Function com `supabase functions deploy delete-member` (JWT verification **enabled**).
3. Configure os segredos `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente da função. Nunca exponha a service role em variáveis `VITE_*` nem no desktop.
4. No aplicativo, entre como owner/admin e abra **Gerenciar usuários e acessos**. A ação **Excluir** exige confirmação digitando o nome do integrante.

## Garantias e limitações

- A Edge Function valida o JWT com Auth, consulta o perfil ativo do solicitante e rejeita autoexclusão e exclusão do proprietário.
- A exclusão é permanente e pode afetar registros vinculados por CASCADE. Faça backup e teste em ambiente de homologação.
- O banco continua sendo a autoridade: a função pressupõe que as FKs e a migração `profile_guard` permitem a exclusão em cascata.
- A função não implementa auditoria durável da exclusão. Para isso, crie um registro independente de `auth.users` e com política apropriada.
- Convites continuam usando a função existente `invite-member`; suspensão e alteração de papéis usam as políticas existentes de `profiles`.
