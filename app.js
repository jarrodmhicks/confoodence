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
function icon(kind) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", "22");
  s.setAttribute("height", "22");
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
function distText(ref, pt, leg) {
  const d = dist(ref, pt);
  if (!d) return null;
  const walk = leg ? leg.min : d.min;
  let t = leg ? walk + " MIN WALK" : "~" + walk + " MIN WALK (EST)";
  if (walk >= 12) {
    const m = metroMin(ref, pt);
    if (m && m < walk) t += " · ~" + m + " MIN METRO (EST)";
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
    return { set() {}, show() {} };
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
          icon: mkIcon(p.label, p.sel ? "sel" : ""),
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
    open: null,
    made: null,
  };
  const rank = { G: 3, O: 2, U: 1, B: 0 };
  try {
    S.ref = JSON.parse(ls("ref") || "null");
  } catch (e) {}
  let mapObj = null,
    mapBox = null;
  function head() {
    app.appendChild(el("div", "sub", TAGLINE));
    app.appendChild(
      el("div", "sub", "Set up a vote, then send your friends one link."),
    );
  }
  function refBox() {
    const box = el("div", "card");
    box.appendChild(el("div", "b", "1. REFERENCE LOCATION"));
    const pr = el("div", "row");
    PRESETS.forEach((p) => {
      const b = el("button", null, p.label);
      b.onclick = () => {
        S.ref = {
          name: p.name,
          addr: p.addr,
          lat: p.lat,
          lng: p.lng,
          approx: true,
        };
        ls("ref", JSON.stringify(S.ref));
        paint();
        geocode("ref:" + p.addr, p.addr, false).then((g) => {
          if (g && S.ref && S.ref.addr === p.addr) {
            S.ref.lat = g.lat;
            S.ref.lng = g.lng;
            S.ref.approx = false;
            ls("ref", JSON.stringify(S.ref));
            refreshMap();
            if (S.view === "list") paint();
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
    const set = el("button", null, "SET LOCATION");
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
      paint();
    };
    box.append(n, a, set, msg);
    if (S.ref)
      box.appendChild(
        el(
          "div",
          "small",
          (S.ref.approx ? "Approximate pin: " : "") +
            "Distances are measured from " +
            S.ref.name +
            ".",
        ),
      );
    return box;
  }
  function ok(r) {
    if (S.meal && !r.meals.some((m) => m.indexOf(S.meal) >= 0)) return false;
    if (S.cg && r.cg !== S.cg) return false;
    if (S.v && rank[r.v] < S.v) return false;
    if (S.vg && rank[r.vg] < S.vg) return false;
    if (S.g && rank[r.g] < S.g) return false;
    if (
      S.q &&
      (r.name + " " + r.cc + " " + (r.dishes || "") + " " + (r.area || ""))
        .toLowerCase()
        .indexOf(S.q) < 0
    )
      return false;
    return true;
  }
  function filters() {
    const box = el("div", "card");
    box.appendChild(el("div", "b", "2. BROWSE & PICK (UP TO " + MAXPICK + ")"));
    const q = el("input");
    q.type = "search";
    q.placeholder = "Search name, dish, cuisine";
    q.value = S.q;
    q.oninput = () => {
      S.q = q.value.toLowerCase();
      list();
    };
    box.appendChild(q);
    const g = el("div", "grid2");
    const sel = (opts, key, numeric) => {
      const s = el("select");
      opts.forEach(([t, v]) => {
        const o = el("option", null, t);
        o.value = v;
        if (String(S[key]) === String(v)) o.selected = true;
        s.appendChild(o);
      });
      s.onchange = () => {
        S[key] = numeric ? Number(s.value) : s.value;
        list();
      };
      return s;
    };
    g.appendChild(
      sel(
        [
          ["Any meal", ""],
          ["Lunch", "lunch"],
          ["Dinner", "dinner"],
          ["Coffee", "coffee"],
        ],
        "meal",
      ),
    );
    g.appendChild(
      sel(
        [["Any cuisine", ""]].concat(
          [...new Set(P.map((r) => r.cg))].sort().map((x) => [x, x]),
        ),
        "cg",
      ),
    );
    const lv = [
      ["Veg: any", 0],
      ["Veg: OK+", 2],
      ["Veg: Good", 3],
    ];
    g.appendChild(sel(lv, "v", true));
    g.appendChild(
      sel(
        [
          ["Vegan: any", 0],
          ["Vegan: OK+", 2],
          ["Vegan: Good", 3],
        ],
        "vg",
        true,
      ),
    );
    g.appendChild(
      sel(
        [
          ["GF: any", 0],
          ["GF: OK+", 2],
          ["GF: Good", 3],
        ],
        "g",
        true,
      ),
    );
    box.appendChild(g);
    const tg = el("div", "tabs");
    tg.style.gridTemplateColumns = "1fr 1fr";
    [
      ["list", "LIST"],
      ["map", "MAP"],
    ].forEach(([k, t]) => {
      const b = el("button", S.view === k ? "on" : null, t);
      b.onclick = () => {
        S.view = k;
        paint();
      };
      tg.appendChild(b);
    });
    box.appendChild(tg);
    return box;
  }
  function pinsFor(rs) {
    return rs
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
          title: r.name,
        };
      })
      .filter(Boolean);
  }
  function refreshMap() {
    if (!mapObj) return;
    mapObj.set(
      S.ref,
      pinsFor(P.filter(ok)),
      (id) => {
        S.open = id;
        S.view = "list";
        paint();
        setTimeout(() => {
          const e = document.getElementById("pl" + id);
          if (e) e.scrollIntoView({ block: "center" });
        }, 50);
      },
      false,
    );
  }
  function toggle(id) {
    const i = S.sel.indexOf(id);
    if (i >= 0) S.sel.splice(i, 1);
    else {
      if (S.sel.length >= MAXPICK) {
        alert("Max " + MAXPICK + " places per poll. Remove one first.");
        return;
      }
      S.sel.push(id);
    }
    S.made = null;
    paintTray();
    list();
  }
  function list() {
    const holder = $("plist");
    if (!holder) return;
    holder.replaceChildren();
    const rs = P.filter(ok).sort((a, b) => a.name.localeCompare(b.name));
    holder.appendChild(
      el(
        "div",
        "small mut",
        rs.length +
          " of " +
          P.length +
          " places" +
          (geoPending() ? " · locating " + geoPending() + " more..." : ""),
      ),
    );
    rs.forEach((r) => {
      const c = el("div", "card" + (S.sel.includes(r.id) ? " sel" : ""));
      c.id = "pl" + r.id;
      const h = el("div", "row");
      const t = el("div", "b", r.name);
      t.style.flex = "1";
      h.appendChild(t);
      const ab = el(
        "button",
        S.sel.includes(r.id) ? "fill" : null,
        S.sel.includes(r.id)
          ? "#" + (S.sel.indexOf(r.id) + 1) + " ADDED"
          : "+ ADD",
      );
      ab.onclick = () => toggle(r.id);
      h.appendChild(ab);
      c.appendChild(h);
      c.appendChild(el("div", "small mut", r.cc + " · " + (r.addr || r.area)));
      const pr = el("div", "row");
      pr.appendChild(distPill(S.ref, ptOf(r)));
      [
        ["VEG", "v"],
        ["VEGAN", "vg"],
        ["GF", "g"],
      ].forEach(([l, k]) =>
        pr.appendChild(el("span", "pill", l + " " + LV[r[k]])),
      );
      c.appendChild(pr);
      const dt = el(
        "button",
        null,
        S.open === r.id ? "HIDE DETAILS" : "DETAILS & LINKS",
      );
      dt.onclick = () => {
        S.open = S.open === r.id ? null : r.id;
        list();
      };
      c.appendChild(dt);
      if (S.open === r.id) c.appendChild(details(r, S.ref, ptOf(r), true));
      holder.appendChild(c);
    });
  }
  function geoPending() {
    return P.filter((r) => !("p" + r.id in GEO)).length;
  }
  function paintTray() {
    const t = $("tray");
    if (!t) return;
    t.replaceChildren();
    t.appendChild(el("div", "b", S.sel.length + " / " + MAXPICK + " SELECTED"));
    const ti = el("input");
    ti.placeholder = "Name this vote (e.g. Tuesday dinner)";
    ti.id = "ptitle";
    ti.value = S.title || "";
    ti.oninput = () => {
      S.title = ti.value;
    };
    t.appendChild(ti);
    const need = !S.ref
      ? "Set a reference location first."
      : S.sel.length < 2
        ? "Pick at least 2 places."
        : "";
    const b = el("button", "fill", "CREATE LINK");
    b.disabled = !!need;
    t.appendChild(b);
    if (need) t.appendChild(el("div", "small mut", need));
    const out = el("div");
    t.appendChild(out);
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
        r2.appendChild(A(S.made.url, "OPEN (VOTE + RESULTS)", "lnk"));
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
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "SAVING...";
      holdBG = true;
      const coords = {};
      const miss = [];
      for (const id of S.sel) {
        const r = P[id];
        let g = ptOf(r);
        if (!g && !("p" + id in GEO)) {
          g = await geocode("p" + id, placeQuery(r), true);
        }
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
      } catch (e) {
        S.made = {
          err:
            "Could not save the vote. Is the " +
            LABEL_CODE.toLowerCase() +
            " right and the database set up? " +
            String(e.message).slice(0, 120),
        };
      }
      paintTray();
    };
  }
  function paint() {
    app.replaceChildren();
    app.appendChild(el("div", "brand", "CONFOODENCE"));
    head();
    app.appendChild(dash());
    app.appendChild(refBox());
    app.appendChild(filters());
    mapBox = el("div", "mapbox");
    mapBox.id = "map";
    mapBox.style.display = S.view === "map" ? "block" : "none";
    app.appendChild(mapBox);
    mapObj = Map_(mapBox);
    const pl = el("div");
    pl.id = "plist";
    pl.style.cssText =
      "display:" +
      (S.view === "list" ? "flex" : "none") +
      ";flex-direction:column;gap:8px";
    app.appendChild(pl);
    const tray = el("div", "tray");
    tray.id = "tray";
    app.appendChild(tray);
    list();
    paintTray();
    if (S.view === "map") {
      refreshMap();
      mapObj.show();
    }
  }
  paint();
  /* locate places in the background (cached); repaint pins as they resolve */
  (async () => {
    for (const r of P) {
      if ("p" + r.id in GEO) continue;
      while (holdBG) await sleep(300);
      await geocode("p" + r.id, placeQuery(r), true);
      if (S.view === "map") refreshMap();
      else if ($("plist") && !document.activeElement.matches("input,select"))
        list();
    }
    paintTray();
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
  const IDS = poll.places.filter((i) => P[i]);
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
    i: 0,
    mine: draft,
    all: [],
    err: "",
    done: ls("done:" + POLLID) === "1",
    armed: false,
  };
  let mapObj = null,
    mapBox = null;
  const pt = (id) => (poll.coords && poll.coords[id] ? poll.coords[id] : null);
  const leg = (id) => (poll.legs && poll.legs[id]) || null;
  async function refresh() {
    try {
      S.all = await API.votes(POLLID, vid);
      S.err = "";
      const mine = S.all.filter((v) => v.mine);
      if (IDS.every((id) => mine.some((v) => v.place_id === id))) {
        S.done = true;
        ls("done:" + POLLID, "1");
        mine.forEach((v) => (S.mine[v.place_id] = v.vote));
      }
    } catch (e) {
      S.err = "Could not reach the vote server. Retrying...";
    }
    if (S.tab === "res" || S.tab === "map") draw();
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
        S.tab = k;
        draw();
        if (k !== "vote") refresh();
      };
      tabs.appendChild(b);
    });
    app.appendChild(tabs);
    if (S.tab === "vote") voteView();
    else if (S.tab === "map") mapView();
    else resView();
  }
  function voteView() {
    const id = IDS[S.i],
      r = P[id];
    const dots = el("div", "dots");
    IDS.forEach((x, k) => {
      const d = el(
        "span",
        (x in S.mine ? "done " : "") + (k === S.i ? "cur" : ""),
        String(k + 1),
      );
      d.onclick = () => {
        S.i = k;
        draw();
      };
      dots.appendChild(d);
    });
    app.appendChild(dots);
    app.appendChild(
      el(
        "div",
        "small mut",
        S.i +
          1 +
          " / " +
          IDS.length +
          (S.done
            ? " · SUBMITTED · VOTES ARE FINAL"
            : " · " +
              IDS.filter((x) => x in S.mine).length +
              " ANSWERED · VOTES ARE ANONYMOUS"),
      ),
    );
    app.appendChild(dash());
    app.appendChild(el("div", "b", r.name.toUpperCase()));
    app.querySelector(".b:last-child").style.fontSize = "22px";
    app.appendChild(
      el("div", "small", (r.cc + " · " + (r.area || "")).toUpperCase()),
    );
    if (r.addr) app.appendChild(el("div", "small", r.addr.toUpperCase()));
    const dp = el("div");
    dp.appendChild(distPill(ref, pt(id), leg(id)));
    app.appendChild(dp);
    app.appendChild(dash());
    app.appendChild(details(r, ref, pt(id), true));
    app.appendChild(dash());
    app.appendChild(el("div", "b", "YOUR VOTE"));
    const v = el("div", "vote");
    [
      [1, "YES", "s1"],
      [0, "MAYBE", "s0"],
      [-1, "NO", "sm"],
    ].forEach(([val, t, cl]) => {
      const b = el("button", S.mine[id] === val ? cl : null);
      b.disabled = S.done;
      b.appendChild(icon(val));
      b.appendChild(el("span", null, t));
      b.onclick = () => {
        pick(id, val);
        S.armed = false;
        draw();
        if (S.i < IDS.length - 1)
          setTimeout(() => {
            S.i++;
            draw();
            window.scrollTo(0, 0);
          }, 250);
      };
      v.appendChild(b);
    });
    app.appendChild(v);
    const nav = el("div", "grid2");
    const pv = el("button", null, "< PREV"),
      nx = el("button", null, "NEXT >");
    pv.disabled = S.i === 0;
    nx.disabled = S.i === IDS.length - 1;
    pv.onclick = () => {
      S.i--;
      draw();
      window.scrollTo(0, 0);
    };
    nx.onclick = () => {
      S.i++;
      draw();
      window.scrollTo(0, 0);
    };
    nav.append(pv, nx);
    app.appendChild(nav);
    app.appendChild(dash());
    if (S.done) {
      app.appendChild(
        el(
          "div",
          "banner",
          "Your votes are in and locked. Open RESULTS to see how everyone voted.",
        ),
      );
      return;
    }
    const left = IDS.filter((x) => !(x in S.mine)).length;
    if (left) {
      app.appendChild(
        el(
          "div",
          "small mut",
          "Answer all " +
            IDS.length +
            " places to submit and unlock results (" +
            left +
            " left).",
        ),
      );
      return;
    }
    const sb = el(
      "button",
      "fill",
      S.armed ? "TAP AGAIN: LOCK IN MY VOTES (NO CHANGES)" : "SUBMIT MY VOTES",
    );
    sb.onclick = () => {
      if (!S.armed) {
        S.armed = true;
        draw();
        window.scrollTo(0, document.body.scrollHeight);
        return;
      }
      sb.disabled = true;
      sb.textContent = "SUBMITTING...";
      submit();
    };
    app.appendChild(sb);
    app.appendChild(
      el("div", "small mut", "You cannot change votes after you submit."),
    );
  }
  function mapView() {
    mapBox = el("div", "mapbox");
    mapBox.id = "map";
    app.appendChild(mapBox);
    mapObj = Map_(mapBox);
    const pins = IDS.map((id, k) => {
      const p = pt(id);
      return p
        ? {
            id,
            lat: p.lat,
            lng: p.lng,
            label: String(k + 1),
            sel: id in S.mine,
            title: P[id].name,
          }
        : null;
    }).filter(Boolean);
    mapObj.set(
      ref,
      pins,
      (id) => {
        S.i = IDS.indexOf(id);
        S.tab = "vote";
        draw();
        window.scrollTo(0, 0);
      },
      false,
    );
    mapObj.show();
    app.appendChild(
      el(
        "div",
        "small mut",
        "Tap a numbered pin to open that place. Filled pins are the ones you have answered.",
      ),
    );
    IDS.forEach((id, k) => {
      const r = P[id];
      const row = el("div", "row");
      row.appendChild(el("b", null, k + 1 + " " + r.name.toUpperCase()));
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
  function resView() {
    if (!S.done) {
      const n = IDS.filter((x) => x in S.mine).length;
      app.appendChild(
        el(
          "div",
          "banner",
          "Results unlock after you answer all " +
            IDS.length +
            " places and submit. You have answered " +
            n +
            ".",
        ),
      );
      const g = el("button", "fill", "BACK TO VOTING");
      g.onclick = () => {
        S.tab = "vote";
        draw();
      };
      app.appendChild(g);
      return;
    }
    const nv = Math.round(S.all.length / IDS.length);
    app.appendChild(
      el(
        "div",
        "small mut",
        nv +
          (nv === 1 ? " PERSON HAS" : " PEOPLE HAVE") +
          " SUBMITTED · UPDATES EVERY FEW SECONDS",
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
        P[a.id].name.localeCompare(P[b.id].name),
    );
    rows.forEach((x) => {
      x.top =
        x.n > 0 && x.s === rows[0].s && x.y === rows[0].y && x.x === rows[0].x;
    });
    const ties = rows.filter((x) => x.top).length;
    rows.forEach((x, i) => {
      const r = P[x.id];
      const c = el("div", "card" + (x.top ? " sel" : ""));
      const h = el("div", "row");
      const t = el(
        "div",
        "b",
        (x.top ? (ties > 1 ? "TIED FOR TOP: " : "TOP PICK: ") : i + 1 + ". ") +
          r.name.toUpperCase(),
      );
      t.style.flex = "1";
      h.appendChild(t);
      h.appendChild(el("b", null, (x.s > 0 ? "+" : "") + x.s));
      c.appendChild(h);
      const bar = el("div", "bar");
      [
        ["#2C8A57", x.y],
        ["#C79A2B", x.m],
        ["#B4452F", x.x],
      ].forEach(([col, n]) => {
        const s = el("i");
        s.style.background = col;
        s.style.width = (x.n ? (100 * n) / x.n : 0) + "%";
        bar.appendChild(s);
      });
      c.appendChild(bar);
      c.appendChild(
        el("div", "small", x.y + " YES · " + x.m + " MAYBE · " + x.x + " NO"),
      );
      const d = distText(ref, pt(x.id), leg(x.id));
      c.appendChild(
        el("div", "small mut", (r.cc + " · " + (d || "")).toUpperCase()),
      );
      if (x.top) {
        const g = el("div", "grid2");
        g.appendChild(
          A(directions(ref, r, "transit"), "[ DIRECTIONS: TRANSIT ]", "lnk"),
        );
        g.appendChild(
          A(directions(ref, r, "walking"), "[ DIRECTIONS: WALK ]", "lnk"),
        );
        c.appendChild(g);
      }
      const go_ = el("button", null, "OPEN CARD");
      go_.onclick = () => {
        S.i = IDS.indexOf(x.id);
        S.tab = "vote";
        draw();
        window.scrollTo(0, 0);
      };
      c.appendChild(go_);
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
