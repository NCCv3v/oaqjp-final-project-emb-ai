import { CAFES, CRAWLS, POWDERS } from "../js/data.js";
import { filterCafes, filterPowders, hkdPerGram, hkClock, openingState } from "../js/logic.js";

const errors = [];

function walk(value, path) {
  if (!value || typeof value !== "object") return;
  if (typeof value.en === "string") {
    for (const key of ["en", "zh", "nl"]) {
      if (typeof value[key] !== "string" || !value[key].trim()) errors.push(`${path}.${key} missing`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
}

const cafeIds = new Set();
for (const cafe of CAFES) {
  if (cafeIds.has(cafe.id)) errors.push(`duplicate cafe ${cafe.id}`);
  cafeIds.add(cafe.id);
  if (cafe.lat < 22.15 || cafe.lat > 22.6 || cafe.lng < 113.8 || cafe.lng > 114.45) {
    errors.push(`coords ${cafe.id}`);
  }
  if (cafe.hours && cafe.hours.length !== 7) errors.push(`hours ${cafe.id}`);
  walk(cafe, cafe.id);
}
const powderIds = new Set();
for (const powder of POWDERS) {
  if (powderIds.has(powder.id)) errors.push(`duplicate powder ${powder.id}`);
  powderIds.add(powder.id);
  walk(powder, powder.id);
  if (powder.price) {
    const gram = hkdPerGram(powder.price);
    if (gram == null || gram <= 0) errors.push(`price ${powder.id}`);
  }
}
for (const cafe of CAFES) {
  for (const id of cafe.powders || []) {
    if (!powderIds.has(id)) errors.push(`${cafe.id} missing powder ${id}`);
  }
}
for (const route of CRAWLS) {
  for (const id of route.cafes) {
    if (!cafeIds.has(id)) errors.push(`route ${route.id} missing ${id}`);
  }
  walk(route, route.id);
}

const sayaka = hkdPerGram(POWDERS.find((powder) => powder.id === "ippodo-sayaka").price);
const matchali = hkdPerGram(POWDERS.find((powder) => powder.id === "matchali-matcha").price);
const hojicha = hkdPerGram(POWDERS.find((powder) => powder.id === "matchali-hojicha").price);
if (sayaka !== 5.72) errors.push(`sayaka ${sayaka}`);
if (matchali !== 10.92) errors.push(`matchali ${matchali}`);
if (hojicha !== 7.54) errors.push(`hojicha ${hojicha}`);

const fridayNoon = new Date("2026-10-02T04:00:00.000Z");
const clock = hkClock(fridayNoon);
if (clock.idx !== 4 || clock.mins !== 12 * 60) errors.push(`clock ${JSON.stringify(clock)}`);
const moon = CAFES.find((cafe) => cafe.id === "matchali-moon");
const aokomi = CAFES.find((cafe) => cafe.id === "aokomi");
const green = CAFES.find((cafe) => cafe.id === "green-icon");
const venner = CAFES.find((cafe) => cafe.id === "venner");
if (openingState(moon, fridayNoon).status !== "open") errors.push("moon should be open Friday noon");
if (openingState(aokomi, fridayNoon).status !== "open") errors.push("aokomi should be open Friday noon");
const greenNoon = openingState(green, fridayNoon);
if (greenNoon.status !== "closed" || greenNoon.nextMins !== 15 * 60) errors.push(`green ${JSON.stringify(greenNoon)}`);
const monday = new Date("2026-10-05T04:00:00.000Z");
if (openingState(venner, monday).status !== "unknown") errors.push("venner monday");
if (openingState(aokomi, monday).status !== "closed") errors.push("aokomi monday");
const beforeSeason = openingState(green, new Date("2026-08-01T04:00:00.000Z"));
if (beforeSeason.status !== "out" || !beforeSeason.upcoming) errors.push("green before season");

const base = {
  types: { matcha: true, hojicha: true },
  tiers: { specialist: true, neighbourhood: true, counter: false },
  district: "all",
  query: "",
  routes: CRAWLS,
};
const specialists = filterCafes(CAFES, POWDERS, base, fridayNoon);
if (specialists.some((cafe) => cafe.tier === "counter")) errors.push("counters leaked");
if (!specialists.some((cafe) => cafe.id === "aokomi")) errors.push("aokomi filtered out");
const hoji = filterCafes(CAFES, POWDERS, { ...base, types: { matcha: false, hojicha: true } }, fridayNoon);
if (hoji.some((cafe) => !cafe.types.includes("hojicha"))) errors.push("hojicha filter");
if (hoji.some((cafe) => cafe.id === "commaa")) errors.push("commaa is matcha only");
const tasted = filterCafes(CAFES, POWDERS, { ...base, tastingOnly: true }, fridayNoon).map((cafe) => cafe.id).sort();
if (tasted.join() !== ["aokomi", "commaa", "green-icon"].sort().join()) errors.push(`tasting ${tasted}`);

const shelf = filterPowders(POWDERS, { powderSort: "price", powderType: "all", tag: "all", powderQuery: "" });
if (shelf[0].id !== "ippodo-hojicha-leaf") errors.push(`cheapest ${shelf[0].id}`);
const newest = filterPowders(POWDERS, { powderSort: "newest", powderType: "all", tag: "all", powderQuery: "" });
if (newest[0].id !== "aokomi-mill") errors.push(`newest ${newest[0].id}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok ${CAFES.length} cafes, ${POWDERS.length} powders, ${specialists.length} default pins`);
