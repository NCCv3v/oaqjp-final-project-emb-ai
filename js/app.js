import { CAFES, POWDERS, CRAWLS, GLOSSARY, BREW, METHOD, SOURCES } from "./data.js";
import { L, t } from "./i18n.js";
import {
  filterCafes,
  filterPowders,
  formatMins,
  haversine,
  hkdPerGram,
  openingState,
} from "./logic.js";

const STORE = "chasen-hk-v1";

const state = {
  lang: "en",
  tab: "map",
  types: { matcha: true, hojicha: true },
  tiers: { specialist: true, neighbourhood: true, counter: false },
  tastingOnly: false,
  openNow: false,
  savedOnly: false,
  district: "all",
  query: "",
  powderQuery: "",
  powderSort: "popular",
  powderType: "all",
  tag: "all",
  routeId: null,
  savedCafes: [],
  savedPowders: [],
  compare: [],
  notes: {},
  grams: 2,
  cups: 7,
  costId: "matchali-matcha",
  userPos: null,
  sheet: null,
  selected: null,
  locMsg: "",
  journal: "home",
  mapMode: "street",
};

let map;
let Leaflet;
let markerLayer;
let routeLine;
let userLayer;
let mapReady = false;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function lang() {
  return state.lang;
}

function tr(key) {
  return t(lang(), key);
}

function tx(value) {
  return L(lang(), value);
}

function load() {
  const nav = (navigator.language || "en").toLowerCase();
  state.lang = nav.startsWith("zh") ? "zh" : nav.startsWith("nl") ? "nl" : "en";
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!saved) return;
    for (const key of ["lang", "savedCafes", "savedPowders", "compare", "notes", "grams", "cups", "costId", "tiers", "types"]) {
      if (saved[key] != null) state[key] = saved[key];
    }
  } catch {
    /* keep defaults */
  }
}

function save() {
  localStorage.setItem(STORE, JSON.stringify({
    lang: state.lang,
    savedCafes: state.savedCafes,
    savedPowders: state.savedPowders,
    compare: state.compare,
    notes: state.notes,
    grams: state.grams,
    cups: state.cups,
    costId: state.costId,
    tiers: state.tiers,
    types: state.types,
  }));
}

function cafeById(id) {
  return CAFES.find((cafe) => cafe.id === id);
}

function powderById(id) {
  return POWDERS.find((powder) => powder.id === id);
}

function visibleCafes() {
  return filterCafes(CAFES, POWDERS, { ...state, routes: CRAWLS });
}

function visiblePowders() {
  return filterPowders(POWDERS, state);
}

function noteKey(kind, id) {
  return `${kind}:${id}`;
}

function isSaved(list, id) {
  return list.includes(id);
}

function toggleList(list, id) {
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return next;
}

function hoursText(cafe) {
  const open = openingState(cafe);
  if (open.status === "open") {
    return `${tr("open")} · ${tr("closes")} ${formatMins(open.closes)}`;
  }
  if (open.status === "unknown") return tr("unknownHours");
  if (open.status === "out") {
    return open.upcoming ? `${tr("outSeason")} · ${cafe.season[0]}` : tr("outSeason");
  }
  if (open.nextMins != null) {
    const when = open.nextOffset === 0
      ? tr("today")
      : open.nextOffset === 1
        ? tr("tomorrow")
        : tr(`day${open.nextIdx}`);
    return `${tr("closed")} · ${tr("opensAt")} ${when} ${formatMins(open.nextMins)}`;
  }
  return tr("closed");
}

function weekText(cafe) {
  if (!cafe.hours) return tr("unknownHours");
  return cafe.hours.map((span, index) => {
    const name = tr(`day${index}`);
    if (span === "unknown") return `${name} · ${tr("unknownHours")}`;
    if (!span) return `${name} · —`;
    return `${name} · ${formatMins(span[0])}–${formatMins(span[1])}`;
  }).join("<br>");
}

function priceGram(powder) {
  return hkdPerGram(powder.price);
}

function money(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `HK$${value.toFixed(2)}`;
}

function typeLabel(type) {
  if (type === "matcha") return tr("matcha");
  if (type === "hojicha") return tr("hojicha");
  return tr("leaf");
}

function cluster(kind, x) {
  const hoji = kind === "hojicha";
  const mound = hoji ? "#7a3d22" : "#246332";
  const hi = hoji ? "#d48445" : "#7cb85a";
  const tea = hoji ? "#e39a48" : "#c6e15a";
  const foam = hoji ? "#f8e6cc" : "#f6ffd4";
  const whisk = hoji ? "#d2a36a" : "#f3e4bf";
  const line = hoji ? "#8d5a30" : "#a67c45";
  return `
    <g transform="translate(${x} 0)">
      <ellipse cx="30" cy="62" rx="16" ry="4.5" fill="#7f97c9" opacity="0.55"/>
      <ellipse cx="16" cy="48" rx="10" ry="6.5" fill="${mound}"/>
      <ellipse cx="14" cy="45" rx="6.5" ry="4" fill="${hi}"/>
      <ellipse cx="18" cy="44" rx="3" ry="2" fill="#f4f7df" opacity="0.35"/>
      <path d="M22 42c0 10 6 15 15 15s15-5 15-15H22z" fill="#f7ead4"/>
      <path d="M26 42c1.2 7 5 11 11 11s10-4 11-11" fill="#e4c8a4"/>
      <ellipse cx="37" cy="41" rx="15" ry="5.2" fill="#efd8b4"/>
      <ellipse cx="37" cy="40" rx="12" ry="3.8" fill="${tea}"/>
      <ellipse cx="34" cy="39" rx="5" ry="1.5" fill="${foam}"/>
      <path d="M48 18c7 9 6 18 1 28" stroke="${whisk}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M44 14c2 7 1 12-1 16" stroke="${line}" stroke-width="1.15" fill="none" stroke-linecap="round"/>
      <path d="M49 12c3 8 3 14 0 20" stroke="${line}" stroke-width="1.15" fill="none" stroke-linecap="round"/>
      <path d="M54 15c3 7 2 14-1 19" stroke="${line}" stroke-width="1.15" fill="none" stroke-linecap="round"/>
    </g>`;
}

function markerHTML(cafe) {
  const both = cafe.types.includes("matcha") && cafe.types.includes("hojicha");
  const kind = both ? "both" : (cafe.types[0] || "matcha");
  const selected = state.selected === cafe.id ? " is-selected" : "";
  return `<div class="pin pin-${kind}${selected}"><span></span><em>${esc(cafe.name)}</em></div>`;
}

function svg(view, w, h, body) {
  return `<svg viewBox="${view}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
}

function pinSize() {
  return { size: [18, 18], anchor: [9, 9] };
}

function mapsUrl(cafe, apple) {
  const q = encodeURIComponent(`${cafe.name} ${tx(cafe.branch)}`);
  if (apple) return `https://maps.apple.com/?ll=${cafe.lat},${cafe.lng}&q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${cafe.lat},${cafe.lng}`;
}

function paintChrome() {
  document.getElementById("eyebrow").textContent = tr("preview");
  document.getElementById("title").textContent = tr("appName");
  document.getElementById("subtitle").textContent = tr("appSub");
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : lang();
  const langs = document.getElementById("langs");
  langs.innerHTML = ["zh", "en", "nl"].map((code) => {
    const label = code === "zh" ? "繁" : code === "en" ? "EN" : "NL";
    return `<button type="button" class="lang${state.lang === code ? " on" : ""}" data-act="lang" data-lang="${code}">${label}</button>`;
  }).join("");
  document.getElementById("tabbar").innerHTML = [
    ["map", tr("tabMap")],
    ["cafes", tr("tabCafes")],
    ["taste", tr("tabTaste")],
    ["powder", tr("tabPowder")],
    ["book", tr("tabBook")],
  ].map(([id, label]) => `<button type="button" class="tab${state.tab === id ? " on" : ""}" data-act="tab" data-tab="${id}"><span>${esc(label)}</span></button>`).join("");
  tickClock();
}

function tickClock() {
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const node = document.getElementById("clock");
  if (node) node.textContent = hm;
}

function showTab(tab) {
  state.tab = tab;
  for (const id of ["map", "cafes", "taste", "powder", "book"]) {
    document.getElementById(`view-${id}`).hidden = id !== tab;
  }
  paintChrome();
  if (tab === "map") {
    ensureMap();
    updateMarkers();
    setTimeout(() => map && map.invalidateSize(), 60);
  } else if (tab === "cafes") renderCafes();
  else if (tab === "taste") renderTaste();
  else if (tab === "powder") renderPowders();
  else renderBook();
  renderSheet();
}

function chip(act, id, label, on, extra = "") {
  return `<button type="button" class="chip${on ? " on" : ""}" data-act="${act}" data-id="${id}" ${extra}>${esc(label)}</button>`;
}

function renderFilters() {
  const host = document.getElementById("filters");
  const districts = ["all", "island", "kowloon", "nt"].map((id) => {
    const label = id === "all" ? tr("allAreas") : tr(id);
    return chip("district", id, label, state.district === id);
  }).join("");
  host.innerHTML = [
    chip("type", "matcha", tr("matcha"), state.types.matcha),
    chip("type", "hojicha", tr("hojicha"), state.types.hojicha),
    chip("tier", "specialist", tr("specialist"), state.tiers.specialist),
    chip("tier", "neighbourhood", tr("neighbourhood"), state.tiers.neighbourhood),
    chip("tier", "counter", tr("counter"), state.tiers.counter),
    chip("flag", "tastingOnly", tr("tastingOnly"), state.tastingOnly),
    chip("flag", "openNow", tr("openNow"), state.openNow),
    chip("flag", "savedOnly", tr("savedOnly"), state.savedOnly),
    districts,
    chip("near", "near", tr("near"), Boolean(state.userPos)),
  ].join("");
  const mapQuery = document.getElementById("map-q");
  if (mapQuery) {
    mapQuery.placeholder = tr("searchCafes");
    if (mapQuery.value !== state.query) mapQuery.value = state.query;
  }
  const legend = document.getElementById("legend");
  legend.innerHTML = `
    <span>${miniKey("matcha")} ${esc(tr("legendMatcha"))}</span>
    <span>${miniKey("hojicha")} ${esc(tr("legendHojicha"))}</span>`;
  const route = CRAWLS.find((item) => item.id === state.routeId);
  const banner = document.getElementById("route-banner");
  if (route) {
    banner.hidden = false;
    banner.innerHTML = `<strong>${esc(tx(route.name))}</strong> <button type="button" data-act="clear-route">${esc(tr("clearRoute"))}</button>`;
  } else banner.hidden = true;
  document.getElementById("zoom-in").setAttribute("aria-label", tr("zoomIn"));
  document.getElementById("zoom-out").setAttribute("aria-label", tr("zoomOut"));
  document.getElementById("fit-map").textContent = tr("fit");
}

function miniKey(kind) {
  return `<i class="key key-${kind}"></i>`;
}

function showMapNote(message) {
  const note = document.getElementById("map-note");
  if (!note) return;
  note.hidden = !message;
  note.textContent = message || "";
}

function ensureMap() {
  renderFilters();
  if (mapReady) return;
  const stage = document.getElementById("map");
  if (!window.L || typeof window.L.map !== "function") {
    useAtlas(tr("mapFail"));
    mapReady = true;
    return;
  }
  Leaflet = window.L;
  try {
    map = Leaflet.map(stage, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 11,
      maxZoom: 16,
    }).setView([22.302, 114.174], 12);
  } catch (err) {
    console.error(err);
    useAtlas(tr("mapFail"));
    mapReady = true;
    return;
  }
  const tiles = Leaflet.tileLayer("vendor/tiles/{z}/{x}/{y}.png?v=5", {
    minZoom: 11,
    maxZoom: 16,
    maxNativeZoom: 13,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  let loaded = false;
  const markLoaded = () => {
    loaded = true;
    showMapNote("");
  };
  tiles.on("tileload", markLoaded);
  setTimeout(() => {
    if (!loaded && state.mapMode !== "atlas") showMapNote(tr("mapFail"));
  }, 4000);
  markerLayer = Leaflet.layerGroup().addTo(map);
  routeLine = Leaflet.polyline([], { color: "#1d6b43", weight: 4, opacity: 0.85 }).addTo(map);
  userLayer = Leaflet.layerGroup().addTo(map);
  map.on("click", () => {
    if (state.sheet) closeSheet();
  });
  mapReady = true;
  updateMarkers();
  const frame = () => {
    map.invalidateSize();
    fitCafes();
  };
  requestAnimationFrame(frame);
  setTimeout(frame, 180);
}

function useAtlas(message) {
  state.mapMode = "atlas";
  document.getElementById("map").hidden = true;
  const atlas = document.getElementById("atlas");
  atlas.hidden = false;
  const note = document.getElementById("atlas-note");
  if (note) note.textContent = message || "";
}

function updateMarkers() {
  renderFilters();
  const cafes = visibleCafes();
  if (state.mapMode === "atlas" || !map) {
    paintAtlas(cafes);
    return;
  }
  markerLayer.clearLayers();
  userLayer.clearLayers();
  for (const cafe of cafes) {
    const box = pinSize(cafe);
    const icon = Leaflet.divIcon({
      className: "pin-wrap",
      html: markerHTML(cafe),
      iconSize: box.size,
      iconAnchor: box.anchor,
    });
    const marker = Leaflet.marker([cafe.lat, cafe.lng], { icon, zIndexOffset: state.selected === cafe.id ? 800 : 0 });
    marker.on("click", (event) => {
      Leaflet.DomEvent.stopPropagation(event);
      openCafe(cafe.id);
    });
    marker.addTo(markerLayer);
  }
  const route = CRAWLS.find((item) => item.id === state.routeId);
  const points = route ? route.cafes.map(cafeById).filter(Boolean).map((cafe) => [cafe.lat, cafe.lng]) : [];
  routeLine.setLatLngs(points);
  if (state.userPos) {
    Leaflet.circleMarker([state.userPos.lat, state.userPos.lng], {
      radius: 7,
      color: "#c4452d",
      weight: 2,
      fillColor: "#f6e27a",
      fillOpacity: 1,
    }).addTo(userLayer);
  }
}

function paintAtlas(cafes) {
  const atlas = document.getElementById("atlas");
  const bounds = { west: 113.9, east: 114.28, south: 22.22, north: 22.45 };
  const pins = cafes.map((cafe) => {
    const x = ((cafe.lng - bounds.west) / (bounds.east - bounds.west)) * 100;
    const y = ((bounds.north - cafe.lat) / (bounds.north - bounds.south)) * 100;
    return `<button type="button" class="atlas-pin" style="left:${x}%;top:${y}%" data-act="cafe" data-id="${cafe.id}">${markerHTML(cafe)}<em>${esc(cafe.name)}</em></button>`;
  }).join("");
  atlas.innerHTML = `
    <p class="atlas-note" id="atlas-note">${esc(tr("mapFail"))}</p>
    <div class="atlas-land">
      <span class="land island">${esc(tr("island"))}</span>
      <span class="land kowloon">${esc(tr("kowloon"))}</span>
      <span class="land nt">${esc(tr("nt"))}</span>
      ${pins}
    </div>`;
}

function fitCafes(list) {
  const cafes = list || visibleCafes();
  if (!cafes.length || !map || state.mapMode === "atlas") return;
  const bounds = Leaflet.latLngBounds(cafes.map((cafe) => [cafe.lat, cafe.lng]));
  map.fitBounds(bounds.pad(0.25), { animate: true });
}

function renderCafes() {
  const host = document.getElementById("view-cafes");
  const cafes = sortCafes(visibleCafes());
  const hidden = CAFES.filter((cafe) => cafe.tier === "counter").length;
  const counterNote = !state.tiers.counter && !state.routeId
    ? `<button type="button" class="inline-link" data-act="tier" data-id="counter">${hidden} ${esc(tr("hiddenCounters"))} · ${esc(tr("showCounters"))}</button>`
    : "";
  host.innerHTML = `
    <div class="pad list-wrap">
      <label class="search"><input id="cafe-q" value="${esc(state.query)}" placeholder="${esc(tr("searchCafes"))}"></label>
      <div class="filters" id="cafe-filters"></div>
      ${counterNote}
      <div id="cafe-list">${cafeCards(cafes)}</div>
    </div>`;
  document.getElementById("cafe-filters").innerHTML = document.getElementById("filters").innerHTML;
  const input = document.getElementById("cafe-q");
  input.addEventListener("input", () => {
    state.query = input.value;
    const list = document.getElementById("cafe-list");
    if (list) list.innerHTML = cafeCards(sortCafes(visibleCafes()));
    updateMarkers();
  });
}

function sortCafes(list) {
  return [...list].sort((a, b) => {
    if (state.userPos) {
      return haversine(state.userPos, a) - haversine(state.userPos, b);
    }
    const rank = { specialist: 0, neighbourhood: 1, counter: 2 };
    return (rank[a.tier] - rank[b.tier]) || tx(a.area).localeCompare(tx(b.area)) || a.name.localeCompare(b.name);
  });
}

function cafeCards(cafes) {
  if (!cafes.length) return `<p class="empty">${esc(tr("noCafes"))}</p>`;
  return cafes.map((cafe) => {
    const dist = state.userPos ? `${haversine(state.userPos, cafe).toFixed(1)} km` : "";
    const types = cafe.types.map((type) => `<i class="pill ${type}">${esc(typeLabel(type))}</i>`).join("");
    const taste = cafe.tasting ? `<i class="pill taste">${esc(tr("tasting"))}</i>` : "";
    const price = cafe.drinkFrom ? `<b>HK$${cafe.drinkFrom}+</b>` : "";
    return `
      <button type="button" class="card cafe-card" data-act="cafe" data-id="${cafe.id}">
        <span class="mini">${markerHTML(cafe)}</span>
        <span class="card-copy">
          <strong>${esc(cafe.name)} <em>${esc(tx(cafe.branch))}</em></strong>
          <small>${esc(tx(cafe.area))} ${dist ? `· ${dist}` : ""}</small>
          <span class="pills">${types}${taste}</span>
          <small class="hours-line">${esc(hoursText(cafe))}</small>
        </span>
        ${price}
      </button>`;
  }).join("");
}

function renderTaste() {
  const sets = CAFES.filter((cafe) => cafe.tasting);
  const cups = CAFES.filter((cafe) => !cafe.tasting && cafe.tier !== "counter");
  const host = document.getElementById("view-taste");
  host.innerHTML = `
    <div class="pad">
      <p class="lead">${esc(tr("tasteLead"))}</p>
      <p class="note">${esc(tr("noOmakase"))}</p>
      <h2>${esc(tr("tasteSets"))}</h2>
      ${sets.map(tasteCard).join("")}
      <h2>${esc(tr("routes"))}</h2>
      ${CRAWLS.map(routeCard).join("")}
      <h2>${esc(tr("tasteCups"))}</h2>
      ${cups.map((cafe) => cafeCards([cafe])).join("")}
    </div>`;
}

function tasteCard(cafe) {
  return `
    <article class="card block">
      <header>
        <h3>${esc(cafe.name)} <em>${esc(tx(cafe.branch))}</em></h3>
        <i class="pill taste">${esc(cafe.tasting.kind)}</i>
      </header>
      <p><strong>${esc(tx(cafe.tasting.title))}</strong></p>
      <p>${esc(tx(cafe.tasting.detail))}</p>
      <p class="price-line">${esc(tx(cafe.tasting.price))}</p>
      <button type="button" class="stamp" data-act="cafe" data-id="${cafe.id}">${esc(tr("more"))}</button>
    </article>`;
}

function routeCard(route) {
  const names = route.cafes.map((id) => cafeById(id)).filter(Boolean).map((cafe) => cafe.name).join(" → ");
  return `
    <article class="card block">
      <h3>${esc(tx(route.name))}</h3>
      <p>${esc(tx(route.blurb))}</p>
      <p class="meta">${esc(names)}</p>
      <button type="button" class="stamp" data-act="route" data-id="${route.id}">${esc(tr("crawlOn"))}</button>
    </article>`;
}

function renderPowders() {
  const powders = visiblePowders();
  const rows = [];
  for (let i = 0; i < powders.length; i += 3) rows.push(powders.slice(i, i + 3));
  const title = state.powderType === "hojicha" ? tr("hojicha") : state.powderType === "matcha" ? tr("matcha") : tr("powderTitle");
  const tags = ["all", "umami", "latte", "koicha", "roasted", "fresh"].map((tag) => {
    const label = tag === "all" ? tr("allFlavours") : tr(`tag_${tag}`);
    return chip("tag", tag, label, state.tag === tag);
  }).join("");
  const sorts = ["popular", "top", "price", "newest"].map((sort) => {
    const key = sort === "popular" ? "popular" : sort === "top" ? "top" : sort;
    return `<button type="button" class="sort${state.powderSort === sort ? " on" : ""}" data-act="sort" data-id="${sort}">${esc(tr(key))}</button>`;
  }).join("");
  document.getElementById("view-powder").innerHTML = `
    <div class="shelf-page">
      <h2 class="shelf-title">${esc(title)}</h2>
      <label class="search light"><input id="powder-q" value="${esc(state.powderQuery)}" placeholder="${esc(tr("searchPowders"))}"></label>
      <div class="sorts">${sorts}</div>
      <div class="filters powder-filters">
        ${chip("powder-type", "all", tr("allAreas"), state.powderType === "all")}
        ${chip("powder-type", "matcha", tr("matcha"), state.powderType === "matcha")}
        ${chip("powder-type", "hojicha", tr("hojicha"), state.powderType === "hojicha")}
      </div>
      <div class="filters">${tags}</div>
      <p class="script">${esc(tr("tapPowder"))}</p>
      ${rows.map((row) => `
        <div class="shelf-row">
          <div class="tin-row">${row.map(tinButton).join("")}</div>
          <div class="board"></div>
        </div>`).join("") || `<p class="empty">${esc(tr("noPowders"))}</p>`}
      ${state.compare.length ? `<button type="button" class="compare-fab" data-act="journal" data-id="compare">${esc(tr("compareTitle"))} (${state.compare.length})</button>` : ""}
    </div>`;
  document.getElementById("powder-q").addEventListener("input", (event) => {
    state.powderQuery = event.target.value;
    renderPowders();
    const again = document.getElementById("powder-q");
    if (again) {
      again.focus();
      const pos = state.powderQuery.length;
      again.setSelectionRange(pos, pos);
    }
  });
}

function tinButton(powder) {
  const sw = powder.swatch;
  const style = `--body:${sw.body};--band:${sw.band};--ink:${sw.ink};--lid:${sw.lid}`;
  const leaf = powder.leaf ? `<i class="ribbon">${esc(tr("leaf"))}</i>` : "";
  return `
    <button type="button" class="tin-btn" data-act="powder" data-id="${powder.id}">
      <span class="rate">${powder.score.toFixed(1)} <span class="star">★</span></span>
      ${leaf}
      <span class="can ${powder.vessel}" style="${style}">
        <span class="lid"></span>
        <span class="label"><strong>${esc(tx(powder.short))}</strong><em>${esc(tx(powder.maker).split("，")[0].split(",")[0])}</em></span>
      </span>
    </button>`;
}

function renderBook() {
  const host = document.getElementById("view-book");
  if (state.journal === "home") {
    host.innerHTML = `
      <div class="pad">
        <p class="lead">${esc(tr("journalLead"))}</p>
        ${bookLink("saved", tr("myCafes"))}
        ${bookLink("powders", tr("myPowders"))}
        ${bookLink("compare", tr("compareTitle"))}
        ${bookLink("cost", tr("costTitle"))}
        ${bookLink("brew", tr("brewTitle"))}
        ${bookLink("glossary", tr("glossary"))}
        ${bookLink("sources", tr("sources"))}
        <section class="card block">
          <h3>${esc(tr("language"))}</h3>
          <div class="langs big" id="book-langs"></div>
          <p class="note">${esc(tr("install"))}</p>
        </section>
      </div>`;
    document.getElementById("book-langs").innerHTML = document.getElementById("langs").innerHTML;
    return;
  }
  const back = `<button type="button" class="back" data-act="journal" data-id="home">←</button>`;
  if (state.journal === "saved") host.innerHTML = `${back}<div class="pad"><h2>${esc(tr("myCafes"))}</h2>${savedCafes()}</div>`;
  else if (state.journal === "powders") host.innerHTML = `${back}<div class="pad"><h2>${esc(tr("myPowders"))}</h2>${savedPowders()}</div>`;
  else if (state.journal === "compare") host.innerHTML = `${back}<div class="pad">${compareView()}</div>`;
  else if (state.journal === "cost") host.innerHTML = `${back}<div class="pad">${costView()}</div>`;
  else if (state.journal === "brew") host.innerHTML = `${back}<div class="pad"><h2>${esc(tr("brewTitle"))}</h2>${BREW.map(brewCard).join("")}</div>`;
  else if (state.journal === "glossary") host.innerHTML = `${back}<div class="pad"><h2>${esc(tr("glossary"))}</h2>${GLOSSARY.map(glossCard).join("")}</div>`;
  else host.innerHTML = `${back}<div class="pad">${sourcesView()}</div>`;
}

function bookLink(id, label) {
  return `<button type="button" class="card link-card" data-act="journal" data-id="${id}"><span>${esc(label)}</span><span>›</span></button>`;
}

function savedCafes() {
  const list = state.savedCafes.map(cafeById).filter(Boolean);
  if (!list.length) return `<p class="empty">${esc(tr("emptySaved"))}</p>`;
  return cafeCards(list);
}

function savedPowders() {
  const list = state.savedPowders.map(powderById).filter(Boolean);
  if (!list.length) return `<p class="empty">${esc(tr("emptySaved"))}</p>`;
  return list.map((powder) => `
    <button type="button" class="card link-card" data-act="powder" data-id="${powder.id}">
      <span>${esc(tx(powder.name))}</span><span>${powder.score.toFixed(1)} ★</span>
    </button>`).join("");
}

function compareView() {
  const items = state.compare.map(powderById).filter(Boolean);
  if (items.length < 2) {
    return `<h2>${esc(tr("compareTitle"))}</h2><p class="note">${esc(tr("compareHint"))}</p><p class="empty">${esc(tr("needTwo"))}</p>`;
  }
  const rows = [
    ["origin", (powder) => tx(powder.origin)],
    ["grade", (powder) => tx(powder.grade)],
    ["cultivar", (powder) => tx(powder.cultivar)],
    ["flavour", (powder) => tx(powder.flavour)],
    ["score", (powder) => powder.score.toFixed(1)],
    ["priceField", (powder) => {
      const gram = priceGram(powder);
      return gram == null ? "—" : `${money(gram)}${tr("perG")}`;
    }],
  ];
  const head = items.map((powder) => `<th>${esc(tx(powder.short))}</th>`).join("");
  const body = rows.map(([key, pick]) => `
    <tr><th>${esc(tr(key))}</th>${items.map((powder) => `<td>${esc(pick(powder))}</td>`).join("")}</tr>`).join("");
  return `<h2>${esc(tr("compareTitle"))}</h2><p class="note">${esc(tr("compareHint"))}</p><div class="table-wrap"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function costView() {
  const options = POWDERS.filter((powder) => priceGram(powder) != null).map((powder) => {
    const selected = powder.id === state.costId ? " selected" : "";
    return `<option value="${powder.id}"${selected}>${esc(tx(powder.name))}</option>`;
  }).join("");
  const powder = powderById(state.costId) || POWDERS.find((item) => priceGram(item) != null);
  const gram = powder ? priceGram(powder) : null;
  const perBowl = gram == null ? null : gram * Number(state.grams);
  const perMonth = perBowl == null ? null : perBowl * Number(state.cups) * 4.3;
  return `
    <h2>${esc(tr("costTitle"))}</h2>
    <p class="note">${esc(tr("costHint"))}</p>
    <label class="field">${esc(tr("powderTitle"))}<select data-cost="id">${options}</select></label>
    <label class="field">${esc(tr("grams"))}<input data-cost="grams" type="number" min="1" max="8" step="0.5" value="${esc(state.grams)}"></label>
    <label class="field">${esc(tr("cups"))}<input data-cost="cups" type="number" min="1" max="40" step="1" value="${esc(state.cups)}"></label>
    <div class="card block sums">
      <p>${esc(tr("perBowl"))} <strong>${money(perBowl)}</strong></p>
      <p>${esc(tr("perMonth"))} <strong>${money(perMonth)}</strong></p>
      <p class="note">${esc(tr("fxNote"))}</p>
    </div>`;
}

function brewCard(item) {
  const steps = item.steps.map((step, index) => `<li><span>${index + 1}</span>${esc(tx(step))}</li>`).join("");
  return `<article class="card block"><h3>${esc(tx(item.title))}</h3><ol class="steps">${steps}</ol></article>`;
}

function glossCard(item) {
  return `<article class="card block"><h3>${esc(tx(item.term))}</h3><p>${esc(tx(item.body))}</p></article>`;
}

function sourcesView() {
  const links = SOURCES.map((source) => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a></li>`).join("");
  return `<h2>${esc(tr("methodTitle"))}</h2><p>${esc(tx(METHOD))}</p><ul class="sources">${links}</ul>`;
}

function openCafe(id) {
  state.selected = id;
  state.sheet = { kind: "cafe", id };
  updateMarkers();
  renderSheet();
}

function openPowder(id) {
  state.sheet = { kind: "powder", id };
  renderSheet();
}

function closeSheet() {
  state.sheet = null;
  const sheet = document.getElementById("sheet");
  sheet.hidden = true;
  sheet.innerHTML = "";
}

function renderSheet() {
  const sheet = document.getElementById("sheet");
  if (!state.sheet) {
    sheet.hidden = true;
    sheet.innerHTML = "";
    return;
  }
  sheet.hidden = false;
  if (state.sheet.kind === "cafe") sheet.innerHTML = cafeSheet(cafeById(state.sheet.id));
  else sheet.innerHTML = powderSheet(powderById(state.sheet.id));
  sheet.scrollTop = 0;
}

function heart(on) {
  return on ? "♥" : "♡";
}

function cafeSheet(cafe) {
  if (!cafe) return "";
  const saved = isSaved(state.savedCafes, cafe.id);
  const key = noteKey("cafe", cafe.id);
  const note = state.notes[key] || { stars: 0, text: "" };
  const powders = (cafe.powders || []).map(powderById).filter(Boolean);
  const powderBlock = powders.length
    ? powders.map((powder) => `<button type="button" class="text-link" data-act="powder" data-id="${powder.id}">${esc(tx(powder.name))}</button>`).join("")
    : `<p>${esc(tx(cafe.house || ""))}</p>`;
  const drinks = (cafe.signatures || []).map((drink) => {
    const price = drink.price ? ` · HK$${drink.price}` : "";
    return `<li>${esc(tx(drink))}${price}</li>`;
  }).join("");
  const rating = cafe.rating
    ? `<p class="meta">${cafe.rating.toFixed(1)} ★${cafe.ratingCount ? ` · ${cafe.ratingCount} ${esc(tr("publicReviews"))}` : ""}</p>`
    : "";
  return sheetFrame(`
    <p class="kicker">${esc(tx(cafe.area))} · ${esc(tr(cafe.tier))}</p>
    <h2>${esc(cafe.name)}</h2>
    <p class="branch">${esc(tx(cafe.branch))}</p>
    <div class="pills">${cafe.types.map((type) => `<i class="pill ${type}">${esc(typeLabel(type))}</i>`).join("")}${cafe.tasting ? `<i class="pill taste">${esc(tr("tasting"))}</i>` : ""}${cafe.season ? `<i class="pill season">${esc(tr("seasonal"))}</i>` : ""}</div>
    ${rating}
    <p>${esc(tx(cafe.blurb))}</p>
    <p class="hours-line">${esc(hoursText(cafe))}</p>
    <h3>${esc(tr("hours"))}</h3>
    <p class="meta">${weekText(cafe)}</p>
    ${cafe.hoursTypical ? `<p class="note">${esc(tr("typicalHours"))}</p>` : ""}
    <h3>${esc(tr("address"))}</h3>
    <p>${esc(tx(cafe.address))}</p>
    <p class="meta">${esc(tx(cafe.mtr))}</p>
    <p class="row-actions">
      <a class="stamp" href="${mapsUrl(cafe, true)}" target="_blank" rel="noopener">${esc(tr("apple"))}</a>
      <a class="stamp ghost" href="${mapsUrl(cafe, false)}" target="_blank" rel="noopener">${esc(tr("google"))}</a>
    </p>
    <h3>${esc(tr("drinks"))}</h3>
    <ul>${drinks}</ul>
    ${cafe.tasting ? `<h3>${esc(tr("tasting"))}</h3><p><strong>${esc(tx(cafe.tasting.title))}</strong></p><p>${esc(tx(cafe.tasting.detail))}</p><p class="price-line">${esc(tx(cafe.tasting.price))}</p>` : ""}
    <h3>${esc(tr("powdersHere"))}</h3>
    ${powderBlock}
    ${cafe.house && powders.length ? `<p class="note">${esc(tx(cafe.house))}</p>` : ""}
    <h3>${esc(tr("seating"))}</h3>
    <p>${esc(tx(cafe.seating))}</p>
    ${cafe.phone ? `<p><a href="tel:+852${cafe.phone.replace(/\s/g, "")}">${esc(tr("call"))} ${esc(cafe.phone)}</a></p>` : ""}
    ${cafe.url ? `<p><a href="${esc(cafe.url)}" target="_blank" rel="noopener">${esc(tr("website"))}</a></p>` : ""}
    <h3>${esc(tr("stars"))}</h3>
    ${stars(key, note.stars)}
    <label class="field">${esc(tr("notes"))}<textarea data-note="${key}" placeholder="${esc(tr("notePlaceholder"))}">${esc(note.text)}</textarea></label>
    <button type="button" class="stamp wide" data-act="save-cafe" data-id="${cafe.id}">${heart(saved)} ${esc(saved ? tr("saved") : tr("save"))}</button>
  `);
}

function powderSheet(powder) {
  if (!powder) return "";
  const saved = isSaved(state.savedPowders, powder.id);
  const compared = state.compare.includes(powder.id);
  const key = noteKey("powder", powder.id);
  const note = state.notes[key] || { stars: 0, text: "" };
  const gram = priceGram(powder);
  const priceMain = gram == null ? "—" : `${money(gram)}${tr("perG")}`;
  const raw = powder.price
    ? `${powder.price.currency === "JPY" ? "¥" : "US$"}${powder.price.amount} / ${powder.price.grams} g`
    : "";
  const where = CAFES.filter((cafe) => (cafe.powders || []).includes(powder.id));
  const whereHtml = where.length
    ? where.map((cafe) => `<button type="button" class="text-link" data-act="cafe" data-id="${cafe.id}">${esc(cafe.name)} · ${esc(tx(cafe.branch))}</button>`).join("")
    : `<p class="note">${esc(tx(powder.priceNote))}</p>`;
  const tags = (powder.tags || []).map((tag) => `<i class="pill">${esc(tr(`tag_${tag}`))}</i>`).join("");
  const home = gram == null ? "" : `<p class="price-line">${esc(tr("powderCost"))} · 2 g ≈ ${money(gram * 2)}</p>`;
  return sheetFrame(`
    <p class="kicker">${esc(typeLabel(powder.type))}${powder.leaf ? ` · ${esc(tr("leafRibbon"))}` : ""}</p>
    <h2>${esc(tx(powder.name))}</h2>
    <p class="branch">${esc(tx(powder.maker))}</p>
    <p class="score">${powder.score.toFixed(1)} <span class="star">★</span></p>
    <p class="note">${esc(tr("scoreNote"))} ${esc(tx(powder.scoreWhy))}</p>
    <div class="pills">${tags}</div>
    ${field(tr("intro"), tx(powder.intro))}
    ${field(tr("origin"), tx(powder.origin))}
    ${field(tr("grade"), tx(powder.grade))}
    ${field(tr("sourcing"), tx(powder.sourcing))}
    ${field(tr("score"), powder.score.toFixed(1))}
    ${field(tr("ranking"), tx(powder.ranking))}
    ${field(tr("cultivar"), tx(powder.cultivar))}
    ${field(tr("flavour"), tx(powder.flavour))}
    ${field(tr("priceField"), `${priceMain}${raw ? ` · ${raw}` : ""}`)}
    <p class="note">${esc(tx(powder.priceNote))}</p>
    <p class="note">${esc(tr("fxNote"))}</p>
    ${home}
    ${field(tr("prep"), tx(powder.prep))}
    <h3>${esc(tr("where"))}</h3>
    ${whereHtml}
    <p><a href="${esc(powder.url)}" target="_blank" rel="noopener">${esc(tr("makerPage"))}</a></p>
    <h3>${esc(tr("stars"))}</h3>
    ${stars(key, note.stars)}
    <label class="field">${esc(tr("notes"))}<textarea data-note="${key}" placeholder="${esc(tr("notePlaceholder"))}">${esc(note.text)}</textarea></label>
    <p class="row-actions">
      <button type="button" class="stamp" data-act="save-powder" data-id="${powder.id}">${heart(saved)} ${esc(saved ? tr("saved") : tr("save"))}</button>
      <button type="button" class="stamp ghost" data-act="compare-add" data-id="${powder.id}">${esc(compared ? tr("compared") : tr("compare"))}</button>
    </p>
  `);
}

function field(label, value) {
  return `<h3>${esc(label)}</h3><p>${esc(value)}</p>`;
}

function stars(key, value) {
  return `<p class="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn${n <= value ? " on" : ""}" data-act="star" data-key="${key}" data-star="${n}">★</button>`).join("")}</p>`;
}

function sheetFrame(body) {
  return `<button type="button" class="sheet-close" data-act="close">${esc(tr("close"))}</button><div class="sheet-body">${body}</div>`;
}

function locate() {
  if (!navigator.geolocation) {
    state.locMsg = tr("locFail");
    return;
  }
  state.locMsg = tr("locWait");
  navigator.geolocation.getCurrentPosition((pos) => {
    state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    state.locMsg = "";
    updateMarkers();
    if (map && state.mapMode !== "atlas") map.setView([state.userPos.lat, state.userPos.lng], 14);
    if (state.tab === "cafes") renderCafes();
  }, () => {
    state.locMsg = tr("locFail");
    const banner = document.getElementById("route-banner");
    if (banner) {
      banner.hidden = false;
      banner.textContent = state.locMsg;
    }
  }, { enableHighAccuracy: true, timeout: 8000 });
}

function onClick(event) {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  if (act === "lang") {
    state.lang = el.dataset.lang;
    save();
    refresh();
    return;
  }
  if (act === "tab") {
    showTab(el.dataset.tab);
    return;
  }
  if (act === "type") {
    state.types[id] = !state.types[id];
    save();
    refreshLists();
    return;
  }
  if (act === "tier") {
    state.tiers[id] = !state.tiers[id];
    save();
    refreshLists();
    return;
  }
  if (act === "flag") {
    state[id] = !state[id];
    refreshLists();
    return;
  }
  if (act === "district") {
    state.district = id;
    refreshLists();
    return;
  }
  if (act === "near") {
    locate();
    return;
  }
  if (act === "cafe") {
    openCafe(id);
    return;
  }
  if (act === "powder") {
    openPowder(id);
    return;
  }
  if (act === "close") {
    closeSheet();
    return;
  }
  if (act === "save-cafe") {
    state.savedCafes = toggleList(state.savedCafes, id);
    save();
    renderSheet();
    return;
  }
  if (act === "save-powder") {
    state.savedPowders = toggleList(state.savedPowders, id);
    save();
    renderSheet();
    return;
  }
  if (act === "compare-add") {
    if (state.compare.includes(id)) state.compare = state.compare.filter((item) => item !== id);
    else if (state.compare.length < 3) state.compare = [...state.compare, id];
    save();
    renderSheet();
    if (state.tab === "powder") renderPowders();
    return;
  }
  if (act === "star") {
    const key = el.dataset.key;
    const starsNow = Number(el.dataset.star);
    const prev = state.notes[key] || { text: "" };
    state.notes[key] = { ...prev, stars: starsNow };
    save();
    el.parentElement.querySelectorAll("[data-act=star]").forEach((btn) => {
      btn.classList.toggle("on", Number(btn.dataset.star) <= starsNow);
    });
    return;
  }
  if (act === "sort") {
    state.powderSort = id;
    renderPowders();
    return;
  }
  if (act === "powder-type") {
    state.powderType = id;
    renderPowders();
    return;
  }
  if (act === "tag") {
    state.tag = id;
    renderPowders();
    return;
  }
  if (act === "route") {
    state.routeId = id;
    state.tab = "map";
    closeSheet();
    showTab("map");
    const stops = CRAWLS.find((route) => route.id === id).cafes.map(cafeById).filter(Boolean);
    fitCafes(stops);
    return;
  }
  if (act === "clear-route") {
    state.routeId = null;
    updateMarkers();
    fitCafes();
    return;
  }
  if (act === "journal") {
    state.journal = id;
    if (state.tab !== "book") showTab("book");
    else renderBook();
    return;
  }
  if (act === "zoom-in" && map) map.zoomIn();
  if (act === "zoom-out" && map) map.zoomOut();
  if (act === "fit") fitCafes();
}

function onInput(event) {
  const note = event.target.closest("[data-note]");
  if (note) {
    const key = note.dataset.note;
    const prev = state.notes[key] || { stars: 0 };
    state.notes[key] = { ...prev, text: note.value };
    save();
    return;
  }
  const cost = event.target.closest("[data-cost]");
  if (!cost) return;
  if (cost.dataset.cost === "id") state.costId = cost.value;
  if (cost.dataset.cost === "grams") state.grams = Number(cost.value) || 2;
  if (cost.dataset.cost === "cups") state.cups = Number(cost.value) || 1;
  save();
  const sums = document.querySelector(".sums");
  if (!sums) return;
  const powder = powderById(state.costId);
  const gram = powder ? priceGram(powder) : null;
  const perBowl = gram == null ? null : gram * Number(state.grams);
  const perMonth = perBowl == null ? null : perBowl * Number(state.cups) * 4.3;
  const strong = sums.querySelectorAll("strong");
  if (strong[0]) strong[0].textContent = money(perBowl);
  if (strong[1]) strong[1].textContent = money(perMonth);
}

function refresh() {
  paintChrome();
  renderFilters();
  if (state.tab === "map") updateMarkers();
  else showTab(state.tab);
  renderSheet();
}

function refreshLists() {
  updateMarkers();
  if (state.tab === "cafes") renderCafes();
  if (state.tab === "taste") renderTaste();
}

function boot() {
  load();
  paintChrome();
  document.getElementById("map-q").addEventListener("input", (event) => {
    state.query = event.target.value;
    updateMarkers();
  });
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("input", onInput);
  showTab("map");
  setInterval(tickClock, 30000);
}

boot();
