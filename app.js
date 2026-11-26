const dateKey = new Date().toISOString().slice(0, 10);
const stateKey = `chronicle:${dateKey}`;
const packs = window.chroniclePuzzles;
const state = JSON.parse(localStorage.getItem(stateKey) || "null") || { plays: 0, score: null };
const elements = Object.fromEntries(["eventList", "roundType", "themeLabel", "puzzleTitle", "roundIndex", "issueNumber", "playsLed", "playsLabel", "nextPlay", "checkOrder", "feedback", "result", "scoreValue", "progressFill", "progressCopy", "paywall", "closePaywall", "paywallDone", "upgradeTop", "upgradeSide"].map(id => [id, document.getElementById(id)]));
let order = [];
let locked = false;
let currentPack = null;
let currentPackIndex = 0;
let currentCorrectOrder = [];

function validatePuzzles() {
  for (const pack of packs) {
    const years = pack.events.map(event => event.year);
    if (pack.events.length !== 5 || new Set(years).size !== 5 || Math.max(...years) - Math.min(...years) > 15) {
      throw new Error(`Invalid puzzle pack: ${pack.title}`);
    }
  }
}

function dailyPuzzleIndex() {
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  return day % packs.length;
}

function puzzleForPlay(play) {
  return packs[(dailyPuzzleIndex() + play) % packs.length];
}

function persist() {
  localStorage.setItem(stateKey, JSON.stringify(state));
}

function setStatus() {
  const left = Math.max(0, 3 - state.plays);
  elements.playsLed.style.opacity = left ? "1" : ".25";
  elements.playsLabel.textContent = `${left} ${left === 1 ? "PLAY" : "PLAYS"} LEFT TODAY`;
  elements.nextPlay.disabled = !locked || left === 0;
  elements.nextPlay.textContent = left === 0 ? "NO PLAYS LEFT" : "NEXT FREE PLAY";
  elements.checkOrder.disabled = locked || left === 0;
  const score = locked ? state.score : null;
  elements.scoreValue.textContent = score === null ? "—" : `${score}/5`;
  elements.progressFill.style.width = score === null ? "0%" : `${score * 20}%`;
  elements.progressCopy.textContent = score === null ? "Order all five events to finish the round." : `${score} of 5 events landed in the right position.`;
}

function render() {
  if (state.plays >= 3 && Number.isInteger(state.lastPackIndex) && Array.isArray(state.lastOrder)) {
    currentPackIndex = state.lastPackIndex;
    order = [...state.lastOrder];
    locked = true;
  } else {
    currentPackIndex = (dailyPuzzleIndex() + state.plays) % packs.length;
    order = packs[currentPackIndex].events.map((event, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    locked = false;
  }
  currentPack = packs[currentPackIndex];
  currentCorrectOrder = [...currentPack.events].sort((a, b) => a.year - b.year).map(event => currentPack.events.indexOf(event));
  elements.roundType.textContent = state.plays === 0 ? "TODAY'S PUZZLE" : "BONUS ROUND";
  elements.themeLabel.textContent = currentPack.theme.toUpperCase();
  elements.puzzleTitle.textContent = currentPack.title;
  elements.roundIndex.textContent = `0${Math.min(state.plays + 1, 3)}`;
  elements.issueNumber.textContent = String(dailyPuzzleIndex() + 1).padStart(3, "0");
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback";
  if (locked) {
    elements.feedback.textContent = state.score === 5 ? "Perfect timeline. Clean work." : `${state.score} of 5 events are in the right position.`;
    elements.feedback.className = `feedback ${state.score === 5 ? "positive" : "negative"}`;
    showAnswer();
  } else {
    elements.result.hidden = true;
    elements.result.innerHTML = "";
  }
  drawRows();
  setStatus();
}

function drawRows() {
  elements.eventList.innerHTML = "";
  order.forEach((eventIndex, position) => {
    const event = currentPack.events[eventIndex];
    const row = document.createElement("li");
    row.className = "event-row";
    row.dataset.eventId = event.id;
    const badge = document.createElement("span");
    badge.className = "position";
    badge.textContent = String(position + 1).padStart(2, "0");
    const title = document.createElement("span");
    title.className = "event-title";
    title.textContent = event.title;
    const controls = document.createElement("span");
    controls.className = "move-controls";
    const up = document.createElement("button");
    up.className = "move";
    up.type = "button";
    up.textContent = "↑";
    up.setAttribute("aria-label", `Move ${event.title} earlier`);
    up.disabled = locked || position === 0;
    up.addEventListener("click", () => move(position, -1));
    const down = document.createElement("button");
    down.className = "move";
    down.type = "button";
    down.textContent = "↓";
    down.setAttribute("aria-label", `Move ${event.title} later`);
    down.disabled = locked || position === order.length - 1;
    down.addEventListener("click", () => move(position, 1));
    controls.append(up, down);
    row.append(badge, title, controls);
    if (locked) {
      const year = document.createElement("span");
      year.className = "event-year";
      year.textContent = event.year;
      row.replaceChild(year, controls);
      row.classList.add(eventIndex === currentCorrectOrder[position] ? "correct" : "incorrect");
    }
    elements.eventList.append(row);
  });
}

function move(position, direction) {
  if (locked) return;
  const target = position + direction;
  if (target < 0 || target >= order.length) return;
  [order[position], order[target]] = [order[target], order[position]];
  drawRows();
}

function checkOrder() {
  if (locked) return;
  if (state.plays >= 3) {
    openPaywall();
    return;
  }
  const sorted = [...currentPack.events].sort((a, b) => a.year - b.year);
  const score = order.reduce((total, eventIndex, position) => total + Number(eventIndex === currentCorrectOrder[position]), 0);
  locked = true;
  state.lastPackIndex = currentPackIndex;
  state.lastOrder = [...order];
  state.plays += 1;
  state.score = score;
  persist();
  elements.feedback.textContent = score === 5 ? "Perfect timeline. Clean work." : `${score} of 5 events are in the right position.`;
  elements.feedback.className = `feedback ${score === 5 ? "positive" : "negative"}`;
  showAnswer(sorted);
  drawRows();
  setStatus();
}

function showAnswer(sorted = [...currentPack.events].sort((a, b) => a.year - b.year)) {
  elements.result.innerHTML = `<span class="result-label">THE TIMELINE</span>${sorted.map(event => `<a href="${event.source}" target="_blank" rel="noreferrer">${event.title}</a> <span>(${event.year})</span>`).join("<br>")}<button class="share-result" id="shareResult" type="button">COPY RESULT <span aria-hidden="true">↗</span></button>`;
  elements.result.hidden = false;
  document.getElementById("shareResult").addEventListener("click", async event => {
    const tiles = order.map((eventIndex, position) => eventIndex === currentCorrectOrder[position] ? "🟩" : "⬛").join("");
    const shareText = `CHRONICLE ${elements.issueNumber.textContent} · ${state.score}/5\n${tiles}`;
    try {
      await navigator.clipboard.writeText(shareText);
      event.currentTarget.textContent = "COPIED";
    } catch {
      event.currentTarget.textContent = "COPY UNAVAILABLE";
    }
  });
}

function nextPlay() {
  if (state.plays >= 3) {
    openPaywall();
    return;
  }
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

elements.checkOrder.addEventListener("click", checkOrder);
elements.nextPlay.addEventListener("click", nextPlay);
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
validatePuzzles();
render();
