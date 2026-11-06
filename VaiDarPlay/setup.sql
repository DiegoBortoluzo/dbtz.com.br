-- Vai dar Play? · v3: multi-tenant leve + clima (Open-Meteo)
-- Se já rodou a versão anterior (sem dados reais), apague antes:
-- drop view if exists court_current, courts_pub, site_weather;
-- drop table if exists court_status_events, observations, courts, sites, tenants, app_settings cascade;

create table tenants (
  id int generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,30}$'),
  name text not null,
  admin_pin text not null,
  update_mode text not null default 'open' check (update_mode in ('open'))
);
create table sites (
  id int generated always as identity primary key,
  tenant_id int not null references tenants(id),
  name text not null,
  lat numeric(9,6) not null,
  lon numeric(9,6) not null
);
create table courts (
  id int generated always as identity primary key,
  tenant_id int not null references tenants(id),
  site_id int not null references sites(id),
  slug text not null check (slug ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  type text not null check (type in ('saibro','beach_tenis','padel','outro')),
  sort int not null default 0,
  active boolean not null default true,
  unique (tenant_id, slug)
);
create table court_status_events (
  id bigint generated always as identity primary key,
  tenant_id int not null,
  court_id int not null references courts(id),
  status text not null check (status in ('livre','restricao','molhada','interditada')),
  author text not null check (char_length(author) between 2 and 40),
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);
create index on court_status_events (court_id, created_at desc);
-- mesma tabela para dados de API hoje e de sensores amanhã (source = 'open-meteo' | 'device:<id>')
create table observations (
  id bigint generated always as identity primary key,
  site_id int not null references sites(id),
  source text not null,
  metric text not null,
  value double precision not null,
  ts timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (site_id, source, metric, ts)
);
create index on observations (site_id, metric, ts desc);

alter table tenants enable row level security;      -- sem policies: o PIN nunca é lido de fora
alter table sites enable row level security;
alter table courts enable row level security;
alter table court_status_events enable row level security;
alter table observations enable row level security;
create policy "ler quadras" on courts for select to anon using (true);
create policy "ler eventos" on court_status_events for select to anon using (true);
create policy "inserir eventos" on court_status_events for insert to anon
  with check (exists (select 1 from courts where id = court_id and active));
grant select on courts to anon;
grant select, insert on court_status_events to anon;

-- views públicas (rodam com permissão do dono; não expõem PIN nem coordenadas)
create or replace view courts_pub as
  select c.id, c.slug, c.name, c.type, c.sort, c.active, c.site_id, t.slug as tenant_slug
  from courts c join tenants t on t.id = c.tenant_id;
create or replace view court_current as
  select c.id as court_id, c.slug, c.name, c.type, c.sort, c.site_id, t.slug as tenant_slug, e.status, e.author, e.note, e.created_at
  from courts c join tenants t on t.id = c.tenant_id
  left join lateral (select * from court_status_events x where x.court_id = c.id order by x.created_at desc limit 1) e on true
  where c.active;
create or replace view site_weather as
  select s.id as site_id,
    coalesce(sum(o.value) filter (where o.metric='precipitation' and o.ts <= now() and o.ts > now() - interval '1 hour'),0) as rain_1h,
    coalesce(sum(o.value) filter (where o.metric='precipitation' and o.ts <= now() and o.ts > now() - interval '6 hours'),0) as rain_6h,
    coalesce(sum(o.value) filter (where o.metric='precipitation' and o.ts <= now() and o.ts > now() - interval '12 hours'),0) as rain_12h,
    coalesce(sum(o.value) filter (where o.metric='precipitation' and o.ts <= now() and o.ts > now() - interval '24 hours'),0) as rain_24h,
    coalesce(sum(o.value) filter (where o.metric='precipitation' and o.ts > now() and o.ts <= now() + interval '6 hours'),0) as rain_next_6h,
    (array_agg(o.value order by o.ts desc) filter (where o.metric='temperature_2m' and o.ts <= now()))[1] as temp,
    (array_agg(o.value order by o.ts desc) filter (where o.metric='relative_humidity_2m' and o.ts <= now()))[1] as rh,
    (array_agg(o.value order by o.ts desc) filter (where o.metric='wind_speed_10m' and o.ts <= now()))[1] as wind,
    (array_agg(o.value order by o.ts desc) filter (where o.metric='shortwave_radiation' and o.ts <= now()))[1] as rad,
    max(o.fetched_at) as fetched_at
  from sites s left join observations o on o.site_id = s.id and o.source = 'open-meteo'
  group by s.id;
grant select on courts_pub, court_current, site_weather to anon;

create or replace function before_event() returns trigger language plpgsql as $$
begin
  select tenant_id into new.tenant_id from courts where id = new.court_id;
  if exists (select 1 from court_status_events where court_id = new.court_id and created_at > now() - interval '15 seconds') then
    raise exception 'Aguarde alguns segundos para atualizar de novo.';
  end if;
  return new;
end $$;
create trigger t_event before insert on court_status_events for each row execute function before_event();

create or replace function save_court(p_tenant text, p_pin text, p_slug text, p_name text, p_type text, p_sort int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t tenants%rowtype;
begin
  select * into t from tenants where slug = p_tenant;
  if t.id is null or t.admin_pin is distinct from p_pin then perform pg_sleep(1); raise exception 'PIN incorreto.'; end if;
  insert into courts (tenant_id, site_id, slug, name, type, sort, active)
  values (t.id, (select id from sites where tenant_id = t.id order by id limit 1), p_slug, p_name, p_type, p_sort, p_active)
  on conflict (tenant_id, slug) do update set name = excluded.name, type = excluded.type, sort = excluded.sort, active = excluded.active;
end $$;
grant execute on function save_court(text,text,text,text,text,int,boolean) to anon;

-- dados iniciais: clube Winner (TROQUE O PIN depois), coordenadas da academia e 7 quadras de saibro
insert into tenants (slug, name, admin_pin) values ('winner', 'Winner', 'TROQUE-ESTE-PIN');
insert into sites (tenant_id, name, lat, lon) select id, 'Winner', -22.754361, -47.386667 from tenants where slug = 'winner';
insert into courts (tenant_id, site_id, slug, name, type, sort)
select t.id, s.id, 'q'||g, 'Quadra '||g, 'saibro', g from tenants t join sites s on s.tenant_id = t.id, generate_series(1,7) g where t.slug = 'winner';

-- AGENDAMENTO do clima (depois de publicar a função; ative pg_cron e pg_net; troque PROJETO e a chave anon):
-- select cron.schedule('fetch-weather', '*/30 * * * *', $$ select net.http_post(
--   url := 'https://PROJETO.supabase.co/functions/v1/fetch-weather',
--   headers := jsonb_build_object('Authorization', 'Bearer SUA_ANON_KEY')) $$);
