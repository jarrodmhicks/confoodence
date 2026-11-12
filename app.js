/* ===== helpers ===== */
const LIVE = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
// Accept a pasted URL with extra path (e.g. https://abc.supabase.co/rest/v1/) and keep only the base.
const SB_BASE = (() => {
  try {
    return new URL(CONFIG.SUPABASE_URL).origin;
  } catch (e) {
    return CONFIG.SUPABASE_URL;
  }
})();
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function el(t, c, x) {
  const e = document.createElement(t);
  if (c) e.className = c;
  if (x != null) e.textContent = x;
  return e;
}
function A(h, t, c) {
  const a = el("a", c, t);
  a.href = h;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}
function ls(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch (e) {
    return null;
  }
}
function dash() {
  return el("div", "dash");
}
function gs(q) {
  return "https://www.google.com/search?q=" + encodeURIComponent(q);
}
function icon(kind, size) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", String(size || 22));
  s.setAttribute("height", String(size || 22));
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "3");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute(
    "d",
    kind === 1
      ? "M5 12.5l4.5 4.5L19 7.5"
      : kind === 0
        ? "M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5v.1"
        : "M6 6l12 12M18 6L6 18",
  );
  s.appendChild(p);
  return s;
}
function rid(n, al) {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(n)),
    (b) => al[b % al.length],
  ).join("");
}
const LV = { G: "GOOD", O: "OK", B: "BAD", U: "UNKNOWN" };
/* Places are looked up by their stable id, so deleting a place from data.js never shifts the others. */
const BY = {};
P.forEach((r) => (BY[r.id] = r));
function priceTier(r) {
  const s = r.price || "";
  let m = s.match(/^\s*(\${1,4})/);
  if (m) return m[1].length;
  m = s.match(/\$(\d+)/);
  if (m) {
    const n = +m[1];
    return n <= 15 ? 1 : n <= 35 ? 2 : n <= 60 ? 3 : 4;
  }
  if (/cheap eats|fast-casual|casual|inexpens|coffee|bagel/i.test(s)) return 1;
  return 0;
}
const tierTxt = (r) => (priceTier(r) ? "$".repeat(priceTier(r)) : "$?");
/* ===== distance / geocoding ===== */
function hav(a, b) {
  const R = 6371000,
    t = Math.PI / 180,
    dl = (b.lat - a.lat) * t,
    dn = (b.lng - a.lng) * t;
  const x =
    Math.sin(dl / 2) ** 2 +
    Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function dist(ref, pt) {
  if (!ref || !pt) return null;
  const m = hav(ref, pt) * 1.3,
    min = Math.max(1, Math.round(m / 80));
  return {
    min,
    mi: m / 1609,
    txt:
      min <= 30
        ? "~" + min + " MIN WALK"
        : "~" + (m / 1609).toFixed(1) + " MI AWAY (TRY TRANSIT)",
  };
}
/* Text for a distance pill. leg = exact walking route stored with the poll (optional). */
function distText(ref, pt, leg, short) {
  const d = dist(ref, pt);
  if (!d) return null;
  const est = short ? "" : " (EST)";
  const walk = leg ? leg.min : d.min;
  let t = leg ? walk + " MIN WALK" : "~" + walk + " MIN WALK" + est;
  if (walk >= 12) {
    const m = metroMin(ref, pt);
    if (m && m < walk) t += " · ~" + m + " MIN METRO" + est;
  }
  return t;
}
let GEO = {};
try {
  GEO = JSON.parse(ls("geo2") || "{}");
} catch (e) {}
let gchain = Promise.resolve();
let holdBG = false;
function geocode(key, q, bounded) {
  if (key in GEO) return Promise.resolve(GEO[key]);
  const p = gchain.then(async () => {
    if (key in GEO) return GEO[key];
    try {
      const u =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us" +
        (bounded ? "&viewbox=-77.3,39.1,-76.8,38.7&bounded=1" : "") +
        "&q=" +
        encodeURIComponent(q);
      const r = await fetch(u);
      const j = await r.json();
      GEO[key] = j && j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
      ls("geo2", JSON.stringify(GEO));
    } catch (e) {
      await sleep(1100);
      return undefined;
    }
    await sleep(1100);
    return GEO[key];
  });
  gchain = p.catch(() => {});
  return p;
}
function placeQuery(r) {
  return r.addr
    ? r.addr + ", Washington, DC"
    : r.name.replace(/\(.*?\)/g, "") +
        ", " +
        (r.area || "") +
        ", Washington, DC";
}
function ptOf(r) {
  const g = GEO["p" + r.id];
  return g || null;
}
/* ===== backend ===== */
let CODE = ls("code") || "";
async function rpc(fn, args) {
  const r = await fetch(SB_BASE + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: Object.assign(
      { apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      CONFIG.SUPABASE_ANON_KEY.indexOf("eyJ") === 0
        ? { Authorization: "Bearer " + CONFIG.SUPABASE_ANON_KEY }
        : {},
    ),
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("HTTP " + r.status + ": " + t);
  }
  const tx = await r.text();
  return tx ? JSON.parse(tx) : null;
}
const API = {
  // Returns { ok, why }. why explains a failure so the gate can show what actually went wrong.
  async check(c) {
    if (!LIVE) return { ok: true };
    try {
      const v = await rpc("cf_check", { c });
      return v === true
        ? { ok: true }
        : {
            ok: false,
            why:
              "That " +
              LABEL_CODE.toLowerCase() +
              " does not match the one in your database.",
          };
    } catch (e) {
      const m = String(e.message);
      let why = "Could not talk to Supabase: " + m.slice(0, 220);
      if (/Failed to fetch|NetworkError|Load failed/i.test(m))
        why =
          "Could not reach Supabase. Check SUPABASE_URL in config.js (it must look like https://yourprojectid.supabase.co) and your internet connection.";
      else if (/HTTP 404|PGRST202|Could not find the function/i.test(m))
        why =
          "Connected, but the database functions were not found. Run setup.sql in the Supabase SQL Editor (and make sure it finished without errors).";
      else if (/HTTP 401|HTTP 403|Invalid API key|JWT/i.test(m))
        why =
          "Supabase rejected the key. Check SUPABASE_ANON_KEY in config.js: use the Publishable key (sb_publishable_...), not the secret key.";
      return { ok: false, why };
    }
  },
  async createPoll(o) {
    if (!LIVE) {
      ls("demo:poll:" + o.id, JSON.stringify(o));
      return;
    }
    await rpc("cf_create_poll", {
      c: CODE,
      p_id: o.id,
      p_title: o.title,
      p_ref_name: o.ref.name,
      p_lat: o.ref.lat,
      p_lng: o.ref.lng,
      p_places: o.places,
      p_coords: o.coords,
      p_legs: o.legs || {},
    });
  },
  async getPoll(id) {
    if (!LIVE) {
      try {
        return JSON.parse(ls("demo:poll:" + id));
      } catch (e) {
        return null;
      }
    }
    const p = await rpc("cf_get_poll", { c: CODE, p_id: id });
    if (!p) return null;
    return {
      id: p.poll_id,
      title: p.title,
      ref: { name: p.ref_name, lat: p.ref_lat, lng: p.ref_lng },
      places: p.place_ids,
      coords: p.coords || {},
      legs: p.legs || {},
    };
  },
  /* Rows are { place_id, vote, mine }. The server (and demo mode) only returns other people's votes once you have answered every place. */
  async votes(id, vid) {
    if (!LIVE) {
      let cur = [];
      try {
        cur = JSON.parse(ls("demo:votes:" + id) || "[]");
      } catch (e) {}
      let n = 0;
      try {
        n = JSON.parse(ls("demo:poll:" + id)).places.length;
      } catch (e) {}
      const mineRows = cur.filter((o) => o.voter_id === vid);
      const rows = mineRows.length >= n ? cur : mineRows;
      return rows.map((o) => ({
        place_id: o.place_id,
        vote: o.vote,
        mine: o.voter_id === vid,
      }));
    }
    return (await rpc("cf_results", { c: CODE, p_id: id, v_id: vid })) || [];
  },
  async submit(id, vid, pls, vals) {
    if (!LIVE) {
      let cur = [];
      try {
        cur = JSON.parse(ls("demo:votes:" + id) || "[]");
      } catch (e) {}
      if (!cur.some((o) => o.voter_id === vid))
        pls.forEach((pl, k) =>
          cur.push({ voter_id: vid, place_id: pl, vote: vals[k] }),
        );
      ls("demo:votes:" + id, JSON.stringify(cur));
      return;
    }
    await rpc("cf_submit", { c: CODE, p_id: id, v_id: vid, pls, vals });
  },
};
/* ===== map ===== */
function mkIcon(txt, cls) {
  return L.divIcon({
    className: "",
    html: '<div class="pin ' + cls + '">' + txt + "</div>",
    iconSize: cls.indexOf("ven") >= 0 ? [34, 34] : [26, 26],
    iconAnchor: cls.indexOf("ven") >= 0 ? [17, 17] : [13, 13],
  });
}
function Map_(box) {
  if (!window.L) {
    box.appendChild(
      el(
        "div",
        "banner",
        "Map library did not load. Check your connection; the list still works.",
      ),
    );
    return { set() {}, show() {}, focus() {} };
  }
  const m = L.map(box, { zoomControl: true, attributionControl: true }).setView(
    [38.9, -77.03],
    12,
  );
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(m);
  let layer = L.layerGroup().addTo(m),
    fitted = false;
  return {
    set(ref, pins, onPick, refit) {
      layer.clearLayers();
      const pts = [];
      if (ref) {
        L.marker([ref.lat, ref.lng], {
          icon: mkIcon("&#9733;", "ven"),
          zIndexOffset: 1000,
          title: ref.name,
        }).addTo(layer);
        pts.push([ref.lat, ref.lng]);
        [800, 1600].forEach((r) =>
          L.circle([ref.lat, ref.lng], {
            radius: r,
            color: "#1B1B1B",
            weight: 1.2,
            dashArray: "5 5",
            fill: false,
          }).addTo(layer),
        );
      }
      pins.forEach((p) => {
        const mk = L.marker([p.lat, p.lng], {
          icon: mkIcon(p.label, (p.sel ? "sel" : "") + (p.hi ? " hi" : "")),
          title: p.title,
        }).addTo(layer);
        if (onPick) mk.on("click", () => onPick(p.id));
        pts.push([p.lat, p.lng]);
      });
      if (pts.length && (!fitted || refit)) {
        m.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
        fitted = true;
      }
    },
    show() {
      setTimeout(() => m.invalidateSize(), 50);
    },
    focus(p) {
      if (!m.getBounds().pad(-0.15).contains([p.lat, p.lng]))
        m.panTo([p.lat, p.lng]);
    },
  };
}
/* ===== shared card ===== */
function distPill(ref, pt, leg) {
  return el(
    "span",
    "pill fill",
    distText(ref, pt, leg) || "DISTANCE: LOCATING...",
  );
}
/* Real walking route from the free OpenStreetMap foot router. Returns { min, m } or null (falls back to the estimate). */
async function walkRoute(a, b) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(
      "https://routing.openstreetmap.de/routed-foot/route/v1/foot/" +
        a.lng +
        "," +
        a.lat +
        ";" +
        b.lng +
        "," +
        b.lat +
        "?overview=false",
      { signal: ctl.signal },
    );
    const j = await r.json();
    if (j && j.code === "Ok" && j.routes && j.routes[0])
      return {
        min: Math.max(1, Math.round(j.routes[0].duration / 60)),
        m: Math.round(j.routes[0].distance),
      };
  } catch (e) {
  } finally {
    clearTimeout(to);
  }
  return null;
}
function directions(ref, r, mode) {
  const dest = encodeURIComponent(
    r.name.replace(/\(.*?\)/g, "") +
      " " +
      (r.addr || r.area || "") +
      " Washington DC",
  );
  const org = ref ? ref.lat + "," + ref.lng : "";
  return (
    "https://www.google.com/maps/dir/?api=1&origin=" +
    encodeURIComponent(org) +
    "&destination=" +
    dest +
    "&travelmode=" +
    (mode || "transit")
  );
}
function details(r, ref, pt, withLinks) {
  const f = document.createDocumentFragment();
  const kv = el("div", "kv");
  const add = (k, v) => {
    if (!v) return;
    kv.appendChild(el("span", "mut", k));
    kv.appendChild(el("span", null, v));
  };
  add("THE HOOK", r.hook);
  add("PRICE", r.price);
  add("OPEN", r.hours);
  if (r.mealnote) add("SERVES", r.mealnote.join(", "));
  add("KNOWN FOR", r.dishes);
  if (r.pour) add("POUR-OVER", r.pour);
  if ((r.badges && r.badges.length) || (r.acc && r.acc.length)) {
    kv.appendChild(el("span", "mut", "LISTS"));
    const s = el("span");
    (r.badges || []).forEach((b, i) => {
      if (i) s.appendChild(document.createTextNode(" · "));
      s.appendChild(A(b.u, b.l));
    });
    (r.acc || []).forEach((a) => {
      s.appendChild(document.createTextNode(" · " + a));
    });
    kv.appendChild(s);
  }
  add("BOOKING", r.res);
  add("GROUP OF 5", r.grp_);
  add("SERVICE", r.svc);
  f.appendChild(kv);
  const d = el("div", "diet grid3");
  [
    ["VEGETARIAN", "v"],
    ["VEGAN", "vg"],
    ["GLUTEN-FREE", "g"],
  ].forEach(([l, k]) => {
    const x = el("div", r[k]);
    x.appendChild(el("small", null, l));
    x.appendChild(el("b", null, LV[r[k]]));
    d.appendChild(x);
  });
  f.appendChild(d);
  if (r.basis && r.basis !== "n/a")
    f.appendChild(
      el(
        "div",
        "small mut",
        "BASIS: " + r.basis + " (Unknown = check the menu)",
      ),
    );
  else f.appendChild(el("div", "small mut", "Unknown = check the menu."));
  if (r.flag) f.appendChild(el("div", "err", r.flag));
  if (withLinks) {
    const g = el("div", "grid4");
    g.appendChild(
      A(
        r.menu ||
          gs(r.name + " " + (r.addr || r.area || "") + " Washington DC menu"),
        r.menu ? "[ MENU ]" : "[ MENU* ]",
        "lnk",
      ),
    );
    g.appendChild(
      A(
        r.site ||
          gs(r.name + " " + (r.area || "") + " Washington DC official site"),
        r.site ? "[ SITE ]" : "[ SITE* ]",
        "lnk",
      ),
    );
    g.appendChild(
      A(
        "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(
            r.name.replace(/\(.*?\)/g, "") +
              " " +
              (r.addr || r.area || "") +
              " Washington DC",
          ),
        "[ MAP ]",
        "lnk",
      ),
    );
    g.appendChild(A(directions(ref, r, "transit"), "[ GO ]", "lnk"));
    f.appendChild(g);
    if (!r.menu || !r.site)
      f.appendChild(
        el("div", "small mut", "* = no verified link; opens a web search."),
      );
  }
  return f;
}
/* ===== boot ===== */
const H = new URLSearchParams(location.hash.slice(1));
const POLLID = H.get("p");
boot();
async function boot() {
  const app = $("app");
  app.replaceChildren();
  app.appendChild(el("div", "brand", "CONFOODENCE"));
  if (!LIVE) {
    app.appendChild(
      el(
        "div",
        "banner",
        "DEMO MODE: Supabase keys not set, so everything is stored only in this browser.",
      ),
    );
    return go();
  }
  if (CODE && (await API.check(CODE)).ok) return go();
  gate();
}
function gate(msg) {
  const app = $("app");
  app.replaceChildren();
  app.appendChild(el("div", "brand", "CONFOODENCE"));
  app.appendChild(el("div", "sub", TAGLINE));
  app.appendChild(dash());
  app.appendChild(el("div", "b", "ENTER THE " + LABEL_CODE.toUpperCase()));
  const i = el("input");
  i.type = "password";
  i.placeholder = LABEL_CODE.toLowerCase();
  i.autocomplete = "off";
  const pw = el("div", "row");
  pw.style.flexWrap = "nowrap";
  pw.appendChild(i);
  const showBtn = el("button", null, "SHOW");
  showBtn.type = "button";
  showBtn.style.flexShrink = "0";
  showBtn.onclick = () => {
    const hidden = i.type === "password";
    i.type = hidden ? "text" : "password";
    showBtn.textContent = hidden ? "HIDE" : "SHOW";
  };
  pw.appendChild(showBtn);
  app.appendChild(pw);
  if (msg) app.appendChild(el("div", "err", msg));
  const b = el("button", "fill", "LET ME IN");
  app.appendChild(b);
  const go_ = async () => {
    b.disabled = true;
    const c = i.value.trim();
    const res = await API.check(c);
    if (res.ok) {
      CODE = c;
      ls("code", c);
      boot();
    } else gate(res.why);
  };
  b.onclick = go_;
  i.onkeydown = (e) => {
    if (e.key === "Enter") go_();
  };
}
function go() {
  if (POLLID) voter();
  else organizer();
}
/* ===== organizer ===== */
function organizer() {
  const app = $("app");
  document.querySelector(".wrap").classList.add("wide");
  const desk = () => window.matchMedia("(min-width: 980px)").matches;
  const rank = { G: 3, O: 2, U: 1, B: 0 };
  const S = {
    ref: null,
    sel: [],
    title: "",
    made: null,
    view: "list",
    meal: "",
    cg: "",
    v: 0,
    vg: 0,
    g: 0,
    q: "",
    price: 0,
    walk: 0,
    onlySel: false,
    sort: "name",
    open: {},
    pin: null,
    trayOpen: false,
    fopen: false,
    msg: "",
  };
  try {
    S.ref = JSON.parse(ls("ref") || "null");
  } catch (e) {}
  let mapObj,
    refHolder,
    listHolder,
    pinHolder,
    trayEl,
    mapcol,
    listcol,
    fbody,
    ftoggle,
    qIn;
  const ctl = {};

  /* ---------- reference location ---------- */
  function refChanged(refit) {
    renderRef();
    renderList();
    renderMap(refit);
    renderTray();
  }
  function renderRef() {
    refHolder.replaceChildren();
    const box = el("div", "card");
    box.appendChild(el("div", "b", "1. REFERENCE LOCATION"));
    const pr = el("div", "row");
    PRESETS.forEach((p) => {
      const b = el("button", "mini", p.label);
      b.onclick = () => {
        S.ref = {
          name: p.name,
          addr: p.addr,
          lat: p.lat,
          lng: p.lng,
          approx: true,
        };
        ls("ref", JSON.stringify(S.ref));
        refChanged(true);
        geocode("ref:" + p.addr, p.addr, false).then((g) => {
          if (g && S.ref && S.ref.addr === p.addr) {
            S.ref.lat = g.lat;
            S.ref.lng = g.lng;
            S.ref.approx = false;
            ls("ref", JSON.stringify(S.ref));
            refChanged(false);
          }
        });
      };
      pr.appendChild(b);
    });
    box.appendChild(pr);
    const n = el("input");
    n.placeholder = "Name (e.g. APAN Venue)";
    n.value = S.ref ? S.ref.name : "";
    const a = el("input");
    a.placeholder = "Address (e.g. 620 Michigan Ave NE, Washington, DC)";
    a.value = S.ref ? S.ref.addr : "";
    const set = el("button", "mini", "SET LOCATION");
    const msg = el("div", "small mut");
    set.onclick = async () => {
      if (!n.value.trim() || !a.value.trim()) {
        msg.textContent = "Enter both a name and an address.";
        return;
      }
      msg.textContent = "Looking it up...";
      const g = await geocode("ref:" + a.value.trim(), a.value.trim(), false);
      if (!g) {
        msg.textContent = "Address not found. Try adding the city and ZIP.";
        return;
      }
      S.ref = {
        name: n.value.trim(),
        addr: a.value.trim(),
        lat: g.lat,
        lng: g.lng,
      };
      ls("ref", JSON.stringify(S.ref));
      refChanged(true);
    };
    box.append(n, a, set, msg);
    if (S.ref)
      box.appendChild(
        el(
          "div",
          "small",
          (S.ref.approx ? "Approximate pin: " : "") +
            "Times are estimates from " +
            S.ref.name +
            ". Real walking routes are fetched when you create the link.",
        ),
      );
    refHolder.appendChild(box);
  }

  /* ---------- filters ---------- */
  function ok(r) {
    if (S.meal && !r.meals.some((m) => m.indexOf(S.meal) >= 0)) return false;
    if (S.cg && r.cg !== S.cg) return false;
    if (S.v && rank[r.v] < S.v) return false;
    if (S.vg && rank[r.vg] < S.vg) return false;
    if (S.g && rank[r.g] < S.g) return false;
    const t = priceTier(r);
    if (S.price && t && t > S.price) return false;
    if (S.walk) {
      const d = dist(S.ref, ptOf(r));
      if (d && d.min > S.walk) return false;
    }
    if (S.onlySel && !S.sel.includes(r.id)) return false;
    if (
      S.q &&
      (r.name + " " + r.cc + " " + (r.dishes || "") + " " + (r.area || ""))
        .toLowerCase()
        .indexOf(S.q) < 0
    )
      return false;
    return true;
  }
  function activeFilters() {
    return [S.meal, S.cg, S.v, S.vg, S.g, S.price, S.walk, S.onlySel].filter(
      Boolean,
    ).length;
  }
  function applyF() {
    fbody.classList.toggle("closed", !S.fopen);
    const n = activeFilters();
    ftoggle.textContent =
      (S.fopen ? "HIDE FILTERS" : "FILTERS") + (n ? " (" + n + ")" : "");
  }
  function filtersBox() {
    const box = el("div", "card");
    const head = el("div", "row");
    const t = el("div", "b", "2. BROWSE & PICK (UP TO " + MAXPICK + ")");
    t.style.flex = "1";
    ftoggle = el("button", "mini ftoggle", "FILTERS");
    ftoggle.onclick = () => {
      S.fopen = !S.fopen;
      applyF();
    };
    head.append(t, ftoggle);
    box.appendChild(head);
    qIn = el("input");
    qIn.type = "search";
    qIn.placeholder = "Search name, dish, cuisine";
    qIn.oninput = () => {
      S.q = qIn.value.toLowerCase();
      renderList();
      renderMap(false);
    };
    box.appendChild(qIn);
    fbody = el("div", "fb");
    const g = el("div", "grid2");
    const sel = (key, opts, numeric) => {
      const s = el("select");
      opts.forEach(([tx, v]) => {
        const o = el("option", null, tx);
        o.value = v;
        s.appendChild(o);
      });
      s.value = S[key];
      s.onchange = () => {
        S[key] = numeric ? Number(s.value) : s.value;
        applyF();
        renderList();
        renderMap(false);
      };
      ctl[key] = s;
      return s;
    };
    g.append(
      sel("sort", [
        ["Sort: A to Z", "name"],
        ["Sort: nearest first", "dist"],
        ["Sort: price, low to high", "price"],
      ]),
      sel("meal", [
        ["Any meal", ""],
        ["Lunch", "lunch"],
        ["Dinner", "dinner"],
        ["Coffee", "coffee"],
      ]),
      sel(
        "cg",
        [["Any cuisine", ""]].concat(
          [...new Set(P.map((r) => r.cg))].sort().map((x) => [x, x]),
        ),
      ),
      sel(
        "price",
        [
          ["Any price", 0],
          ["$ only", 1],
          ["Up to $$", 2],
          ["Up to $$$", 3],
        ],
        true,
      ),
      sel(
        "walk",
        [
          ["Any distance", 0],
          ["Within 10 min walk", 10],
          ["Within 20 min walk", 20],
          ["Within 30 min walk", 30],
        ],
        true,
      ),
      sel(
        "v",
        [
          ["Veg: any", 0],
          ["Veg: OK+", 2],
          ["Veg: Good", 3],
        ],
        true,
      ),
      sel(
        "vg",
        [
          ["Vegan: any", 0],
          ["Vegan: OK+", 2],
          ["Vegan: Good", 3],
        ],
        true,
      ),
      sel(
        "g",
        [
          ["GF: any", 0],
          ["GF: OK+", 2],
          ["GF: Good", 3],
        ],
        true,
      ),
    );
    fbody.appendChild(g);
    const r2 = el("div", "grid2");
    const only = el("button", "mini", "SELECTED ONLY");
    only.onclick = () => {
      S.onlySel = !S.onlySel;
      only.classList.toggle("fill", S.onlySel);
      applyF();
      renderList();
      renderMap(false);
    };
    ctl.only = only;
    const rs = el("button", "mini", "RESET FILTERS");
    rs.onclick = () => {
      Object.assign(S, {
        meal: "",
        cg: "",
        v: 0,
        vg: 0,
        g: 0,
        q: "",
        price: 0,
        walk: 0,
        onlySel: false,
        sort: "name",
      });
      ["sort", "meal", "cg", "price", "walk", "v", "vg", "g"].forEach(
        (k) => (ctl[k].value = S[k]),
      );
      qIn.value = "";
      only.classList.remove("fill");
      applyF();
      renderList();
      renderMap(false);
    };
    r2.append(only, rs);
    fbody.appendChild(r2);
    box.appendChild(fbody);
    setTimeout(applyF, 0);
    return box;
  }

  /* ---------- cards ---------- */
  function chipsFor(r) {
    const f = el("div", "chips");
    f.appendChild(
      el(
        "span",
        "chip fill",
        distText(S.ref, ptOf(r), null, true) || "LOCATING...",
      ),
    );
    [
      ["VEG", "v"],
      ["VEGAN", "vg"],
      ["GF", "g"],
    ].forEach(([l, k]) =>
      f.appendChild(
        el("span", "chip " + r[k], l + " " + (r[k] === "U" ? "?" : LV[r[k]])),
      ),
    );
    return f;
  }
  function placeCard(r, inPin) {
    const on = S.sel.includes(r.id);
    const c = el("div", "pc" + (on ? " sel" : ""));
    if (!inPin) c.id = "pl" + r.id;
    const top = el("div", "top");
    const nm = el("div", "nm", r.name);
    nm.onclick = () => toggleOpen(r.id);
    top.appendChild(nm);
    const ab = el(
      "button",
      "add" + (on ? " fill" : ""),
      on ? "#" + (S.sel.indexOf(r.id) + 1) + " ADDED" : "+ ADD",
    );
    ab.onclick = () => toggle(r.id);
    top.appendChild(ab);
    if (inPin) {
      const x = el("button", "add", "X");
      x.setAttribute("aria-label", "Close");
      x.onclick = () => {
        S.pin = null;
        renderPinCard();
        renderMap(false);
      };
      top.appendChild(x);
    }
    c.appendChild(top);
    c.appendChild(
      el("div", "ln", r.cc + " · " + (r.area || "") + " · " + tierTxt(r)),
    );
    const cr = el("div", "row2");
    cr.appendChild(chipsFor(r));
    const tg = el("button", "mini", S.open[r.id] ? "LESS" : "INFO");
    tg.onclick = () => toggleOpen(r.id);
    cr.appendChild(tg);
    c.appendChild(cr);
    if (S.open[r.id]) c.appendChild(details(r, S.ref, ptOf(r), true));
    return c;
  }
  function toggleOpen(id) {
    S.open[id] = !S.open[id];
    refreshCard(id);
  }
  function refreshCard(id) {
    const e = document.getElementById("pl" + id);
    if (e) e.replaceWith(placeCard(BY[id], false));
    if (S.pin === id) renderPinCard();
  }
  function toggle(id) {
    const i = S.sel.indexOf(id);
    S.msg = "";
    if (i >= 0) S.sel.splice(i, 1);
    else {
      if (S.sel.length >= MAXPICK) {
        S.msg = "Max " + MAXPICK + " places per vote. Remove one first.";
        S.trayOpen = true;
        renderTray();
        return;
      }
      S.sel.push(id);
    }
    S.made = null;
    renderList();
    renderPinCard();
    renderMap(false);
    renderTray();
  }
  function renderList() {
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      dist: (a, b) => dk(a) - dk(b) || a.name.localeCompare(b.name),
      price: (a, b) =>
        (priceTier(a) || 9) - (priceTier(b) || 9) ||
        a.name.localeCompare(b.name),
    }[S.sort];
    function dk(r) {
      const p = ptOf(r);
      return p && S.ref ? hav(S.ref, p) : 1e9;
    }
    const rs = P.filter(ok).sort(cmp);
    listHolder.replaceChildren();
    const pend = P.filter((r) => !("p" + r.id in GEO)).length;
    listHolder.appendChild(
      el(
        "div",
        "small mut",
        rs.length +
          " of " +
          P.length +
          " places" +
          (pend ? " · locating " + pend + " more..." : ""),
      ),
    );
    if (!rs.length)
      listHolder.appendChild(
        el("div", "banner", "Nothing matches. Try RESET FILTERS."),
      );
    rs.forEach((r) => listHolder.appendChild(placeCard(r, false)));
  }

  /* ---------- map ---------- */
  function renderMap(refit) {
    const pins = P.filter(ok)
      .map((r) => {
        const p = ptOf(r);
        if (!p) return null;
        const i = S.sel.indexOf(r.id);
        return {
          id: r.id,
          lat: p.lat,
          lng: p.lng,
          label: i >= 0 ? String(i + 1) : "",
          sel: i >= 0,
          hi: S.pin === r.id,
          title: r.name,
        };
      })
      .filter(Boolean);
    mapObj.set(S.ref, pins, pickPin, !!refit);
  }
  function pickPin(id) {
    S.pin = id;
    renderPinCard();
    renderMap(false);
    const p = ptOf(BY[id]);
    if (p) mapObj.focus(p);
    if (desk()) {
      const e = document.getElementById("pl" + id);
      if (e) {
        e.scrollIntoView({ block: "center", behavior: "smooth" });
        e.classList.add("flash");
        setTimeout(() => e.classList.remove("flash"), 1500);
      }
    }
  }
  function renderPinCard() {
    pinHolder.replaceChildren();
    if (S.pin != null && BY[S.pin])
      pinHolder.appendChild(placeCard(BY[S.pin], true));
    else
      pinHolder.appendChild(
        el(
          "div",
          "small mut",
          "Tap a pin to see that place here. The map keeps its position.",
        ),
      );
  }

  /* ---------- tray (selected places + create link) ---------- */
  function renderTray() {
    trayEl.replaceChildren();
    trayEl.className = "tray" + (S.trayOpen ? " open" : "");
    const head = el("div", "trayhead");
    head.appendChild(
      el("b", null, S.sel.length + " / " + MAXPICK + " SELECTED"),
    );
    const tg = el(
      "button",
      "mini ttoggle",
      S.trayOpen ? "HIDE" : "REVIEW & CREATE",
    );
    tg.onclick = () => {
      S.trayOpen = !S.trayOpen;
      renderTray();
    };
    head.appendChild(tg);
    trayEl.appendChild(head);
    const body = el("div", "traybody");
    S.sel.forEach((id, i) => {
      const row = el("div", "selrow");
      row.appendChild(el("span", null, i + 1 + ". " + BY[id].name));
      const x = el("button", "mini", "REMOVE");
      x.onclick = () => toggle(id);
      row.appendChild(x);
      body.appendChild(row);
    });
    if (!S.sel.length)
      body.appendChild(el("div", "small mut", "Add places with + ADD."));
    if (S.msg) body.appendChild(el("div", "err", S.msg));
    const ti = el("input");
    ti.placeholder = "Name this vote (e.g. Tuesday dinner)";
    ti.value = S.title || "";
    ti.oninput = () => {
      S.title = ti.value;
    };
    body.appendChild(ti);
    const need = !S.ref
      ? "Set a reference location first."
      : S.sel.length < 2
        ? "Pick at least 2 places."
        : "";
    const b = el("button", "fill big", "CREATE LINK");
    b.disabled = !!need;
    body.appendChild(b);
    if (need) body.appendChild(el("div", "small mut", need));
    const out = el("div", "outbox");
    body.appendChild(out);
    if (S.made) {
      out.appendChild(el("div", "b", "YOUR LINK"));
      if (S.made.err) out.appendChild(el("div", "err", S.made.err));
      else {
        const inp = el("input");
        inp.value = S.made.url;
        inp.readOnly = true;
        inp.onfocus = () => inp.select();
        out.appendChild(inp);
        const r2 = el("div", "row");
        const cp = el("button", "fill", "COPY LINK");
        cp.onclick = () => {
          inp.select();
          (navigator.clipboard
            ? navigator.clipboard.writeText(S.made.url)
            : Promise.reject()
          ).then(
            () => (cp.textContent = "COPIED"),
            () => {
              document.execCommand("copy");
              cp.textContent = "COPIED";
            },
          );
        };
        r2.appendChild(cp);
        r2.appendChild(A(S.made.url, "OPEN (VOTE + RESULTS)", "lnk inl"));
        out.appendChild(r2);
        out.appendChild(
          el(
            "div",
            "small mut",
            S.made.routed === S.made.total
              ? "Real walking routes found for all " + S.made.total + " places."
              : "Real walking routes found for " +
                  S.made.routed +
                  " of " +
                  S.made.total +
                  " places; the rest show estimates.",
          ),
        );
        if (S.made.miss && S.made.miss.length)
          out.appendChild(
            el(
              "div",
              "banner",
              "No map pin found for: " +
                S.made.miss.join(", ") +
                ". They still appear in the vote, without distance.",
            ),
          );
      }
    }
    trayEl.appendChild(body);
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "SAVING...";
      holdBG = true;
      const coords = {};
      const miss = [];
      for (const id of S.sel) {
        const r = BY[id];
        let g = ptOf(r);
        if (!g && !("p" + id in GEO))
          g = await geocode("p" + id, placeQuery(r), true);
        if (g) coords[id] = g;
        else miss.push(r.name);
      }
      holdBG = false;
      b.textContent = "FINDING WALKING ROUTES...";
      const legs = {};
      const ids = S.sel.filter((x) => coords[x]);
      let nxt = 0;
      await Promise.all(
        [0, 1, 2].map(async () => {
          while (nxt < ids.length) {
            const x = ids[nxt++];
            const lg = await walkRoute(S.ref, coords[x]);
            if (lg) legs[x] = lg;
          }
        }),
      );
      const id = rid(7, "abcdefghjkmnpqrstuvwxyz23456789");
      try {
        await API.createPoll({
          id,
          title: (S.title || "").trim() || "Where should we eat?",
          ref: { name: S.ref.name, lat: S.ref.lat, lng: S.ref.lng },
          places: S.sel.slice(),
          coords,
          legs,
        });
        S.made = {
          url: location.href.split("#")[0] + "#p=" + id,
          miss,
          routed: Object.keys(legs).length,
          total: S.sel.length,
        };
        S.trayOpen = true;
      } catch (e) {
        S.made = {
          err:
            "Could not save the vote. Is the " +
            LABEL_CODE.toLowerCase() +
            " right and the database set up? " +
            String(e.message).slice(0, 120),
        };
        S.trayOpen = true;
      }
      renderTray();
    };
  }

  /* ---------- build the page once ---------- */
  function applyView() {
    mapcol.classList.toggle("hide", S.view !== "map");
    listcol.classList.toggle("hide", S.view !== "list");
    vt.forEach((b, i) =>
      b.classList.toggle("on", S.view === (i ? "map" : "list")),
    );
    if (S.view === "map") mapObj.show();
  }
  let vt = [];
  app.replaceChildren();
  app.appendChild(el("div", "brand", "CONFOODENCE"));
  app.appendChild(
    el(
      "div",
      "sub",
      TAGLINE + ". Set up a vote, then send your friends one link.",
    ),
  );
  app.appendChild(dash());
  const org = el("div", "org");
  const side = el("div", "side");
  refHolder = el("div");
  trayEl = el("div", "tray");
  side.appendChild(refHolder);
  side.appendChild(filtersBox());
  const tabs = el("div", "tabs two viewtabs");
  [
    ["list", "LIST"],
    ["map", "MAP"],
  ].forEach(([k, t]) => {
    const b = el("button", null, t);
    b.onclick = () => {
      S.view = k;
      applyView();
    };
    vt.push(b);
    tabs.appendChild(b);
  });
  side.appendChild(tabs);
  side.appendChild(trayEl);
  mapcol = el("div", "mapcol");
  const mapBox = el("div", "mapbox");
  mapBox.id = "map";
  pinHolder = el("div");
  mapcol.append(mapBox, pinHolder);
  listcol = el("div", "listcol");
  listHolder = el("div", "plist");
  listcol.appendChild(listHolder);
  org.append(side, mapcol, listcol);
  app.appendChild(org);
  mapObj = Map_(mapBox);
  renderRef();
  renderPinCard();
  renderList();
  renderTray();
  applyView();
  renderMap(true);
  /* locate places in the background (cached); repaint as they resolve */
  (async () => {
    for (const r of P) {
      if ("p" + r.id in GEO) continue;
      while (holdBG) await sleep(300);
      await geocode("p" + r.id, placeQuery(r), true);
      if (
        !document.activeElement ||
        !document.activeElement.matches("input,select")
      )
        renderList();
      renderMap(false);
    }
    renderRef();
  })();
}

/* ===== voter ===== */
async function voter() {
  const app = $("app");
  let poll;
  try {
    poll = await API.getPoll(POLLID);
  } catch (e) {
    poll = null;
  }
  if (!poll) {
    app.appendChild(
      el(
        "div",
        "err",
        "This vote was not found. Check the link, or the " +
          LABEL_CODE.toLowerCase() +
          ".",
      ),
    );
    return;
  }
  const IDS = poll.places.filter((i) => BY[i]);
  const N = IDS.length;
  const ref = poll.ref;
  let vid = ls("voter");
  if (!vid) {
    vid = rid(12, "0123456789abcdef");
    ls("voter", vid);
  }
  let draft = {};
  try {
    draft = JSON.parse(ls("draft:" + POLLID) || "{}");
  } catch (e) {}
  const S = {
    tab: "vote",
    mine: draft,
    all: [],
    err: "",
    done: ls("done:" + POLLID) === "1",
    armed: false,
    openRes: {},
  };
  const pt = (id) => (poll.coords && poll.coords[id] ? poll.coords[id] : null);
  const leg = (id) => (poll.legs && poll.legs[id]) || null;
  const answered = () => IDS.filter((x) => x in S.mine).length;
  const firstOpen = () => {
    const k = IDS.findIndex((x) => !(x in S.mine));
    return k < 0 ? N : k;
  };
  async function refresh() {
    const was = S.done;
    try {
      S.all = await API.votes(POLLID, vid);
      S.err = "";
      const mine = S.all.filter((v) => v.mine);
      if (N && IDS.every((id) => mine.some((v) => v.place_id === id))) {
        S.done = true;
        ls("done:" + POLLID, "1");
        mine.forEach((v) => (S.mine[v.place_id] = v.vote));
      }
    } catch (e) {
      S.err = "Could not reach the vote server. Retrying...";
    }
    if (S.tab !== "vote" || S.done !== was) draw();
  }
  function pick(id, val) {
    if (S.done) return;
    S.mine[id] = val;
    ls("draft:" + POLLID, JSON.stringify(S.mine));
  }
  async function submit() {
    try {
      await API.submit(
        POLLID,
        vid,
        IDS,
        IDS.map((id) => S.mine[id]),
      );
      S.done = true;
      ls("done:" + POLLID, "1");
      S.tab = "res";
      await refresh();
      draw();
      window.scrollTo(0, 0);
    } catch (e) {
      S.armed = false;
      S.err =
        "Could not submit. Check your connection and try again. " +
        String(e.message).slice(0, 100);
      draw();
    }
  }
  const sym = (val, size) => {
    const s = el("span", "sy");
    s.appendChild(icon(val, size || 16));
    return s;
  };
  const gotoSlide = (k) => {
    const e = document.getElementById("sl" + k);
    if (e) e.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function draw() {
    app.replaceChildren();
    app.appendChild(el("div", "brand", "CONFOODENCE"));
    app.appendChild(
      el(
        "div",
        "sub",
        poll.title.toUpperCase() + " · REF: " + ref.name.toUpperCase(),
      ),
    );
    app.appendChild(dash());
    if (S.err) app.appendChild(el("div", "err", S.err));
    const tabs = el("div", "tabs");
    [
      ["vote", "VOTE"],
      ["map", "MAP"],
      ["res", S.done ? "RESULTS" : "RESULTS (LOCKED)"],
    ].forEach(([k, t]) => {
      const b = el("button", S.tab === k ? "on" : null, t);
      b.onclick = () => {
        if (S.tab === k && k === "vote") return startVoting();
        S.tab = k;
        draw();
        window.scrollTo(0, 0);
        if (k !== "vote") refresh();
      };
      tabs.appendChild(b);
    });
    app.appendChild(tabs);
    if (!N)
      app.appendChild(
        el(
          "div",
          "err",
          "None of the places in this vote are available any more.",
        ),
      );
    else if (S.tab === "vote") voteView();
    else if (S.tab === "map") mapView();
    else resView();
  }
  function startVoting() {
    if (S.done) return;
    gotoSlide(firstOpen());
  }

  /* ----- voting: one full-screen card at a time; nothing re-renders, the page just scrolls ----- */
  function voteView() {
    if (S.done) {
      app.appendChild(
        el(
          "div",
          "banner",
          "Your votes are in and locked. Open RESULTS to see how everyone voted.",
        ),
      );
      IDS.forEach((id, k) => app.appendChild(summaryRow(id, k, false)));
      const g = el("button", "fill big", "SEE RESULTS");
      g.onclick = () => {
        S.tab = "res";
        draw();
        window.scrollTo(0, 0);
      };
      app.appendChild(g);
      return;
    }
    const intro = el("div", "card");
    intro.appendChild(el("div", "b", N + " PLACES · ABOUT 2 MINUTES"));
    intro.appendChild(
      el(
        "div",
        "small",
        "Read each card and tap Yes, Maybe or No. It moves on by itself. Votes are anonymous and final once submitted. Results unlock when you finish.",
      ),
    );
    const go = el(
      "button",
      "fill big",
      answered()
        ? "CONTINUE (" + answered() + " / " + N + " DONE)"
        : "START VOTING",
    );
    go.onclick = startVoting;
    intro.appendChild(go);
    app.appendChild(intro);

    const wrap = el("div", "slides");
    const bar = el("div", "pbar");
    const dots = IDS.map((id, k) => {
      const d = el("button", "dot", String(k + 1));
      d.onclick = () => gotoSlide(k);
      bar.appendChild(d);
      return d;
    });
    const dr = el("button", "dot rv", "OK");
    dr.onclick = () => gotoSlide(N);
    bar.appendChild(dr);
    wrap.appendChild(bar);
    const paintDots = () => {
      dots.forEach((d, k) => d.classList.toggle("done", IDS[k] in S.mine));
      dr.classList.toggle("done", answered() === N);
    };
    const btns = {};
    const reviewBox = el("div", "reviewlist");
    function renderReview() {
      reviewBox.replaceChildren();
      IDS.forEach((id, k) => reviewBox.appendChild(summaryRow(id, k, true)));
      subBtn.disabled = answered() < N;
      subBtn.textContent =
        answered() < N
          ? "ANSWER " + (N - answered()) + " MORE TO SUBMIT"
          : S.armed
            ? "TAP AGAIN: LOCK IN MY VOTES"
            : "SUBMIT MY VOTES";
      subBtn.classList.toggle("armed", S.armed);
    }
    const subBtn = el("button", "fill big");
    IDS.forEach((id, k) => {
      const r = BY[id];
      const s = el("section", "slide");
      s.id = "sl" + k;
      const body = el("div", "sbody");
      body.appendChild(el("div", "pn", k + 1 + " / " + N));
      const nm = el("div", "b");
      nm.style.fontSize = "22px";
      nm.textContent = r.name.toUpperCase();
      body.appendChild(nm);
      body.appendChild(
        el("div", "small", (r.cc + " · " + (r.area || "")).toUpperCase()),
      );
      if (r.addr) body.appendChild(el("div", "small", r.addr.toUpperCase()));
      const dp = el("div");
      dp.appendChild(distPill(ref, pt(id), leg(id)));
      body.appendChild(dp);
      body.appendChild(dash());
      body.appendChild(details(r, ref, pt(id), true));
      s.appendChild(body);
      const vb = el("div", "votebar");
      const v = el("div", "vote");
      btns[id] = [];
      [
        [1, "YES"],
        [0, "MAYBE"],
        [-1, "NO"],
      ].forEach(([val, t]) => {
        const b = el("button", S.mine[id] === val ? "on" : null);
        b.appendChild(icon(val));
        b.appendChild(el("span", null, t));
        b.onclick = () => {
          pick(id, val);
          S.armed = false;
          btns[id].forEach(([bv, bb]) => bb.classList.toggle("on", bv === val));
          paintDots();
          renderReview();
          setTimeout(() => gotoSlide(answered() === N ? N : k + 1), 260);
        };
        btns[id].push([val, b]);
        v.appendChild(b);
      });
      vb.appendChild(v);
      s.appendChild(vb);
      wrap.appendChild(s);
    });
    const rs = el("section", "slide");
    rs.id = "sl" + N;
    const rb = el("div", "sbody");
    rb.appendChild(el("div", "b", "REVIEW & SUBMIT"));
    rb.appendChild(
      el(
        "div",
        "small mut",
        "Tap a row to change an answer. Votes are anonymous and cannot be changed after you submit.",
      ),
    );
    rb.appendChild(reviewBox);
    rs.appendChild(rb);
    const sv = el("div", "votebar");
    subBtn.onclick = () => {
      if (answered() < N) return;
      if (!S.armed) {
        S.armed = true;
        renderReview();
        setTimeout(() => {
          if (S.armed && !S.done) {
            S.armed = false;
            renderReview();
          }
        }, 7000);
        return;
      }
      subBtn.disabled = true;
      subBtn.textContent = "SUBMITTING...";
      submit();
    };
    sv.appendChild(subBtn);
    rs.appendChild(sv);
    wrap.appendChild(rs);
    app.appendChild(wrap);
    paintDots();
    renderReview();
  }
  function summaryRow(id, k, clickable) {
    const row = el("div", "sumrow" + (clickable ? " clk" : ""));
    row.appendChild(el("span", "sn", k + 1 + ". " + BY[id].name));
    const v = S.mine[id];
    if (v === undefined)
      row.appendChild(el("span", "mut small", "NOT ANSWERED"));
    else row.appendChild(sym(v, 18));
    if (clickable) row.onclick = () => gotoSlide(k);
    return row;
  }

  /* ----- map ----- */
  function mapView() {
    const box = el("div", "mapbox");
    box.id = "map";
    app.appendChild(box);
    const mo = Map_(box);
    const pins = IDS.map((id, k) => {
      const p = pt(id);
      return p
        ? {
            id,
            lat: p.lat,
            lng: p.lng,
            label: String(k + 1),
            sel: id in S.mine,
            title: BY[id].name,
          }
        : null;
    }).filter(Boolean);
    mo.set(
      ref,
      pins,
      (id) => {
        if (S.done) {
          S.tab = "res";
          S.openRes[id] = true;
        } else S.tab = "vote";
        draw();
        window.scrollTo(0, 0);
        if (!S.done) setTimeout(() => gotoSlide(IDS.indexOf(id)), 50);
      },
      false,
    );
    mo.show();
    app.appendChild(
      el(
        "div",
        "small mut",
        "Tap a numbered pin to jump to that place. Filled pins are the ones you have answered.",
      ),
    );
    IDS.forEach((id, k) => {
      const row = el("div", "row");
      row.appendChild(el("b", null, k + 1 + " " + BY[id].name.toUpperCase()));
      const sp = el(
        "span",
        "mut small",
        distText(ref, pt(id), leg(id)) || "NO PIN",
      );
      sp.style.marginLeft = "auto";
      row.appendChild(sp);
      app.appendChild(row);
    });
  }

  /* ----- results ----- */
  function resView() {
    if (!S.done) {
      app.appendChild(
        el(
          "div",
          "banner",
          "Results unlock after you answer all " +
            N +
            " places and submit. You have answered " +
            answered() +
            ".",
        ),
      );
      const g = el("button", "fill big", "BACK TO VOTING");
      g.onclick = () => {
        S.tab = "vote";
        draw();
        window.scrollTo(0, 0);
      };
      app.appendChild(g);
      return;
    }
    const nv = Math.round(S.all.length / N);
    app.appendChild(
      el(
        "div",
        "small mut",
        nv +
          (nv === 1 ? " PERSON HAS" : " PEOPLE HAVE") +
          " SUBMITTED · UPDATES EVERY FEW SECONDS · TAP A ROW FOR DETAILS",
      ),
    );
    const rows = IDS.map((id) => {
      const vs = S.all.filter((v) => v.place_id === id);
      return {
        id,
        n: vs.length,
        y: vs.filter((v) => v.vote === 1).length,
        m: vs.filter((v) => v.vote === 0).length,
        x: vs.filter((v) => v.vote === -1).length,
        s: vs.reduce((a, v) => a + v.vote, 0),
      };
    }).sort(
      (a, b) =>
        b.s - a.s ||
        b.y - a.y ||
        a.x - b.x ||
        BY[a.id].name.localeCompare(BY[b.id].name),
    );
    rows.forEach((x) => {
      x.top =
        x.n > 0 && x.s === rows[0].s && x.y === rows[0].y && x.x === rows[0].x;
    });
    const ties = rows.filter((x) => x.top).length;
    rows.forEach((x, i) => {
      const r = BY[x.id];
      const c = el("div", "rc" + (x.top ? " top" : ""));
      const h = el("div", "rhead");
      const t = el(
        "div",
        "rname",
        (x.top
          ? ties > 1
            ? "TIED FOR TOP · "
            : "TOP PICK · "
          : i + 1 + ". ") + r.name.toUpperCase(),
      );
      t.onclick = () => {
        S.openRes[x.id] = !S.openRes[x.id];
        draw();
      };
      h.appendChild(t);
      h.appendChild(el("b", null, (x.s > 0 ? "+" : "") + x.s));
      c.appendChild(h);
      const l2 = el("div", "rline");
      const sy = el("span", "syrow");
      if (!x.n) sy.appendChild(el("span", "mut small", "NO VOTES YET"));
      for (let q = 0; q < x.y; q++) sy.appendChild(sym(1, 15));
      for (let q = 0; q < x.m; q++) sy.appendChild(sym(0, 15));
      for (let q = 0; q < x.x; q++) sy.appendChild(sym(-1, 15));
      l2.appendChild(sy);
      l2.appendChild(
        el(
          "span",
          "mut small",
          (distText(ref, pt(x.id), leg(x.id), true) || "").replace(
            / \(EST\)/g,
            "",
          ),
        ),
      );
      c.appendChild(l2);
      if (x.top) {
        const g = el("div", "row");
        g.appendChild(el("span", "small b", "DIRECTIONS:"));
        g.appendChild(
          A(directions(ref, r, "transit"), "[ TRANSIT ]", "lnk inl"),
        );
        g.appendChild(A(directions(ref, r, "walking"), "[ WALK ]", "lnk inl"));
        c.appendChild(g);
      }
      if (S.openRes[x.id]) c.appendChild(details(r, ref, pt(x.id), true));
      app.appendChild(c);
    });
  }
  draw();
  refresh();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 6000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}
