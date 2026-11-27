const windowLength = 8 * 60 * 60 * 1000;
const minYear = 15;
const maxYear = 2016;
const slot = Math.floor(Date.now() / windowLength);
const stateKey = `chroniclr:${slot}`;
const windowCacheKey = `chroniclr:window:v2:${slot}`;
const packs = window.chroniclrThemePacks;
const state = JSON.parse(localStorage.getItem(stateKey) || "null") || { plays: 0, lastResult: null };
const elements = Object.fromEntries(["resetTimer", "orderMode", "themeMode", "nearMode", "gamePanel", "challengeHeading", "challengeEyebrow", "challengeTitle", "yearWindow", "windowStart", "windowEnd", "promptLine", "eventList", "eventEntry", "targetYear", "eventSearch", "searchEvent", "searchResults", "answerPanel", "feedback", "nextPlay", "checkOrder", "shuffleRound", "roundIndex", "scoreValue", "scoreUnit", "progressFill", "progressCopy", "upgradeTop", "upgradeSide", "paywall", "closePaywall", "paywallDone"].map(id => [id, document.getElementById(id)]));
let mode = localStorage.getItem("chroniclr:mode") || "random";
let baseYear = minYear;
let windowEvents = [];
let currentPack = null;
let currentCorrectOrder = [];
let order = [];
let locked = false;
let keyboardGrabbedId = null;
let dragState = null;
let debugPreview = false;
let debugSeed = "";
let debugYear = null;
let debugEvents = [];
let randomLoadError = false;

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

function annualWindowEvents(year, wikitext) {
  const months = "January|February|March|April|May|June|July|August|September|October|November|December";
  const patterns = [
    new RegExp(`^(?:${months})\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*[–—-]\\s*(.+)$`, "i"),
    new RegExp(`^\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${months})\\s*[–—-]\\s*(.+)$`, "i")
  ];
  const results = [];
  for (const rawLine of wikitext.split(/\n+/)) {
    const line = rawLine.replace(/&(?:ndash|mdash);|&#0*821[12];|&#x0*20(?:13|14);/gi, "–").replace(/^[*#;:\s]+/, "").replace(/^'{2,3}([^']+)'{2,3}/, "$1").replace(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/, (_, target, label) => label || target).replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref\b[^/]*\/>/gi, "").replace(/\s+/g, " ").trim();
    const match = patterns.map(pattern => line.match(pattern)).find(Boolean);
    if (!match) continue;
    const datePrefix = line.length - match[1].length;
    const links = [...match[1].matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g)].map(link => ({ title: link[1].replaceAll("_", " ").trim(), label: (link[2] || link[1]).replaceAll("_", " ").trim(), position: line.indexOf(link[0]) }));
    const candidates = links.filter(link => link.position >= datePrefix && !/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i.test(link.title) && !/^\d{1,4}$/.test(link.title) && !/^(?:Help|Special|File|Category|Wikipedia):/i.test(link.title));
    const chosen = candidates.sort((a, b) => b.label.length - a.label.length)[0] || links.sort((a, b) => b.label.length - a.label.length)[0];
    if (!chosen) continue;
    const title = chosen.title;
    const linkedTitles = [...new Set(links.map(link => link.title))];
    const context = match[1].replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => (label || target).replaceAll("_", " ")).replace(/\{\{[^{}]*\}\}/g, "").replace(/'''?/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const source = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
    results.push({ id: `${year}-${hashSeed(title)}`, title, linkedTitles, context, year, source });
  }
  return [...new Map(results.map(event => [event.title, event])).values()].slice(0, 100);
}

async function fetchAnnualWindow(centerYear) {
  const years = Array.from({ length: 15 }, (_, index) => centerYear - 7 + index);
  const params = new URLSearchParams({ action: "query", prop: "revisions", titles: years.join("|"), redirects: "1", rvprop: "content", rvsection: "1", rvslots: "main", format: "json", formatversion: "2", origin: "*" });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Wikipedia could not be reached.");
  const data = await response.json();
  const pages = data.query?.pages || [];
  return pages.flatMap(page => {
    const year = Number(page.title);
    const content = page.revisions?.[0]?.slots?.main?.content || page.revisions?.[0]?.slots?.main?.["*"] || "";
    return Number.isInteger(year) ? annualWindowEvents(year, content) : [];
  });
}

async function fetchYearEvents(year) {
  const params = new URLSearchParams({ action: "query", prop: "revisions", titles: String(year), redirects: "1", rvprop: "content", rvsection: "1", rvslots: "main", format: "json", formatversion: "2", origin: "*" });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Wikipedia could not be reached.");
  const data = await response.json();
  const page = data.query?.pages?.[0];
  const content = page?.revisions?.[0]?.slots?.main?.content || page?.revisions?.[0]?.slots?.main?.["*"] || "";
  return page ? annualWindowEvents(year, content) : [];
}

function selectWindowEvents(events, year, roundNumber) {
  const random = seededRandom(hashSeed(`${slot}:${year}:${roundNumber}:events`));
  const candidates = shuffle(events.filter(event => Math.abs(event.year - year) <= 7), random);
  const selected = [];
  const selectedYears = new Set();
  const selectedTitles = new Set();
  for (const event of candidates) {
    if (selectedYears.has(event.year) || selectedTitles.has(event.title)) continue;
    selected.push(event);
    selectedYears.add(event.year);
    selectedTitles.add(event.title);
    if (selected.length === 5) break;
  }
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
    if (!selectWindowEvents(windowEvents, baseYear, 0)) throw new Error("This year range did not yield enough linked events.");
    localStorage.setItem(windowCacheKey, JSON.stringify({ year: baseYear, events: windowEvents }));
  } catch {
    windowEvents = [];
    randomLoadError = true;
  }
}

function getThemePack(roundNumber, isPreview = false) {
  if (isPreview) {
    const alternatives = packs.filter(pack => pack.theme !== currentPack?.theme);
    const choices = alternatives.length ? alternatives : packs;
    return choices[Math.floor(Math.random() * choices.length)];
  }
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
  elements.roundIndex.textContent = `${String(Math.min(state.plays + 1, 3)).padStart(2, "0")} / 03`;
  elements.nextPlay.disabled = !state.lastResult;
  elements.nextPlay.textContent = remaining === 0 ? "NO ROUNDS LEFT" : "NEXT ROUND";
  elements.checkOrder.disabled = locked || (remaining === 0 && !debugPreview);
  elements.eventSearch.disabled = mode === "near" && (remaining === 0 || currentResult);
  elements.searchEvent.disabled = mode === "near" && (remaining === 0 || currentResult);
  elements.shuffleRound.hidden = mode === "near";
}

function setupRandomRound(roundNumber) {
  const activeYear = debugPreview ? debugYear : baseYear;
  const activeEvents = debugPreview ? debugEvents : windowEvents;
  const seed = debugPreview ? debugSeed : roundNumber;
  const selected = selectWindowEvents(activeEvents, activeYear, seed);
  currentPack = selected ? { title: "", theme: "", events: selected } : { title: "", theme: "", events: [] };
  order = shuffle(currentPack.events.map((event, index) => index), seededRandom(hashSeed(`${slot}:${activeYear}:${seed}:order`)));
}

function setupThemeRound(roundNumber) {
  const pack = getThemePack(roundNumber, debugPreview);
  currentPack = pack;
  const seed = debugPreview ? debugSeed : roundNumber;
  order = shuffle(pack.events.map((event, index) => index), seededRandom(hashSeed(`${slot}:${seed}:theme-order`)));
}

function updateYearLabels() {
  const dash = elements.yearWindow.querySelector(".window-dash");
  const target = mode === "near" ? currentTargetYear() : null;
  const activeBaseYear = debugPreview && mode === "random" ? debugYear : baseYear;
  const years = mode === "near" ? [target] : mode === "theme" && currentPack ? currentPack.events.map(event => event.year) : [activeBaseYear - 7, activeBaseYear + 7];
  elements.windowStart.textContent = Math.min(...years);
  elements.windowEnd.textContent = Math.max(...years);
  dash.hidden = mode === "near";
  elements.windowEnd.hidden = mode === "near";
  elements.yearWindow.setAttribute("aria-label", `Year range ${Math.min(...years)} to ${Math.max(...years)}`);
  elements.targetYear.textContent = target || currentTargetYear();
}

function setMode(nextMode) {
  if (mode !== nextMode && nextMode === "near") elements.eventSearch.value = "";
  debugPreview = false;
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
    title.textContent = event.context || event.title;
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
  if (locked || (state.plays >= 3 && !debugPreview) || mode === "near") return;
  locked = true;
  currentCorrectOrder = [...currentPack.events].sort((a, b) => a.year - b.year).map(event => currentPack.events.indexOf(event));
  const score = order.reduce((total, eventIndex, position) => total + Number(eventIndex === currentCorrectOrder[position]), 0);
  if (!debugPreview) {
    state.plays += 1;
    state.lastResult = { round: state.plays - 1, mode, score, title: currentPack.title, theme: currentPack.theme, events: currentPack.events, order: [...order] };
    persist();
  }
  drawRows();
  showOrderAnswer(score);
  updateStatus();
}

function showPriorResult() {
  if (debugPreview || !state.lastResult || state.lastResult.round !== state.plays - 1 || state.lastResult.mode !== mode || mode === "near") return false;
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
  elements.gamePanel?.classList.toggle("is-near", mode === "near");
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback";
  elements.answerPanel.replaceChildren();
  elements.answerPanel.hidden = true;
  elements.searchResults.replaceChildren();
  elements.eventEntry.hidden = mode !== "near";
  elements.eventList.hidden = mode === "near";
  elements.promptLine.hidden = mode === "near";
  elements.checkOrder.hidden = mode === "near";
  elements.challengeEyebrow.textContent = mode === "random" ? "RANDOM WINDOW" : mode === "theme" ? "THEMED" : "";
  elements.challengeTitle.textContent = mode === "random" ? "" : mode === "theme" ? "" : "";
  if (mode === "near") {
    currentPack = null;
    order = [];
    elements.challengeHeading.hidden = true;
    updateYearLabels();
    const prior = state.lastResult && state.lastResult.round === state.plays - 1 && state.lastResult.mode === "near" ? state.lastResult : null;
    elements.scoreValue.firstChild.textContent = prior ? String(prior.score) : "—";
    elements.scoreUnit.textContent = "/ 1000";
    elements.progressFill.style.width = prior ? `${prior.score / 10}%` : "0%";
    elements.progressCopy.textContent = prior ? prior.noEventMatch ? "No event match" : `${prior.distance} years from ${prior.targetYear}` : "Proximity + rarity";
    if (prior) {
      const label = document.createElement("span");
      label.className = "answer-title";
      label.textContent = prior.noEventMatch ? "0 POINTS · NO EVENT MATCH" : `${prior.score} POINTS · ${prior.distance} YEARS AWAY · +${prior.rarityBonus || 0} RARITY`;
      const line = document.createElement("div");
      const resultText = prior.noEventMatch ? ` was not named in an event on the ${prior.targetYear} year page.` : prior.personContext ? ` is named in a ${prior.targetYear} event: ${prior.personContext} ` : ` is dated ${prior.eventYear}. Your year was ${prior.targetYear}.`;
      line.append(answerLink({ title: prior.eventTitle, source: prior.eventSource }), document.createTextNode(resultText));
      if (prior.evidenceSource) {
        const evidence = document.createElement("a");
        evidence.href = prior.evidenceSource;
        evidence.target = "_blank";
        evidence.rel = "noreferrer";
        evidence.textContent = `Source: ${prior.targetYear} events`;
        line.append(evidence);
      }
      elements.answerPanel.append(label, line);
      elements.answerPanel.hidden = false;
      elements.feedback.textContent = prior.noEventMatch ? "No event match; 0 points." : prior.personContext ? "Person matched to an event on the target year page." : "Event date checked against Wikidata.";
      elements.feedback.className = prior.noEventMatch ? "feedback negative" : "feedback positive";
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
  elements.challengeHeading.hidden = false;
  if (mode === "random") setupRandomRound(state.plays);
  else setupThemeRound(state.plays);
  if (mode === "theme") {
    elements.challengeEyebrow.textContent = currentPack.theme.toUpperCase();
    elements.challengeTitle.textContent = currentPack.title;
  }
  updateYearLabels();
  elements.shuffleRound.hidden = false;
  currentCorrectOrder = [...currentPack.events].sort((a, b) => a.year - b.year).map(event => currentPack.events.indexOf(event));
  if (!showPriorResult()) {
    drawRows();
    elements.scoreValue.firstChild.textContent = "—";
    elements.scoreUnit.textContent = "/ 5";
    elements.progressFill.style.width = "0%";
    elements.progressCopy.textContent = "Correct positions";
  }
  if (mode === "random" && !currentPack.events.length) elements.feedback.textContent = randomLoadError ? "Wikipedia could not load this random window. Use Shuffle to try another." : "No linked event pages were found in this window. Use Shuffle to try another.";
  updateStatus();
}

function wikimediaUrl(api, params) {
  return `${api}?${new URLSearchParams({ ...params, format: "json", origin: "*" })}`;
}

function normalizedSearchText(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function autoMappedSearchResult(query, results) {
  const normalizedQuery = normalizedSearchText(query);
  const result = results[0];
  if (!result) return null;
  const normalizedTitle = normalizedSearchText(result.title);
  if (normalizedTitle === normalizedQuery) return result;
  if (normalizedQuery.length >= 4 && normalizedTitle.startsWith(`${normalizedQuery} `)) return result;
  return null;
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
      elements.feedback.textContent = "No matching answer. Try a different name.";
      return;
    }
    const mapped = autoMappedSearchResult(query, results);
    if (mapped) {
      await scoreSearchResult(mapped.title);
      return;
    }
    elements.feedback.textContent = "Choose the name you meant.";
    for (const result of results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.setAttribute("role", "option");
      const title = document.createElement("strong");
      title.textContent = result.title;
      button.append(title);
      button.addEventListener("click", () => scoreSearchResult(result.title));
      elements.searchResults.append(button);
    }
  } catch {
    elements.feedback.textContent = "Wikipedia search could not load. Try again in a moment.";
  }
}

async function resolveWikidataEntity(title) {
  const pageUrl = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", prop: "pageprops", ppprop: "wikibase_item", titles: title, redirects: "1", formatversion: "2" });
  const pageResponse = await fetch(pageUrl, { headers: { Accept: "application/json" } });
  if (!pageResponse.ok) throw new Error("The article date is unavailable.");
  const pageData = await pageResponse.json();
  const page = pageData.query?.pages?.[0];
  const itemId = page?.pageprops?.wikibase_item;
  if (!itemId) return null;
  const itemUrl = wikimediaUrl("https://www.wikidata.org/w/api.php", { action: "wbgetentities", ids: itemId, props: "claims|sitelinks" });
  const itemResponse = await fetch(itemUrl, { headers: { Accept: "application/json" } });
  if (!itemResponse.ok) throw new Error("The article date is unavailable.");
  const itemData = await itemResponse.json();
  return { itemId, title: page.title, entity: itemData.entities?.[itemId] || {} };
}

function entityYears(claims, properties = ["P585", "P580", "P577", "P571", "P582"]) {
  const years = new Set();
  for (const property of properties) {
    for (const claim of claims[property] || []) {
      const time = claim.mainsnak?.datavalue?.value?.time;
      const match = time?.match(/^([+-])0*(\d+)-/);
      if (match) years.add(Number(match[2]) * (match[1] === "-" ? -1 : 1));
    }
  }
  return [...years];
}

function itemIsHuman(entity) {
  return (entity.claims?.P31 || []).some(claim => claim.mainsnak?.datavalue?.value?.id === "Q5");
}

function normalizedTitle(title) {
  return title.replaceAll("_", " ").trim().toLocaleLowerCase();
}

async function targetYearPersonEvent(title, year) {
  const events = await fetchYearEvents(year);
  return events.find(event => event.linkedTitles?.some(linkedTitle => normalizedTitle(linkedTitle) === normalizedTitle(title))) || null;
}

async function rarityBonus(title, entity) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  const end = date.toISOString().slice(0, 10).replaceAll("-", "");
  date.setUTCDate(date.getUTCDate() - 29);
  const start = date.toISOString().slice(0, 10).replaceAll("-", "");
  const article = encodeURIComponent(title.replaceAll(" ", "_"));
  try {
    const response = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${article}/daily/${start}00/${end}00`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Page views are unavailable.");
    const data = await response.json();
    const views = (data.items || []).reduce((total, item) => total + item.views, 0);
    return Math.max(0, Math.min(100, Math.round(100 * (1 - Math.log1p(views) / Math.log1p(1000000)))));
  } catch {
    const sitelinks = Object.keys(entity.sitelinks || {}).length;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - sitelinks / 100))));
  }
}

async function scoreSearchResult(title) {
  if (state.plays >= 3) {
    openPaywall();
    return;
  }
  elements.searchResults.replaceChildren();
  elements.feedback.textContent = "Checking the date and connection…";
  elements.eventSearch.disabled = true;
  elements.searchEvent.disabled = true;
  try {
    const target = currentTargetYear();
    const resolved = await resolveWikidataEntity(title);
    if (!resolved) throw new Error("No Wikidata record.");
    const canonicalTitle = resolved.title;
    let personContext = "";
    let year;
    let noEventMatch = false;
    const eventSource = `https://en.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle.replaceAll(" ", "_"))}`;
    let evidenceSource = "";
    if (itemIsHuman(resolved.entity)) {
      const match = await targetYearPersonEvent(canonicalTitle, target);
      evidenceSource = `https://en.wikipedia.org/wiki/${target}`;
      if (!match) {
        noEventMatch = true;
      } else {
        year = target;
        personContext = match.context;
      }
    } else {
      year = entityYears(resolved.entity.claims || {}).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    }
    if (!noEventMatch && !Number.isFinite(year)) {
      elements.feedback.textContent = "I couldn't find a reliable event date for that article. Try another result.";
      elements.eventSearch.disabled = false;
      elements.searchEvent.disabled = false;
      return;
    }
    const distance = noEventMatch ? null : Math.abs(year - target);
    const bonus = noEventMatch ? 0 : await rarityBonus(canonicalTitle, resolved.entity);
    const proximity = noEventMatch ? 0 : Math.max(0, 1000 - distance);
    const score = Math.round(proximity * (0.9 + bonus / 1000));
    const rarityPoints = score - Math.round(proximity * 0.9);
    state.plays += 1;
    state.lastResult = { round: state.plays - 1, mode: "near", score, eventTitle: canonicalTitle, eventSource, evidenceSource, eventYear: year ?? null, targetYear: target, distance, rarityBonus: rarityPoints, personContext, noEventMatch };
    persist();
    elements.answerPanel.replaceChildren();
    const label = document.createElement("span");
    label.className = "answer-title";
    label.textContent = noEventMatch ? "0 POINTS · NO EVENT MATCH" : `${score} POINTS · ${distance} YEARS AWAY · +${rarityPoints} RARITY`;
    const line = document.createElement("div");
    const resultText = noEventMatch ? ` was not named in an event on the ${target} year page.` : personContext ? ` is named in a ${target} event: ${personContext} ` : ` is dated ${year}. Your year was ${target}.`;
    line.append(answerLink({ title: canonicalTitle, year, source: eventSource }), document.createTextNode(resultText));
    if (evidenceSource) {
      const evidence = document.createElement("a");
      evidence.href = evidenceSource;
      evidence.target = "_blank";
      evidence.rel = "noreferrer";
      evidence.textContent = `Source: ${target} events`;
      line.append(evidence);
    }
    elements.answerPanel.append(label, line);
    elements.answerPanel.hidden = false;
    elements.feedback.textContent = noEventMatch ? "No event match; 0 points." : personContext ? "Person matched to a target-year event." : "Event date checked against Wikidata.";
    elements.feedback.className = noEventMatch ? "feedback negative" : "feedback positive";
    elements.scoreValue.firstChild.textContent = String(score);
    elements.scoreUnit.textContent = "/ 1000";
    elements.progressFill.style.width = `${score / 10}%`;
    elements.progressCopy.textContent = noEventMatch ? "No event match" : `${distance} years from ${target}`;
    elements.searchEvent.disabled = true;
    elements.eventSearch.disabled = true;
    updateStatus();
  } catch {
    elements.feedback.textContent = "The answer could not be checked. Try another result.";
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
  debugPreview = false;
  persist();
  elements.eventSearch.disabled = false;
  elements.searchEvent.disabled = false;
  elements.eventSearch.value = "";
  render();
}

async function shuffleCurrentRound() {
  if (mode === "near") return;
  const previousYear = debugPreview ? debugYear : baseYear;
  const nextSeed = `${Date.now()}-${Math.random()}`;
  elements.shuffleRound.disabled = true;
  elements.feedback.textContent = mode === "random" ? "Loading a new random window…" : "Shuffling the themed round…";
  if (mode === "random") {
    let requestedYear = minYear + Math.floor(Math.random() * (maxYear - minYear + 1));
    while (requestedYear === previousYear) requestedYear = minYear + Math.floor(Math.random() * (maxYear - minYear + 1));
    try {
      const events = await fetchAnnualWindow(requestedYear);
      if (!selectWindowEvents(events, requestedYear, nextSeed)) throw new Error("No suitable events were found.");
      debugPreview = true;
      debugSeed = nextSeed;
      debugYear = requestedYear;
      debugEvents = events;
      randomLoadError = false;
    } catch {
      elements.feedback.textContent = "Wikipedia could not load a new window. Try Shuffle again.";
      elements.shuffleRound.disabled = false;
      return;
    }
  } else {
    debugPreview = true;
    debugSeed = nextSeed;
  }
  render();
  elements.shuffleRound.disabled = false;
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
elements.shuffleRound.addEventListener("click", shuffleCurrentRound);
elements.nextPlay.addEventListener("click", nextPlay);
elements.searchEvent.addEventListener("click", searchWikipedia);
elements.eventSearch.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchWikipedia();
  }
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
