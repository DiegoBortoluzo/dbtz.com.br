(function () {
  var CFG = window.WINNER_CONFIG || {}, PAGE = window.PAGE || "home", TEN = CFG.tenant || "winner";
  var ST = { livre: "Livre", restricao: "Jogável com restrição", molhada: "Molhada", interditada: "Interditada" };
  var TY = { saibro: "Saibro", beach_tenis: "Beach tênis", padel: "Pádel", outro: "Outras" };
  var app = document.getElementById("app"), PIN = "", COURT = null;
  var ATTR = '<p class="attr">Dados meteorológicos: <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0)</p>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, opt) {
    opt = opt || {};
    opt.headers = { apikey: CFG.key, Authorization: "Bearer " + CFG.key, "Content-Type": "application/json", Prefer: "return=minimal" };
    return fetch(CFG.url + "/rest/v1/" + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { var m = t; try { m = JSON.parse(t).message || t; } catch (e) {} throw new Error(m); });
      return r.status === 201 || r.status === 204 ? null : r.json();
    });
  }
  function ago(ts) {
    var m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    if (m < 1) return "agora"; if (m < 60) return "há " + m + " min";
    if (m < 1440) return "há " + Math.round(m / 60) + " h"; return "há " + Math.round(m / 1440) + " d";
  }
  function when(ts) { return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function isOld(ts) { return Date.now() - new Date(ts).getTime() > 12 * 3600 * 1000; }
  function head(t, p) { return "<header><h1>" + t + "</h1><p>" + p + "</p></header>"; }
  function fail() { return '<p class="err">Não foi possível carregar. Verifique a conexão e tente novamente.</p>'; }
  function getName() { try { return localStorage.getItem("winner_nome") || ""; } catch (e) { return ""; } }
  function setName(v) { try { localStorage.setItem("winner_nome", v); } catch (e) {} }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function n1(x) { return x == null ? "–" : Number(x).toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
  function cell(l, v) { return "<div><b>" + n1(v) + "</b><span>" + l + "</span></div>"; }

  // ---------- clima (modelo Open-Meteo, gravado no banco pela função fetch-weather) ----------
  function wx(id) {
    if (!id) return Promise.resolve("");
    return api("site_weather?select=*&site_id=eq." + id).then(function (r) {
      var w = r[0]; if (!w || !w.fetched_at) return "";
      var old = Date.now() - new Date(w.fetched_at).getTime() > 2 * 3600 * 1000;
      return "<h2>Clima no local</h2>" + '<div class="card"><div class="stats">' + cell("mm na 1 h", w.rain_1h) + cell("mm em 6 h", w.rain_6h) + cell("mm em 12 h", w.rain_12h) + cell("mm em 24 h", w.rain_24h) + "</div>" +
        '<div class="row"><span>Previsto nas próximas 6 h: <i>' + n1(w.rain_next_6h) + ' mm</i></span><span><i>' + n1(w.temp) + " °C</i> · umidade <i>" + n1(w.rh) + "%</i></span></div>" +
        '<div class="row"><span>Vento <i>' + n1(w.wind) + ' km/h</i></span><span>Radiação solar <i>' + n1(w.rad) + " W/m²</i></span></div>" +
        '<p class="note">Estimativa de modelo meteorológico, não medida na quadra. Atualizado ' + ago(w.fetched_at) + "." + (old ? " <b>Dados desatualizados.</b>" : "") + "</p></div>";
    }).catch(function () { return ""; });
  }

  // ---------- visão geral ----------
  function loadHome() {
    api("court_current?select=*&tenant_slug=eq." + TEN + "&order=sort.asc,name.asc").then(function (rows) {
      return wx(rows[0] && rows[0].site_id).then(function (W) {
        var h = head("Vai dar Play?", "Winner · estado das quadras · toque em uma quadra para ver ou atualizar");
        if (!rows.length) h += '<p class="err">Nenhuma quadra cadastrada.</p>';
        Object.keys(TY).forEach(function (t) {
          var list = rows.filter(function (r) { return r.type === t; });
          if (!list.length) return;
          h += "<h2>" + TY[t] + '</h2><div class="grid" style="margin-top:0">';
          list.forEach(function (r) {
            var s = r.status || "none";
            h += '<a class="tile s-' + s + '" href="quadra.html?c=' + encodeURIComponent(r.slug) + '"><span class="nm">' + esc(r.name) + '</span><span class="st">' + (r.status ? ST[s] : "Sem informação") + "</span>" +
              (r.status ? '<span class="meta">' + ago(r.created_at) + " · " + esc(r.author) + "</span>" + (isOld(r.created_at) ? '<span class="old">Informação antiga</span>' : "") : "") + "</a>";
          });
          h += "</div>";
        });
        app.innerHTML = h + W + ATTR;
      });
    }).catch(function () { app.innerHTML = head("Vai dar Play?", "Winner") + fail(); });
  }

  // ---------- página da quadra ----------
  function loadCourt() {
    var slug = new URLSearchParams(location.search).get("c") || "";
    var p = COURT ? Promise.resolve(COURT) : api("courts_pub?select=*&tenant_slug=eq." + TEN + "&slug=eq." + encodeURIComponent(slug)).then(function (r) { return (COURT = r[0] || null); });
    p.then(function (c) {
      if (!c) { app.innerHTML = head("Quadra não encontrada", "Vai dar Play?") + '<a class="back" href="index.html">Ver todas as quadras</a>'; return; }
      return Promise.all([api("court_status_events?select=*&court_id=eq." + c.id + "&order=created_at.desc&limit=20"), wx(c.site_id)]).then(function (a) { drawCourt(c, a[0], a[1]); });
    }).catch(function () { app.innerHTML = head("Quadra", "Vai dar Play?") + fail(); });
  }
  function drawCourt(c, rows, W) {
    var cur = rows[0], s = cur ? cur.status : "none", keep = document.getElementById("nome") ? val("nome") : getName(), note = val("nota");
    document.title = c.name + " · Vai dar Play?";
    var h = head(esc(c.name), "Vai dar Play? · Winner · " + TY[c.type] + " · atualiza sozinha a cada 20 s") +
      '<div class="big s-' + s + '"><span class="st">' + (cur ? ST[s] : "Sem informação") + "</span>" +
      (cur ? '<span class="meta">' + ago(cur.created_at) + " por " + esc(cur.author) + "</span>" + (cur.note ? '<span class="meta">' + esc(cur.note) + "</span>" : "") + (isOld(cur.created_at) ? '<span class="old">Informação antiga</span>' : "") : '<span class="meta">Ninguém registrou o estado ainda.</span>') + "</div>" + (W || "");
    if (c.active) {
      h += "<h2>Como está a quadra agora?</h2>" + '<div class="card"><label for="nome">Seu nome</label><input id="nome" maxlength="40" autocomplete="name" value="' + esc(keep) + '">' +
        '<label for="nota">Observação (opcional)</label><input id="nota" maxlength="140" placeholder="Ex.: poças no fundo da quadra" value="' + esc(note) + '">';
      Object.keys(ST).forEach(function (k) { h += '<button class="opt s-' + k + '" data-s="' + k + '">' + ST[k] + "</button>"; });
      h += '<p class="err" id="err" role="alert"></p></div>';
    }
    h += '<h2>Últimas alterações</h2><div class="card"><ul class="h">';
    if (!rows.length) h += "<li>Nenhuma alteração registrada.</li>";
    rows.forEach(function (r) { h += '<li><span class="dot s-' + r.status + '" style="background:none">' + ST[r.status] + '</span><span class="who">' + when(r.created_at) + " · " + esc(r.author) + (r.note ? " · " + esc(r.note) : "") + "</span></li>"; });
    app.innerHTML = h + '</ul></div><a class="back" href="index.html">Ver todas as quadras</a>' + ATTR;
    Array.prototype.forEach.call(app.querySelectorAll(".opt"), function (b) { b.onclick = function () { save(b.dataset.s); }; });
  }
  function save(status) {
    var nome = val("nome").trim(), err = document.getElementById("err");
    if (nome.length < 2) { err.textContent = "Informe seu nome para atualizar."; document.getElementById("nome").focus(); return; }
    setName(nome); err.textContent = "Salvando…";
    api("court_status_events", { method: "POST", body: JSON.stringify({ court_id: COURT.id, status: status, author: nome, note: val("nota").trim() || null }) })
      .then(function () { document.getElementById("nota").value = ""; loadCourt(); })
      .catch(function (e) { err.textContent = /Aguarde/.test(e.message) ? "Aguarde alguns segundos para atualizar de novo." : "Não foi possível salvar. Tente novamente."; });
  }

  // ---------- cadastro de quadras (com PIN) ----------
  function slugify(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30); }
  function loadAdmin() {
    api("courts_pub?select=*&tenant_slug=eq." + TEN + "&order=sort.asc,name.asc").then(function (rows) {
      var opts = Object.keys(TY).map(function (k) { return '<option value="' + k + '">' + TY[k] + "</option>"; }).join("");
      var h = head("Cadastro de quadras", "Área restrita: exige o PIN de administrador") +
        '<div class="card" style="margin-top:16px"><label for="pin">PIN</label><input id="pin" type="password" autocomplete="off" value="' + esc(PIN) + '">' +
        '<label for="cn">Nome da quadra</label><input id="cn" maxlength="40" placeholder="Ex.: Beach tênis 1">' +
        '<label for="cs">Código do link (letras, números e hífen)</label><input id="cs" maxlength="30">' +
        '<label for="ct">Tipo</label><select id="ct">' + opts + '</select>' +
        '<label for="co">Ordem na lista</label><input id="co" type="number" value="0">' +
        '<label><input id="ca" type="checkbox" checked> Quadra ativa</label>' +
        '<button class="btn" id="sv">Salvar quadra</button><button class="btn alt" id="cl">Limpar</button><p class="err" id="err" role="alert"></p></div>' +
        '<h2>Quadras cadastradas</h2><div class="card"><ul class="h">';
      rows.forEach(function (r) {
        var u = new URL("quadra.html?c=" + r.slug, location.href).href;
        h += '<li class="c"><b>' + esc(r.name) + "</b> · " + TY[r.type] + (r.active ? "" : " · inativa") + '<span class="url">' + esc(u) + '</span><button class="btn alt" data-e="' + esc(r.slug) + '">Editar</button></li>';
      });
      app.innerHTML = h + '</ul></div><a class="back" href="index.html">Ver todas as quadras</a>';
      var by = {}; rows.forEach(function (r) { by[r.slug] = r; });
      document.getElementById("cn").oninput = function () { var s = document.getElementById("cs"); if (!s.readOnly) s.value = slugify(this.value); };
      document.getElementById("cl").onclick = function () { PIN = val("pin"); loadAdmin(); };
      Array.prototype.forEach.call(app.querySelectorAll("[data-e]"), function (b) {
        b.onclick = function () {
          var r = by[b.dataset.e]; document.getElementById("cn").value = r.name; var s = document.getElementById("cs"); s.value = r.slug; s.readOnly = true;
          document.getElementById("ct").value = r.type; document.getElementById("co").value = r.sort; document.getElementById("ca").checked = r.active; window.scrollTo(0, 0);
        };
      });
      document.getElementById("sv").onclick = function () {
        var err = document.getElementById("err"); PIN = val("pin"); err.textContent = "Salvando…";
        api("rpc/save_court", { method: "POST", body: JSON.stringify({ p_tenant: TEN, p_pin: PIN, p_slug: val("cs"), p_name: val("cn").trim(), p_type: val("ct"), p_sort: parseInt(val("co"), 10) || 0, p_active: document.getElementById("ca").checked }) })
          .then(function () { loadAdmin(); }).catch(function (e) { err.textContent = /PIN/.test(e.message) ? "PIN incorreto." : "Não foi possível salvar. Confira nome e código."; });
      };
    }).catch(function () { app.innerHTML = head("Cadastro de quadras", "") + fail(); });
  }

  if (!CFG.url || !CFG.key || /COLE_/.test(CFG.url)) { app.innerHTML = head("Vai dar Play?", "") + '<p class="err">Configure o arquivo config.js.</p>'; return; }
  var run = PAGE === "court" ? loadCourt : PAGE === "admin" ? loadAdmin : loadHome;
  run();
  if (PAGE !== "admin") setInterval(function () { if (document.visibilityState === "visible" && !(document.activeElement && document.activeElement.tagName === "INPUT")) run(); }, 20000);
})();
