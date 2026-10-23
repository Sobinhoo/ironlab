# IRONLab cloud — checklist de validação antes de produção

## Ordem das migrações
1. `20261023_iron_cloud_foundation.sql`
2. `20261024_iron_atomic_project_saves.sql`

Execute primeiro em um projeto Supabase de homologação. O commit **não** aplica migrações automaticamente.

## Testes obrigatórios
- Usuário sem perfil ativo: não cria equipe e não lê projetos.
- Integrante de equipe A: não lê projetos da equipe B.
- Viewer/member: não salva projeto (RPC retorna erro de permissão).
- Mentor/admin: cria e atualiza projetos de sua equipe.
- Duas edições com a mesma revisão: a primeira é salva; a segunda retorna conflito sem sobrescrever dados.
- Cada atualização bem-sucedida preserva o documento anterior em `iron_project_revisions`.
- Documentos maiores que 2 MiB e nomes inválidos são rejeitados.
- Conta suspensa: não acessa projetos mesmo com token ainda válido.
- Excluir usuário: verificar dependências e retenção de histórico antes de publicar.

## Pendências antes de merge
- Implementar UI de seleção de equipes/projetos e estados de conflito.
- Revisar permissões de criação de equipes e convites para equipes.
- Acrescentar testes automatizados de RLS/RPC e TypeScript/build.
- Corrigir migrações para instalações parciais ou políticas preexistentes.
- Adicionar auditoria durável para exclusões administrativas.
- Definir política de retenção de dados e backup.
- Não exibir Health Score como previsão de falha certificada.
