# IRONLab v0.28.3 — identidade visual

## Alterações
- Logo original transparente, recortada apenas nas margens vazias, em `public/branding/ironlab-logo.png`.
- Marca no cabeçalho, login, recuperação de acesso e verificação de sessão.
- Favicon, título da aba e tema do navegador.
- CSS global reconstruído para remover regras padrão do Vite que deixavam os títulos pretos e restringiam a largura.
- Ajustes de cores preto/grafite/verde da marca e painel administrativo.
- Componentes de mapa, telemetria, motor, Supabase e regras de acesso preservados.

## Instalação
1. Importe o ZIP no StackBlitz.
2. Recrie `.env` com VITE_SUPABASE_URL (sem /rest/v1) e VITE_SUPABASE_ANON_KEY (publishable key).
3. Execute `npm install` e `npm run dev`.
4. Faça login e teste Administração, mapa e telemetria.

**Atenção:** este pacote não inclui `.env`, tokens nem senhas. O backend não precisa ser recriado.
