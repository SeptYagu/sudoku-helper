// ==UserScript==
// @name         Sudoku.com Candidate Helper
// @namespace    local.sudoku-helper
// @version      0.3.0
// @description  Show legal candidates and strong single hints on sudoku.com.
// @match        https://sudoku.com/*
// @updateURL    https://raw.githubusercontent.com/SeptYagu/sudoku-helper/main/sudoku-helper.user.js?raw=1
// @downloadURL  https://raw.githubusercontent.com/SeptYagu/sudoku-helper/main/sudoku-helper.user.js?raw=1
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function sudokuCandidateHelper() {
  "use strict";

  const APP_ID = "sudoku-candidate-helper";
  const API_NAME = "SudokuCandidateHelper";
  const STORAGE_KEYS = [
    "main_game",
    "main_game_killer",
    "solver_game",
    "dailyInfo",
    "currentGame",
    "game",
    "sudoku",
    "puzzle",
  ];
  const LEGACY_KEYS = ["clearGrid", "userGrid", "puzzleGrid", "pencilGrid", "winRate", "timePassed", "cages"];
  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  if (window[API_NAME] && typeof window[API_NAME].destroy === "function") {
    window[API_NAME].destroy();
  }

  const state = {
    boardElement: null,
    overlay: null,
    panel: null,
    manualSection: null,
    manualInput: null,
    summary: null,
    sourceLabel: null,
    list: null,
    visible: true,
    showAllCandidates: true,
    strongOnly: false,
    manualMode: false,
    manualGrid: "",
    timer: 0,
    lastSignature: "",
    lastResult: null,
    lastDiagnostics: null,
    webpackRequire: null,
    networkCandidates: [],
    networkHookInstalled: false,
  };

  installNetworkHooks();

  const css = `
    #${APP_ID}-overlay {
      position: fixed;
      z-index: 2147483000;
      pointer-events: none;
    }

    #${APP_ID}-panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: min(360px, calc(100vw - 36px));
      max-height: min(580px, calc(100vh - 36px));
      overflow: auto;
      z-index: 2147483001;
      padding: 12px;
      border: 1px solid rgba(52, 72, 97, 0.18);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 16px 40px rgba(25, 38, 60, 0.18);
      color: #1f2a37;
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${APP_ID}-panel * {
      box-sizing: border-box;
    }

    .${APP_ID}-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      font-weight: 700;
      color: #243447;
    }

    .${APP_ID}-status {
      margin: 8px 0;
      padding: 8px;
      border-radius: 6px;
      background: #f5f7fb;
      color: #3d4f66;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .${APP_ID}-buttons {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 8px;
    }

    .${APP_ID}-button {
      min-height: 30px;
      border: 1px solid rgba(52, 72, 97, 0.2);
      border-radius: 6px;
      background: #ffffff;
      color: #26384d;
      cursor: pointer;
      font: inherit;
      white-space: nowrap;
    }

    .${APP_ID}-button:hover {
      background: #eef5ff;
      border-color: rgba(50, 90, 175, 0.35);
    }

    .${APP_ID}-button[data-active="true"] {
      background: #325aaf;
      border-color: #325aaf;
      color: white;
    }

    .${APP_ID}-manual {
      display: none;
      margin: 8px 0;
    }

    .${APP_ID}-manual[data-open="true"] {
      display: block;
    }

    .${APP_ID}-manual textarea {
      width: 100%;
      height: 118px;
      resize: vertical;
      padding: 8px;
      border: 1px solid rgba(52, 72, 97, 0.22);
      border-radius: 6px;
      color: #1f2a37;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    }

    .${APP_ID}-hint-list {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }

    .${APP_ID}-hint-list li {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 5px 0;
      border-top: 1px solid rgba(52, 72, 97, 0.1);
    }

    .${APP_ID}-muted {
      color: #66758a;
      font-size: 12px;
    }
  `;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function init() {
    injectStyle();
    createPanel();
    refresh(true);
    window.addEventListener("resize", scheduleRefresh, { passive: true });
    window.addEventListener("scroll", scheduleRefresh, { passive: true });
    state.timer = window.setInterval(() => refresh(false), 900);

    window[API_NAME] = {
      refresh: () => refresh(true),
      destroy,
      setManualGrid(grid) {
        state.manualGrid = String(grid || "");
        state.manualMode = true;
        if (state.manualInput) state.manualInput.value = state.manualGrid;
        updateButtons();
        refresh(true);
      },
      getLastResult: () => state.lastResult,
      getCapturedGames: () => state.networkCandidates.slice(),
      diagnose: () => diagnose(true),
    };
  }

  function injectStyle() {
    if (document.getElementById(`${APP_ID}-style`)) return;
    const style = document.createElement("style");
    style.id = `${APP_ID}-style`;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = `${APP_ID}-panel`;
    panel.innerHTML = `
      <div class="${APP_ID}-header">
        <span>数独候选助手</span>
        <button class="${APP_ID}-button" data-action="close" title="关闭">关闭</button>
      </div>
      <div class="${APP_ID}-buttons">
        <button class="${APP_ID}-button" data-action="refresh">刷新</button>
        <button class="${APP_ID}-button" data-action="visible">提示层</button>
        <button class="${APP_ID}-button" data-action="all">候选数</button>
        <button class="${APP_ID}-button" data-action="strong">强提示</button>
        <button class="${APP_ID}-button" data-action="manual">手动盘面</button>
        <button class="${APP_ID}-button" data-action="clearManual">清手动</button>
        <button class="${APP_ID}-button" data-action="diagnose">诊断</button>
      </div>
      <div class="${APP_ID}-status" data-role="source">正在读取棋盘...</div>
      <div class="${APP_ID}-manual" data-role="manual">
        <textarea spellcheck="false" placeholder="粘贴 81 位盘面，0 或 . 表示空格；也可以粘贴 9 行。"></textarea>
      </div>
      <div class="${APP_ID}-status" data-role="summary"></div>
      <ul class="${APP_ID}-hint-list" data-role="list"></ul>
    `;

    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("input", onPanelInput);
    document.body.appendChild(panel);

    state.panel = panel;
    state.manualSection = panel.querySelector("[data-role='manual']");
    state.manualInput = panel.querySelector("textarea");
    state.sourceLabel = panel.querySelector("[data-role='source']");
    state.summary = panel.querySelector("[data-role='summary']");
    state.list = panel.querySelector("[data-role='list']");
    updateButtons();
  }

  function onPanelClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "refresh") refresh(true);
    if (action === "visible") {
      state.visible = !state.visible;
      updateButtons();
      refresh(true);
    }
    if (action === "all") {
      state.showAllCandidates = !state.showAllCandidates;
      updateButtons();
      refresh(true);
    }
    if (action === "strong") {
      state.strongOnly = !state.strongOnly;
      updateButtons();
      refresh(true);
    }
    if (action === "manual") {
      state.manualMode = !state.manualMode;
      if (state.manualSection) state.manualSection.dataset.open = String(state.manualMode);
      updateButtons();
      refresh(true);
    }
    if (action === "clearManual") {
      state.manualGrid = "";
      state.manualMode = false;
      if (state.manualInput) state.manualInput.value = "";
      if (state.manualSection) state.manualSection.dataset.open = "false";
      updateButtons();
      refresh(true);
    }
    if (action === "diagnose") diagnose(true);
    if (action === "close") destroy();
  }

  function onPanelInput(event) {
    if (event.target !== state.manualInput) return;
    state.manualGrid = event.target.value;
    state.manualMode = true;
    updateButtons();
    refresh(true);
  }

  function updateButtons() {
    if (!state.panel) return;
    const set = (action, active) => {
      const button = state.panel.querySelector(`[data-action="${action}"]`);
      if (button) button.dataset.active = String(active);
    };
    set("visible", state.visible);
    set("all", state.showAllCandidates);
    set("strong", state.strongOnly);
    set("manual", state.manualMode);
  }

  function scheduleRefresh() {
    window.requestAnimationFrame(() => refresh(false));
  }

  function refresh(force) {
    const board = findBoardElement();
    state.boardElement = board;

    const source = readGrid();
    const signature = [
      source.grid ? source.grid.join("") : "no-grid",
      source.source,
      state.visible,
      state.showAllCandidates,
      state.strongOnly,
      board ? getBoardRectSignature(board) : "no-board",
    ].join("|");

    if (!force && signature === state.lastSignature) return;
    state.lastSignature = signature;

    ensureOverlay(board);

    if (!source.grid) {
      clearOverlay();
      renderStatus(source);
      return;
    }

    const result = analyzeGrid(source.grid);
    state.lastResult = result;
    drawOverlay(source.grid, result);
    renderStatus(source, result);
  }

  function findBoardElement() {
    return (
      document.querySelector("#game canvas") ||
      document.querySelector("#game") ||
      document.querySelector("#game-wrapper .game canvas") ||
      document.querySelector(".game canvas")
    );
  }

  function getBoardRectSignature(board) {
    const rect = board.getBoundingClientRect();
    return [rect.left, rect.top, rect.width, rect.height].map((v) => Math.round(v)).join(",");
  }

  function ensureOverlay(board) {
    if (!board) {
      clearOverlay();
      return;
    }

    if (!state.overlay) {
      const canvas = document.createElement("canvas");
      canvas.id = `${APP_ID}-overlay`;
      document.body.appendChild(canvas);
      state.overlay = canvas;
    }

    const rect = board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    state.overlay.style.left = `${Math.round(rect.left)}px`;
    state.overlay.style.top = `${Math.round(rect.top)}px`;
    state.overlay.style.width = `${width}px`;
    state.overlay.style.height = `${height}px`;

    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (state.overlay.width !== pixelWidth) state.overlay.width = pixelWidth;
    if (state.overlay.height !== pixelHeight) state.overlay.height = pixelHeight;

    const ctx = state.overlay.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearOverlay() {
    if (!state.overlay) return;
    const ctx = state.overlay.getContext("2d");
    ctx.clearRect(0, 0, state.overlay.width, state.overlay.height);
  }

  function readGrid() {
    if (state.manualMode || state.manualGrid.trim()) {
      const manual = normalizeGridString(state.manualGrid);
      if (manual) {
        return {
          grid: manual,
          source: "手动盘面",
          detail: "来自助手面板输入",
        };
      }
    }

    const runtime = readWebpackGame();
    if (runtime && runtime.grid) return runtime;

    const stored = readStoredGame();
    if (stored && stored.grid) return stored;

    const network = readNetworkGame();
    if (network && network.grid) return network;

    const diagnostics = diagnose(false);
    return {
      grid: null,
      source: "未读取到盘面",
      detail: [
        "没有从运行时或本地存储读到当前盘面。",
        "请先等棋盘加载完成；新版会自动监听题目接口，不需要先填数字。",
        "也可以打开“手动盘面”粘贴 81 位盘面。",
        diagnostics && diagnostics.short ? `诊断: ${diagnostics.short}` : "",
      ].filter(Boolean).join("\n"),
    };
  }

  function installNetworkHooks() {
    if (state.networkHookInstalled) return;
    state.networkHookInstalled = true;

    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = function sudokuHelperFetchHook(...args) {
        const url = getRequestUrl(args[0]);
        return originalFetch.apply(this, args).then((response) => {
          captureFetchResponse(response, url);
          return response;
        });
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;
      if (typeof originalOpen === "function" && typeof originalSend === "function") {
        XHR.prototype.open = function sudokuHelperOpenHook(method, url, ...rest) {
          this.__sudokuHelperUrl = getRequestUrl(url);
          return originalOpen.call(this, method, url, ...rest);
        };
        XHR.prototype.send = function sudokuHelperSendHook(...args) {
          try {
            this.addEventListener("loadend", () => {
              if (typeof this.responseText === "string") {
                recordResponseText(this.responseText, this.__sudokuHelperUrl || "xhr");
              }
            });
          } catch (error) {
            // Ignore XHRs that do not allow listeners.
          }
          return originalSend.apply(this, args);
        };
      }
    }
  }

  function getRequestUrl(request) {
    if (!request) return "unknown";
    if (typeof request === "string") return request;
    if (request.url) return String(request.url);
    return String(request);
  }

  function captureFetchResponse(response, url) {
    if (!response || typeof response.clone !== "function") return;
    const contentType = response.headers && response.headers.get && response.headers.get("content-type");
    if (contentType && !/json|text|javascript/i.test(contentType)) return;

    try {
      response.clone().text().then((text) => {
        recordResponseText(text, url || response.url || "fetch");
      }).catch(() => {});
    } catch (error) {
      // Some opaque responses cannot be cloned/read.
    }
  }

  function recordResponseText(text, source) {
    if (!text || typeof text !== "string" || text.length > 2_000_000) return;
    const trimmed = text.trim();
    if (!trimmed || !"[{".includes(trimmed[0])) return;

    try {
      recordGamePayload(JSON.parse(trimmed), source || "network");
    } catch (error) {
      // Non-JSON responses are ignored.
    }
  }

  function recordGamePayload(payload, source) {
    const candidates = [];
    collectGameCandidates(payload, `network:${source}`, candidates);
    collectLegacyPayloadCandidates(payload, `network:${source}`, candidates);

    let added = false;
    const capturedAt = Date.now();
    for (const candidate of candidates) {
      const grid = gameToGrid(candidate.game);
      if (!grid) continue;
      state.networkCandidates.unshift({ ...candidate, grid, capturedAt });
      added = true;
    }

    if (!added) return;

    const seen = new Set();
    state.networkCandidates = state.networkCandidates.filter((candidate) => {
      const key = `${candidate.grid.join("")}|${candidate.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 30);

    if (state.panel) {
      window.requestAnimationFrame(() => refresh(true));
    }
  }

  function readNetworkGame() {
    if (!state.networkCandidates.length) return null;

    const ranked = state.networkCandidates
      .map((item) => ({
        ...item,
        score: scoreCandidate(item) + Math.max(0, 20 - Math.floor((Date.now() - item.capturedAt) / 30_000)),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return null;

    return {
      grid: best.grid,
      source: best.path,
      detail: best.game.id ? `题目 ID: ${best.game.id}` : "自动抓取 sudoku.com 题目接口",
    };
  }

  function readWebpackGame() {
    const webpackRequire = getWebpackRequire();
    const moduleCache = webpackRequire && webpackRequire.c;
    if (!moduleCache || typeof moduleCache !== "object") return null;

    const candidates = [];
    for (const [moduleId, moduleRecord] of Object.entries(moduleCache)) {
      collectRuntimeCandidates(moduleRecord && moduleRecord.exports, `webpack:${moduleId}.exports`, candidates);
      if (candidates.length > 20) break;
    }

    const ranked = candidates
      .map((item) => ({ ...item, score: scoreCandidate(item) + (item.path.includes(".state.currentGame") ? 60 : 30) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return null;

    const grid = gameToGrid(best.game);
    if (!grid) return null;

    return {
      grid,
      source: best.path,
      detail: best.game.id ? `题目 ID: ${best.game.id}` : "自动读取当前页面运行中的棋盘",
    };
  }

  function getWebpackRequire() {
    if (state.webpackRequire) return state.webpackRequire;

    const chunk = window.webpackChunk || (typeof self !== "undefined" && self.webpackChunk);
    if (!Array.isArray(chunk) || typeof chunk.push !== "function") return null;

    try {
      const chunkId = `${APP_ID}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      chunk.push([[chunkId], {}, (webpackRequire) => {
        state.webpackRequire = webpackRequire;
      }]);
    } catch (error) {
      return null;
    }

    return state.webpackRequire || null;
  }

  function collectRuntimeCandidates(root, path, candidates) {
    const seen = new WeakSet();

    function walk(value, currentPath, depth) {
      if (!value || typeof value !== "object" || depth > 5) return;
      if (seen.has(value)) return;
      seen.add(value);

      if (isGameLike(value)) {
        candidates.push({ game: value, path: currentPath });
        return;
      }

      if (value.state && isGameLike(value.state.currentGame)) {
        candidates.push({ game: value.state.currentGame, path: `${currentPath}.state.currentGame` });
        return;
      }

      const keys = Object.keys(value);
      const priority = keys.filter((key) => /^(A|default|store|state|currentGame)$/i.test(key));
      const rest = keys.filter((key) => !priority.includes(key)).slice(0, 30);
      for (const key of [...priority, ...rest]) {
        walk(value[key], `${currentPath}.${key}`, depth + 1);
        if (candidates.length > 20) return;
      }
    }

    walk(root, path, 0);
  }

  function readStoredGame() {
    const stores = getStorageObjects();
    const candidates = [];

    for (const store of stores) {
      for (const key of STORAGE_KEYS) {
        const direct = parseStorageValue(store.storage, key);
        if (direct) {
          collectGameCandidates(direct, `${store.name}.${key}`, candidates);
        }
      }

      const legacy = readLegacyGame(store);
      if (legacy) candidates.push(legacy);
    }

    if (!candidates.length) {
      for (const store of stores) {
        for (let i = 0; i < store.storage.length; i += 1) {
          const key = store.storage.key(i);
          if (!key || STORAGE_KEYS.includes(key) || LEGACY_KEYS.includes(key)) continue;
          const parsed = parseStorageValue(store.storage, key);
          if (parsed) collectGameCandidates(parsed, `${store.name}.${key}`, candidates);
          if (candidates.length >= 16) break;
        }
      }
    }

    const ranked = candidates
      .map((item) => ({ ...item, score: scoreCandidate(item) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best) return null;

    const grid = gameToGrid(best.game);
    if (!grid) return null;

    return {
      grid,
      source: best.path,
      detail: best.game.id ? `题目 ID: ${best.game.id}` : "自动读取 sudoku.com 当前存档",
    };
  }

  function readLegacyGame(store) {
    const clearGrid = readMaybeJsonValue(store.storage, "clearGrid");
    const userGrid = readMaybeJsonValue(store.storage, "userGrid");
    const solvedGrid = readMaybeJsonValue(store.storage, "puzzleGrid");
    if (!clearGrid || !userGrid || !solvedGrid) return null;

    const mission = Array.isArray(clearGrid) ? clearGrid.join("") : String(clearGrid);
    const solution = Array.isArray(solvedGrid) ? solvedGrid.join("") : String(solvedGrid);
    const base = normalizeGridString(mission);
    if (!base || !normalizeGridString(solution)) return null;

    const userText = Array.isArray(userGrid) ? "" : String(userGrid);
    const values = base.map((digit, index) => {
      const entered = Array.isArray(userGrid) ? normalizeDigit(userGrid[index]) : normalizeDigit(userText[index]);
      return digit || entered || 0;
    });

    return {
      path: `${store.name}.legacy(clearGrid/userGrid/puzzleGrid)`,
      game: {
        values,
        mission: base.join(""),
        solution,
        loaded: true,
        mode: readRawValue(store.storage, "mode") || "classic",
        difficulty: readRawValue(store.storage, "difficulty") || "",
      },
    };
  }

  function collectLegacyPayloadCandidates(root, path, candidates) {
    const seen = new WeakSet();

    function walk(value, currentPath, depth) {
      if (!value || typeof value !== "object" || depth > 7) return;
      if (seen.has(value)) return;
      seen.add(value);

      const game = legacyPayloadToGame(value);
      if (game) {
        candidates.push({ game, path: `${currentPath}.legacyPayload` });
        return;
      }

      if (Array.isArray(value)) {
        const limit = Math.min(value.length, 80);
        for (let i = 0; i < limit; i += 1) walk(value[i], `${currentPath}[${i}]`, depth + 1);
        return;
      }

      const entries = Object.entries(value).slice(0, 100);
      for (const [key, child] of entries) walk(child, `${currentPath}.${key}`, depth + 1);
    }

    walk(root, path, 0);
  }

  function legacyPayloadToGame(value) {
    if (!value || typeof value !== "object" || !value.clearGrid || !value.solvedGrid) return null;

    const mission = Array.isArray(value.clearGrid) ? value.clearGrid.join("") : String(value.clearGrid);
    const solution = Array.isArray(value.solvedGrid) ? value.solvedGrid.join("") : String(value.solvedGrid);
    const base = normalizeGridString(mission);
    if (!base || !normalizeGridString(solution)) return null;

    const userGrid = value.userGrid || [];
    const userText = Array.isArray(userGrid) ? "" : String(userGrid);
    const values = base.map((digit, index) => {
      const entered = Array.isArray(userGrid) ? normalizeDigit(userGrid[index]) : normalizeDigit(userText[index]);
      return digit || entered || 0;
    });

    return {
      values,
      mission: base.join(""),
      solution,
      loaded: true,
      mode: value.mode || "classic",
      difficulty: value.difficulty || "",
      id: value.id,
    };
  }

  function getStorageObjects() {
    const stores = [];
    try {
      if (window.localStorage) stores.push({ name: "localStorage", storage: window.localStorage });
    } catch (error) {
      // Ignore blocked storage.
    }
    try {
      if (window.sessionStorage) stores.push({ name: "sessionStorage", storage: window.sessionStorage });
    } catch (error) {
      // Ignore blocked storage.
    }
    return stores;
  }

  function parseStorageValue(storage, key) {
    try {
      const raw = storage.getItem(key);
      if (!raw || raw.length > 2_000_000) return null;
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function readMaybeJsonValue(storage, key) {
    const raw = readRawValue(storage, key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw;
    }
  }

  function readRawValue(storage, key) {
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function collectGameCandidates(root, path, candidates) {
    const seen = new WeakSet();

    function walk(value, currentPath, depth) {
      if (!value || typeof value !== "object" || depth > 7) return;
      if (seen.has(value)) return;
      seen.add(value);

      if (isGameLike(value)) {
        candidates.push({ game: value, path: currentPath });
        return;
      }

      if (Array.isArray(value)) {
        const limit = Math.min(value.length, 60);
        for (let i = 0; i < limit; i += 1) walk(value[i], `${currentPath}[${i}]`, depth + 1);
        return;
      }

      const entries = Object.entries(value).slice(0, 80);
      for (const [key, child] of entries) walk(child, `${currentPath}.${key}`, depth + 1);
    }

    walk(root, path, 0);
  }

  function isGameLike(value) {
    if (!value || typeof value !== "object") return false;
    return Boolean(normalizeValues(value.values) || normalizeGridString(value.mission));
  }

  function scoreCandidate(item) {
    const game = item.game;
    let score = 0;
    if (item.path.includes("main_game")) score += 120;
    if (item.path.includes("solver_game")) score += 70;
    if (item.path.includes("legacy(")) score += 65;
    if (normalizeValues(game.values)) score += 40;
    if (normalizeGridString(game.mission)) score += 20;
    if (game.loaded) score += 8;
    if (game.mode === "classic") score += 5;
    if (typeof game.timer === "number") score += Math.min(5, game.timer / 300);
    return score;
  }

  function gameToGrid(game) {
    const fromValues = normalizeValues(game.values);
    if (fromValues) return fromValues;
    return normalizeGridString(game.mission);
  }

  function normalizeValues(values) {
    if (!Array.isArray(values) || values.length !== 81) return null;

    const grid = values.map((cell) => {
      if (typeof cell === "number") return normalizeDigit(cell);
      if (typeof cell === "string") return normalizeDigit(cell);
      if (cell && typeof cell === "object") {
        const raw = cell.val ?? cell.value ?? cell.digit ?? cell.number ?? 0;
        return normalizeDigit(raw);
      }
      return 0;
    });

    return grid.every((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9) ? grid : null;
  }

  function normalizeGridString(value) {
    const raw = String(value || "")
      .replace(/[^\d.]/g, "")
      .replace(/\./g, "0");
    if (raw.length !== 81) return null;
    const grid = raw.split("").map((char) => normalizeDigit(char));
    return grid.every((digit) => digit >= 0 && digit <= 9) ? grid : null;
  }

  function normalizeDigit(value) {
    const digit = Number.parseInt(value, 10);
    return Number.isInteger(digit) && digit >= 1 && digit <= 9 ? digit : 0;
  }

  function diagnose(printToConsole) {
    const stores = getStorageObjects();
    const storageInfo = stores.map((store) => {
      const keys = [];
      try {
        for (let i = 0; i < store.storage.length; i += 1) keys.push(store.storage.key(i));
      } catch (error) {
        // Ignore blocked storage.
      }
      const relevant = keys.filter((key) => (
        STORAGE_KEYS.includes(key) ||
        LEGACY_KEYS.includes(key) ||
        /game|grid|puzzle|sudoku/i.test(key)
      ));
      return { name: store.name, count: keys.length, relevant };
    });
    const webpackRequire = getWebpackRequire();
    const webpackCount = webpackRequire && webpackRequire.c ? Object.keys(webpackRequire.c).length : 0;
    const boardFound = Boolean(findBoardElement());
    const info = {
      boardFound,
      webpackModules: webpackCount,
      capturedNetworkGames: state.networkCandidates.length,
      storage: storageInfo,
      short: `board=${boardFound}, webpackModules=${webpackCount}, network=${state.networkCandidates.length}, keys=${storageInfo.map((item) => `${item.name}:${item.relevant.join(",") || "-"}`).join(" | ")}`,
    };
    state.lastDiagnostics = info;

    if (printToConsole) {
      console.info("[SudokuCandidateHelper] diagnostics", info);
      if (state.summary) {
        state.summary.textContent = [
          "诊断信息已输出到控制台。",
          info.short,
          "如果仍读取不到，把这段 diagnostics 发给我。",
        ].join("\n");
      }
    }

    return info;
  }

  function analyzeGrid(grid) {
    const candidates = Array.from({ length: 81 }, (_, index) => {
      if (grid[index]) return [];
      const used = new Set();
      for (const peer of peers(index)) {
        if (grid[peer]) used.add(grid[peer]);
      }
      return DIGITS.filter((digit) => !used.has(digit));
    });

    const conflicts = findConflicts(grid);
    const nakedSingles = [];
    for (let index = 0; index < 81; index += 1) {
      if (!grid[index] && candidates[index].length === 1) {
        nakedSingles.push({ index, digit: candidates[index][0], type: "唯一候选" });
      }
    }

    const hiddenSingles = findHiddenSingles(grid, candidates);
    const strongByCell = new Map();
    for (const hint of [...nakedSingles, ...hiddenSingles]) {
      const key = `${hint.index}:${hint.digit}`;
      if (!strongByCell.has(key)) strongByCell.set(key, hint);
    }

    return {
      candidates,
      conflicts,
      nakedSingles,
      hiddenSingles,
      strongHints: Array.from(strongByCell.values()).sort((a, b) => a.index - b.index || a.digit - b.digit),
      filled: grid.filter(Boolean).length,
      empty: grid.filter((digit) => !digit).length,
    };
  }

  function peers(index) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    const result = new Set();

    for (let i = 0; i < 9; i += 1) {
      result.add(row * 9 + i);
      result.add(i * 9 + col);
    }

    for (let r = boxRow; r < boxRow + 3; r += 1) {
      for (let c = boxCol; c < boxCol + 3; c += 1) result.add(r * 9 + c);
    }

    result.delete(index);
    return result;
  }

  function units() {
    const all = [];
    for (let row = 0; row < 9; row += 1) all.push({ type: "行唯一", cells: DIGITS.map((_, col) => row * 9 + col) });
    for (let col = 0; col < 9; col += 1) all.push({ type: "列唯一", cells: DIGITS.map((_, row) => row * 9 + col) });
    for (let br = 0; br < 3; br += 1) {
      for (let bc = 0; bc < 3; bc += 1) {
        const cells = [];
        for (let r = br * 3; r < br * 3 + 3; r += 1) {
          for (let c = bc * 3; c < bc * 3 + 3; c += 1) cells.push(r * 9 + c);
        }
        all.push({ type: "宫唯一", cells });
      }
    }
    return all;
  }

  function findHiddenSingles(grid, candidates) {
    const hints = [];
    for (const unit of units()) {
      for (const digit of DIGITS) {
        const places = unit.cells.filter((index) => !grid[index] && candidates[index].includes(digit));
        if (places.length === 1 && candidates[places[0]].length > 1) {
          hints.push({ index: places[0], digit, type: unit.type });
        }
      }
    }
    return hints;
  }

  function findConflicts(grid) {
    const conflicts = new Set();
    for (const unit of units()) {
      const seen = new Map();
      for (const index of unit.cells) {
        const digit = grid[index];
        if (!digit) continue;
        if (!seen.has(digit)) seen.set(digit, []);
        seen.get(digit).push(index);
      }
      for (const indexes of seen.values()) {
        if (indexes.length > 1) indexes.forEach((index) => conflicts.add(index));
      }
    }
    return conflicts;
  }

  function drawOverlay(grid, result) {
    if (!state.overlay) return;
    const ctx = state.overlay.getContext("2d");
    const rect = state.overlay.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const cellW = width / 9;
    const cellH = height / 9;

    ctx.clearRect(0, 0, width, height);
    if (!state.visible) return;

    const strong = new Map();
    for (const hint of result.strongHints) {
      if (!strong.has(hint.index)) strong.set(hint.index, []);
      strong.get(hint.index).push(hint);
    }

    for (let index = 0; index < 81; index += 1) {
      const row = Math.floor(index / 9);
      const col = index % 9;
      const x = col * cellW;
      const y = row * cellH;

      if (result.conflicts.has(index)) drawConflict(ctx, x, y, cellW, cellH);
      if (grid[index]) continue;

      const hints = strong.get(index) || [];
      const candidates = result.candidates[index];

      if (hints.length) {
        drawStrongHint(ctx, hints, x, y, cellW, cellH);
      } else if (candidates.length === 0) {
        drawNoCandidate(ctx, x, y, cellW, cellH);
      } else if (state.showAllCandidates && !state.strongOnly) {
        drawCandidates(ctx, candidates, x, y, cellW, cellH);
      }
    }
  }

  function drawCandidates(ctx, candidates, x, y, cellW, cellH) {
    ctx.save();
    ctx.fillStyle = "rgba(50, 90, 175, 0.78)";
    ctx.font = `${Math.max(10, Math.floor(cellH * 0.18))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const digit of candidates) {
      const pos = digit - 1;
      const cx = x + cellW * ((pos % 3) + 0.5) / 3;
      const cy = y + cellH * (Math.floor(pos / 3) + 0.5) / 3;
      ctx.fillText(String(digit), cx, cy);
    }
    ctx.restore();
  }

  function drawStrongHint(ctx, hints, x, y, cellW, cellH) {
    const digits = [...new Set(hints.map((hint) => hint.digit))];
    const isNaked = hints.some((hint) => hint.type === "唯一候选");
    const color = isNaked ? "rgba(31, 152, 93, 0.2)" : "rgba(255, 181, 71, 0.25)";
    const textColor = isNaked ? "#127348" : "#9a5b00";

    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
    ctx.strokeStyle = isNaked ? "rgba(31, 152, 93, 0.8)" : "rgba(255, 181, 71, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, cellW - 6, cellH - 6);
    ctx.fillStyle = textColor;
    ctx.font = `700 ${Math.max(20, Math.floor(cellH * 0.48))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(digits.join("/"), x + cellW / 2, y + cellH / 2);
    ctx.restore();
  }

  function drawNoCandidate(ctx, x, y, cellW, cellH) {
    ctx.save();
    ctx.fillStyle = "rgba(229, 92, 108, 0.18)";
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
    ctx.fillStyle = "#c7293e";
    ctx.font = `700 ${Math.max(18, Math.floor(cellH * 0.38))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x + cellW / 2, y + cellH / 2);
    ctx.restore();
  }

  function drawConflict(ctx, x, y, cellW, cellH) {
    ctx.save();
    ctx.strokeStyle = "rgba(229, 92, 108, 0.95)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, cellW - 6, cellH - 6);
    ctx.restore();
  }

  function renderStatus(source, result) {
    if (state.sourceLabel) {
      state.sourceLabel.textContent = `${source.source}\n${source.detail || ""}`;
    }

    if (!state.summary || !state.list) return;

    if (!source.grid || !result) {
      state.summary.textContent = "还没有可分析的盘面。";
      state.list.innerHTML = "";
      return;
    }

    const strongCount = result.strongHints.length;
    const conflictCount = result.conflicts.size;
    state.summary.textContent = [
      `已填 ${result.filled} 格，空 ${result.empty} 格`,
      `确定提示 ${strongCount} 个${conflictCount ? `，冲突 ${conflictCount} 格` : ""}`,
      state.strongOnly ? "当前只显示强提示。" : "当前显示候选数和强提示。",
    ].join("\n");

    const rows = result.strongHints.slice(0, 18).map((hint) => {
      const { row, col } = rowCol(hint.index);
      return `<li><span>R${row + 1}C${col + 1} = <strong>${hint.digit}</strong></span><span class="${APP_ID}-muted">${hint.type}</span></li>`;
    });

    if (result.strongHints.length > 18) {
      rows.push(`<li><span>还有 ${result.strongHints.length - 18} 个</span><span class="${APP_ID}-muted">滚动查看棋盘</span></li>`);
    }

    state.list.innerHTML = rows.length ? rows.join("") : `<li><span>暂无确定单</span><span class="${APP_ID}-muted">看小候选数继续推理</span></li>`;
  }

  function rowCol(index) {
    return { row: Math.floor(index / 9), col: index % 9 };
  }

  function destroy() {
    window.clearInterval(state.timer);
    window.removeEventListener("resize", scheduleRefresh);
    window.removeEventListener("scroll", scheduleRefresh);
    if (state.overlay) state.overlay.remove();
    if (state.panel) state.panel.remove();
    const style = document.getElementById(`${APP_ID}-style`);
    if (style) style.remove();
    state.overlay = null;
    state.panel = null;
    delete window[API_NAME];
  }

  ready(init);
})();
