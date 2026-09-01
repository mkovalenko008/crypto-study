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
  { id: "five-blocks", glyph: "⚔", name: "Экватор", desc: "Закрыто 5 блоков" },
  { id: "all-blocks", glyph: "★", name: "Протокол закрыт", desc: "Пройдены все блоки программы" },
  { id: "quiz-perfect", glyph: "✓", name: "С первой попытки", desc: "Квиз на 100% с первой попытки" },
  { id: "journal-streak-7", glyph: "◯", name: "Неделя дисциплины", desc: "7 дней подряд с записью в дневник" },
  { id: "journal-streak-30", glyph: "◉", name: "Месяц дисциплины", desc: "30 дней подряд с записью в дневник" },
  { id: "standing-complete", glyph: "◆", name: "Протокол безопасности", desc: "Отмечены все пункты постоянного чек-листа безопасности" },
  { id: "journal-10-trades", glyph: "▦", name: "Десять сделок", desc: "10 записей в торговом дневнике" },
  { id: "journal-positive-expectancy", glyph: "▲", name: "Положительное мат. ожидание", desc: "Expectancy выше нуля при 10+ сделках с посчитанным R" },
  { id: "propfirm-clean", glyph: "⛨", name: "Дисциплина проп-фирмы", desc: "Все правила режима «проп-фирма» соблюдены за окно" },
  { id: "propfirm-enabled", glyph: "▣", name: "Включил дисциплину", desc: "Настроен режим «проп-фирма» хотя бы раз" },
  { id: "bots-viewed", glyph: "◐", name: "Живой полигон", desc: "Открыта вкладка «Боты» хотя бы раз" },
  { id: "big-winner", glyph: "⬆", name: "Крупный выигрыш", desc: "Зафиксирована сделка с результатом от 5R" },
  { id: "journal-50-trades", glyph: "▩", name: "Полтинник", desc: "50 записей в торговом дневнике" },
  { id: "standing-half", glyph: "◔", name: "На полпути", desc: "Отмечено 5 из 9 пунктов постоянного чек-листа" }
];

function checkBlockAchievements() {
  const completed = BLOCKS.filter(b => Store.isBlockComplete(b)).length;
  if (completed >= 1) Store.unlockAchievement("first-block");
  if (completed >= 5) Store.unlockAchievement("five-blocks");
  if (completed >= BLOCKS.length) Store.unlockAchievement("all-blocks");
}

function checkStandingAchievements() {
  const standing = Store.raw.standing;
  const checkedCount = PROGRAM_META.standingChecklist.filter((_, i) => !!standing[i]).length;
  if (checkedCount >= 5) Store.unlockAchievement("standing-half");
  if (checkedCount >= PROGRAM_META.standingChecklist.length) Store.unlockAchievement("standing-complete");
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
  const entries = Store.raw.journal.entries;
  if (entries.length >= 1) Store.unlockAchievement("journal-first");
  if (entries.length >= 10) Store.unlockAchievement("journal-10-trades");
  if (entries.length >= 50) Store.unlockAchievement("journal-50-trades");
  const streak = currentJournalStreak();
  if (streak >= 7) Store.unlockAchievement("journal-streak-7");
  if (streak >= 30) Store.unlockAchievement("journal-streak-30");
  const stats = journalStats(entries);
  if (stats.withRCount >= 10 && stats.expectancy > 0) Store.unlockAchievement("journal-positive-expectancy");
  if (stats.withR.some(e => e.r >= 5)) Store.unlockAchievement("big-winner");
}

function checkPropFirmAchievements() {
  const entries = Store.raw.journal.entries;
  const limits = computeAutoRiskLimits(journalStats(entries));
  const status = computePropFirmStatus(entries, Store.raw.journal.propFirm, limits);
  if (!status) return;
  const clean = status.dailyBreaches.length === 0 && !status.ddBreachDay && status.fiftyPctBreaches.length === 0 && status.days.length >= 5;
  if (clean) Store.unlockAchievement("propfirm-clean");
}

/* =========================================================================
   Small utilities
   ========================================================================= */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtPct(n) { return `${Math.round(n)}%`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function on(root, selector, event, handler) {
  root.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler));
}

/* =========================================================================
   Router
   ========================================================================= */
const ROUTES = ["dashboard", "block", "bots", "journal", "resources", "achievements"];

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
  else if (name === "bots") { view.innerHTML = renderBotsScreen(); loadBotsData(); }
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
    ["journal", "Дневник"],
    ["bots", "Боты"],
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
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `<span class="live-dot"></span>Блок ${currentBlock.id} · ${completedCount}/${BLOCKS.length} · ${time}`;
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
      <span class="eyebrow">Протокол v4 · ${BLOCKS.length} блоков</span>
      <h1 class="headline-2tone"><span class="l1">Дорожная</span><span class="l2">карта</span></h1>
      <p class="subhead">${BLOCKS.length} блоков — от основ блокчейна до трейдинга и мемкоин-спекуляций. Блок закрывается только когда чек-лист выполнен целиком и квиз пройден на 80%+.</p>
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
      <h3>Недели прохождения</h3>
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
  on(view, "input[data-idx]", "change", (e) => {
    Store.toggleStanding(parseInt(e.currentTarget.dataset.idx, 10));
    checkStandingAchievements();
    render();
  });
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
   Bots — native render of the separate bitget_bot paper-trading dashboard.
   Both sites live at the same origin (mkovalenko008.github.io), so this is
   a same-origin fetch, not a cross-origin one: no CORS, no backend needed.
   The source page bakes its full state into a `const DATA = {...}` blob
   inside its one inline <script> — we fetch that HTML, pull DATA out with
   a regex, and recompute the same numbers ourselves so they render with
   this app's own components instead of an iframe.
   ========================================================================= */
const BOTS_SOURCE_URL = "https://mkovalenko008.github.io/cripto/";

function computeBotSummary(bot) {
  let startTotal = 0, balTotal = 0, tradeCount = 0, openCount = 0, coinCount = 0;
  const allTrades = [];
  const perCoin = [];
  for (const [sym, c] of Object.entries(bot.coins)) {
    coinCount++;
    startTotal += c.starting_capital;
    balTotal += c.balance;
    tradeCount += c.trades.length;
    if (c.position) openCount++;
    c.trades.forEach(t => allTrades.push({ sym: sym.replace("USDT", ""), ...t }));
    const pct = c.starting_capital ? ((c.balance - c.starting_capital) / c.starting_capital * 100) : 0;
    perCoin.push({ sym: sym.replace("USDT", ""), pct, trades: c.trades.length, position: c.position });
  }
  allTrades.sort((a, b) => a.exit_time.localeCompare(b.exit_time));
  let cum = startTotal;
  const curve = [cum];
  allTrades.forEach(t => { cum += t.pnl_usdt; curve.push(cum); });
  const tradesDesc = allTrades.slice().sort((a, b) => b.exit_time.localeCompare(a.exit_time));
  perCoin.sort((a, b) => b.pct - a.pct);
  const resultUsdt = balTotal - startTotal;
  const resultPct = startTotal ? (resultUsdt / startTotal * 100) : 0;
  return { startTotal, balTotal, tradeCount, openCount, coinCount, curve, perCoin, trades: tradesDesc, resultUsdt, resultPct };
}

function renderTradesTable(trades) {
  if (!trades.length) return `<p class="faint">Сделок пока нет.</p>`;
  const rows = trades.map(t => {
    const time = new Date(t.exit_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    return `<tr>
      <td>${esc(t.sym)}</td>
      <td>${esc(t.side)}</td>
      <td>${t.entry_price}</td>
      <td>${t.exit_price}</td>
      <td class="${t.pnl_pct >= 0 ? "r-pos" : "r-neg"}">${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(2)}%</td>
      <td class="${t.pnl_usdt >= 0 ? "r-pos" : "r-neg"}">${t.pnl_usdt >= 0 ? "+" : ""}${t.pnl_usdt.toFixed(3)}</td>
      <td class="wrap">${esc(t.exit_reason)}</td>
      <td>${time}</td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="journal-table">
    <thead><tr><th>Монета</th><th>Сторона</th><th>Вход</th><th>Выход</th><th>PnL %</th><th>PnL USDT</th><th>Причина выхода</th><th>Время выхода</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderLineChart(points) {
  if (points.length < 2) return `<p class="faint">Недостаточно точек для графика.</p>`;
  const w = 600, h = 160, pad = 10;
  const minV = Math.min(...points), maxV = Math.max(...points);
  const range = (maxV - minV) || 1;
  const stepX = (w - 2 * pad) / (points.length - 1);
  const toY = (v) => h - pad - ((v - minV) / range) * (h - 2 * pad);
  const startY = toY(points[0]);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${toY(v)}`).join(" ");
  return `<svg class="equity-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line class="zero-line" x1="${pad}" y1="${startY}" x2="${w - pad}" y2="${startY}"/>
    <path class="curve" d="${path}"/>
  </svg>`;
}

function renderBotCard(bot) {
  const s = computeBotSummary(bot);
  const rows = s.perCoin.map(c => {
    const resultCell = c.trades
      ? `<span class="${c.pct >= 0 ? "r-pos" : "r-neg"}">${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(2)}%</span>`
      : (c.position ? `<span class="faint">в позиции</span>` : `<span class="faint">нет сделок</span>`);
    const posCell = c.position ? `<span class="bot-open">${c.position.side} вход ${c.position.entry_price}</span>` : "—";
    return `<tr>
      <td>${esc(c.sym)}</td>
      <td>${resultCell}</td>
      <td>${c.trades} сделок</td>
      <td>${posCell}</td>
    </tr>`;
  }).join("");

  return `
    <div class="card">
      <div class="btn-row" style="justify-content:space-between;margin-top:0">
        <div>
          <h3 style="margin-bottom:4px">${esc(bot.label)}</h3>
          <p class="faint" style="margin:0">${esc(bot.subtitle)}</p>
        </div>
        <span class="gate-status ${bot.validated ? "pass" : ""}">${bot.validated ? "валидировано на train/test" : "без подтверждённого edge"}</span>
      </div>
      <div class="stat-grid" style="margin-top:20px">
        <div class="stat-tile"><div class="num">${s.balTotal.toFixed(4)}</div><div class="lbl">Портфель, USDT</div></div>
        <div class="stat-tile"><div class="num ${s.resultUsdt >= 0 ? "r-pos" : "r-neg"}">${s.resultUsdt >= 0 ? "+" : ""}${s.resultUsdt.toFixed(2)}</div><div class="lbl">${s.resultPct >= 0 ? "+" : ""}${s.resultPct.toFixed(2)}%</div></div>
        <div class="stat-tile"><div class="num">${s.tradeCount}</div><div class="lbl">Сделок</div></div>
        <div class="stat-tile"><div class="num">${s.openCount}/${s.coinCount}</div><div class="lbl">Открытых позиций</div></div>
      </div>
      ${renderLineChart(s.curve)}
      <div class="table-wrap" style="margin-top:16px">
        <table class="journal-table">
          <thead><tr><th>Монета</th><th>Результат</th><th>Сделок</th><th>Открыто</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <details style="margin-top:16px">
        <summary class="faint" style="cursor:pointer">Показать все сделки (${s.trades.length})</summary>
        <div style="margin-top:10px">${renderTradesTable(s.trades)}</div>
      </details>
      <p class="faint" style="margin-top:14px">${esc(bot.method_note)}</p>
    </div>`;
}

async function loadBotsData() {
  const container = document.getElementById("bots-content");
  if (!container) return;
  try {
    const res = await fetch(BOTS_SOURCE_URL, { cache: "no-store" });
    const html = await res.text();
    const match = html.match(/const\s+DATA\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!match) throw new Error("DATA blob not found");
    const data = JSON.parse(match[1]);
    const genDate = new Date(data.generated_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    container.innerHTML = `
      <p class="faint bot-generated">Обновлено ${genDate} · данные тем же способом, что и на <a href="${BOTS_SOURCE_URL}" target="_blank" rel="noopener noreferrer">исходном дашборде ↗</a></p>
      ${renderBotCard(data.bots.trend)}
      ${renderBotCard(data.bots.meanrev)}
    `;
  } catch (err) {
    container.innerHTML = `<div class="card faint">Не удалось загрузить живые данные ботов сейчас. <a href="${BOTS_SOURCE_URL}" target="_blank" rel="noopener noreferrer">Открыть напрямую ↗</a></div>`;
  }
}

function renderBotsScreen() {
  Store.unlockAchievement("bots-viewed");
  return `
    <div class="hero" style="padding-top:32px;padding-bottom:32px">
      <span class="eyebrow">Живые боты · paper trading</span>
      <h1 class="headline-2tone"><span class="l1">Крипто</span><span class="l2">Полигон</span></h1>
      <p class="subhead">Трендовый и mean-reversion боты на реальных ценах Bitget, без единой реальной сделки — тот же живой прогресс, что на <a href="${BOTS_SOURCE_URL}" target="_blank" rel="noopener noreferrer">mkovalenko008.github.io/cripto</a>, только отрисован здесь напрямую.</p>
    </div>
    <div id="bots-content"><p class="faint">Загружаю живые данные ботов…</p></div>
  `;
}

/* =========================================================================
   Trading journal
   ========================================================================= */
function computeR(entry) {
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

/* Daily loss limit / drawdown limit are never typed in — they're derived
   so the number always reflects reality instead of a stale manual guess.
   With loss history: 2x / 6x the average R lost per losing trade. With
   none yet (a fresh journal), fall back to the standard "1 trade's risk
   = 1R" unit from Block 6's position-sizing rule (2R / 6R) until real
   losses exist to compute from. */
function computeAutoRiskLimits(stats) {
  if (stats.avgLossR > 0) {
    return {
      dailyLossLimitR: Math.round(stats.avgLossR * 2 * 10) / 10,
      maxDrawdownR: Math.round(stats.avgLossR * 6 * 10) / 10,
      source: "history"
    };
  }
  return { dailyLossLimitR: 2, maxDrawdownR: 6, source: "baseline" };
}

/* Shared by the panel (display) and the achievement checker, so the two
   never disagree about what counts as a breach. */
function computePropFirmStatus(entries, cfg, limits) {
  if (!cfg) return null;
  const start = new Date(cfg.start);
  const end = new Date(start); end.setDate(end.getDate() + 30);
  const inWindow = entries.filter(e => { const d = new Date(e.date); return d >= start && d <= end; })
    .map(e => ({ ...e, r: computeR(e) })).filter(e => e.r !== null);

  const byDay = {};
  inWindow.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.r; });
  const days = Object.keys(byDay).sort();
  const totalNet = days.reduce((s, d) => s + byDay[d], 0);

  const dailyBreaches = days.filter(d => byDay[d] < -Math.abs(limits.dailyLossLimitR));
  let peak = 0, cum = 0, maxDD = 0, ddBreachDay = null;
  days.forEach(d => {
    cum += byDay[d];
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) { maxDD = dd; if (dd > limits.maxDrawdownR) ddBreachDay = d; }
  });
  const fiftyPctBreaches = totalNet > 0 ? days.filter(d => byDay[d] > 0.5 * totalNet) : [];

  return { start, end, byDay, days, totalNet, dailyBreaches, maxDD, ddBreachDay, fiftyPctBreaches };
}

function renderDailyRChart(byDay, dailyLossLimitR) {
  const days = Object.keys(byDay).sort();
  if (!days.length) return "";
  const w = 600, h = 140, pad = 10;
  const vals = days.map(d => byDay[d]);
  const maxAbs = Math.max(Math.abs(dailyLossLimitR) || 0, ...vals.map(v => Math.abs(v)), 0.5);
  const gap = (w - 2 * pad) / days.length;
  const barW = gap * 0.7;
  const zeroY = h / 2;
  const scale = (h / 2 - pad) / maxAbs;
  const bars = days.map((d, i) => {
    const v = byDay[d];
    const x = pad + i * gap + (gap - barW) / 2;
    const barH = Math.abs(v) * scale;
    const y = v >= 0 ? zeroY - barH : zeroY;
    const breach = v < -Math.abs(dailyLossLimitR);
    const color = breach ? "#fa3812" : (v >= 0 ? "#34d399" : "#353845");
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}" fill="${color}"/>`;
  }).join("");
  const limitY = zeroY + Math.abs(dailyLossLimitR) * scale;
  return `<svg class="equity-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line class="zero-line" x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}"/>
    <line x1="${pad}" y1="${limitY.toFixed(1)}" x2="${w - pad}" y2="${limitY.toFixed(1)}" stroke="#651a15" stroke-width="1" stroke-dasharray="4 3"/>
    ${bars}
  </svg>
  <p class="faint">Дневной R по дням окна; пунктир — дневной лимит убытка (${dailyLossLimitR}R).</p>`;
}

function renderPropFirmPanel(entries, stats) {
  const cfg = Store.raw.journal.propFirm;
  const limits = computeAutoRiskLimits(stats);
  const sourceNote = limits.source === "history"
    ? `Лимиты пересчитаны автоматически по факту сделок: 2× и 6× твоего среднего R убытка (${stats.avgLossR.toFixed(2)}R). Появятся новые убыточные сделки — пересчитается сама.`
    : `Пока нет убыточных сделок для расчёта — лимиты взяты от стандартной единицы риска (1R = риск одной сделки по правилу Блока 6): 2R и 6R. Появятся убыточные сделки — пересчитается автоматически, вводить вручную не нужно.`;
  const limitsBlock = `
    <p class="faint">${sourceNote}</p>
    <div class="stat-grid" style="margin:12px 0">
      <div class="stat-tile"><div class="num">${limits.dailyLossLimitR}R</div><div class="lbl">Дневной лимит убытка</div></div>
      <div class="stat-tile"><div class="num">${limits.maxDrawdownR}R</div><div class="lbl">Общий лимит просадки</div></div>
    </div>`;
  const formHtml = `
    <details ${cfg ? "" : "open"}>
      <summary class="faint" style="cursor:pointer">${cfg ? "Настройки режима «проп-фирма»" : "Включить режим «проп-фирма»"}</summary>
      ${limitsBlock}
      <div class="form-grid">
        <div><label class="field-label">Дата начала окна (30 дней)</label><input type="date" id="pf-start" value="${cfg ? cfg.start : todayISO()}"/></div>
      </div>
      <div class="btn-row"><button class="btn primary" id="pf-save">${cfg ? "Обновить окно" : "Включить режим"}</button>${cfg ? `<button class="btn danger" id="pf-disable">Выключить режим</button>` : ""}</div>
    </details>`;

  if (!cfg) return `<div class="card"><h3>Режим «проп-фирма»</h3>${formHtml}</div>`;

  const status = computePropFirmStatus(entries, cfg, limits);
  const flag = (ok, text) => `<div class="propfirm-flag ${ok ? "ok" : "breach"}"><span class="dot"></span>${text}</div>`;

  return `<div class="card">
    <span class="eyebrow">Режим «проп-фирма»</span>
    <h3>Окно ${cfg.start} → ${status.end.toISOString().slice(0, 10)}</h3>
    ${flag(status.dailyBreaches.length === 0, `Дневной лимит убытка (${limits.dailyLossLimitR}R): ${status.dailyBreaches.length ? "нарушен в дни " + status.dailyBreaches.join(", ") : "не нарушен"}`)}
    ${flag(!status.ddBreachDay, `Общий лимит просадки (${limits.maxDrawdownR}R): макс. просадка ${status.maxDD.toFixed(2)}R${status.ddBreachDay ? " — превышена к " + status.ddBreachDay : ""}`)}
    ${flag(status.fiftyPctBreaches.length === 0, `Правило «не больше 50% прибыли за один день»: ${status.fiftyPctBreaches.length ? "нарушено в дни " + status.fiftyPctBreaches.join(", ") : (status.totalNet > 0 ? "не нарушено" : "период пока не в плюсе — правило не применимо")}`)}
    <p class="faint">Итог по сделкам в окне: ${status.totalNet.toFixed(2)}R за ${status.days.length} торговых дней.</p>
    ${renderDailyRChart(status.byDay, limits.dailyLossLimitR)}
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
        <div><label class="field-label">Размер позиции</label><input type="number" step="0.1" name="positionSizePct" required/></div>
        <div><label class="field-label">Цена входа (опц.)</label><input type="number" step="any" name="entryPrice"/></div>
        <div><label class="field-label">Цена стопа, SL (опц.)</label><input type="number" step="any" name="stopPrice"/></div>
        <div><label class="field-label">Тейк-профит, PL (опц.)</label><input type="number" step="any" name="takeProfitPrice"/></div>
        <div><label class="field-label">Факт. цена выхода (опц.)</label><input type="number" step="any" name="exitPrice"/></div>
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

    ${renderPropFirmPanel(entries, stats)}

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
      takeProfitPrice: fd.get("takeProfitPrice") || "",
      exitPrice: fd.get("exitPrice") || "",
      thesis: fd.get("thesis").trim(),
      exitPlan: fd.get("exitPlan").trim(),
      deviationNote: fd.get("deviationNote").trim()
    };
    Store.addJournalEntry(entry);
    checkJournalAchievements();
    checkPropFirmAchievements();
    render();
  });

  on(view, "[data-del]", "click", (e) => {
    Store.deleteJournalEntry(e.currentTarget.dataset.del);
    render();
  });

  const pfSave = view.querySelector("#pf-save");
  if (pfSave) pfSave.addEventListener("click", () => {
    const start = view.querySelector("#pf-start").value || todayISO();
    Store.setPropFirm({ start });
    Store.unlockAchievement("propfirm-enabled");
    checkPropFirmAchievements();
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
  setInterval(updateNavStatus, 30000);
});
