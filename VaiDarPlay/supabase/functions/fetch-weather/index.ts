import { createClient } from "jsr:@supabase/supabase-js@2";

const VARS = ["precipitation", "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "shortwave_radiation", "et0_fao_evapotranspiration"];

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sites, error } = await sb.from("sites").select("id,lat,lon");
  if (error) return new Response(error.message, { status: 500 });
  let saved = 0;
  for (const s of sites ?? []) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&hourly=${VARS.join(",")}&past_days=2&forecast_days=2&timezone=UTC`;
    const r = await fetch(url);
    if (!r.ok) continue;
    const j = await r.json();
    const now = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    j.hourly.time.forEach((t: string, i: number) =>
      VARS.forEach((v) => {
        const x = j.hourly[v][i];
        if (x != null) rows.push({ site_id: s.id, source: "open-meteo", metric: v, value: x, ts: t + ":00Z", fetched_at: now });
      }));
    const { error: e2 } = await sb.from("observations").upsert(rows, { onConflict: "site_id,source,metric,ts" });
    if (!e2) saved += rows.length;
  }
  return new Response(JSON.stringify({ saved }), { headers: { "Content-Type": "application/json" } });
});
