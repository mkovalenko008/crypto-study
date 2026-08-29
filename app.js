"use strict";

/* =========================================================================
   Storage layer — the only part that touches localStorage. Swapping to a
   real backend later means reimplementing this object's methods to hit an
   API instead; nothing in the render functions below talks to storage
   directly, so the swap stays local to this block.
   ========================================================================= */
const Store = (() => {
  const KEY = "cryptoStudy.v1";
  let state = null;

  function defaults() {
    return {
      blocks: {},        // id -> { checklist: {idx:true}, quizBest: 0, quizAttempts: 0, firstTry100: false }
      flashcards: {},     // id -> { box, next_review (ISO) }
      scenarios: {},      // id -> { done, userAnswer }
      standing: {},        // idx -> bool
      journal: { entries: [], propFirm: null },
      achievements: []   // unlocked ids
    };
  }

  function load() {
    if (state) return state;
    let parsed = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) { parsed = null; }
    const d = defaults();
    if (!parsed) { state = d; return state; }
    state = {
      blocks: Object.assign({}, parsed.blocks || {}),
      flashcards: Object.assign({}, parsed.flashcards || {}),
      scenarios: Object.assign({}, parsed.scenarios || {}),
      standing: Object.assign({}, parsed.standing || {}),
      journal: Object.assign({ entries: [], propFirm: null }, parsed.journal || {}),
      achievements: parsed.achievements || []
    };
    return state;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function getBlock(id) {
    load();
    if (!state.blocks[id]) {
      state.blocks[id] = { checklist: {}, quizBest: 0, quizAttempts: 0, firstTry100: false };
    }
    return state.blocks[id];
  }

  function setChecklistItem(blockId, idx, val) {
    const b = getBlock(blockId);
    b.checklist[idx] = val;
    persist();
  }

  function recordQuizResult(blockId, scorePct) {
    const b = getBlock(blockId);
    b.quizAttempts += 1;
    if (scorePct > b.quizBest) b.quizBest = scorePct;
    if (b.quizAttempts === 1 && scorePct === 100) b.firstTry100 = true;
    persist();
    return b;
  }

  function blockChecklistFraction(blockDef) {
    const b = getBlock(blockDef.id);
    if (!blockDef.practice_items.length) return 1;
    let done = 0;
    blockDef.practice_items.forEach((_, i) => { if (b.checklist[i]) done++; });
    return done / blockDef.practice_items.length;
  }

  function blockProgressPct(blockDef) {
    const b = getBlock(blockDef.id);
    const checklistFrac = blockChecklistFraction(blockDef);
    if (!blockDef.practice_items.length) return Math.round(b.quizBest);
    return Math.round((checklistFrac * 0.6 + (b.quizBest / 100) * 0.4) * 100);
  }

  function isBlockComplete(blockDef) {
    const b = getBlock(blockDef.id);
    return blockChecklistFraction(blockDef) === 1 && b.quizBest >= 80;
  }

  function isBlockUnlocked(blockId) {
    if (blockId === 0) return true;
    const prev = BLOCKS.find(bl => bl.id === blockId - 1);
    if (!prev) return true;
    return isBlockComplete(prev);
  }

  function getFlashcard(id) {
    load();
    if (!state.flashcards[id]) {
      state.flashcards[id] = { box: 1, next_review: new Date(0).toISOString() };
    }
    return state.flashcards[id];
  }

  const LEITNER_INTERVAL_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 };

  function reviewFlashcard(id, correct) {
    const c = getFlashcard(id);
    if (correct) {
      c.box = Math.min(5, c.box + 1);
    } else {
      c.box = 1;
    }
    const days = LEITNER_INTERVAL_DAYS[c.box] || 0;
    const next = new Date();
    next.setDate(next.getDate() + days);
    c.next_review = next.toISOString();
    persist();
    return c;
  }

  function dueFlashcards() {
    const now = new Date();
    return FLASHCARDS.filter(fc => new Date(getFlashcard(fc.id).next_review) <= now);
  }

  function getScenario(id) {
    load();
    if (!state.scenarios[id]) state.scenarios[id] = { done: false, userAnswer: "" };
    return state.scenarios[id];
  }
  function setScenarioAnswer(id, text) { getScenario(id).userAnswer = text; persist(); }
  function markScenarioDone(id, val) { getScenario(id).done = val; persist(); }

  function toggleStanding(idx) {
    load();
    state.standing[idx] = !state.standing[idx];
    persist();
  }

  function addJournalEntry(entry) {
    load();
    state.journal.entries.push(entry);
    persist();
  }
  function deleteJournalEntry(id) {
    load();
    state.journal.entries = state.journal.entries.filter(e => e.id !== id);
    persist();
  }
  function setPropFirm(cfg) {
    load();
    state.journal.propFirm = cfg;
    persist();
  }

  function unlockAchievement(id) {
    load();
    if (state.achievements.includes(id)) return false;
    state.achievements.push(id);
    persist();
    return true;
  }

  return {
    load, persist,
    getBlock, setChecklistItem, recordQuizResult,
    blockChecklistFraction, blockProgressPct, isBlockComplete, isBlockUnlocked,
    getFlashcard, reviewFlashcard, dueFlashcards, LEITNER_INTERVAL_DAYS,
    getScenario, setScenarioAnswer, markScenarioDone,
    toggleStanding,
    addJournalEntry, deleteJournalEntry, setPropFirm,
    unlockAchievement,
    get raw() { return load(); }
  };
})();

/* =========================================================================
   Achievements
   ========================================================================= */
const ACHIEVEMENTS = [
  { id: "journal-first", glyph: "✎", name: "Первая запись", desc: "Первая сделка в торговом дневнике" },
  { id: "first-block", glyph: "⚑", name: "Первый блок", desc: "Закрыт первый блок программы" },
  { id: "five-blocks", glyph: "⚔", name: "Экватор", desc: "Закрыто 5 блоков из 11" },
  { id: "all-blocks", glyph: "★", name: "Протокол закрыт", desc: "Пройдены все 11 блоков программы" },
  { id: "quiz-perfect", glyph: "✓", name: "С первой попытки", desc: "Квиз на 100% с первой попытки" },
  { id: "flashcards-clean", glyph: "◈", name: "Чистая колода", desc: "Вся колода флеш-карт без ошибок за сессию" },
  { id: "journal-streak-7", glyph: "◯", name: "Неделя дисциплины", desc: "7 дней подряд с записью в дневник" },
  { id: "journal-streak-30", glyph: "◉", name: "Месяц дисциплины", desc: "30 дней подряд с записью в дневник" },
  { id: "scenario-master", glyph: "⚙", name: "Применено на практике", desc: "Разобраны все applied-сценарии" }
];

function checkBlockAchievements() {
  const completed = BLOCKS.filter(b => Store.isBlockComplete(b)).length;
  if (completed >= 1) Store.unlockAchievement("first-block");
  if (completed >= 5) Store.unlockAchievement("five-blocks");
  if (completed >= 11) Store.unlockAchievement("all-blocks");
}

function checkScenarioAchievements() {
  const allDone = SCENARIOS.every(s => Store.getScenario(s.id).done);
  if (allDone) Store.unlockAchievement("scenario-master");
}

function currentJournalStreak() {
  const entries = Store.raw.journal.entries;
  if (!entries.length) return 0;
  const days = Array.from(new Set(entries.map(e => e.date))).sort();
  let streak = 1;
  let best = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const cur = new Date(days[i]);
    const diff = Math.round((cur - prev) / 86400000);
    if (diff === 1) { streak++; } else { streak = 1; }
    if (streak > best) best = streak;
  }
  // check streak reaches up to today/most recent day (informational; we award on best run)
  return best;
}

function checkJournalAchievements() {
  if (Store.raw.journal.entries.length >= 1) Store.unlockAchievement("journal-first");
  const streak = currentJournalStreak();
  if (streak >= 7) Store.unlockAchievement("journal-streak-7");
  if (streak >= 30) Store.unlockAchievement("journal-streak-30");
}

/* =========================================================================
   Small utilities
   ========================================================================= */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtPct(n) { return `${Math.round(n)}%`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function on(root, selector, event, handler) {
  root.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler));
}

/* =========================================================================
   Router
   ========================================================================= */
const ROUTES = ["dashboard", "block", "flashcards", "scenarios", "journal", "resources", "achievements"];

function parseHash() {
  const raw = (location.hash || "#/dashboard").replace(/^#\//, "");
  const parts = raw.split("/");
  const name = ROUTES.includes(parts[0]) ? parts[0] : "dashboard";
  return { name, arg: parts[1] };
}

function navigate(route) { location.hash = `#/${route}`; }

function render() {
  const { name, arg } = parseHash();
  renderNav(name);
  const view = document.getElementById("view");
  if (name === "dashboard") view.innerHTML = renderDashboard();
  else if (name === "block") { view.innerHTML = renderBlockScreen(parseInt(arg, 10)); bindBlockEvents(parseInt(arg, 10)); }
  else if (name === "flashcards") { view.innerHTML = renderFlashcardsScreen(); bindFlashcardsEvents(); }
  else if (name === "scenarios") { view.innerHTML = renderScenariosScreen(); bindScenariosEvents(); }
  else if (name === "journal") { view.innerHTML = renderJournalScreen(); bindJournalEvents(); }
  else if (name === "resources") view.innerHTML = renderResourcesScreen();
  else if (name === "achievements") view.innerHTML = renderAchievementsScreen();

  if (name === "dashboard") bindDashboardEvents();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderNav(active) {
  const nav = document.getElementById("tabs");
  const items = [
    ["dashboard", "Дашборд"],
    ["flashcards", "Флеш-карты"],
    ["scenarios", "Сценарии"],
    ["journal", "Дневник"],
    ["resources", "Ресурсы"],
    ["achievements", "Достижения"]
  ];
  nav.innerHTML = items.map(([r, label]) =>
    `<button data-route="${r}" class="${active === r ? "active" : ""}">${label}</button>`
  ).join("");
  on(nav, "button", "click", (e) => navigate(e.currentTarget.dataset.route));
  updateNavStatus();
}

function updateNavStatus() {
  const el = document.getElementById("nav-status");
  if (!el) return;
  const completedCount = BLOCKS.filter(b => Store.isBlockComplete(b)).length;
  const currentBlock = BLOCKS.find(b => !Store.isBlockComplete(b)) || BLOCKS[BLOCKS.length - 1];
  el.innerHTML = `<span class="live-dot"></span>Блок ${currentBlock.id} · ${completedCount}/${BLOCKS.length}`;
}

/* =========================================================================
   Dashboard / roadmap
   ========================================================================= */
function renderDashboard() {
  const completedCount = BLOCKS.filter(b => Store.isBlockComplete(b)).length;
  const overallPct = Math.round((completedCount / BLOCKS.length) * 100);
  const currentBlock = BLOCKS.find(b => !Store.isBlockComplete(b)) || BLOCKS[BLOCKS.length - 1];

  const nodes = BLOCKS.map(b => {
    const complete = Store.isBlockComplete(b);
    const unlocked = Store.isBlockUnlocked(b.id);
    const isCurrent = b.id === currentBlock.id && !complete;
    const cls = ["stamp-node"];
    if (complete) cls.push("complete");
    if (isCurrent) cls.push("current");
    if (!unlocked) cls.push("locked");
    const core = complete ? "✓" : (!unlocked ? "–" : String(b.id));
    return `<button class="${cls.join(" ")}" data-block="${b.id}">
      <span class="stamp-core">${core}</span>
      <span class="stamp-label">${esc(b.title)}</span>
    </button>`;
  }).join("");

  const timelineRows = PROGRAM_META.timeline.map(row => {
    const labels = row.blockIds.map(id => {
      const b = BLOCKS.find(x => x.id === id);
      const done = Store.isBlockComplete(b);
      return `<span class="pill"${done ? ' style="border-color:rgba(52,211,153,0.4);color:var(--color-signal-green)"' : ""}>Блок ${id}${done ? " ✓" : ""}</span>`;
    }).join(" ");
    return `<tr><td>${row.week}</td><td>${labels}</td></tr>`;
  }).join("");

  const standingItems = PROGRAM_META.standingChecklist.map((item, i) => {
    const checked = !!Store.raw.standing[i];
    return `<div class="checklist-item ${checked ? "done" : ""}">
      <input type="checkbox" id="std-${i}" data-idx="${i}" ${checked ? "checked" : ""}/>
      <label for="std-${i}">${esc(item)}</label>
    </div>`;
  }).join("");

  return `
    <div class="hero">
      <span class="eyebrow">Протокол v3 · 12–13 недель</span>
      <h1 class="headline-2tone"><span class="l1">Дорожная</span><span class="l2">карта</span></h1>
      <p class="subhead">11 блоков от матчасти до продвинутого DeFi. Блок закрывается только когда чек-лист выполнен целиком и квиз пройден на 80%+.</p>
      <div class="rule-note">${esc(PROGRAM_META.rule)}</div>
    </div>

    <div class="card">
      <span class="eyebrow">Прогресс</span>
      <div class="roadmap">${nodes}</div>
      <div class="overall-tally">
        <div class="tally-figure"><span class="num">${overallPct}%</span><span class="unit">Общий прогресс</span></div>
        <div class="tally-figure"><span class="num">${completedCount}/${BLOCKS.length}</span><span class="unit">Блоков закрыто</span></div>
        <div class="tally-figure"><span class="num">Блок ${currentBlock.id}</span><span class="unit">Текущий</span></div>
      </div>
    </div>

    <div class="card">
      <span class="eyebrow">Таймлайн</span>
      <h3>12–13 недель</h3>
      <table class="journal-table" style="min-width:0">
        <thead><tr><th>Неделя</th><th>Блок(и)</th></tr></thead>
        <tbody>${timelineRows}</tbody>
      </table>
    </div>

    <div class="card">
      <span class="eyebrow">Всегда на виду</span>
      <h3>Постоянный чек-лист безопасности</h3>
      <p class="faint">Не привязан к блокам — держать перед глазами всегда.</p>
      ${standingItems}
    </div>
  `;
}

function bindDashboardEvents() {
  const view = document.getElementById("view");
  on(view, ".stamp-node", "click", (e) => navigate(`block/${e.currentTarget.dataset.block}`));
  on(view, "input[data-idx]", "change", (e) => { Store.toggleStanding(parseInt(e.currentTarget.dataset.idx, 10)); render(); });
}

/* =========================================================================
   Block screen
   ========================================================================= */
function renderBlockScreen(id) {
  const b = BLOCKS.find(x => x.id === id);
  if (!b) return `<div class="card">Блок не найден. <a href="#/dashboard">К дашборду</a></div>`;

  const unlocked = Store.isBlockUnlocked(id) || sessionStorage.getItem(`force-${id}`) === "1";
  const prevTitle = id > 0 ? BLOCKS.find(x => x.id === id - 1).title : null;

  const lockNotice = (!unlocked) ? `
    <div class="lock-banner">
      По правилам программы этот блок открывается после закрытия блока ${id - 1} («${esc(prevTitle)}»).
      <div class="btn-row"><button class="btn ghost" id="force-open">Всё равно открыть (не по правилам программы)</button></div>
    </div>` : "";

  if (!unlocked) {
    return `<a href="#/dashboard" class="faint">&larr; К дашборду</a>
      <div class="card"><h2>Блок ${id}. ${esc(b.title)} <span class="pill">${esc(b.duration)}</span></h2>${lockNotice}</div>`;
  }

  const sections = b.sections.map(s => `<div class="section-block"><h3>${esc(s.heading)}</h3>${s.body}</div>`).join("");

  const bState = Store.getBlock(id);
  const checklist = b.practice_items.length
    ? b.practice_items.map((item, i) => {
      const checked = !!bState.checklist[i];
      return `<div class="checklist-item ${checked ? "done" : ""}">
        <input type="checkbox" id="chk-${id}-${i}" data-idx="${i}" ${checked ? "checked" : ""}/>
        <label for="chk-${id}-${i}">${esc(item)}</label>
      </div>`;
    }).join("")
    : `<p class="faint">В этом блоке нет отдельного списка практики в источнике — прогресс определяется квизом.</p>`;

  const checklistFrac = Store.blockChecklistFraction(b);
  const complete = Store.isBlockComplete(b);

  const checkLine = b.check ? `<div class="scenario-prompt"><strong>Чек на выходе:</strong> ${esc(b.check)}</div>` : "";

  const linksCard = (b.links && b.links.length) ? `
    <div class="card">
      <span class="eyebrow">Материалы</span>
      <h3>Куда идти читать/пробовать</h3>
      <div class="link-chips">
        ${b.links.map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join("")}
      </div>
    </div>` : "";

  return `
    <a href="#/dashboard" class="faint">&larr; К дашборду</a>
    <div class="card">
      <span class="eyebrow">Блок ${id} · ${esc(b.duration)}</span>
      <h2>${esc(b.title)}</h2>
      <div class="btn-row" style="margin-top:0;margin-bottom:20px">
        ${complete ? `<span class="gate-status pass">Блок пройден</span>` : `<span class="gate-status">В работе — ${fmtPct(Store.blockProgressPct(b))}</span>`}
      </div>
      ${sections}
      ${checkLine}
    </div>
    ${linksCard}

    <div class="card">
      <span class="eyebrow">Практика · ${Math.round(checklistFrac * 100)}%</span>
      <h3>Чек-лист</h3>
      ${checklist}
    </div>

    <div class="card" id="quiz-card">
      ${renderQuiz(b)}
    </div>
  `;
}

function renderQuiz(b) {
  const bState = Store.getBlock(b.id);
  const bestLine = bState.quizAttempts
    ? `<p class="faint">Лучший результат: ${bState.quizBest}% (попыток: ${bState.quizAttempts})</p>`
    : `<p class="faint">Нужно 80%+, чтобы блок засчитался пройденным.</p>`;
  const questions = b.quiz.map((q, qi) => `
    <div class="quiz-q" data-qi="${qi}">
      <p class="q-text">${qi + 1}. ${esc(q.question)}</p>
      ${q.options.map((opt, oi) => `
        <label class="quiz-opt" data-oi="${oi}">
          <input type="radio" name="q${qi}" value="${oi}"/>
          <span>${esc(opt)}</span>
        </label>`).join("")}
    </div>
  `).join("");

  return `
    <h3>Квиз на понимание</h3>
    ${bestLine}
    <div id="quiz-result"></div>
    <form id="quiz-form">
      ${questions}
      <div class="btn-row"><button type="submit" class="btn primary">Проверить</button></div>
    </form>
  `;
}

function bindBlockEvents(id) {
  const view = document.getElementById("view");
  const forceBtn = view.querySelector("#force-open");
  if (forceBtn) forceBtn.addEventListener("click", () => { sessionStorage.setItem(`force-${id}`, "1"); render(); });

  on(view, "input[data-idx]", "change", (e) => {
    Store.setChecklistItem(id, parseInt(e.currentTarget.dataset.idx, 10), e.currentTarget.checked);
    checkBlockAchievements();
    render();
    navigate(`block/${id}`);
  });

  const form = view.querySelector("#quiz-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const b = BLOCKS.find(x => x.id === id);
    let correctCount = 0;
    b.quiz.forEach((q, qi) => {
      const qEl = form.querySelector(`.quiz-q[data-qi="${qi}"]`);
      const checked = qEl.querySelector(`input[name="q${qi}"]:checked`);
      const chosen = checked ? parseInt(checked.value, 10) : -1;
      qEl.classList.add("graded");
      qEl.querySelectorAll(".quiz-opt").forEach(optEl => {
        const oi = parseInt(optEl.dataset.oi, 10);
        if (oi === q.correct) optEl.classList.add("correct-answer");
        else if (oi === chosen) optEl.classList.add("wrong-answer");
      });
      if (chosen === q.correct) correctCount++;
    });
    const scorePct = Math.round((correctCount / b.quiz.length) * 100);
    Store.recordQuizResult(id, scorePct);
    if (scorePct === 100) Store.unlockAchievement("quiz-perfect");
    checkBlockAchievements();
    const resultEl = view.querySelector("#quiz-result");
    resultEl.innerHTML = `<div class="score-banner ${scorePct >= 80 ? "pass" : "fail"}">
      Результат: ${correctCount}/${b.quiz.length} (${scorePct}%) ${scorePct >= 80 ? "— порог пройден" : "— нужно 80%+, попробуй ещё раз"}
    </div>`;
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/* =========================================================================
   Flashcards
   ========================================================================= */
let flashSession = null; // { queue: [ids], pos, mode, showBack, wrongCount, totalCards }

function initFlashSession(mode) {
  const ids = mode === "all" ? FLASHCARDS.map(c => c.id) : Store.dueFlashcards().map(c => c.id);
  flashSession = { queue: shuffle(ids), pos: 0, mode, showBack: false, wrongCount: 0, totalCards: ids.length };
}

function renderFlashcardsScreen() {
  if (!flashSession) initFlashSession("due");
  const dueCount = Store.dueFlashcards().length;

  if (!flashSession.queue.length) {
    return `
      <div class="card">
        <span class="eyebrow">Spaced repetition</span>
        <h2>Флеш-карты</h2>
        <p>Карточек к повторению сейчас нет (0 due из ${FLASHCARDS.length}).</p>
        <div class="btn-row">
          <button class="btn primary" id="start-all">Пройти всю колоду (тренировка)</button>
        </div>
      </div>`;
  }

  const cardId = flashSession.queue[flashSession.pos];
  const card = FLASHCARDS.find(c => c.id === cardId);
  const cState = Store.getFlashcard(cardId);
  const dots = [1, 2, 3, 4, 5].map(n => `<span class="box-dot ${n === cState.box ? "active" : ""}">${n}</span>`).join("");

  return `
    <div class="card">
      <span class="eyebrow">Spaced repetition</span>
      <h2>Флеш-карты <span class="pill">${flashSession.mode === "all" ? "вся колода" : "к повторению"}</span></h2>
      <p class="faint">Карта ${flashSession.pos + 1} из ${flashSession.queue.length} · всего в колоде ${FLASHCARDS.length} · due сейчас: ${dueCount}</p>
      <div class="flash-stage">
        <div class="flashcard" id="flash-card">
          <span class="side-tag">${flashSession.showBack ? "Ответ" : "Вопрос — нажми, чтобы открыть ответ"}</span>
          <div class="content ${flashSession.showBack ? "back" : ""}">${esc(flashSession.showBack ? card.back : card.front)}</div>
        </div>
        <div class="box-track">Box: ${dots}</div>
        ${!flashSession.showBack
      ? `<div class="btn-row"><button class="btn primary" id="reveal">Показать ответ</button></div>`
      : `<div class="btn-row">
              <button class="btn danger" id="mark-wrong">Не помню</button>
              <button class="btn primary" id="mark-right">Помню</button>
             </div>`}
      </div>
    </div>
    <div class="card">
      <button class="btn ghost" id="restart-due">Начать заново: к повторению</button>
      <button class="btn ghost" id="restart-all">Начать заново: вся колода</button>
    </div>
  `;
}

function bindFlashcardsEvents() {
  const view = document.getElementById("view");
  const startAll = view.querySelector("#start-all");
  if (startAll) startAll.addEventListener("click", () => { initFlashSession("all"); render(); });

  const flashCard = view.querySelector("#flash-card");
  const reveal = view.querySelector("#reveal");
  if (flashCard) flashCard.addEventListener("click", () => { flashSession.showBack = true; render(); });
  if (reveal) reveal.addEventListener("click", (e) => { e.stopPropagation(); flashSession.showBack = true; render(); });

  const advance = (correct) => {
    const cardId = flashSession.queue[flashSession.pos];
    Store.reviewFlashcard(cardId, correct);
    if (!correct) {
      flashSession.wrongCount++;
      flashSession.queue.push(cardId); // requeue to see again this session
    }
    flashSession.pos++;
    flashSession.showBack = false;
    if (flashSession.pos >= flashSession.queue.length) {
      if (flashSession.mode === "all" && flashSession.wrongCount === 0 && flashSession.totalCards === FLASHCARDS.length) {
        Store.unlockAchievement("flashcards-clean");
      }
      flashSession = null;
    }
    render();
  };

  const wrongBtn = view.querySelector("#mark-wrong");
  const rightBtn = view.querySelector("#mark-right");
  if (wrongBtn) wrongBtn.addEventListener("click", () => advance(false));
  if (rightBtn) rightBtn.addEventListener("click", () => advance(true));

  const rDue = view.querySelector("#restart-due");
  const rAll = view.querySelector("#restart-all");
  if (rDue) rDue.addEventListener("click", () => { initFlashSession("due"); render(); });
  if (rAll) rAll.addEventListener("click", () => { initFlashSession("all"); render(); });
}

/* =========================================================================
   Applied scenarios
   ========================================================================= */
function renderScenariosScreen() {
  const cards = SCENARIOS.map(s => {
    const state = Store.getScenario(s.id);
    const blockTitle = BLOCKS.find(b => b.id === s.blockId).title;
    let body = `
      <div class="scenario-prompt">${esc(s.prompt)}</div>
      <p><strong>Задача:</strong> ${esc(s.task)}</p>`;

    if (s.type === "numeric") {
      body += `
        <div class="form-grid">
          <div>
            <label class="field-label">Твой ответ ${s.unit ? `(${esc(s.unit)})` : ""}</label>
            <input type="text" inputmode="decimal" id="ans-${s.id}" placeholder="например: -20.0"/>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn primary" data-check="${s.id}">Проверить</button>
          <button class="btn ghost" data-reveal="${s.id}">Показать разбор</button>
        </div>
        <div id="result-${s.id}"></div>`;
    } else {
      body += `
        <textarea id="ans-${s.id}" placeholder="Запиши свой разбор здесь...">${esc(state.userAnswer)}</textarea>
        <div class="btn-row">
          <button class="btn ghost" data-reveal="${s.id}">Показать разбор</button>
          <button class="btn primary" data-done="${s.id}">${state.done ? "Разобрано ✓" : "Отметить как разобрано"}</button>
        </div>`;
    }
    body += `<div class="model-answer" id="model-${s.id}" hidden>${esc(s.modelAnswer)}</div>`;

    return `<div class="card">
      <h3>${esc(blockTitle)} <span class="pill">${state.done ? "разобрано" : "не разобрано"}</span></h3>
      ${body}
    </div>`;
  }).join("");

  return `<div class="card"><span class="eyebrow">Практика</span><h2>Applied-сценарии</h2><p class="faint">Не пересказ определения, а применение чек-листа или формулы к конкретному случаю.</p></div>${cards}`;
}

function bindScenariosEvents() {
  const view = document.getElementById("view");
  on(view, "[data-reveal]", "click", (e) => {
    const id = e.currentTarget.dataset.reveal;
    view.querySelector(`#model-${id}`).hidden = false;
  });
  on(view, "textarea", "input", (e) => {
    const id = e.currentTarget.id.replace("ans-", "");
    Store.setScenarioAnswer(id, e.currentTarget.value);
  });
  on(view, "[data-done]", "click", (e) => {
    const id = e.currentTarget.dataset.done;
    const s = Store.getScenario(id);
    Store.markScenarioDone(id, !s.done);
    checkScenarioAchievements();
    render();
  });
  on(view, "[data-check]", "click", (e) => {
    const id = e.currentTarget.dataset.check;
    const scenario = SCENARIOS.find(s => s.id === id);
    const input = view.querySelector(`#ans-${id}`);
    const val = parseFloat((input.value || "").replace(",", "."));
    const correctVal = typeof scenario.computeInput !== "undefined" ? scenario.compute(scenario.computeInput) : scenario.compute();
    const resultEl = view.querySelector(`#result-${id}`);
    const ok = !isNaN(val) && Math.abs(val - correctVal) <= scenario.tolerance;
    resultEl.innerHTML = `<p class="result-tag ${ok ? "ok" : "no"}">${ok ? "✓ Верно" : `✗ Неверно — правильный ответ: ${correctVal}${scenario.unit || ""}`}</p>`;
    if (ok) {
      Store.markScenarioDone(id, true);
      checkScenarioAchievements();
    }
  });
}

/* =========================================================================
   Trading journal
   ========================================================================= */
function computeR(entry) {
  if (entry.manualR !== null && entry.manualR !== undefined && entry.manualR !== "") return parseFloat(entry.manualR);
  const { entryPrice, stopPrice, exitPrice, direction } = entry;
  if ([entryPrice, stopPrice, exitPrice].some(v => v === null || v === undefined || v === "")) return null;
  const e = parseFloat(entryPrice), st = parseFloat(stopPrice), ex = parseFloat(exitPrice);
  if (e === st) return null;
  if (direction === "short") return (e - ex) / (st - e);
  return (ex - e) / (e - st);
}

function journalStats(entries) {
  const withR = entries.map(e => ({ ...e, r: computeR(e) })).filter(e => e.r !== null && !isNaN(e.r));
  const total = entries.length;
  const wins = withR.filter(e => e.r > 0);
  const losses = withR.filter(e => e.r < 0);
  const winRate = withR.length ? wins.length / withR.length : 0;
  const lossRate = withR.length ? losses.length / withR.length : 0;
  const avgWinR = wins.length ? wins.reduce((s, e) => s + e.r, 0) / wins.length : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((s, e) => s + e.r, 0) / losses.length) : 0;
  const expectancy = (winRate * avgWinR) - (lossRate * avgLossR);
  return { total, withRCount: withR.length, winRate, avgWinR, avgLossR, expectancy, withR };
}

function renderEquityCurve(withR) {
  if (!withR.length) return `<p class="faint">Недостаточно данных для графика (нужны сделки с посчитанным R).</p>`;
  const sorted = withR.slice().sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const points = sorted.map(e => { cum += e.r; return cum; });
  const w = 600, h = 160, pad = 10;
  const minV = Math.min(0, ...points), maxV = Math.max(0, ...points);
  const range = (maxV - minV) || 1;
  const stepX = points.length > 1 ? (w - 2 * pad) / (points.length - 1) : 0;
  const toY = (v) => h - pad - ((v - minV) / range) * (h - 2 * pad);
  const zeroY = toY(0);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${toY(v)}`).join(" ");
  return `<svg class="equity-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line class="zero-line" x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}"/>
    <path class="curve" d="${path}"/>
  </svg>
  <p class="faint">Кумулятивный R по ${points.length} сделкам с посчитанным результатом. Итого: ${cum.toFixed(2)}R</p>`;
}

function renderPropFirmPanel(entries) {
  const cfg = Store.raw.journal.propFirm;
  const formHtml = `
    <details ${cfg ? "" : "open"}>
      <summary class="faint" style="cursor:pointer">${cfg ? "Настройки режима «проп-фирма»" : "Включить режим «проп-фирма»"}</summary>
      <div class="form-grid" style="margin-top:10px">
        <div><label class="field-label">Дата начала окна (30 дней)</label><input type="date" id="pf-start" value="${cfg ? cfg.start : todayISO()}"/></div>
        <div><label class="field-label">Дневной лимит убытка, R</label><input type="number" step="0.1" id="pf-daily" value="${cfg ? cfg.dailyLossLimitR : 2}"/></div>
        <div><label class="field-label">Общий лимит просадки, R</label><input type="number" step="0.1" id="pf-dd" value="${cfg ? cfg.maxDrawdownR : 6}"/></div>
      </div>
      <div class="btn-row"><button class="btn primary" id="pf-save">Сохранить настройки</button>${cfg ? `<button class="btn danger" id="pf-disable">Выключить режим</button>` : ""}</div>
    </details>`;

  if (!cfg) return `<div class="card"><h3>Режим «проп-фирма»</h3>${formHtml}</div>`;

  const start = new Date(cfg.start);
  const end = new Date(start); end.setDate(end.getDate() + 30);
  const inWindow = entries.filter(e => { const d = new Date(e.date); return d >= start && d <= end; })
    .map(e => ({ ...e, r: computeR(e) })).filter(e => e.r !== null);

  const byDay = {};
  inWindow.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.r; });
  const days = Object.keys(byDay).sort();
  const totalNet = days.reduce((s, d) => s + byDay[d], 0);

  const dailyBreaches = days.filter(d => byDay[d] < -Math.abs(cfg.dailyLossLimitR));
  let peak = 0, cum = 0, maxDD = 0, ddBreachDay = null;
  days.forEach(d => {
    cum += byDay[d];
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) { maxDD = dd; if (dd > cfg.maxDrawdownR) ddBreachDay = d; }
  });
  const fiftyPctBreaches = totalNet > 0 ? days.filter(d => byDay[d] > 0.5 * totalNet) : [];

  const flag = (ok, text) => `<div class="propfirm-flag ${ok ? "ok" : "breach"}"><span class="dot"></span>${text}</div>`;

  return `<div class="card">
    <span class="eyebrow">Режим «проп-фирма»</span>
    <h3>Окно ${cfg.start} → ${end.toISOString().slice(0, 10)}</h3>
    ${flag(dailyBreaches.length === 0, `Дневной лимит убытка (${cfg.dailyLossLimitR}R): ${dailyBreaches.length ? "нарушен в дни " + dailyBreaches.join(", ") : "не нарушен"}`)}
    ${flag(!ddBreachDay, `Общий лимит просадки (${cfg.maxDrawdownR}R): макс. просадка ${maxDD.toFixed(2)}R${ddBreachDay ? " — превышена к " + ddBreachDay : ""}`)}
    ${flag(fiftyPctBreaches.length === 0, `Правило «не больше 50% прибыли за один день»: ${fiftyPctBreaches.length ? "нарушено в дни " + fiftyPctBreaches.join(", ") : (totalNet > 0 ? "не нарушено" : "период пока не в плюсе — правило не применимо")}`)}
    <p class="faint">Итог по сделкам в окне: ${totalNet.toFixed(2)}R за ${days.length} торговых дней.</p>
    ${formHtml}
  </div>`;
}

function renderJournalScreen() {
  const entries = Store.raw.journal.entries.slice().sort((a, b) => b.date.localeCompare(a.date));
  const stats = journalStats(entries);

  const rows = entries.map(e => {
    const r = computeR(e);
    const rCell = r === null ? '<span class="faint">—</span>' : `<span class="${r >= 0 ? "r-pos" : "r-neg"}">${r.toFixed(2)}R</span>`;
    return `<tr>
      <td>${esc(e.date)}</td>
      <td>${esc(e.asset)}</td>
      <td class="wrap">${esc(e.thesis)}</td>
      <td>${e.positionSizePct}%</td>
      <td>${rCell}</td>
      <td class="wrap">${esc(e.deviationNote || "")}</td>
      <td><button class="btn ghost" data-del="${e.id}">Удалить</button></td>
    </tr>`;
  }).join("");

  return `
    <div class="card">
      <span class="eyebrow">Дисциплина</span>
      <h2>Торговый дневник</h2>
      <form id="journal-form" class="form-grid">
        <div><label class="field-label">Дата</label><input type="date" name="date" value="${todayISO()}" required/></div>
        <div><label class="field-label">Актив</label><input type="text" name="asset" placeholder="BTC" required/></div>
        <div><label class="field-label">Направление</label>
          <select name="direction"><option value="long">Long</option><option value="short">Short</option></select>
        </div>
        <div><label class="field-label">Размер позиции, % портфеля</label><input type="number" step="0.1" name="positionSizePct" required/></div>
        <div><label class="field-label">Цена входа (опц.)</label><input type="number" step="any" name="entryPrice"/></div>
        <div><label class="field-label">Цена стопа (опц.)</label><input type="number" step="any" name="stopPrice"/></div>
        <div><label class="field-label">Факт. цена выхода (опц.)</label><input type="number" step="any" name="exitPrice"/></div>
        <div><label class="field-label">R вручную (если цены не даны)</label><input type="number" step="any" name="manualR"/></div>
        <div class="full"><label class="field-label">Тезис входа (1 предложение)</label><input type="text" name="thesis" required/></div>
        <div class="full"><label class="field-label">План выхода</label><input type="text" name="exitPlan"/></div>
        <div class="full"><label class="field-label">Что пошло не по плану</label><textarea name="deviationNote"></textarea></div>
        <div class="full btn-row"><button type="submit" class="btn primary">Записать сделку</button></div>
      </form>
    </div>

    <div class="card">
      <span class="eyebrow">Метрики</span>
      <h3>Статистика</h3>
      <div class="stat-grid">
        <div class="stat-tile"><div class="num">${stats.total}</div><div class="lbl">Всего сделок</div></div>
        <div class="stat-tile"><div class="num">${fmtPct(stats.winRate * 100)}</div><div class="lbl">Win rate</div></div>
        <div class="stat-tile"><div class="num">${stats.avgWinR.toFixed(2)}R</div><div class="lbl">Средний R (win)</div></div>
        <div class="stat-tile"><div class="num">-${stats.avgLossR.toFixed(2)}R</div><div class="lbl">Средний R (loss)</div></div>
        <div class="stat-tile"><div class="num">${stats.expectancy.toFixed(2)}R</div><div class="lbl">Expectancy</div></div>
      </div>
      <p class="faint">Expectancy = (% выигрышных × средний R выигрыша) − (% убыточных × средний R убытка) — формула Van Tharp из Блока 3.</p>
      ${renderEquityCurve(stats.withR)}
    </div>

    ${renderPropFirmPanel(entries)}

    <div class="card">
      <span class="eyebrow">Журнал</span>
      <h3>Записи</h3>
      <div class="table-wrap">
        <table class="journal-table">
          <thead><tr><th>Дата</th><th>Актив</th><th>Тезис</th><th>Размер</th><th>R</th><th>Что не по плану</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="faint">Пока пусто</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bindJournalEvents() {
  const view = document.getElementById("view");
  const form = view.querySelector("#journal-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const entry = {
      id: uid(),
      date: fd.get("date"),
      asset: fd.get("asset").trim(),
      direction: fd.get("direction"),
      positionSizePct: parseFloat(fd.get("positionSizePct")) || 0,
      entryPrice: fd.get("entryPrice") || "",
      stopPrice: fd.get("stopPrice") || "",
      exitPrice: fd.get("exitPrice") || "",
      manualR: fd.get("manualR") || "",
      thesis: fd.get("thesis").trim(),
      exitPlan: fd.get("exitPlan").trim(),
      deviationNote: fd.get("deviationNote").trim()
    };
    Store.addJournalEntry(entry);
    checkJournalAchievements();
    render();
  });

  on(view, "[data-del]", "click", (e) => {
    Store.deleteJournalEntry(e.currentTarget.dataset.del);
    render();
  });

  const pfSave = view.querySelector("#pf-save");
  if (pfSave) pfSave.addEventListener("click", () => {
    const start = view.querySelector("#pf-start").value || todayISO();
    const dailyLossLimitR = parseFloat(view.querySelector("#pf-daily").value) || 2;
    const maxDrawdownR = parseFloat(view.querySelector("#pf-dd").value) || 6;
    Store.setPropFirm({ start, dailyLossLimitR, maxDrawdownR });
    render();
  });
  const pfDisable = view.querySelector("#pf-disable");
  if (pfDisable) pfDisable.addEventListener("click", () => { Store.setPropFirm(null); render(); });
}

/* =========================================================================
   Resources
   ========================================================================= */
function renderResourcesScreen() {
  const groups = PROGRAM_META.resources.map(g => `
    <div class="resource-group">
      <h4>${esc(g.category)}</h4>
      <ul>${g.items.map(i => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)} ↗</a>${i.note ? ` — ${esc(i.note)}` : ""}</li>`).join("")}</ul>
    </div>`).join("");
  return `<div class="card"><span class="eyebrow">Справочник</span><h2>Панель ресурсов</h2>${groups}</div>`;
}

/* =========================================================================
   Achievements screen
   ========================================================================= */
function renderAchievementsScreen() {
  const unlocked = Store.raw.achievements;
  const badges = ACHIEVEMENTS.map(a => `
    <div class="badge ${unlocked.includes(a.id) ? "unlocked" : ""}">
      <span class="glyph">${a.glyph}</span>
      <span class="name">${esc(a.name)}</span>
      <span class="desc">${esc(a.desc)}</span>
    </div>`).join("");
  return `<div class="card"><span class="eyebrow">Прогресс</span><h2>Достижения <span class="pill">${unlocked.length}/${ACHIEVEMENTS.length}</span></h2><div class="badge-grid">${badges}</div></div>`;
}

/* =========================================================================
   Boot
   ========================================================================= */
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  Store.load();
  render();
});
