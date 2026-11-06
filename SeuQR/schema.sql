-- Schema inicial da plataforma de QR Code dinamico
-- Rodar no SQL Editor do Supabase (mesmo projeto do KeeperID/MePerdiPet, ou um novo)

create table if not exists revendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  comissao_pct numeric default 0,
  marca_propria jsonb,
  created_at timestamptz default now()
);

create table if not exists qrcodes (
  id uuid primary key default gen_random_uuid(),
  hash varchar(8) unique not null,
  revendedor_id uuid references revendedores(id),
  status varchar(20) default 'ativo',
  plano varchar(20) default 'free',
  created_at timestamptz default now()
);

create table if not exists destinos (
  id uuid primary key default gen_random_uuid(),
  qrcode_id uuid references qrcodes(id) unique,
  tipo varchar(30) not null,       -- link_unico | pagina_links | avaliacao_google | agendamento
  config jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists paginas_blocos (
  id uuid primary key default gen_random_uuid(),
  destino_id uuid references destinos(id),
  ordem int not null,
  tipo_bloco varchar(30),          -- link | whatsapp | texto | pagamento
  conteudo jsonb not null
);

create table if not exists scans (
  id bigserial primary key,
  qrcode_id uuid references qrcodes(id),
  scanned_at timestamptz default now(),
  dispositivo varchar(255),
  cidade_aprox text
);

create index if not exists idx_qrcodes_hash on qrcodes(hash);
create index if not exists idx_scans_qrcode on scans(qrcode_id);
