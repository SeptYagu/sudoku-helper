// ==UserScript==
// @name         Sudoku.com Candidate Helper
// @namespace    local.sudoku-helper
// @version      0.6.3
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
  const SCRIPT_VERSION = "0.6.3";
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
  const SPEED_STORAGE_KEY = `${APP_ID}:autoFillSpeed`;

  if (window[API_NAME] && typeof window[API_NAME].destroy === "function") {
    window[API_NAME].destroy();
  }

  const state = {
    boardElement: null,
    overlay: null,
    panel: null,
    manualSection: null,
    manualInput: null,
    speedInput: null,
    speedLabel: null,
    summary: null,
    sourceLabel: null,
    list: null,
    visible: true,
    showAllCandidates: true,
    strongOnly: false,
    manualMode: false,
    manualGrid: "",
    autoFilling: false,
    autoFillCancelRequested: false,
    autoFillSpeed: readStoredAutoFillSpeed(),
    notice: "",
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
      height: min(580px, calc(100vh - 36px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
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
      flex: 0 0 auto;
    }

    .${APP_ID}-title {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
    }

    .${APP_ID}-version {
      color: #66758a;
      font-size: 12px;
      font-weight: 600;
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

    .${APP_ID}-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding-right: 2px;
      scrollbar-gutter: stable;
    }

    .${APP_ID}-buttons {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 8px;
      flex: 0 0 auto;
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

    .${APP_ID}-speed {
      flex: 0 0 auto;
      margin: 0 0 8px;
      padding: 8px;
      border-radius: 6px;
      background: #f5f7fb;
      color: #3d4f66;
      font-size: 12px;
    }

    .${APP_ID}-speed label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .${APP_ID}-speed input {
      width: 100%;
      display: block;
      accent-color: #325aaf;
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
      align-items: flex-start;
      gap: 10px;
      padding: 5px 0;
      border-top: 1px solid rgba(52, 72, 97, 0.1);
    }

    .${APP_ID}-hint-list li[data-kind="logic"] {
      display: block;
    }

    .${APP_ID}-reason {
      display: block;
      color: #3d4f66;
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
      autoFill: () => autoFillStrongHints(),
      stopAutoFill: () => requestAutoFillStop(),
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
        <span class="${APP_ID}-title"><span>数独候选助手</span><span class="${APP_ID}-version">v${SCRIPT_VERSION}</span></span>
        <button class="${APP_ID}-button" data-action="close" title="关闭">关闭</button>
      </div>
      <div class="${APP_ID}-buttons">
        <button class="${APP_ID}-button" data-action="refresh">刷新</button>
        <button class="${APP_ID}-button" data-action="visible">提示层</button>
        <button class="${APP_ID}-button" data-action="all">候选数</button>
        <button class="${APP_ID}-button" data-action="strong">强提示</button>
        <button class="${APP_ID}-button" data-action="autoFill">自动填写</button>
        <button class="${APP_ID}-button" data-action="manual">手动盘面</button>
        <button class="${APP_ID}-button" data-action="clearManual">清手动</button>
        <button class="${APP_ID}-button" data-action="diagnose">诊断</button>
      </div>
      <div class="${APP_ID}-speed">
        <label for="${APP_ID}-speed-input">
          <span>自动填写速度</span>
          <span data-role="speedLabel"></span>
        </label>
        <input id="${APP_ID}-speed-input" data-role="speed" type="range" min="1" max="10" step="1" value="${state.autoFillSpeed}">
      </div>
      <div class="${APP_ID}-body">
        <div class="${APP_ID}-status" data-role="source">正在读取棋盘...</div>
        <div class="${APP_ID}-status">绿色：排除法后唯一数字。黄色：该数字唯一位置。</div>
        <div class="${APP_ID}-manual" data-role="manual">
          <textarea spellcheck="false" placeholder="粘贴 81 位盘面，0 或 . 表示空格；也可以粘贴 9 行。"></textarea>
        </div>
        <div class="${APP_ID}-status" data-role="summary"></div>
        <ul class="${APP_ID}-hint-list" data-role="list"></ul>
      </div>
    `;

    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("input", onPanelInput);
    document.body.appendChild(panel);

    state.panel = panel;
    state.manualSection = panel.querySelector("[data-role='manual']");
    state.manualInput = panel.querySelector("textarea");
    state.speedInput = panel.querySelector("[data-role='speed']");
    state.speedLabel = panel.querySelector("[data-role='speedLabel']");
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
    if (action === "autoFill") {
      if (state.autoFilling) requestAutoFillStop();
      else autoFillStrongHints();
    }
    if (action === "diagnose") diagnose(true);
    if (action === "close") destroy();
  }

  function onPanelInput(event) {
    if (event.target === state.speedInput) {
      state.autoFillSpeed = normalizeAutoFillSpeed(event.target.value);
      writeStoredAutoFillSpeed(state.autoFillSpeed);
      updateSpeedLabel();
      return;
    }

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
    set("autoFill", state.autoFilling);
    const autoFillButton = state.panel.querySelector('[data-action="autoFill"]');
    if (autoFillButton) autoFillButton.textContent = state.autoFilling ? "停止填写" : "自动填写";
    updateSpeedLabel();
  }

  function updateSpeedLabel() {
    if (state.speedInput && Number(state.speedInput.value) !== state.autoFillSpeed) {
      state.speedInput.value = String(state.autoFillSpeed);
    }
    if (!state.speedLabel) return;

    const delay = getAutoFillBaseDelay();
    const label = state.autoFillSpeed <= 3 ? "慢" : state.autoFillSpeed >= 8 ? "快" : "中";
    state.speedLabel.textContent = `${label} ${state.autoFillSpeed}/10，约 ${delay}ms`;
  }

  function normalizeAutoFillSpeed(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 4;
    return Math.min(10, Math.max(1, Math.round(number)));
  }

  function readStoredAutoFillSpeed() {
    try {
      return normalizeAutoFillSpeed(window.localStorage.getItem(SPEED_STORAGE_KEY) || 4);
    } catch (error) {
      return 4;
    }
  }

  function writeStoredAutoFillSpeed(value) {
    try {
      window.localStorage.setItem(SPEED_STORAGE_KEY, String(normalizeAutoFillSpeed(value)));
    } catch (error) {
      // Storage may be blocked; the in-memory speed still works.
    }
  }

  function getAutoFillBaseDelay() {
    const speed = normalizeAutoFillSpeed(state.autoFillSpeed);
    return Math.round(1000 - speed * 75);
  }

  function getRandomAutoFillDelay() {
    const base = getAutoFillBaseDelay();
    return Math.round(base * (0.75 + Math.random() * 0.65));
  }

  function getRandomCellSelectDelay() {
    return Math.round(55 + Math.random() * 85);
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

  async function autoFillStrongHints() {
    if (state.autoFilling) {
      requestAutoFillStop();
      return;
    }

    state.autoFilling = true;
    state.autoFillCancelRequested = false;
    state.notice = `正在自动填写确定数字... 速度 ${state.autoFillSpeed}/10，带随机间隔`;
    updateButtons();
    refresh(true);

    try {
      disableNoteModeIfPossible();

      let filled = 0;
      let stoppedReason = "";
      for (let step = 0; step < 81; step += 1) {
        if (state.autoFillCancelRequested) {
          stoppedReason = "已手动停止";
          break;
        }

        const source = readGrid();
        if (!source.grid) {
          stoppedReason = "没有读到盘面";
          break;
        }
        if (state.manualMode || source.source === "手动盘面") {
          stoppedReason = "当前是手动盘面，不能自动填写到网页";
          break;
        }

        const result = analyzeGrid(source.grid);
        if (result.conflicts.size) {
          stoppedReason = "盘面有冲突";
          break;
        }

        const entries = getAutoFillEntries(source.grid, result);
        if (!entries.length) break;

        const board = findBoardElement();
        if (!board) {
          stoppedReason = "没有找到网页棋盘";
          break;
        }

        const entry = entries[0];
        state.notice = `正在自动填写第 ${filled + 1} 格：${cellList([entry.index])} = ${entry.digit}`;
        refresh(true);

        const ok = await fillCellThroughPage(board, entry.index, entry.digit);
        if (state.autoFillCancelRequested) {
          stoppedReason = "已手动停止";
          break;
        }
        if (!ok) {
          stoppedReason = `${cellList([entry.index])} 点击失败`;
          break;
        }
        if (!(await sleepWithAutoFillCancel(getRandomAutoFillDelay()))) {
          stoppedReason = "已手动停止";
          break;
        }

        const confirmed = await waitForCellValue(entry.index, entry.digit, 1400);
        if (state.autoFillCancelRequested) {
          stoppedReason = "已手动停止";
          break;
        }
        if (!confirmed) {
          stoppedReason = `${cellList([entry.index])} 没确认填入 ${entry.digit}，已暂停避免继续误填`;
          break;
        }

        filled += 1;
      }

      state.notice = stoppedReason ? `已自动填写 ${filled} 格；${stoppedReason}。` : `已自动填写 ${filled} 格确定数字。`;
    } finally {
      state.autoFilling = false;
      state.autoFillCancelRequested = false;
      updateButtons();
      refresh(true);
      window.setTimeout(() => refresh(true), 300);
    }
  }

  function requestAutoFillStop() {
    if (!state.autoFilling) return;
    state.autoFillCancelRequested = true;
    state.notice = "正在停止自动填写...";
    updateButtons();
    refresh(true);
  }

  function getAutoFillEntries(grid, result) {
    const digitsByCell = new Map();
    for (const hint of result.strongHints) {
      if (grid[hint.index]) continue;
      if (!digitsByCell.has(hint.index)) digitsByCell.set(hint.index, new Set());
      digitsByCell.get(hint.index).add(hint.digit);
    }

    return Array.from(digitsByCell.entries())
      .filter(([, digits]) => digits.size === 1)
      .map(([index, digits]) => ({ index, digit: Array.from(digits)[0] }))
      .sort((a, b) => a.index - b.index);
  }

  async function fillCellThroughPage(board, index, digit) {
    const clickedCell = clickBoardCell(board, index);
    if (!(await sleepWithAutoFillCancel(getRandomCellSelectDelay()))) return false;

    const clickedDigit = clickDigitControl(digit);
    if (clickedDigit) return clickedCell;

    return clickedCell && dispatchKeyboardDigit(digit);
  }

  async function waitForCellValue(index, digit, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (state.autoFillCancelRequested) return false;
      const source = readGrid();
      if (source.grid && source.grid[index] === digit) return true;
      if (!(await sleepWithAutoFillCancel(120))) return false;
    }
    return false;
  }

  function clickBoardCell(board, index) {
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const row = Math.floor(index / 9);
    const col = index % 9;
    const x = rect.left + rect.width * (col + 0.5) / 9;
    const y = rect.top + rect.height * (row + 0.5) / 9;
    const target = document.elementFromPoint(x, y) || board;
    dispatchPointerClick(target, x, y);
    return true;
  }

  function clickDigitControl(digit) {
    const control = findDigitControl(digit);
    if (!control) return false;

    const rect = control.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    dispatchPointerClick(control, x, y);
    return true;
  }

  function findDigitControl(digit) {
    const value = String(digit);
    const selectors = [
      "button",
      "[role='button']",
      "[tabindex]",
      "[data-value]",
      "[data-number]",
      "[data-digit]",
      "[data-key]",
      ".number",
      ".numbers *",
      ".numpad *",
      ".keyboard *",
      ".game-controls *",
    ].join(",");
    const boardRect = (state.boardElement || findBoardElement())?.getBoundingClientRect();

    return Array.from(document.querySelectorAll(selectors))
      .filter((element) => !state.panel?.contains(element))
      .filter((element) => isVisibleElement(element))
      .filter((element) => !isInsideSquareBoard(element, boardRect))
      .filter((element) => elementMatchesDigit(element, value))
      .map((element) => ({ element, score: scoreControlElement(element, boardRect) }))
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  }

  function elementMatchesDigit(element, value) {
    const text = (element.textContent || "").trim();
    const attrs = ["data-value", "data-number", "data-digit", "data-key", "aria-label", "title"];
    const attrMatches = attrs.some((name) => {
      const attr = String(element.getAttribute(name) || "").trim();
      return attr === value || new RegExp(`(^|\\D)${value}(\\D|$)`).test(attr);
    });
    return text === value || attrMatches;
  }

  function isInsideSquareBoard(element, boardRect) {
    if (!boardRect) return false;
    const boardLooksSquare = Math.abs(boardRect.width - boardRect.height) < Math.max(boardRect.width, boardRect.height) * 0.18;
    if (!boardLooksSquare) return false;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return centerX >= boardRect.left && centerX <= boardRect.right && centerY >= boardRect.top && centerY <= boardRect.bottom;
  }

  function scoreControlElement(element, boardRect) {
    const rect = element.getBoundingClientRect();
    const label = `${element.className || ""} ${element.id || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
    let score = 0;

    if (/number|digit|numpad|keyboard|control|key/.test(label)) score += 20;
    if (element.tagName === "BUTTON" || element.getAttribute("role") === "button") score += 8;
    if (!boardRect) return score;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const boardCenterX = boardRect.left + boardRect.width / 2;
    const boardCenterY = boardRect.top + boardRect.height / 2;
    const distance = Math.hypot(centerX - boardCenterX, centerY - boardCenterY);

    if (rect.top >= boardRect.top - 20 && rect.top <= boardRect.bottom + 260) score += 15;
    if (centerX >= boardRect.left - 80 && centerX <= boardRect.right + 80) score += 8;
    return score - distance / 100;
  }

  function dispatchKeyboardDigit(digit) {
    const key = String(digit);
    const keyCode = 48 + Number(digit);
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;

    for (const type of ["keydown", "keypress", "keyup"]) {
      const event = new KeyboardEvent(type, {
        key,
        code: `Digit${digit}`,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      try {
        Object.defineProperty(event, "keyCode", { get: () => keyCode });
        Object.defineProperty(event, "which", { get: () => keyCode });
      } catch (error) {
        // Some browsers keep keyboard legacy fields read-only.
      }
      target.dispatchEvent(event);
    }

    return true;
  }

  function disableNoteModeIfPossible() {
    const control = findTextControl(["备注", "笔记", "Notes", "Note"]);
    if (!control || !looksActive(control)) return false;

    const rect = control.getBoundingClientRect();
    dispatchPointerClick(control, rect.left + rect.width / 2, rect.top + rect.height / 2);
    return true;
  }

  function findTextControl(labels) {
    const normalized = labels.map((label) => label.toLowerCase());
    return Array.from(document.querySelectorAll("button,[role='button'],[tabindex],.game-controls *"))
      .filter((element) => !state.panel?.contains(element))
      .filter((element) => isVisibleElement(element))
      .filter((element) => {
        const text = (element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim().toLowerCase();
        return normalized.some((label) => text === label || text.includes(label));
      })[0] || null;
  }

  function looksActive(element) {
    const value = `${element.className || ""} ${element.getAttribute("aria-pressed") || ""} ${element.getAttribute("data-active") || ""}`.toLowerCase();
    return /active|selected|true|on/.test(value);
  }

  function dispatchPointerClick(element, x, y) {
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      button: 0,
      buttons: 1,
    };

    if (typeof PointerEvent === "function") {
      element.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
    }

    element.dispatchEvent(new MouseEvent("mousedown", base));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
  }

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width >= 8 && rect.height >= 8 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function sleepWithAutoFillCancel(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (state.autoFillCancelRequested) return false;
      await sleep(Math.min(80, deadline - Date.now()));
    }
    return !state.autoFillCancelRequested;
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
    const baseCandidates = buildBaseCandidates(grid);
    const logic = applyLogicalReductions(grid, baseCandidates);
    const candidates = logic.candidates;
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
      logicSteps: logic.steps,
      filled: grid.filter(Boolean).length,
      empty: grid.filter((digit) => !digit).length,
    };
  }

  function buildBaseCandidates(grid) {
    return Array.from({ length: 81 }, (_, index) => {
      if (grid[index]) return [];
      const used = new Set();
      for (const peer of peers(index)) {
        if (grid[peer]) used.add(grid[peer]);
      }
      return DIGITS.filter((digit) => !used.has(digit));
    });
  }

  function applyLogicalReductions(grid, baseCandidates) {
    const candidates = baseCandidates.map((values) => values.slice());
    const steps = [];

    for (let round = 0; round < 12; round += 1) {
      let changed = false;
      changed = applyPointing(grid, candidates, steps) || changed;
      changed = applyClaiming(grid, candidates, steps) || changed;
      changed = applyNakedSubsets(grid, candidates, steps) || changed;
      changed = applyHiddenSubsets(grid, candidates, steps) || changed;
      changed = applyXWing(grid, candidates, steps) || changed;
      if (!changed) break;
      if (steps.length > 80) break;
    }

    return { candidates, steps };
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
    for (let row = 0; row < 9; row += 1) all.push({
      type: "行唯一",
      kind: "row",
      index: row,
      label: `第${row + 1}行`,
      cells: DIGITS.map((_, col) => row * 9 + col),
    });
    for (let col = 0; col < 9; col += 1) all.push({
      type: "列唯一",
      kind: "col",
      index: col,
      label: `第${col + 1}列`,
      cells: DIGITS.map((_, row) => row * 9 + col),
    });
    for (let br = 0; br < 3; br += 1) {
      for (let bc = 0; bc < 3; bc += 1) {
        const cells = [];
        for (let r = br * 3; r < br * 3 + 3; r += 1) {
          for (let c = bc * 3; c < bc * 3 + 3; c += 1) cells.push(r * 9 + c);
        }
        all.push({
          type: "宫唯一",
          kind: "box",
          index: br * 3 + bc,
          label: `第${br * 3 + bc + 1}宫`,
          cells,
        });
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

  function applyPointing(grid, candidates, steps) {
    let changed = false;
    for (const box of units().filter((unit) => unit.kind === "box")) {
      for (const digit of DIGITS) {
        const places = box.cells.filter((index) => !grid[index] && candidates[index].includes(digit));
        if (places.length < 2) continue;

        const rows = [...new Set(places.map((index) => rowCol(index).row))];
        const cols = [...new Set(places.map((index) => rowCol(index).col))];
        if (rows.length === 1) {
          const targets = rowCells(rows[0]).filter((index) => !box.cells.includes(index));
          changed = applyElimination(candidates, targets, [digit], {
            technique: "宫内指向",
            reason: `${box.label}里的 ${digit} 只能落在第${rows[0] + 1}行，所以这一行其他宫不能再有 ${digit}。`,
            basisCells: places,
          }, steps) || changed;
        }
        if (cols.length === 1) {
          const targets = colCells(cols[0]).filter((index) => !box.cells.includes(index));
          changed = applyElimination(candidates, targets, [digit], {
            technique: "宫内指向",
            reason: `${box.label}里的 ${digit} 只能落在第${cols[0] + 1}列，所以这一列其他宫不能再有 ${digit}。`,
            basisCells: places,
          }, steps) || changed;
        }
      }
    }
    return changed;
  }

  function applyClaiming(grid, candidates, steps) {
    let changed = false;
    for (const unit of units().filter((item) => item.kind === "row" || item.kind === "col")) {
      for (const digit of DIGITS) {
        const places = unit.cells.filter((index) => !grid[index] && candidates[index].includes(digit));
        if (places.length < 2) continue;

        const boxes = [...new Set(places.map((index) => boxIndex(index)))];
        if (boxes.length !== 1) continue;

        const box = units().find((item) => item.kind === "box" && item.index === boxes[0]);
        const targets = box.cells.filter((index) => !unit.cells.includes(index));
        changed = applyElimination(candidates, targets, [digit], {
          technique: "行列锁定",
          reason: `${unit.label}里的 ${digit} 只能落在${box.label}，所以${box.label}其他格不能再有 ${digit}。`,
          basisCells: places,
        }, steps) || changed;
      }
    }
    return changed;
  }

  function applyNakedSubsets(grid, candidates, steps) {
    let changed = false;
    for (const unit of units()) {
      const cells = unit.cells.filter((index) => !grid[index] && candidates[index].length >= 2 && candidates[index].length <= 4);
      for (const size of [2, 3, 4]) {
        for (const combo of combinations(cells, size)) {
          const digits = uniqueDigits(combo.flatMap((index) => candidates[index]));
          if (digits.length !== size) continue;

          const lockedCells = unit.cells.filter((index) => (
            !grid[index] &&
            candidates[index].length > 0 &&
            candidates[index].every((digit) => digits.includes(digit))
          ));
          if (!sameMembers(lockedCells, combo)) continue;

          const targets = unit.cells.filter((index) => !combo.includes(index));
          changed = applyElimination(candidates, targets, digits, {
            technique: `裸${subsetName(size)}`,
            reason: `${unit.label}中 ${cellList(combo)} 只能放 ${digitList(digits)}，所以本单位其他格可删这些候选。`,
            basisCells: combo,
          }, steps) || changed;
        }
      }
    }
    return changed;
  }

  function applyHiddenSubsets(grid, candidates, steps) {
    let changed = false;
    for (const unit of units()) {
      for (const size of [2, 3]) {
        for (const digits of combinations(DIGITS, size)) {
          const digitPlaces = digits.map((digit) => unit.cells.filter((index) => !grid[index] && candidates[index].includes(digit)));
          if (digitPlaces.some((places) => places.length === 0 || places.length > size)) continue;

          const places = [...new Set(digitPlaces.flat())].sort((a, b) => a - b);
          if (places.length !== size) continue;

          const removable = places.some((index) => candidates[index].some((digit) => !digits.includes(digit)));
          if (!removable) continue;

          for (const index of places) {
            const remove = candidates[index].filter((digit) => !digits.includes(digit));
            changed = applyElimination(candidates, [index], remove, {
              technique: `隐藏${subsetName(size)}`,
              reason: `${unit.label}中 ${digitList(digits)} 只出现在 ${cellList(places)}，这些格只保留这组数字。`,
              basisCells: places,
            }, steps) || changed;
          }
        }
      }
    }
    return changed;
  }

  function applyXWing(grid, candidates, steps) {
    let changed = false;
    for (const digit of DIGITS) {
      const rowPairs = DIGITS.map((_, row) => ({
        row,
        cols: DIGITS.map((__, col) => col).filter((col) => !grid[row * 9 + col] && candidates[row * 9 + col].includes(digit)),
      })).filter((item) => item.cols.length === 2);

      for (const [a, b] of combinations(rowPairs, 2)) {
        if (!sameMembers(a.cols, b.cols)) continue;
        const targets = a.cols.flatMap((col) => colCells(col).filter((index) => {
          const row = rowCol(index).row;
          return row !== a.row && row !== b.row;
        }));
        changed = applyElimination(candidates, targets, [digit], {
          technique: "X-Wing",
          reason: `${digit} 在第${a.row + 1}行和第${b.row + 1}行都只可能出现在第${a.cols[0] + 1}/${a.cols[1] + 1}列，所以这两列其他行可删 ${digit}。`,
          basisCells: [a.row * 9 + a.cols[0], a.row * 9 + a.cols[1], b.row * 9 + b.cols[0], b.row * 9 + b.cols[1]],
        }, steps) || changed;
      }

      const colPairs = DIGITS.map((_, col) => ({
        col,
        rows: DIGITS.map((__, row) => row).filter((row) => !grid[row * 9 + col] && candidates[row * 9 + col].includes(digit)),
      })).filter((item) => item.rows.length === 2);

      for (const [a, b] of combinations(colPairs, 2)) {
        if (!sameMembers(a.rows, b.rows)) continue;
        const targets = a.rows.flatMap((row) => rowCells(row).filter((index) => {
          const col = rowCol(index).col;
          return col !== a.col && col !== b.col;
        }));
        changed = applyElimination(candidates, targets, [digit], {
          technique: "X-Wing",
          reason: `${digit} 在第${a.col + 1}列和第${b.col + 1}列都只可能出现在第${a.rows[0] + 1}/${a.rows[1] + 1}行，所以这两行其他列可删 ${digit}。`,
          basisCells: [a.rows[0] * 9 + a.col, a.rows[1] * 9 + a.col, b.rows[0] * 9 + b.col, b.rows[1] * 9 + b.col],
        }, steps) || changed;
      }
    }
    return changed;
  }

  function applyElimination(candidates, targets, digits, meta, steps) {
    const uniqueTargets = [...new Set(targets)];
    const uniqueRemove = uniqueDigits(digits);
    const changes = [];

    for (const index of uniqueTargets) {
      if (!candidates[index] || !candidates[index].length) continue;
      const removed = candidates[index].filter((digit) => uniqueRemove.includes(digit));
      if (!removed.length) continue;

      candidates[index] = candidates[index].filter((digit) => !uniqueRemove.includes(digit));
      changes.push({ index, removed });
    }

    if (!changes.length) return false;

    steps.push({
      technique: meta.technique,
      reason: meta.reason,
      basisCells: meta.basisCells || [],
      changes,
    });
    return true;
  }

  function combinations(items, size) {
    const result = [];
    const combo = [];

    function walk(start) {
      if (combo.length === size) {
        result.push(combo.slice());
        return;
      }
      for (let i = start; i <= items.length - (size - combo.length); i += 1) {
        combo.push(items[i]);
        walk(i + 1);
        combo.pop();
      }
    }

    walk(0);
    return result;
  }

  function uniqueDigits(values) {
    return [...new Set(values)].filter((digit) => DIGITS.includes(digit)).sort((a, b) => a - b);
  }

  function sameMembers(a, b) {
    if (a.length !== b.length) return false;
    const left = a.slice().sort((x, y) => x - y);
    const right = b.slice().sort((x, y) => x - y);
    return left.every((value, index) => value === right[index]);
  }

  function subsetName(size) {
    if (size === 2) return "对";
    if (size === 3) return "三";
    return "四";
  }

  function rowCells(row) {
    return DIGITS.map((_, col) => row * 9 + col);
  }

  function colCells(col) {
    return DIGITS.map((_, row) => row * 9 + col);
  }

  function boxIndex(index) {
    const { row, col } = rowCol(index);
    return Math.floor(row / 3) * 3 + Math.floor(col / 3);
  }

  function digitList(digits) {
    return uniqueDigits(digits).join("/");
  }

  function cellList(cells) {
    return cells.map((index) => {
      const { row, col } = rowCol(index);
      return `R${row + 1}C${col + 1}`;
    }).join("、");
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
    const centerX = x + cellW / 2;
    const centerY = y + cellH / 2;
    const radius = Math.max(8, Math.min(cellW, cellH) / 2 - 4);

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isNaked ? "rgba(31, 152, 93, 0.8)" : "rgba(255, 181, 71, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(6, radius - 1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = `700 ${Math.max(20, Math.floor(cellH * 0.48))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(digits.join("/"), centerX, centerY);
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
      state.summary.textContent = ["还没有可分析的盘面。", state.notice].filter(Boolean).join("\n");
      state.list.innerHTML = "";
      return;
    }

    const strongCount = result.strongHints.length;
    const conflictCount = result.conflicts.size;
    const logicCount = result.logicSteps ? result.logicSteps.length : 0;
    const summaryLines = [
      `已填 ${result.filled} 格，空 ${result.empty} 格`,
      `确定提示 ${strongCount} 个，推理删候选 ${logicCount} 步${conflictCount ? `，冲突 ${conflictCount} 格` : ""}`,
      state.strongOnly ? "当前只显示强提示。" : "当前显示候选数和强提示。",
    ];
    if (state.notice) summaryLines.push(state.notice);
    state.summary.textContent = summaryLines.join("\n");

    const rows = result.strongHints.slice(0, 18).map((hint) => {
      const { row, col } = rowCol(hint.index);
      return `<li><span>R${row + 1}C${col + 1} = <strong>${hint.digit}</strong></span><span class="${APP_ID}-muted">${hint.type}</span></li>`;
    });

    if (result.strongHints.length > 18) {
      rows.push(`<li><span>还有 ${result.strongHints.length - 18} 个</span><span class="${APP_ID}-muted">滚动查看棋盘</span></li>`);
    }

    const logicRows = (result.logicSteps || []).slice(0, 14).map(formatLogicStep);
    if (logicRows.length) {
      rows.push(`<li><span><strong>推理思路</strong></span><span class="${APP_ID}-muted">候选删减</span></li>`);
      rows.push(...logicRows);
      if (result.logicSteps.length > logicRows.length) {
        rows.push(`<li><span>还有 ${result.logicSteps.length - logicRows.length} 步推理</span><span class="${APP_ID}-muted">已省略</span></li>`);
      }
    }

    state.list.innerHTML = rows.length ? rows.join("") : `<li><span>暂无确定单</span><span class="${APP_ID}-muted">看小候选数继续推理</span></li>`;
  }

  function formatLogicStep(step) {
    const changes = step.changes || [];
    const shown = changes.slice(0, 4).map((change) => `${cellList([change.index])}删${digitList(change.removed)}`);
    if (changes.length > shown.length) shown.push(`等${changes.length}处`);

    return [
      `<li data-kind="logic">`,
      `<span><strong>${escapeHtml(step.technique || "推理")}</strong>：${escapeHtml(step.reason || "")}</span>`,
      `<span class="${APP_ID}-reason">${escapeHtml(shown.join("，"))}</span>`,
      `</li>`,
    ].join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
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
