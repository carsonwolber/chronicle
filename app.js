const windowLength = 8 * 60 * 60 * 1000;
const minYear = 15;
const maxYear = 2016;
const maxPersonEventDistance = 25;
const slot = Math.floor(Date.now() / windowLength);
const closerStateKey = "chroniclr:closer";
const closerSavedState = JSON.parse(localStorage.getItem(closerStateKey) || "null");
const stateKey = `chroniclr:${slot}`;
const windowCacheKey = `chroniclr:window:v2:${slot}`;
const state = JSON.parse(localStorage.getItem(stateKey) || "null") || { plays: 0, lastResult: null };
const elements = Object.fromEntries(["resetTimer", "orderMode", "themeMode", "nearMode", "closerMode", "gamePanel", "compareBoard", "comparePrompt", "compareOptions", "closerScore", "closerBest", "resultEyebrow", "resultDialogTitle", "challengeHeading", "challengeEyebrow", "challengeTitle", "yearWindow", "windowStart", "windowEnd", "promptLine", "eventList", "eventEntry", "targetYear", "eventSearch", "searchEvent", "searchResults", "answerPanel", "feedback", "nextPlay", "checkOrder", "shuffleRound", "resultDialog", "resultScore", "resultGrid", "shareResult", "copyResult", "shareX", "shareWhatsApp", "closeResultDialog", "shareFeedback"].map(id => [id, document.getElementById(id)]));
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
let shareMessage = "";
let shareText = "";
let shareUrl = "";
let themeLoadKey = "";
let themeRequestId = 0;
let closerState = closerSavedState && Number.isInteger(closerSavedState.score) ? closerSavedState : { score: 0, best: 0, round: null, gameOver: false };
let closerLoading = false;
let closerLoadError = false;
let closerLoadId = 0;

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

function extractEventsSection(wikitext) {
  const lines = wikitext.split(/\n/);
  const start = lines.findIndex(line => /^==\s*Events\s*==$/.test(line.trim()));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^==[^=].*==$/.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

async function fetchAnnualWindow(centerYear) {
  const years = Array.from({ length: 15 }, (_, index) => centerYear - 7 + index);
  const params = new URLSearchParams({ action: "query", prop: "revisions", titles: years.join("|"), redirects: "1", rvprop: "content", rvslots: "main", format: "json", formatversion: "2", origin: "*" });
  const response = await fetch("https://en.wikipedia.org/w/api.php?" + params, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Wikipedia could not be reached.");
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || "Wikipedia could not be reached.");
  const pages = data.query?.pages || [];
  return pages.flatMap(page => {
    const year = Number(page.title);
    const content = page.revisions?.[0]?.slots?.main?.content || page.revisions?.[0]?.slots?.main?.["*"] || "";
    return Number.isInteger(year) ? annualWindowEvents(year, extractEventsSection(content)) : [];
  });
}

async function fetchYearEvents(year) {
  const params = new URLSearchParams({ action: "query", prop: "revisions", titles: String(year), redirects: "1", rvprop: "content", rvslots: "main", format: "json", formatversion: "2", origin: "*" });
  const response = await fetch("https://en.wikipedia.org/w/api.php?" + params, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Wikipedia could not be reached.");
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || "Wikipedia could not be reached.");
  const page = data.query?.pages?.[0];
  const content = page?.revisions?.[0]?.slots?.main?.content || page?.revisions?.[0]?.slots?.main?.["*"] || "";
  return page ? annualWindowEvents(year, extractEventsSection(content)) : [];
}

async function fetchAnnualYears(yearsToFetch) {
  const years = [...new Set(yearsToFetch)];
  const pages = [];
  for (let index = 0; index < years.length; index += 50) {
    const batch = years.slice(index, index + 50);
    const params = new URLSearchParams({ action: "query", prop: "revisions", titles: batch.join("|"), redirects: "1", rvprop: "content", rvslots: "main", format: "json", formatversion: "2", origin: "*" });
    const response = await fetch("https://en.wikipedia.org/w/api.php?" + params, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Wikipedia event pages could not be reached.");
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "Wikipedia event pages could not be reached.");
    pages.push(...(data.query?.pages || []));
  }
  return pages.flatMap(page => {
    const year = Number(page.title);
    const content = page.revisions?.[0]?.slots?.main?.content || page.revisions?.[0]?.slots?.main?.["*"] || "";
    return Number.isInteger(year) ? annualWindowEvents(year, extractEventsSection(content)) : [];
  });
}

function selectCloserPair(events, targetYear, selectedYears, seed) {
  const allowedYears = new Set(selectedYears);
  const eventsByDistance = new Map();
  for (const event of events) {
    if (!allowedYears.has(event.year)) continue;
    const distance = Math.abs(event.year - targetYear);
    if (distance > 25) continue;
    if (!eventsByDistance.has(distance)) eventsByDistance.set(distance, []);
    eventsByDistance.get(distance).push(event);
  }
  const random = seededRandom(hashSeed(seed));
  const distances = shuffle([...eventsByDistance.keys()], random);
  if (distances.length < 2) return null;
  const firstDistance = distances[0];
  const secondDistance = distances[1];
  const firstEvents = shuffle(eventsByDistance.get(firstDistance), random);
  const secondEvents = shuffle(eventsByDistance.get(secondDistance), random);
  const first = firstEvents[0];
  const second = secondEvents.find(event => event.title !== first.title);
  if (!first || !second) return null;
  return { targetYear, events: [first, second], correctIndex: firstDistance < secondDistance ? 0 : 1 };
}

function selectCloserYears(targetYear) {
  const startYear = Math.max(minYear, targetYear - 25);
  const endYear = Math.min(maxYear, targetYear + 25);
  const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  const pairs = [];
  for (let first = 0; first < years.length; first += 1) {
    for (let second = first + 1; second < years.length; second += 1) {
      if (Math.abs(years[first] - targetYear) !== Math.abs(years[second] - targetYear)) pairs.push([years[first], years[second]]);
    }
  }
  return pairs.length ? pairs[Math.floor(Math.random() * pairs.length)] : null;
}

async function generateCloserRound() {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const targetYear = minYear + Math.floor(Math.random() * (maxYear - minYear + 1));
    const selectedYears = selectCloserYears(targetYear);
    if (!selectedYears) continue;
    try {
      const events = await fetchAnnualYears(selectedYears);
      const round = selectCloserPair(events, targetYear, selectedYears, Date.now() + ":" + attempt);
      if (round) return round;
    } catch (error) {
      lastError = error;
      break;
    }
  }
  throw lastError || new Error("Wikipedia did not return two comparable events.");
}

function persistCloserState() {
  localStorage.setItem(closerStateKey, JSON.stringify(closerState));
}

function selectThemeEvents(events, random) {
  const windows = [];
  for (const startYear of [...new Set(events.map(event => event.year))].sort((a, b) => a - b)) {
    const byYear = new Map();
    for (const event of events) {
      if (event.year < startYear || event.year > startYear + 40) continue;
      if (!byYear.has(event.year)) byYear.set(event.year, []);
      byYear.get(event.year).push(event);
    }
    if (byYear.size >= 5) windows.push(byYear);
  }
  if (!windows.length) return null;
  const yearsByWindow = windows[Math.floor(random() * windows.length)];
  const years = shuffle([...yearsByWindow.keys()], random).slice(0, 5).sort((a, b) => a - b);
  return years.map(year => {
    const candidates = yearsByWindow.get(year);
    return candidates[Math.floor(random() * candidates.length)];
  });
}

async function fetchRandomTheme(seed) {
  const random = seededRandom(hashSeed(slot + ":" + seed + ":theme"));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomUrl = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", list: "random", rnnamespace: "0", rnlimit: "1", formatversion: "2" });
    const randomResponse = await fetch(randomUrl, { headers: { Accept: "application/json" } });
    if (!randomResponse.ok) throw new Error("Wikipedia topics are unavailable.");
    const randomData = await randomResponse.json();
    const topicPage = randomData.query?.random?.[0];
    if (!topicPage) continue;

    const categoryUrl = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", prop: "categories", titles: topicPage.title, cllimit: "max", clshow: "!hidden", formatversion: "2" });
    const categoryResponse = await fetch(categoryUrl, { headers: { Accept: "application/json" } });
    if (!categoryResponse.ok) throw new Error("Wikipedia categories are unavailable.");
    const categoryData = await categoryResponse.json();
    const categories = categoryData.query?.pages?.[0]?.categories || [];
    const usableCategories = categories.filter(category => {
      const name = category.title.replace(/^Category:/, "");
      const lower = name.toLocaleLowerCase();
      const excluded = ["all ", "articles ", "pages ", "wikipedia ", "cs1 ", "webarchive", "short description", "births", "deaths", "living people", "people from", "people living", "year of", "use dmy", "use mdy", "commons category link"];
      return !excluded.some(prefix => lower.startsWith(prefix))
        && !lower.includes(" by year")
        && !lower.includes(" by country")
        && !lower.includes(" by century")
        && !/\d{4}/.test(name);
    });
    if (!usableCategories.length) continue;

    const category = usableCategories[Math.floor(random() * usableCategories.length)];
    const membersUrl = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", generator: "categorymembers", gcmtitle: category.title, gcmnamespace: "0", gcmlimit: "50", prop: "pageprops", ppprop: "wikibase_item", formatversion: "2" });
    const membersResponse = await fetch(membersUrl, { headers: { Accept: "application/json" } });
    if (!membersResponse.ok) throw new Error("Wikipedia topic members are unavailable.");
    const membersData = await membersResponse.json();
    const pages = membersData.query?.pages || [];
    const itemIds = [...new Set(pages.map(page => page.pageprops?.wikibase_item).filter(Boolean))];
    if (itemIds.length < 5) continue;

    const entitiesUrl = wikimediaUrl("https://www.wikidata.org/w/api.php", { action: "wbgetentities", ids: itemIds.join("|"), props: "claims|descriptions", languages: "en", languagefallback: "1" });
    const entitiesResponse = await fetch(entitiesUrl, { headers: { Accept: "application/json" } });
    if (!entitiesResponse.ok) throw new Error("Wikidata dates are unavailable.");
    const entitiesData = await entitiesResponse.json();
    const events = pages.flatMap(page => {
      const itemId = page.pageprops?.wikibase_item;
      const entity = entitiesData.entities?.[itemId];
      if (!entity || itemIsHuman(entity)) return [];
      const year = entityYears(entity.claims || {})
        .filter(value => value >= minYear && value <= maxYear)
        .sort((a, b) => a - b)[0];
      if (!Number.isFinite(year)) return [];
      return [{
        id: itemId,
        title: page.title,
        year,
        context: entity.descriptions?.en?.value || "",
        source: "https://en.wikipedia.org/wiki/" + encodeURIComponent(page.title.replaceAll(" ", "_"))
      }];
    });
    const selected = selectThemeEvents(events, random);
    if (!selected) continue;
    const topic = category.title.replace(/^Category:/, "");
    return { theme: "WIKIPEDIA THEME", title: topic, events: selected };
  }
  throw new Error("Wikipedia did not return a topic with five dated articles.");
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
  const currentResult = state.lastResult && state.lastResult.round === state.plays - 1 && state.lastResult.mode === mode;
  if (mode === "closer") {
    elements.nextPlay.hidden = !closerState.gameOver && !closerLoadError;
    elements.nextPlay.disabled = closerLoading;
    elements.nextPlay.textContent = closerState.gameOver ? "PLAY AGAIN" : "TRY AGAIN";
  } else {
    elements.nextPlay.hidden = false;
    elements.nextPlay.disabled = !state.lastResult;
    elements.nextPlay.textContent = "NEXT ROUND";
  }
  elements.checkOrder.disabled = locked || mode === "closer" || (mode === "theme" && currentPack?.events?.length !== 5);
  elements.eventSearch.disabled = mode === "near" && currentResult;
  elements.searchEvent.disabled = mode === "near" && currentResult;
  elements.shuffleRound.hidden = mode === "near" || mode === "closer";
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
  const prior = state.lastResult;
  if (!debugPreview && prior && prior.round === roundNumber && prior.mode === "theme") {
    currentPack = { title: prior.title, theme: prior.theme, events: prior.events, themeKey: "prior" };
    order = prior.order;
    return;
  }

  const isPreview = debugPreview;
  const requestKey = slot + ":" + roundNumber + ":" + (isPreview ? debugSeed : "round");
  if (currentPack?.themeKey === requestKey) {
    order = currentPack.events.length ? shuffle(currentPack.events.map((event, index) => index), seededRandom(hashSeed(requestKey + ":order"))) : [];
    return;
  }

  const cacheKey = "chroniclr:theme:" + slot + ":" + roundNumber;
  if (!isPreview) {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Array.isArray(cached.events) && cached.events.length === 5) {
      currentPack = { ...cached, themeKey: requestKey };
      order = shuffle(currentPack.events.map((event, index) => index), seededRandom(hashSeed(requestKey + ":order")));
      return;
    }
  }

  currentPack = { theme: "WIKIPEDIA THEME", title: "Finding a topic…", events: [], themeKey: requestKey };
  order = [];
  if (themeLoadKey === requestKey) return;
  const requestId = ++themeRequestId;
  themeLoadKey = requestKey;
  fetchRandomTheme(requestKey).then(pack => {
    if (requestId !== themeRequestId) return;
    themeLoadKey = "";
    if (mode !== "theme" || debugPreview !== isPreview) return;
    currentPack = { ...pack, themeKey: requestKey };
    if (!isPreview) localStorage.setItem(cacheKey, JSON.stringify(pack));
    order = shuffle(currentPack.events.map((event, index) => index), seededRandom(hashSeed(requestKey + ":order")));
    render();
  }).catch(() => {
    if (requestId !== themeRequestId) return;
    themeLoadKey = "";
    if (mode !== "theme" || debugPreview !== isPreview) return;
    currentPack = { theme: "WIKIPEDIA THEME", title: "Try another theme", events: [], themeKey: requestKey, loadFailed: true };
    render();
  });
}
function updateYearLabels() {
  const dash = elements.yearWindow.querySelector(".window-dash");
  const target = mode === "near" ? currentTargetYear() : null;
  const closerTarget = mode === "closer" ? closerState.round?.targetYear : null;
  const activeBaseYear = debugPreview && mode === "random" ? debugYear : baseYear;
  const themeYears = mode === "theme" ? currentPack?.events?.map(event => event.year) || [] : [];
  const years = (mode === "near" ? [target] : mode === "closer" ? [closerTarget] : mode === "theme" ? themeYears : [activeBaseYear - 7, activeBaseYear + 7]).filter(Number.isFinite);
  elements.windowStart.textContent = years.length ? Math.min(...years) : "";
  elements.windowEnd.textContent = years.length ? Math.max(...years) : "";
  dash.hidden = mode === "near" || mode === "closer";
  elements.windowEnd.hidden = mode === "near" || mode === "closer";
  elements.yearWindow.hidden = mode === "theme" && !years.length;
  elements.yearWindow.setAttribute("aria-label", mode === "closer" ? years.length ? "Target year " + years[0] : "Target year loading" : years.length ? "Year range " + Math.min(...years) + " to " + Math.max(...years) : "Wikipedia theme loading");
  elements.targetYear.textContent = target || currentTargetYear();
}

function setMode(nextMode) {
  if (mode !== nextMode && nextMode === "near") elements.eventSearch.value = "";
  if (mode === "closer" && nextMode !== "closer") {
    closerLoadId += 1;
    closerLoading = false;
  }
  if (mode !== nextMode) {
    themeLoadKey = "";
    themeRequestId += 1;
  }
  debugPreview = false;
  mode = nextMode;
  localStorage.setItem("chroniclr:mode", mode);
  elements.orderMode.classList.toggle("is-active", mode === "random");
  elements.themeMode.classList.toggle("is-active", mode === "theme");
  elements.nearMode.classList.toggle("is-active", mode === "near");
  elements.closerMode.classList.toggle("is-active", mode === "closer");
  elements.orderMode.setAttribute("aria-selected", String(mode === "random"));
  elements.themeMode.setAttribute("aria-selected", String(mode === "theme"));
  elements.nearMode.setAttribute("aria-selected", String(mode === "near"));
  elements.closerMode.setAttribute("aria-selected", String(mode === "closer"));
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
    if (mode === "theme") {
      const copy = document.createElement("span");
      copy.className = "event-copy";
      const title = document.createElement("span");
      title.className = "event-title";
      title.textContent = event.title;
      copy.append(title);
      if (event.context && event.context.toLocaleLowerCase() !== event.title.toLocaleLowerCase()) {
        const context = document.createElement("span");
        context.className = "event-context";
        context.textContent = event.context;
        copy.append(context);
      }
      row.append(badge, copy);
    } else {
      const title = document.createElement("span");
      title.className = "event-title";
      title.textContent = event.context || event.title;
      row.append(badge, title);
    }
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
}

function showRandomResult(score) {
  elements.resultEyebrow.textContent = "RANDOM WINDOW";
  elements.resultDialogTitle.textContent = "Round complete";
  const squares = order.map((eventIndex, position) => eventIndex === currentCorrectOrder[position] ? "🟩" : "⬛").join("");
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  shareText = `chroniclr · Random Window\n${score}/5 in the right position\n${squares}`;
  shareUrl = url.toString();
  shareMessage = `${shareText}\n${shareUrl}`;
  elements.resultScore.textContent = `${score}/5`;
  elements.resultGrid.textContent = squares;
  elements.resultGrid.setAttribute("aria-label", `${score} of 5 in the right position`);
  elements.shareFeedback.textContent = "";
  elements.shareX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  elements.shareWhatsApp.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
  if (!elements.resultDialog.open) elements.resultDialog.showModal();
}

async function copyRandomResult() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareMessage);
    } else {
      const field = document.createElement("textarea");
      field.value = shareMessage;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Copy failed.");
    }
    elements.shareFeedback.textContent = "Result copied.";
  } catch {
    elements.shareFeedback.textContent = "Could not copy. Use one of the social links.";
  }
}

async function shareRandomResult() {
  if (!navigator.share) {
    await copyRandomResult();
    return;
  }
  try {
    await navigator.share({ title: "chroniclr score", text: shareText, url: shareUrl });
  } catch (error) {
    if (error.name !== "AbortError") elements.shareFeedback.textContent = "Sharing is unavailable. Copy the result or use a social link.";
  }
}

function showCloserResult() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  shareText = `chroniclr · Closer\n${closerState.score} correct in a row\nBest: ${closerState.best}`;
  shareUrl = url.toString();
  shareMessage = `${shareText}\n${shareUrl}`;
  elements.resultEyebrow.textContent = "CLOSER";
  elements.resultDialogTitle.textContent = "Run over";
  elements.resultScore.textContent = String(closerState.score);
  elements.resultGrid.textContent = `BEST ${closerState.best}`;
  elements.resultGrid.setAttribute("aria-label", `${closerState.score} correct in a row. Best score: ${closerState.best}.`);
  elements.shareFeedback.textContent = "";
  elements.shareX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  elements.shareWhatsApp.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
  if (!elements.resultDialog.open) elements.resultDialog.showModal();
}

function answerCloser(index) {
  if (mode !== "closer" || closerState.gameOver || closerLoading || !closerState.round) return;
  const round = closerState.round;
  if (index === round.correctIndex) {
    closerState.score += 1;
    closerState.best = Math.max(closerState.best || 0, closerState.score);
    closerState.round = null;
    closerLoadError = false;
    persistCloserState();
    render();
    return;
  }
  closerState.gameOver = true;
  round.selectedIndex = index;
  persistCloserState();
  render();
}

async function prepareCloserRound() {
  if (closerLoading || closerState.gameOver) return;
  const requestId = ++closerLoadId;
  closerLoading = true;
  elements.comparePrompt.textContent = "Finding events…";
  elements.feedback.textContent = "";
  updateStatus();
  try {
    const round = await generateCloserRound();
    if (requestId !== closerLoadId || mode !== "closer") return;
    closerState.round = round;
    closerLoadError = false;
    persistCloserState();
    closerLoading = false;
    render();
  } catch {
    if (requestId !== closerLoadId || mode !== "closer") return;
    closerLoading = false;
    closerLoadError = true;
    elements.comparePrompt.textContent = "Could not load a pair of events.";
    elements.feedback.textContent = "Try again.";
    updateStatus();
  }
}

function renderCloserBoard() {
  elements.closerScore.textContent = String(closerState.score);
  elements.closerBest.textContent = String(closerState.best || 0);
  elements.compareOptions.replaceChildren();
  const round = closerState.round;
  if (closerState.gameOver && round) {
    elements.comparePrompt.textContent = "Which happened closer?";
    round.events.forEach((event, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "compare-card";
      button.disabled = true;
      button.classList.add(index === round.correctIndex ? "is-correct" : index === round.selectedIndex ? "is-selected" : "is-revealed");
      const title = document.createElement("span");
      title.className = "compare-title";
      title.textContent = event.title;
      const year = document.createElement("span");
      year.className = "compare-event-year";
      year.textContent = String(event.year);
      button.append(title, year);
      elements.compareOptions.append(button);
    });
    const correct = round.events[round.correctIndex];
    elements.feedback.textContent = `The closer event was ${correct.title} (${correct.year}).`;
    elements.feedback.className = "feedback negative";
    showCloserResult();
    return;
  }
  if (!round) {
    if (closerLoadError) {
      elements.comparePrompt.textContent = "Could not load a pair of events.";
      return;
    }
    elements.comparePrompt.textContent = closerLoading ? "Finding events…" : "Loading…";
    if (!closerLoading) prepareCloserRound();
    return;
  }
  elements.comparePrompt.textContent = "Which event happened closer to this year?";
  round.events.forEach((event, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compare-card";
    button.disabled = closerLoading;
    button.setAttribute("aria-label", event.title);
    const title = document.createElement("span");
    title.className = "compare-title";
    title.textContent = event.title;
    button.append(title);
    button.addEventListener("click", () => answerCloser(index));
    elements.compareOptions.append(button);
  });
}

function submitOrder() {
  if (locked || mode === "near") return;
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
  if (mode === "random" && !debugPreview) showRandomResult(score);
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
  if (mode === "random") showRandomResult(score);
  return true;
}

function render() {
  locked = false;
  keyboardGrabbedId = null;
  elements.gamePanel?.classList.toggle("is-near", mode === "near");
  elements.gamePanel?.classList.toggle("is-closer", mode === "closer");
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback";
  elements.answerPanel.replaceChildren();
  elements.answerPanel.hidden = true;
  elements.searchResults.replaceChildren();
  elements.eventEntry.hidden = mode !== "near";
  elements.compareBoard.hidden = mode !== "closer";
  elements.eventList.hidden = mode === "near" || mode === "closer";
  elements.promptLine.hidden = mode === "near" || mode === "closer";
  elements.checkOrder.hidden = mode === "near" || mode === "closer";
  elements.challengeEyebrow.textContent = mode === "random" ? "RANDOM WINDOW" : mode === "theme" ? "THEMED" : mode === "closer" ? "CLOSER" : "";
  elements.challengeTitle.textContent = mode === "closer" ? "Closer" : "";
  if (mode === "near") {
    currentPack = null;
    order = [];
    elements.challengeHeading.hidden = true;
    updateYearLabels();
    const prior = state.lastResult && state.lastResult.round === state.plays - 1 && state.lastResult.mode === "near" ? state.lastResult : null;
    if (prior) {
      const label = document.createElement("span");
      label.className = "answer-title";
      label.textContent = prior.noEventMatch ? "0 POINTS · NO NEARBY EVENT" : `${prior.score} POINTS · ${prior.distance} YEARS AWAY · +${prior.rarityBonus || 0} RARITY`;
      const line = document.createElement("div");
      const resultText = prior.noEventMatch ? ` has no dated linked event within ${maxPersonEventDistance} years of ${prior.targetYear}.` : prior.personContext ? ` appears in the ${prior.eventYear} events list: ${prior.personContext}. Your year was ${prior.targetYear}.` : prior.associatedEventTitle ? ` is associated with ${prior.associatedEventTitle} (${prior.eventYear}). Your year was ${prior.targetYear}.` : ` is dated ${prior.eventYear}. Your year was ${prior.targetYear}.`;
      line.append(answerLink({ title: prior.eventTitle, source: prior.eventSource }), document.createTextNode(resultText));
      if (prior.evidenceSource) {
        const evidence = document.createElement("a");
        evidence.href = prior.evidenceSource;
        evidence.target = "_blank";
        evidence.rel = "noreferrer";
        evidence.textContent = `Source: ${prior.personContext ? prior.eventYear + " events" : prior.associatedEventTitle || prior.targetYear + " events"}`;
        line.append(evidence);
      }
      elements.answerPanel.append(label, line);
      elements.answerPanel.hidden = false;
      elements.feedback.textContent = prior.noEventMatch ? "No nearby dated event match; 0 points." : prior.associatedEventTitle ? "Person matched to a dated event." : "Event date checked against Wikidata.";
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
  if (mode === "closer") {
    elements.challengeHeading.hidden = false;
    updateYearLabels();
    renderCloserBoard();
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
  }
  if (mode === "random" && !currentPack.events.length) elements.feedback.textContent = randomLoadError ? "Wikipedia could not load this random window. Use Shuffle to try another." : "No linked event pages were found in this window. Use Shuffle to try another.";
  if (mode === "theme" && !currentPack.events.length) elements.feedback.textContent = currentPack.loadFailed ? "Wikipedia could not find five dated articles for a topic. Use Shuffle to try another." : "Finding a random Wikipedia topic…";
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

async function nearestPersonEvent(title, targetYear) {
  return personEventSearch.nearestPersonEvent(title, targetYear, {
    minYear,
    maxYear,
    maxDistance: maxPersonEventDistance,
    searchYear: async query => {
      const url = wikimediaUrl("https://en.wikipedia.org/w/api.php", { action: "query", list: "search", srsearch: query, srlimit: "500", formatversion: "2" });
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Wikipedia event search is unavailable.");
      const data = await response.json();
      if (data.error) throw new Error(data.error.info || "Wikipedia event search is unavailable.");
      return data.query?.search || [];
    },
    fetchYearEvents
  });
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
    let associatedEventTitle = "";
    let year;
    let noEventMatch = false;
    const eventSource = `https://en.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle.replaceAll(" ", "_"))}`;
    let evidenceSource = "";
    if (itemIsHuman(resolved.entity)) {
      const match = await nearestPersonEvent(canonicalTitle, target);
      if (!match) {
        noEventMatch = true;
      } else {
        year = match.year;
        personContext = match.context;
        associatedEventTitle = match.title;
        evidenceSource = match.source;
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
    const proximity = noEventMatch ? 0 : 900 * Math.pow(0.85, distance);
    const score = Math.min(1000, Math.round(proximity * (1 + bonus / 900)));
    const rarityPoints = noEventMatch ? 0 : score - Math.round(proximity);
    state.plays += 1;
    state.lastResult = { round: state.plays - 1, mode: "near", score, eventTitle: canonicalTitle, eventSource, evidenceSource, associatedEventTitle, eventYear: year ?? null, targetYear: target, distance, rarityBonus: rarityPoints, personContext, noEventMatch };
    persist();
    elements.answerPanel.replaceChildren();
    const label = document.createElement("span");
    label.className = "answer-title";
    label.textContent = noEventMatch ? "0 POINTS · NO NEARBY EVENT" : `${score} POINTS · ${distance} YEARS AWAY · +${rarityPoints} RARITY`;
    const line = document.createElement("div");
    const resultText = noEventMatch ? ` has no dated linked event within ${maxPersonEventDistance} years of ${target}.` : personContext ? ` appears in the ${year} events list: ${personContext}. Your year was ${target}.` : associatedEventTitle ? ` is associated with ${associatedEventTitle} (${year}). Your year was ${target}.` : ` is dated ${year}. Your year was ${target}.`;
    line.append(answerLink({ title: canonicalTitle, year, source: eventSource }), document.createTextNode(resultText));
    if (evidenceSource) {
      const evidence = document.createElement("a");
      evidence.href = evidenceSource;
      evidence.target = "_blank";
      evidence.rel = "noreferrer";
      evidence.textContent = `Source: ${personContext ? year + " events" : associatedEventTitle || target + " events"}`;
      line.append(evidence);
    }
    elements.answerPanel.append(label, line);
    elements.answerPanel.hidden = false;
    elements.feedback.textContent = noEventMatch ? "No nearby dated event match; 0 points." : associatedEventTitle ? "Person matched to a dated event." : "Event date checked against Wikidata.";
    elements.feedback.className = noEventMatch ? "feedback negative" : "feedback positive";
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
  if (mode === "closer") {
    if (closerState.gameOver) {
      closerState.score = 0;
      closerState.gameOver = false;
      closerState.round = null;
    }
    closerLoadError = false;
    persistCloserState();
    render();
    return;
  }
  if (!state.lastResult) return;
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

elements.orderMode.addEventListener("click", () => setMode("random"));
elements.themeMode.addEventListener("click", () => setMode("theme"));
elements.nearMode.addEventListener("click", () => setMode("near"));
elements.closerMode.addEventListener("click", () => setMode("closer"));
elements.shareResult.addEventListener("click", shareRandomResult);
elements.copyResult.addEventListener("click", copyRandomResult);
elements.closeResultDialog.addEventListener("click", () => elements.resultDialog.close());
elements.resultDialog.addEventListener("click", event => {
  if (event.target === elements.resultDialog) elements.resultDialog.close();
});
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

async function initialize() {
  await loadRandomWindow();
  for (const [id, selectedMode] of [["orderMode", "random"], ["themeMode", "theme"], ["nearMode", "near"], ["closerMode", "closer"]]) {
    const selected = mode === selectedMode;
    elements[id].classList.toggle("is-active", selected);
    elements[id].setAttribute("aria-selected", String(selected));
  }
  render();
  updateClock();
  setInterval(updateClock, 1000);
}

initialize();
