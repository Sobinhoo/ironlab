# IRONLab — MCI Lab

**IRONLab** é um workspace desktop para inspeção, mapeamento, análise e manutenção de hardware de robôs **FIRST Tech Challenge (FTC)**.

O projeto está em desenvolvimento e ainda **não é uma versão 1.0 homologada**.

## Recursos implementados

- Mapa visual dos módulos REV Control Hub / Expansion Hub e componentes.
- Comunicação HTTP local com a ponte Android FTC na porta 8765.
- Coleta de telemetria de motores e bateria; diagnóstico e histórico local.
- Importação de configuração FTC XML e extração de motores/portas a partir das
  tabelas `Device Information` dos logs reais do Robot Controller.
- Cadastro Supabase com solicitação e aprovação por administrador.
- Projetos locais com exportação/importação JSON.
- Projetos compartilhados Supabase, histórico de revisão, salvamento automático,
  notificação Realtime e detecção de conflito (não é edição CRDT por caractere).
- Acesso local provisório offline, apenas após validação prévia, com limite de 24h;
  recursos administrativos e nuvem permanecem indisponíveis offline.

## Desenvolvimento

Requer Node.js e, para Windows desktop, Rust, WebView2 e ferramentas de build do Windows.

```bash
npm install
npm run build
npm run lint
npm run desktop:dev
```

Para o instalador Tauri:

```bash
npm run desktop:build
```

Configure `.env` local conforme `.env.example`, com **somente** a URL pública
e a chave Supabase anon/publishable. Nunca inclua `service_role` no frontend.

## Implantação do Supabase

O banco existente deve receber as migrações apropriadas, **revisadas e testadas
em staging**, antes de utilizar cadastro, equipes e colaboração. **Não execute
`supabase/schema.sql` novamente no projeto existente.**

Consulte [o guia de cadastro, logs e colaboração](docs/IRONLAB_CADASTRO_LOG_COLABORACAO.md)
e a migração `supabase/migrations/20261105_iron_signup_approval_realtime.sql`.

Autenticação por e-mail depende de um provedor SMTP adequadamente configurado
no Supabase; contas novas não recebem acesso até confirmar o e-mail e obter
aprovação do administrador.

## Estado dos testes

O frontend e os instaladores Windows são compilados em GitHub Actions.
A compilação não substitui:
- testes de RLS com diferentes contas e equipes;
- sessões colaborativas simultâneas e conflitos de revisão;
- avaliação da segurança do servidor HTTP em rede local;
- testes de perda de conectividade, expiração de tokens e recuperação offline;
- validação no Control Hub com hardware real.

**Comunicação com o robô:** mantenha as portas 8765 acessíveis apenas em redes
FTC confiáveis. A ponte HTTP é somente leitura e não deve operar motores.

## Planejamento

Fases até a versão 1.0: autenticação/segurança, equipes, colaboração,
compatibilidade FTC, diagnósticos, uso offline, testes de segurança e entrega
desktop. O assistente ASBI é uma iniciativa separada e experimental.
