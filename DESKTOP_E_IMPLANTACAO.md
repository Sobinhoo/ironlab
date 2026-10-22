# IRONLab v0.30.0 — instalação e limitações

## Web / StackBlitz
1. Importe o ZIP ou copie o projeto para o repositório.
2. Execute `npm install` e `npm run build`.
3. Adicione seu próprio `.env` local com `VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co` e `VITE_SUPABASE_ANON_KEY=...` (chave publishable). **O ZIP não contém `.env`**.
4. Execute `npm run dev`.

## Desktop Windows (Tauri 2)
O projeto inclui o *scaffold* Tauri, **não um executável pronto**. Para compilar é necessário ambiente Windows com Node.js, Rust, Microsoft C++ Build Tools e WebView2.
1. Clone o repositório num PC com permissões de instalação.
2. Instale dependências: `npm install`.
3. Teste no navegador: `npm run build`.
4. Teste desktop: `npm run desktop:dev`.
5. Gere instalador: `npm run desktop:build` (em Windows, NSIS/MSI).
6. Para distribuir, configure assinatura, atualização, testes de rede e segurança.

**Atenção:** O Windows WebView2 pode impor restrições de CORS/HTTP para o Hub. Não foi incluído bypass inseguro. Se ocorrer bloqueio, a próxima etapa é criar um comando nativo Tauri com escopo restrito de IP/porta e timeout, validado contra o firmware do Hub.

## Recursos
- Painel de projetos locais: salvar como, duplicar, abrir, exportar e importar JSON.
- Configurações: grade, snap, IP/porta, limites de alerta.
- Ping: tempo HTTP, **não RSSI**.
- Bateria: indicadores com limites ajustáveis; não mede saúde da bateria.
- Ajuda: referências oficiais e log temporário de conexão.

## Ainda não implementado nesta entrega
- Sincronização multiusuário de projetos no Supabase, auditoria remota e resolução de conflitos. O indicador de salvamento informa armazenamento **local**.
- Captura de RSSI real do Wi-Fi.
- Atalhos globais configuráveis.
- Executável assinado/testado no Windows.
