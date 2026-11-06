# SeuQR — MVP

Plataforma de QR Code dinâmico: cada QR físico aponta pra um hash fixo (`dbtz.cc/a/[hash]`) e o destino pode ser trocado a qualquer momento sem reimprimir nada.

## Passo a passo

1. **Banco (Supabase)**
   - Pode usar o mesmo projeto Supabase do KeeperID/MePerdiPet ou criar um novo.
   - Abra o SQL Editor e rode o conteúdo de `schema.sql`.

2. **Configuração**
   - Copie `.env.example` para `.env`.
   - Preencha `SUPABASE_URL` e `SUPABASE_KEY` (use a **service role key**, do painel Settings > API do Supabase).

3. **Instalar e rodar localmente**
   ```
   npm install
   npm start
   ```
   - Painel admin: `http://localhost:3000/admin/admin.html`
   - Redirecionamento: `http://localhost:3000/a/[hash]`

4. **Subir na HostGator (cPanel com suporte a Node.js)**
   - No cPanel, use "Setup Node.js App", aponte para esta pasta, defina `server.js` como arquivo de start.
   - Configure as variáveis de ambiente (SUPABASE_URL, SUPABASE_KEY) direto no painel do Node App.
   - Aponte o subdomínio ou path `/a/` do domínio dbtz.cc para essa aplicação Node.

## O que já funciona no MVP
- Criar QR Code (gera hash único).
- Editar destino de um QR para "link único" (redirect simples).
- Registro de scan (tabela `scans`) a cada acesso.

## Próximos passos (não incluídos ainda)
- Tipo de destino `pagina_links` editável pelo painel (hoje só existe no motor de redirecionamento, falta o formulário).
- Tipo de destino `avaliacao_google` (atalho pronto pra criar link direto de avaliação).
- Tela de revendedores + emissão de pacotes de QR em lote.
- Autenticação no painel `/admin` (hoje está aberto — não subir em produção sem proteger antes).
