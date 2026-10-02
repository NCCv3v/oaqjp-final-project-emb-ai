export const FX = {
  USD: 7.8,
  JPY: 0.052,
  asOf: "2026-10-02",
};

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function hkdPerGram(price) {
  if (!price || price.amount == null || !price.grams || !FX[price.currency]) return null;
  return Math.round((price.amount / price.grams) * FX[price.currency] * 100) / 100;
}

export function hkClock(date = new Date()) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
  }).format(date);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(String(mRaw).slice(0, 2));
  return {
    idx: WEEK.indexOf(wd),
    mins: h * 60 + m,
    iso,
    hm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  };
}

export function inSeason(cafe, iso) {
  if (!cafe.season) return true;
  return iso >= cafe.season[0] && iso <= cafe.season[1];
}

function spanOn(cafe, idx) {
  if (!cafe.hours) return "unknown";
  const span = cafe.hours[idx];
  if (span === "unknown") return "unknown";
  if (!span) return "closed";
  return span;
}

export function openingState(cafe, date = new Date()) {
  const clock = hkClock(date);
  if (cafe.season && !inSeason(cafe, clock.iso)) {
    const upcoming = clock.iso < cafe.season[0];
    return {
      status: "out",
      upcoming,
      season: cafe.season,
    };
  }
  const today = spanOn(cafe, clock.idx);
  if (today === "unknown") return { status: "unknown" };
  if (Array.isArray(today) && clock.mins >= today[0] && clock.mins < today[1]) {
    return { status: "open", closes: today[1], idx: clock.idx };
  }
  for (let offset = 0; offset < 8; offset += 1) {
    const day = (clock.idx + offset) % 7;
    const span = spanOn(cafe, day);
    if (!Array.isArray(span)) continue;
    if (offset === 0 && clock.mins < span[0]) {
      return { status: "closed", nextOffset: 0, nextMins: span[0], nextIdx: day };
    }
    if (offset > 0) {
      return { status: "closed", nextOffset: offset, nextMins: span[0], nextIdx: day };
    }
  }
  if (!cafe.hours || cafe.hours.every((span) => span === "unknown")) {
    return { status: "unknown" };
  }
  return { status: "closed" };
}

export function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function haystack(cafe, powders) {
  const bits = [cafe.name, cafe.id];
  for (const key of ["branch", "area", "address", "mtr", "blurb", "seating"]) {
    const value = cafe[key];
    if (value && typeof value === "object") bits.push(value.en, value.zh, value.nl);
  }
  for (const drink of cafe.signatures || []) bits.push(drink.en, drink.zh, drink.nl);
  for (const powder of powders) {
    if ((cafe.powders || []).includes(powder.id)) {
      bits.push(powder.name.en, powder.name.zh, powder.name.nl, powder.maker.en, powder.maker.zh);
    }
  }
  return bits.filter(Boolean).join(" ").toLowerCase();
}

export function filterCafes(cafes, powders, state, date = new Date()) {
  const q = (state.query || "").trim().toLowerCase();
  return cafes.filter((cafe) => {
    if (state.routeId) {
      const route = (state.routes || []).find((item) => item.id === state.routeId);
      if (route && !route.cafes.includes(cafe.id)) return false;
    }
    if (!cafe.types.some((type) => state.types[type])) return false;
    if (!state.tiers[cafe.tier]) return false;
    if (state.district !== "all" && cafe.district !== state.district) return false;
    if (state.tastingOnly && !cafe.tasting) return false;
    if (state.openNow && openingState(cafe, date).status !== "open") return false;
    if (state.savedOnly && !(state.savedCafes || []).includes(cafe.id)) return false;
    if (q && !haystack(cafe, powders).includes(q)) return false;
    return true;
  });
}

export function filterPowders(powders, state) {
  const q = (state.powderQuery || "").trim().toLowerCase();
  const list = powders.filter((powder) => {
    if (state.powderType !== "all" && powder.type !== state.powderType) return false;
    if (state.tag && state.tag !== "all" && !(powder.tags || []).includes(state.tag)) return false;
    if (!q) return true;
    const bits = [
      powder.name.en, powder.name.zh, powder.name.nl,
      powder.maker.en, powder.maker.zh, powder.maker.nl,
      powder.cultivar.en, powder.cultivar.zh,
      powder.flavour.en, powder.flavour.zh,
      ...(powder.tags || []),
    ];
    return bits.join(" ").toLowerCase().includes(q);
  });
  const price = (powder) => hkdPerGram(powder.price);
  list.sort((a, b) => {
    if (state.powderSort === "top") return b.score - a.score || b.popularity - a.popularity;
    if (state.powderSort === "price") {
      const ap = price(a);
      const bp = price(b);
      if (ap == null && bp == null) return b.popularity - a.popularity;
      if (ap == null) return 1;
      if (bp == null) return -1;
      return ap - bp;
    }
    if (state.powderSort === "newest") {
      const ay = a.year ?? -1;
      const by = b.year ?? -1;
      return by - ay || b.popularity - a.popularity;
    }
    return b.popularity - a.popularity;
  });
  return list;
}

export function formatMins(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
