const windowLength = 8 * 60 * 60 * 1000;
const minYear = 15;
const maxYear = 2016;
const slot = Math.floor(Date.now() / windowLength);
const stateKey = `chroniclr:${slot}`;
const windowCacheKey = `chroniclr:window:${slot}`;
const packs = window.chroniclrThemePacks;
const state = JSON.parse(localStorage.getItem(stateKey) || "null") || { plays: 0, lastResult: null };
const elements = Object.fromEntries(["resetTimer", "issueNumber", "editionLabel", "playsLabel", "playBeads", "orderMode", "themeMode", "nearMode", "challengeEyebrow", "challengeTitle", "yearWindow", "windowStart", "windowEnd", "promptLine", "eventList", "eventEntry", "targetYear", "eventSearch", "searchEvent", "searchResults", "answerPanel", "feedback", "footnoteText", "footnote", "nextPlay", "checkOrder", "roundIndex", "scoreValue", "scoreUnit", "progressFill", "progressCopy", "sourceNote", "upgradeTop", "upgradeSide", "paywall", "closePaywall", "paywallDone"].map(id => [id, document.getElementById(id)]));
let mode = localStorage.getItem("chroniclr:mode") || "random";
let baseYear = minYear;
let windowEvents = [];
let currentPack = null;
let currentCorrectOrder = [];
let order = [];
let locked = false;
let keyboardGrabbedId = null;
let dragState = null;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function annualWindowEvents(year, extract) {
  const heading = /(?:^|\n)Events\s*\n/i.exec(extract);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = extract.slice(start);
  const end = /\n(?:Births|Deaths|Nobel Prizes|Arts and culture|Sports)\s*\n/i.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const months = "January|February|March|April|May|June|July|August|September|October|November|December";
  const patterns = [
    new RegExp(`^(?:${months})\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*[–—-]\\s*(.+)$`, "i"),
    new RegExp(`^\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${months})\\s*[–—-]\\s*(.+)$`, "i")
  ];
  const results = [];
  for (const rawLine of section.split(/\n+/)) {
    const line = rawLine.replace(/^[*#•\s]+/, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const match = patterns.map(pattern => line.match(pattern)).find(Boolean);
    if (!match) continue;
    const title = match[1].replace(/\s*\[[0-9]+\]\s*/g, " ").trim();
    if (title.length < 18 || title.length > 260) continue;
    results.push({ id: `${year}-${results.length}`, title, year, source: `https://en.wikipedia.org/wiki/${year}` });
  }
  return results.slice(0, 60);
}

async function fetchAnnualWindow(centerYear) {
  const years = Array.from({ length: 15 }, (_, index) => centerYear - 7 + index);
  const params = new URLSearchParams({ action: "query", prop: "extracts", titles: years.join("|"), redirects: "1", exsectionformat: "plain", exchars: "8000", format: "json", formatversion: "2", origin: "*" });
  params.set("explaintext", "1");
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Wikipedia could not be reached.");
  const data = await response.json();
  const pages = data.query?.pages || [];
  return pages.flatMap(page => {
    const year = Number(page.title);
    return Number.isInteger(year) ? annualWindowEvents(year, page.extract || "") : [];
  });
}

function fallbackWindow(centerYear) {
  const events = packs.flatMap(pack => pack.events);
  const feasible = [];
  for (let year = minYear; year <= maxYear; year += 1) {
    const available = new Set(events.filter(event => Math.abs(event.year - year) <= 7).map(event => event.year));
    if (available.size >= 5) feasible.push(year);
  }
  if (!feasible.length) return { year: packs[0].events[2].year, events };
  const nearest = feasible.sort((a, b) => Math.abs(a - centerYear) - Math.abs(b - centerYear))[0];
  return { year: nearest, events };
}

function selectWindowEvents(events, year, roundNumber) {
  const grouped = new Map();
  for (const event of events) {
    if (Math.abs(event.year - year) > 7) continue;
    if (!grouped.has(event.year)) grouped.set(event.year, []);
    grouped.get(event.year).push(event);
  }
  const random = seededRandom(hashSeed(`${slot}:${year}:${roundNumber}:events`));
  const years = shuffle([...grouped.keys()], random);
  const selected = years.slice(0, 5).map(eventYear => shuffle(grouped.get(eventYear), random)[0]);
  return selected.length === 5 ? selected : null;
}

async function loadRandomWindow() {
  const random = seededRandom(hashSeed(`${slot}:base-year`));
  const requestedYear = minYear + Math.floor(random() * (maxYear - minYear + 1));
  baseYear = requestedYear;
  try {
    const cached = JSON.parse(localStorage.getItem(windowCacheKey) || "null");
    if (cached && Array.isArray(cached.events) && cached.events.length >= 5) {
      windowEvents = cached.events;
      baseYear = cached.year;
      return;
    }
    windowEvents = await fetchAnnualWindow(baseYear);
    if (!selectWindowEvents(windowEvents, baseYear, 0)) throw new Error("This year range did not yield enough events.");
    localStorage.setItem(windowCacheKey, JSON.stringify({ year: baseYear, events: windowEvents }));
  } catch {
    const fallback = fallbackWindow(requestedYear);
    baseYear = fallback.year;
    windowEvents = fallback.events;
  }
}

function getThemePack(roundNumber) {
  const random = seededRandom(hashSeed(`${slot}:${roundNumber}:theme`));
  return packs[Math.floor(random() * packs.length)];
}

function persist() {
  localStorage.setItem(stateKey, JSON.stringify(state));
}

function currentTargetYear() {
  if (state.lastResult && state.lastResult.round === state.plays - 1 && state.lastResult.mode === "near") return state.lastResult.targetYear;
  const random = seededRandom(hashSeed(`${slot}:${state.plays}:target`));
  return minYear + Math.floor(random() * (maxYear - minYear + 1));
}

function updateClock() {
  const now = Date.now();
  const nextReset = (Math.floor(now / windowLength) + 1) * windowLength;
  const remaining = Math.max(0, nextReset - now);
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor(remaining % 3600000 / 60000);
  const seconds = Math.floor(remaining % 60000 / 1000);
  elements.resetTimer.textContent = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
  if (Math.floor(now / windowLength) !== slot) window.location.reload();
}

function updateStatus() {
  const remaining = Math.max(0, 3 - state.plays);
  const currentResult = state.lastResult && state.lastResult.round === state.plays - 1 && state.lastResult.mode === mode;
  elements.playsLabel.textContent = "";
  [...elements.playBeads.children].forEach((bead, index) => bead.classList.toggle("is-used", index >= remaining));
  elements.roundIndex.textContent = `${String(Math.min(state.plays + 1, 3)).padStart(2, "0")} / 03`;
  elements.nextPlay.disabled = !state.lastResult;
  elements.nextPlay.textContent = remaining === 0 ? "NO ROUNDS LEFT" : "NEXT ROUND";
  elements.checkOrder.disabled = locked || remaining === 0;
  elements.eventSearch.disabled = mode === "near" && (remaining === 0 || currentResult);
  elements.searchEvent.disabled = mode === "near" && (remaining === 0 || currentResult);
  elements.issueNumber.textContent = String(slot % 1000).padStart(3, "0");
  elements.editionLabel.textContent = "";
}

function setupRandomRound(roundNumber) {
  currentPack = null;
  const selected = selectWindowEvents(windowEvents, baseYear, roundNumber);
  if (selected) {
    currentPack = { title: "A random slice of history", theme: "Random window", events: selected };
  } else {
    const fallback = fallbackWindow(baseYear);
    baseYear = fallback.year;
    windowEvents = fallback.events;
    currentPack = { title: "A random slice of history", theme: "Random window", events: selectWindowEvents(windowEvents, baseYear, roundNumber) };
  }
  order = shuffle(currentPack.events.map((event, index) => index), seededRandom(hashSeed(`${slot}:${roundNumber}:order`)));
}

function setupThemeRound(roundNumber) {
  const pack = getThemePack(roundNumber);
  currentPack = pack;
  order = shuffle(pack.events.map((event, index) => index), seededRandom(hashSeed(`${slot}:${roundNumber}:theme-order`)));
}

function updateYearLabels() {
  const dash = elements.yearWindow.querySelector(".window-dash");
  const target = mode === "near" ? currentTargetYear() : null;
  const years = mode === "near" ? [target] : mode === "theme" && currentPack ? currentPack.events.map(event => event.year) : [baseYear - 7, baseYear + 7];
  elements.windowStart.textContent = Math.min(...years);
  elements.windowEnd.textContent = Math.max(...years);
  dash.hidden = mode === "near";
  elements.windowEnd.hidden = mode === "near";
  elements.yearWindow.setAttribute("aria-label", `Year range ${Math.min(...years)} to ${Math.max(...years)}`);
  elements.targetYear.textContent = target || currentTargetYear();
}

function setMode(nextMode) {
  mode = nextMode;
  localStorage.setItem("chroniclr:mode", mode);
  elements.orderMode.classList.toggle("is-active", mode === "random");
  elements.themeMode.classList.toggle("is-active", mode === "theme");
  elements.nearMode.classList.toggle("is-active", mode === "near");
  elements.orderMode.setAttribute("aria-selected", String(mode === "random"));
  elements.themeMode.setAttribute("aria-selected", String(mode === "theme"));
  elements.nearMode.setAttribute("aria-selected", String(mode === "near"));
  render();
}

function createDragHandle(event, row) {
  const handle = document.createElement("button");
  handle.className = "drag-handle";
  handle.type = "button";
  handle.setAttribute("aria-label", `Reorder ${event.title}. Press Space to pick up, then use the arrow keys. Press Enter to drop.`);
  handle.setAttribute("aria-grabbed", "false");
  const grip = document.createElement("span");
  grip.className = "grip";
  for (let index = 0; index < 6; index += 1) grip.append(document.createElement("i"));
  handle.append(grip);
  handle.addEventListener("pointerdown", pointerDown);
  handle.addEventListener("keydown", keyReorder);
  row.append(handle);
}

function drawRows() {
  elements.eventList.replaceChildren();
  order.forEach((eventIndex, position) => {
    const event = currentPack.events[eventIndex];
    const row = document.createElement("li");
    row.className = "event-row";
    row.dataset.eventId = event.id;
    row.dataset.eventIndex = String(eventIndex);
    const badge = document.createElement("span");
    badge.className = "position";
    badge.textContent = String(position + 1).padStart(2, "0");
    const title = document.createElement("span");
    title.className = "event-title";
    title.textContent = event.title;
    row.append(badge, title);
    if (locked) {
      const year = document.createElement("span");
      year.className = "event-year";
      year.textContent = event.year;
      row.append(year);
      row.classList.add(Number(eventIndex) === currentCorrectOrder[position] ? "correct" : "incorrect");
    } else createDragHandle(event, row);
    elements.eventList.append(row);
  });
}

function refreshPositions() {
  [...elements.eventList.children].filter(row => row.classList.contains("event-row")).forEach((row, index) => {
    row.querySelector(".position").textContent = String(index + 1).padStart(2, "0");
  });
}

function pointerDown(event) {
  if (event.button !== 0 || locked) return;
  event.preventDefault();
  const row = event.currentTarget.closest(".event-row");
  const bounds = row.getBoundingClientRect();
  const placeholder = document.createElement("li");
  placeholder.className = "event-placeholder";
  placeholder.style.height = `${bounds.height}px`;
  row.before(placeholder);
  dragState = { row, placeholder, pointerId: event.pointerId, offsetY: event.clientY - bounds.top, startTop: bounds.top, startLeft: bounds.left, width: bounds.width };
  row.classList.add("is-dragging");
  row.style.position = "fixed";
  row.style.top = `${bounds.top}px`;
  row.style.left = `${bounds.left}px`;
  row.style.width = `${bounds.width}px`;
  row.style.zIndex = "8";
  row.style.pointerEvents = "none";
  event.currentTarget.setPointerCapture(event.pointerId);
  document.addEventListener("pointermove", pointerMove);
  document.addEventListener("pointerup", pointerEnd, { once: true });
  document.addEventListener("pointercancel", pointerEnd, { once: true });
}

function pointerMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.row.style.top = `${event.clientY - dragState.offsetY}px`;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".event-row");
  if (!target || target === dragState.row || !elements.eventList.contains(target)) return;
  const bounds = target.getBoundingClientRect();
  const after = event.clientY > bounds.top + bounds.height / 2;
  elements.eventList.insertBefore(dragState.placeholder, after ? target.nextSibling : target);
}

function pointerEnd(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { row, placeholder } = dragState;
  elements.eventList.insertBefore(row, placeholder);
  placeholder.remove();
  row.classList.remove("is-dragging");
  row.removeAttribute("style");
  order = [...elements.eventList.querySelectorAll(".event-row")].map(item => Number(item.dataset.eventIndex));
  dragState = null;
  document.removeEventListener("pointermove", pointerMove);
  document.removeEventListener("pointercancel", pointerEnd);
  refreshPositions();
}

function keyReorder(event) {
  const handle = event.currentTarget;
  const row = handle.closest(".event-row");
  const position = [...elements.eventList.children].indexOf(row);
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (keyboardGrabbedId === row.dataset.eventId) {
      keyboardGrabbedId = null;
      handle.setAttribute("aria-grabbed", "false");
      elements.feedback.textContent = "Event dropped.";
    } else if (!keyboardGrabbedId) {
      keyboardGrabbedId = row.dataset.eventId;
      handle.setAttribute("aria-grabbed", "true");
      elements.feedback.textContent = "Picked up event. Use the arrow keys to move it, then press Enter to drop.";
    }
    return;
  }
  if (!keyboardGrabbedId || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  event.preventDefault();
  const target = position + (event.key === "ArrowUp" ? -1 : 1);
  if (target < 0 || target >= order.length) return;
  [order[position], order[target]] = [order[target], order[position]];
  drawRows();
  const moved = [...elements.eventList.children][target];
  moved.querySelector(".drag-handle").setAttribute("aria-grabbed", "true");
  moved.querySelector(".drag-handle").focus();
  elements.feedback.textContent = `Moved to position ${target + 1}.`;
}

function answerLink(event) {
  const link = document.createElement("a");
  link.href = event.source || `https://en.wikipedia.org/wiki/${encodeURIComponent(event.title.replaceAll(" ", "_"))}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = event.title;
  return link;
}

function showOrderAnswer(score) {
  elements.answerPanel.replaceChildren();
  const label = document.createElement("span");
  label.className = "answer-title";
  label.textContent = "THE TIMELINE";
  elements.answerPanel.append(label);
  [...currentPack.events].sort((a, b) => a.year - b.year).forEach((event, index) => {
    if (index) elements.answerPanel.append(document.createElement("br"));
    elements.answerPanel.append(answerLink(event), document.createTextNode(` · ${event.year}`));
  });
  elements.answerPanel.hidden = false;
  elements.feedback.textContent = `${score} of 5 in the right position.`;
  elements.feedback.className = `feedback ${score === 5 ? "positive" : "negative"}`;
  elements.scoreValue.firstChild.textContent = String(score);
  elements.scoreUnit.textContent = "/ 5";
  elements.progressFill.style.width = `${score * 20}%`;
  elements.progressCopy.textContent = "Correct positions";
}

function submitOrder() {
  if (locked || state.plays >= 3 || mode === "near") return;
  locked = true;
  currentCorrectOrder = [...currentPack.events].sort((a, b) => a.year - b.year).map(event => currentPack.events.indexOf(event));
  const score = order.reduce((total, eventIndex, position) => total + Number(eventIndex === currentCorrectOrder[position]), 0);
  state.plays += 1;
  state.lastResult = { round: state.plays - 1, mode, score, title: currentPack.title, theme: currentPack.theme, events: currentPack.events, order: [...order] };
  persist();
  drawRows();
  showOrderAnswer(score);
  updateStatus();
}

function showPriorResult() {
  if (!state.lastResult || state.lastResult.round !== state.plays - 1 || state.lastResult.mode !== mode || mode === "near") return false;
  locked = true;
  currentPack.title = state.lastResult.title;
  currentPack.theme = state.lastResult.theme;
  currentPack.events = state.lastResult.events;
  order = state.lastResult.order;
  currentCorrectOrder = [...currentPack.events].sort((a, b) => a.year - b.year).map(event => currentPack.events.indexOf(event));
  const score = state.lastResult.score;
  drawRows();
  showOrderAnswer(score);
  return true;
}

function render() {
  locked = false;
  keyboardGrabbedId = null;
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback";
  elements.answerPanel.replaceChildren();
  elements.answerPanel.hidden = true;
  elements.searchResults.replaceChildren();
  elements.eventEntry.hidden = mode !== "near";
  elements.footnote.hidden = mode === "random";
  elements.sourceNote.hidden = mode === "random";
  elements.eventList.hidden = mode === "near";
  elements.promptLine.hidden = mode === "near";
  elements.checkOrder.hidden = mode === "near";
  elements.challengeEyebrow.textContent = mode === "random" ? "" : mode === "theme" ? "A CURATED TIMELINE" : "A YEAR TO ORBIT";
  elements.challengeTitle.textContent = mode === "random" ? "" : mode === "theme" ? "A themed timeline." : "Name an event near this year.";
  elements.footnoteText.textContent = mode === "theme" ? "A curated set of events from one historical theme." : mode === "near" ? "Name a real event. The closer it is, the higher the score." : "";
  elements.sourceNote.lastElementChild.textContent = mode === "random" ? "" : "Event dates checked against linked Wikipedia records.";
  if (mode === "near") {
    currentPack = null;
    order = [];
    updateYearLabels();
    const prior = state.lastResult && state.lastResult.round === state.plays - 1 && state.lastResult.mode === "near" ? state.lastResult : null;
    elements.scoreValue.firstChild.textContent = prior ? String(prior.score) : "—";
    elements.scoreUnit.textContent = "/ 1000";
    elements.progressFill.style.width = prior ? `${prior.score / 10}%` : "0%";
    elements.progressCopy.textContent = prior ? `${prior.distance} years from ${prior.targetYear}` : "Points for proximity";
    if (prior) {
      const label = document.createElement("span");
      label.className = "answer-title";
      label.textContent = `${prior.score} POINTS · ${prior.distance} YEARS AWAY`;
      const line = document.createElement("div");
      line.append(answerLink({ title: prior.eventTitle, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(prior.eventTitle.replaceAll(" ", "_"))}` }), document.createTextNode(` happened in ${prior.eventYear}. Your year was ${prior.targetYear}.`));
      elements.answerPanel.append(label, line);
      elements.answerPanel.hidden = false;
      elements.feedback.textContent = "Event verified against Wikidata.";
      elements.feedback.className = "feedback positive";
      elements.eventSearch.disabled = true;
      elements.searchEvent.disabled = true;
    } else {
      elements.eventSearch.disabled = false;
      elements.searchEvent.disabled = false;
    }
    elements.checkOrder.disabled = true;
    updateStatus();
    return;
  }
  if (mode === "random") setupRandomRound(state.plays);
  else setupThemeRound(state.plays);
  if (mode === "theme") {
    elements.challengeEyebrow.textContent = currentPack.theme.toUpperCase();
    elements.challengeTitle.textContent = currentPack.title;
  }
  updateYearLabels();
  currentCorrectOrder = [...currentPack.events].sort((a, b) => a.year - b.year).map(event => currentPack.events.indexOf(event));
  if (!showPriorResult()) {
    drawRows();
    elements.scoreValue.firstChild.textContent = "—";
    elements.scoreUnit.textContent = "/ 5";
    elements.progressFill.style.width = "0%";
    elements.progressCopy.textContent = "Correct positions";
  }
  updateStatus();
}

function wikimediaUrl(api, params) {
  return `${api}?${new URLSearchParams({ ...params, format: "json", origin: "*" })}`;
}

async function searchWikipedia() {
  if (state.plays >= 3) {
    openPaywall();
    return;
  }
  const query = elements.eventSearch.value.trim();
  if (!query) return;
  elements.searchResults.replaceChildren();
  elements.feedback.textContent = "Searching Wikipedia…";
  try {
    const url = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", list: "search", srsearch: query, srlimit: "5" });
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Wikipedia search is unavailable.");
    const data = await response.json();
    const results = data.query?.search || [];
    if (!results.length) {
      elements.feedback.textContent = "No matching event. Try a different name.";
      return;
    }
    elements.feedback.textContent = "Choose the event you meant.";
    for (const result of results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.setAttribute("role", "option");
      const title = document.createElement("strong");
      title.textContent = result.title;
      const snippet = document.createElement("span");
      snippet.textContent = result.snippet.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
      button.append(title, snippet);
      button.addEventListener("click", () => scoreSearchResult(result.title));
      elements.searchResults.append(button);
    }
  } catch {
    elements.feedback.textContent = "Wikipedia search could not load. Try again in a moment.";
  }
}

async function resolveWikidataYear(title) {
  const pageUrl = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", prop: "pageprops", ppprop: "wikibase_item", titles: title, redirects: "1", formatversion: "2" });
  const pageResponse = await fetch(pageUrl, { headers: { Accept: "application/json" } });
  if (!pageResponse.ok) throw new Error("The article date is unavailable.");
  const pageData = await pageResponse.json();
  const itemId = pageData.query?.pages?.[0]?.pageprops?.wikibase_item;
  if (!itemId) return null;
  const itemUrl = wikimediaUrl("https://www.wikidata.org/w/api.php", { action: "wbgetentities", ids: itemId, props: "claims" });
  const itemResponse = await fetch(itemUrl, { headers: { Accept: "application/json" } });
  if (!itemResponse.ok) throw new Error("The article date is unavailable.");
  const itemData = await itemResponse.json();
  const claims = itemData.entities?.[itemId]?.claims || {};
  for (const property of ["P585", "P571", "P580", "P577", "P582"]) {
    const claim = claims[property]?.find(value => value.mainsnak?.datavalue?.value?.time);
    if (!claim) continue;
    const time = claim.mainsnak.datavalue.value.time;
    const match = time.match(/^([+-])0*(\d+)-/);
    if (match) return Number(match[2]) * (match[1] === "-" ? -1 : 1);
  }
  return null;
}

async function scoreSearchResult(title) {
  if (state.plays >= 3) {
    openPaywall();
    return;
  }
  elements.searchResults.replaceChildren();
  elements.feedback.textContent = "Checking the event's date…";
  elements.eventSearch.disabled = true;
  elements.searchEvent.disabled = true;
  try {
    const year = await resolveWikidataYear(title);
    if (!Number.isFinite(year)) {
      elements.feedback.textContent = "I couldn't find a reliable year for that article. Try a different result.";
      elements.eventSearch.disabled = false;
      elements.searchEvent.disabled = false;
      return;
    }
    const target = currentTargetYear();
    const distance = Math.abs(year - target);
    const score = Math.max(0, 1000 - distance);
    state.plays += 1;
    state.lastResult = { round: state.plays - 1, mode: "near", score, eventTitle: title, eventYear: year, targetYear: target, distance };
    persist();
    elements.answerPanel.replaceChildren();
    const label = document.createElement("span");
    label.className = "answer-title";
    label.textContent = `${score} POINTS · ${distance} YEARS AWAY`;
    const line = document.createElement("div");
    line.append(answerLink({ title, year, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}` }), document.createTextNode(` happened in ${year}. Your year was ${target}.`));
    elements.answerPanel.append(label, line);
    elements.answerPanel.hidden = false;
    elements.feedback.textContent = "Event verified against Wikidata.";
    elements.feedback.className = "feedback positive";
    elements.scoreValue.firstChild.textContent = String(score);
    elements.scoreUnit.textContent = "/ 1000";
    elements.progressFill.style.width = `${score / 10}%`;
    elements.progressCopy.textContent = `${distance} years from ${target}`;
    elements.searchEvent.disabled = true;
    elements.eventSearch.disabled = true;
    updateStatus();
  } catch {
    elements.feedback.textContent = "The event date could not be checked. Try another result.";
    elements.eventSearch.disabled = false;
    elements.searchEvent.disabled = false;
  }
}

function nextPlay() {
  if (!state.lastResult) return;
  if (state.plays >= 3) {
    openPaywall();
    return;
  }
  state.lastResult = null;
  persist();
  elements.eventSearch.disabled = false;
  elements.searchEvent.disabled = false;
  elements.eventSearch.value = "";
  render();
}

function openPaywall() {
  elements.paywall.hidden = false;
  elements.closePaywall.focus();
}

function closePaywall() {
  elements.paywall.hidden = true;
  elements.upgradeTop.focus();
}

elements.orderMode.addEventListener("click", () => setMode("random"));
elements.themeMode.addEventListener("click", () => setMode("theme"));
elements.nearMode.addEventListener("click", () => setMode("near"));
elements.checkOrder.addEventListener("click", submitOrder);
elements.nextPlay.addEventListener("click", nextPlay);
elements.searchEvent.addEventListener("click", searchWikipedia);
elements.eventSearch.addEventListener("keydown", event => {
  if (event.key === "Enter") searchWikipedia();
});
elements.closePaywall.addEventListener("click", closePaywall);
elements.paywallDone.addEventListener("click", closePaywall);
elements.upgradeTop.addEventListener("click", openPaywall);
elements.upgradeSide.addEventListener("click", openPaywall);
elements.paywall.addEventListener("click", event => {
  if (event.target === elements.paywall) closePaywall();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !elements.paywall.hidden) closePaywall();
});

async function initialize() {
  await loadRandomWindow();
  render();
  updateClock();
  setInterval(updateClock, 1000);
}

initialize();
