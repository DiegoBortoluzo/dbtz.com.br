# Vai dar Play? · piloto Winner (v3: clima por API + multi-tenant leve)

1. Supabase: rode `setup.sql` no SQL Editor (cria clube Winner, local com as coordenadas da academia e 7 quadras de saibro).
2. Troque o PIN: `update tenants set admin_pin = 'SEU-PIN' where slug = 'winner';`
3. Clima: publique a função `supabase/functions/fetch-weather` (Supabase CLI: `supabase functions deploy fetch-weather`), invoque uma vez para testar e agende com o trecho comentado no fim do `setup.sql` (ative pg_cron e pg_net).
4. `config.js`: cole a Project URL e a anon key. O campo `tenant` identifica o clube.
5. Envie a pasta `winner` (sem `supabase/`) para dbtz.com.br/winner. Cadastre beach tênis e pádel em /winner/admin.html.

Notas
- Chuva e clima vêm de modelo meteorológico (Open-Meteo, CC BY 4.0): a tela avisa que não é medida na quadra. Uso gratuito é não comercial; ao cobrar, contrate o plano comercial ou troque de provedor (só a função fetch-weather muda).
- Os dados de API e de sensores futuros usam a mesma tabela `observations`.
- Fotos nas atualizações ficaram para a fase 2 (exigem login, senão qualquer pessoa envia imagem pública).
