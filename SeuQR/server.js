require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use('/admin', express.static(__dirname + '/public'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function gerarHash(tamanho = 7) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let hash = '';
  for (let i = 0; i < tamanho; i++) hash += chars[Math.floor(Math.random() * chars.length)];
  return hash;
}

function renderPaginaLinks(blocos) {
  const itens = (blocos || []).map((b) => {
    if (b.tipo === 'link') return `<a class="bloco" href="${b.url}" target="_blank" rel="noopener">${b.titulo}</a>`;
    if (b.tipo === 'whatsapp') return `<a class="bloco" href="https://wa.me/${b.numero}" target="_blank" rel="noopener">${b.titulo}</a>`;
    if (b.tipo === 'texto') return `<div class="bloco texto">${b.conteudo}</div>`;
    return '';
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SeuQR</title>
<style>
  body { font-family: system-ui, sans-serif; background:#111; color:#fff; display:flex; flex-direction:column; align-items:center; padding:40px 16px; margin:0; }
  .bloco { display:block; width:100%; max-width:400px; background:#222; color:#fff; text-decoration:none; text-align:center; padding:14px; margin:8px 0; border-radius:12px; font-weight:600; box-sizing:border-box; }
  .bloco:hover { background:#333; }
  .texto { background:transparent; font-weight:400; opacity:0.8; }
</style>
</head>
<body>
  ${itens}
</body>
</html>`;
}

// --- Redirecionamento publico: dbtz.cc/a/[hash] ---
app.get('/a/:hash', async (req, res) => {
  const { data: qr } = await supabase
    .from('qrcodes')
    .select('id, status')
    .eq('hash', req.params.hash)
    .single();

  if (!qr || qr.status !== 'ativo') {
    return res.status(404).send('QR Code invalido ou inativo.');
  }

  const { data: destino } = await supabase
    .from('destinos')
    .select('tipo, config')
    .eq('qrcode_id', qr.id)
    .single();

  // registra o scan sem travar o redirecionamento
  supabase.from('scans').insert({
    qrcode_id: qr.id,
    dispositivo: (req.headers['user-agent'] || '').slice(0, 255)
  }).then(() => {});

  if (!destino) return res.status(404).send('Nenhum destino configurado para este QR ainda.');

  if (destino.tipo === 'link_unico') {
    return res.redirect(destino.config.url);
  }

  if (destino.tipo === 'pagina_links') {
    return res.send(renderPaginaLinks(destino.config.blocos));
  }

  return res.status(400).send('Tipo de destino ainda nao suportado neste MVP: ' + destino.tipo);
});

// --- API simples usada pelo painel admin (/admin) ---
app.post('/api/qrcodes', async (req, res) => {
  const hash = gerarHash();
  const { data, error } = await supabase.from('qrcodes').insert({ hash, status: 'ativo' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/qrcodes', async (req, res) => {
  const { data, error } = await supabase
    .from('qrcodes')
    .select('*, destinos(*)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/qrcodes/:id/destino', async (req, res) => {
  const { tipo, config } = req.body;
  const { data: existente } = await supabase
    .from('destinos')
    .select('id')
    .eq('qrcode_id', req.params.id)
    .single();

  const result = existente
    ? await supabase.from('destinos').update({ tipo, config, updated_at: new Date() }).eq('id', existente.id)
    : await supabase.from('destinos').insert({ qrcode_id: req.params.id, tipo, config });

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SeuQR rodando na porta ${PORT}`));
