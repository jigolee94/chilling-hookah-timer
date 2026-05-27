import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Bell, BellOff, CheckCircle2, RotateCcw, Trash2, Clock, Settings, Armchair, LayoutGrid, Pencil, X, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, DoorOpen, Wine, CircleHelp, BookOpen, MapPin, Save, Download, Upload, Trophy, Star, ShieldCheck, Play, BarChart3 } from "lucide-react";

const STORAGE_KEY = "hookah-timer-v5-seongsu-default";
const DEFAULT_ADMIN_PIN = "1004";
const DEFAULT_SELECTED_PRESET_ID = "preset-seongsu";
const MANUAL_PDF_PATH = `${import.meta.env.BASE_URL}hookah_timer_user_manual-3.pdf`;

const defaultFixtures = [
  { id: "entrance", name: "입구", x: 4, y: 4, type: "entrance" },
  { id: "bar", name: "바 / 준비공간", x: 68, y: 82, type: "bar" },
];

const TASK_ORDER = ["flipThree", "finishThree", "served", "maintenanceTime", "extraCoalFlip", "replaceCoal"];

const SCORE_WINDOW_MS = 12 * 60 * 60 * 1000;
const OVERDUE_ALARM_REPEAT_MS = 15 * 1000;
const COAL_LID_OPEN_ALARM_MS = 10 * 60 * 1000;
const COAL_LID_OPEN_TASK_KEY = "maintenanceTime";
const COAL_LID_OPEN_LABEL = "숯 뚜껑 열어주기";

function isCoalLidOpenWindow(taskKey, secondsLeft) {
  return (
    taskKey === COAL_LID_OPEN_TASK_KEY &&
    secondsLeft !== null &&
    secondsLeft > 60 &&
    secondsLeft <= COAL_LID_OPEN_ALARM_MS / 1000
  );
}

function scoreFromDelaySeconds(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  if (safeSeconds <= 10) return 5;
  if (safeSeconds <= 20) return 4;
  return 3;
}

const TASK_LABELS = {
  flipThree: "숯 뒤집기",
  finishThree: "시샤 히팅 시작",
  served: "후카 나감",
  maintenanceTime: "숯 털기/1개 올림",
  extraCoalFlip: "숯 1개 뒤집기",
  replaceCoal: "숯 1개 교체",
};

function normalizeHistoryRecords(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return [value];
  return [];
}

function collectConfirmationRecords(rows, tables, sinceTimestamp = 0) {
  const tableMap = new Map((tables || []).map((table) => [table.id, table]));
  return (rows || [])
    .flatMap((row) => {
      const history = row.confirmationHistory || {};
      return Object.entries(history).flatMap(([taskKey, value]) =>
        normalizeHistoryRecords(value).map((record) => ({
          id: record.id || `${row.id}-${taskKey}-${record.acknowledgedAt || 0}`,
          rowId: row.id,
          tableId: row.tableId,
          tableName: tableMap.get(row.tableId)?.name || "테이블",
          rowLabel: row.label || "후카",
          taskKey,
          taskLabel: record.taskLabel || TASK_LABELS[taskKey] || taskKey,
          scheduledTimestamp: Number(record.scheduledTimestamp || 0),
          acknowledgedAt: Number(record.acknowledgedAt || 0),
          delaySeconds: Number(record.delaySeconds || 0),
          score: Number(record.score || 0),
        }))
      );
    })
    .filter((record) => record.acknowledgedAt && record.acknowledgedAt >= sinceTimestamp)
    .sort((a, b) => b.acknowledgedAt - a.acknowledgedAt);
}

function scoreStatsFromRecords(records) {
  const scored = (records || []).filter((record) => Number(record.score) > 0);
  const total = scored.reduce((sum, record) => sum + Number(record.score || 0), 0);
  const average = scored.length ? total / scored.length : 0;
  return { records: scored, count: scored.length, total, average, ...scoreGrade(average) };
}

function scoreGrade(average) {
  if (!average) return { grade: "-", message: "아직 점수 기록이 없어요." };
  if (average >= 4.8) return { grade: "S", message: "알림 뜨자마자 반응하는 수준이에요. 거의 무빙이 예술입니다." };
  if (average >= 4.2) return { grade: "A", message: "응대 속도 좋습니다. 손님 흐름 끊길 일이 거의 없겠어요." };
  if (average >= 3.4) return { grade: "B", message: "전체적으로 안정적이에요. 조금만 더 빠르면 완전 상위권입니다." };
  return { grade: "C", message: "오늘은 조금 바빴던 흐름이에요. 그래도 기본 점수는 지켰습니다." };
}

function formatDelaySeconds(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  if (safeSeconds < 60) return `${safeSeconds}초`;
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}분 ${pad(rest)}초`;
}


function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfTodayTimestamp(now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatHourRange(hourKey) {
  if (hourKey == null || hourKey === "") return "기록 없음";
  const hour = Number(hourKey);
  if (Number.isNaN(hour)) return "기록 없음";
  return `${pad(hour)}:00~${pad((hour + 1) % 24)}:00`;
}

function normalizeShift(value) {
  return {
    active: Boolean(value?.active && value?.startedAt),
    startedAt: value?.startedAt ? Number(value.startedAt) : null,
    endedAt: value?.endedAt ? Number(value.endedAt) : null,
    lastReport: value?.lastReport || null,
  };
}

function operationMessageFromCount(count) {
  if (count >= 30) return "오늘 칠링 공장 풀가동... 이건 진짜 레전드예요 🔥";
  if (count >= 20) return "오늘 손목이랑 집게가 제일 고생했어요. 완전 바쁜 하루였네요 🔥";
  if (count >= 10) return "오늘도 꽤 달렸네요. 후카 장인 모드 인정 😎";
  if (count > 0) return "오늘도 차근차근 잘 마무리했어요. 고생 많았어요 🙌";
  return "오늘은 조용한 하루였네요. 그래도 세팅해둔 거 정리하고 퇴근!";
}

function createOperationReport(rows, tables, scoreRecords, sinceTimestamp = startOfTodayTimestamp(), now = Date.now()) {
  const tableMap = new Map((tables || []).map((table) => [table.id, table]));
  const rowsInPeriod = (rows || []).filter((row) => Number(row.createdAt || row.startTimestamp || 0) >= sinceTimestamp);
  const completedRows = rowsInPeriod.filter((row) => row.completed || Number(row.acknowledged?.extraCoalFlip || 0) >= sinceTimestamp);
  const activeRows = rowsInPeriod.filter((row) => !row.completed);

  const byHour = new Map();
  rowsInPeriod.forEach((row) => {
    const timestamp = Number(row.createdAt || row.startTimestamp || 0);
    if (!timestamp) return;
    const hour = new Date(timestamp).getHours();
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
  });
  const busiestHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const byTable = new Map();
  rowsInPeriod.forEach((row) => {
    byTable.set(row.tableId, (byTable.get(row.tableId) || 0) + 1);
  });
  const busiestTableEntry = [...byTable.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const delayByTask = new Map();
  (scoreRecords || []).forEach((record) => {
    if (!record.taskKey) return;
    const item = delayByTask.get(record.taskKey) || { taskKey: record.taskKey, taskLabel: record.taskLabel, count: 0, totalDelay: 0 };
    item.count += 1;
    item.totalDelay += Number(record.delaySeconds || 0);
    delayByTask.set(record.taskKey, item);
  });
  const slowestTask = [...delayByTask.values()]
    .map((item) => ({ ...item, averageDelay: item.count ? item.totalDelay / item.count : 0 }))
    .sort((a, b) => b.averageDelay - a.averageDelay)[0] || null;

  return {
    sinceTimestamp,
    endedAt: now,
    // 직원별 마감 리포트의 후카 개수는 "마지막 단계까지 끝난 수"가 아니라
    // 해당 근무 시작 이후 새로 시작한 후카 수로 계산한다.
    // 교대 시점에 아직 진행 중인 후카도 앞 직원이 만든 것으로 집계하고,
    // 다음 직원의 새 근무 기록에는 포함하지 않는다.
    hookahCount: rowsInPeriod.length,
    startedHookahCount: rowsInPeriod.length,
    completedHookahCount: completedRows.length,
    activeTimerCount: activeRows.length,
    busiestHourLabel: busiestHour ? formatHourRange(busiestHour[0]) : "기록 없음",
    busiestHourCount: busiestHour?.[1] || 0,
    busiestTableName: busiestTableEntry ? tableMap.get(busiestTableEntry[0])?.name || "테이블" : "기록 없음",
    busiestTableCount: busiestTableEntry?.[1] || 0,
    slowestTaskLabel: slowestTask?.taskLabel || "기록 없음",
    slowestTaskAverageDelay: slowestTask ? Math.round(slowestTask.averageDelay) : 0,
  };
}

function nowTimeInput() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeInputToDate(value) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const d = new Date();
  d.setHours(h, m, 0, 0);

  const now = new Date();
  if (d.getTime() < now.getTime() - 12 * 60 * 60 * 1000) {
    d.setDate(d.getDate() + 1);
  }

  return d;
}

function timestampToDate(timestamp) {
  const value = Number(timestamp);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestampForTimeValue(value, timestamp, fallbackTimestamp = Date.now()) {
  const timestampDate = timestampToDate(timestamp);
  if (timestampDate && value === formatTime(timestampDate)) return timestampDate.getTime();

  const fallbackDate = timestampToDate(fallbackTimestamp);
  if (fallbackDate && value === formatTime(fallbackDate)) return fallbackDate.getTime();

  const parsedDate = timeInputToDate(value);
  return parsedDate?.getTime?.() || fallbackTimestamp;
}

function rowTimeDate(row, timeKey, timestampKey) {
  const timestampDate = timestampToDate(row[timestampKey]);
  if (timestampDate && row[timeKey] === formatTime(timestampDate)) return timestampDate;
  return timeInputToDate(row[timeKey]);
}

function addMinutes(date, minutes) {
  if (!date) return null;
  return new Date(date.getTime() + Number(minutes || 0) * 60 * 1000);
}

function minutesUntil(date) {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 60000);
}

function secondsUntil(date, now = Date.now()) {
  if (!date) return null;
  return Math.ceil((date.getTime() - now) / 1000);
}

function statusLabel(date, now = Date.now()) {
  if (!date) return "-";
  const diff = date.getTime() - now;
  if (Number.isNaN(diff)) return "-";
  if (Math.abs(diff) < 1000) return "지금";
  return `${formatElapsed(Math.abs(diff))} ${diff > 0 ? "남음" : "지남"}`;
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${pad(seconds)}초`;
}

function formatWorkDuration(startTimestamp, endTimestamp) {
  const start = Number(startTimestamp || 0);
  const end = Number(endTimestamp || Date.now());
  if (!start || !end || end < start) return "0시간 0분";
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}

function elapsedSince(timestamp, now = Date.now()) {
  if (!timestamp) return null;
  return formatElapsed(now - Number(timestamp));
}

function acknowledgedDate(row, taskKey) {
  const timestamp = row.acknowledged?.[taskKey];
  return timestamp ? timestampToDate(timestamp) : null;
}

function tableNameValue(table) {
  return table?.name || "테이블";
}

function compareTableNames(a, b) {
  return tableNameValue(a).localeCompare(tableNameValue(b), "ko-KR", { numeric: true, sensitivity: "base" });
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeDefaultTables() {
  const positions = [
    [8, 10],
    [38, 10],
    [68, 10],
    [8, 38],
    [38, 38],
    [68, 38],
    [18, 66],
    [58, 66],
  ];

  return Array.from({ length: 8 }, (_, index) => ({
    id: `table-${index + 1}`,
    name: `테이블 ${index + 1}`,
    x: positions[index][0],
    y: positions[index][1],
  }));
}

const defaultSettings = {
  appTitle: "Chilling Timer",
  flipMinutes: 4,
  finishCoalMinutes: 5,
  bowlHeatMinutes: 5,
  customerMaintenanceMinutes: 20,
  alarmEnabled: true,
  calculationMode: "start",
  timerSortMode: "time",
  layoutWidth: 100,
  layoutHeight: 140,
  alarmSteps: {
    flipThree: true,
    finishThree: true,
    served: true,
    maintenanceTime: true,
    extraCoalFlip: true,
    replaceCoal: true,
  },
};

const PRESET_TIMER_SETTING_KEYS = [
  "flipMinutes",
  "finishCoalMinutes",
  "bowlHeatMinutes",
  "customerMaintenanceMinutes",
  "calculationMode",
];

function pickPresetTimerSettings(source = defaultSettings) {
  return PRESET_TIMER_SETTING_KEYS.reduce((result, key) => {
    result[key] = source?.[key] ?? defaultSettings[key];
    return result;
  }, {});
}

function mergePresetTimerSettings(source = {}) {
  return {
    ...pickPresetTimerSettings(defaultSettings),
    ...pickPresetTimerSettings(source),
  };
}

function timerSettingsForRow(row, fallbackSettings = defaultSettings) {
  return mergePresetTimerSettings(row?.timerSettings || fallbackSettings);
}

function preparationMinutesForSettings(settings = defaultSettings) {
  const rowSettings = mergePresetTimerSettings(settings);
  return (
    Number(rowSettings.flipMinutes || 0) +
    Number(rowSettings.finishCoalMinutes || 0) +
    Number(rowSettings.bowlHeatMinutes || 0)
  );
}

function refillReminderTimeForRow(row, fallbackSettings = defaultSettings) {
  const startTimestamp = Number(row?.startTimestamp || row?.createdAt || Date.now());
  const preparationMinutes = preparationMinutesForSettings(timerSettingsForRow(row, fallbackSettings));
  const reminderOffsetMinutes = Math.max(0, 80 - preparationMinutes);
  return startTimestamp + reminderOffsetMinutes * 60 * 1000;
}

function presetSummary(preset) {
  const timerSettings = mergePresetTimerSettings(preset?.timerSettings);
  return `${preset?.tables?.length || 0}개 테이블 · 뒤집기 ${timerSettings.flipMinutes}분 · 굽기 ${timerSettings.finishCoalMinutes}분 · 히팅 ${timerSettings.bowlHeatMinutes}분 · 숯털기 ${timerSettings.customerMaintenanceMinutes}분`;
}

function createLayoutPreset(id, name, positions, options = {}) {
  return {
    id,
    name,
    locked: Boolean(options.locked),
    layoutWidth: options.layoutWidth || 100,
    layoutHeight: options.layoutHeight || 140,
    timerSettings: mergePresetTimerSettings(options.timerSettings),
    fixtures: options.fixtures || defaultFixtures,
    tables: positions.map(([x, y], index) => ({
      id: `${id}-table-${index + 1}`,
      name: `테이블 ${index + 1}`,
      x,
      y,
    })),
  };
}

function createDefaultLayoutPresets() {
  return [
    {
      id: "preset-seongsu",
      name: "칠링 성수점",
      locked: true,
      layoutWidth: 140,
      layoutHeight: 220,
      timerSettings: {
        flipMinutes: "4",
        finishCoalMinutes: "4",
        bowlHeatMinutes: "6",
        customerMaintenanceMinutes: 20,
        calculationMode: "start",
      },
      fixtures: [
        {
          id: "entrance",
          name: "입구",
          x: 5.945368994915993,
          y: 107.98778115549396,
          type: "entrance",
        },
        {
          id: "bar",
          name: "바 / 준비공간",
          x: 42.65288420526246,
          y: 177.86169876590853,
          type: "bar",
        },
      ],
      tables: [
        {
          id: "table-1",
          name: "테이블 1",
          x: 5.143770253906155,
          y: 9.650052962764615,
        },
        {
          id: "table-2",
          name: "테이블 2",
          x: 5.693372407132317,
          y: 45.40639865013861,
        },
        {
          id: "1779296200028-a8f4cbb6a101b8",
          name: "테이블 3",
          x: 6.271897506042464,
          y: 71.16916250413463,
        },
        {
          id: "1779296200402-d60b3d132a43a8",
          name: "테이블 4",
          x: 82.55675040323963,
          y: 8.73972837386593,
        },
        {
          id: "1779296200570-d57e0e7b8b56a",
          name: "테이블 5",
          x: 83.65017159133807,
          y: 46.221153505386845,
        },
        {
          id: "1779296214462-735a9eadcdf5a",
          name: "테이블 6",
          x: 8.042525481313703,
          y: 126.29801596364669,
        },
        {
          id: "1779296218429-d8bdb5a8e6296",
          name: "테이블 7",
          x: 41.89790143793542,
          y: 126.28084687263734,
        },
        {
          id: "1779296218992-48dd6098a2cd7",
          name: "테이블 8",
          x: 70.3671968839013,
          y: 125.33988755749118,
        },
        {
          id: "1779296219209-5693c7e190c94",
          name: "테이블 9",
          x: 103.57463022066646,
          y: 126.4376698155557,
        },
        {
          id: "1779296250319-16d8323f6e80e8",
          name: "간이 테이블",
          x: 48.417898692474004,
          y: 83.71973148469002,
        },
      ],
    },
    {
          "id": "preset-undercity",
          "name": "언더시티",
          "locked": true,
          "layoutWidth": 180,
          "layoutHeight": 240,
          "timerSettings": {
                "flipMinutes": "7",
                "finishCoalMinutes": "3",
                "bowlHeatMinutes": "6.5",
                "customerMaintenanceMinutes": 20,
                "calculationMode": "start"
          },
          "fixtures": [
                {
                      "id": "undercity-entrance",
                      "name": "입구",
                      "x": 7.918814990219293,
                      "y": 140.1232654202369,
                      "type": "entrance"
                },
                {
                      "id": "undercity-bar",
                      "name": "바 / 준비공간",
                      "x": 85.49923151593593,
                      "y": 209.63394361926663,
                      "type": "bar"
                }
          ],
          "tables": [
                {
                      "id": "preset-undercity-table-1",
                      "name": "테이블 1",
                      "x": 11.427241105440427,
                      "y": 3.082960559475806
                },
                {
                      "id": "preset-undercity-table-2",
                      "name": "테이블 2",
                      "x": 11.791709932196909,
                      "y": 30.37068422379032
                },
                {
                      "id": "preset-undercity-table-3",
                      "name": "테이블 3",
                      "x": 14.238877939727317,
                      "y": 60.224672379032256
                },
                {
                      "id": "preset-undercity-table-4",
                      "name": "테이블 4",
                      "x": 12.416520568898825,
                      "y": 85.54494550151209
                },
                {
                      "id": "preset-undercity-table-5",
                      "name": "테이블 5",
                      "x": 2,
                      "y": 178.38077077557963
                },
                {
                      "id": "preset-undercity-table-6",
                      "name": "테이블 6",
                      "x": 47.50994175699725,
                      "y": 178.82144066595262
                },
                {
                      "id": "preset-undercity-table-7",
                      "name": "테이블 7",
                      "x": 92.18377211689781,
                      "y": 178.73588906565018
                },
                {
                      "id": "1779881241283-b624341210a9b",
                      "name": "테이블 8",
                      "x": 135.2435035519407,
                      "y": 178.5172759025328
                },
                {
                      "id": "1779881256023-0cb400a37e11d",
                      "name": "테이블 9",
                      "x": 109.78254842552691,
                      "y": 122.7157262986706
                }
          ]
    },
  ];
}

function cloneTablesForLayout(tables) {
  const source = Array.isArray(tables) && tables.length ? tables : makeDefaultTables();
  return source.map((table, index) => ({
    id: table.id || `table-${index + 1}`,
    name: table.name || `테이블 ${index + 1}`,
    x: typeof table.x === "number" ? table.x : 8,
    y: typeof table.y === "number" ? table.y : 10,
  }));
}

function cloneFixturesForLayout(fixtures) {
  const source = Array.isArray(fixtures) && fixtures.length ? fixtures : defaultFixtures;
  return source.map((fixture, index) => ({
    ...defaultFixtures[index % defaultFixtures.length],
    ...fixture,
    id: fixture.id || `fixture-${index + 1}`,
    x: typeof fixture.x === "number" ? fixture.x : 4,
    y: typeof fixture.y === "number" ? fixture.y : 4,
  }));
}

function normalizeLayoutPreset(preset, index = 0) {
  const fallbackId = `custom-preset-${index + 1}`;
  return {
    id: preset?.id || fallbackId,
    name: preset?.name || `프리셋 ${index + 1}`,
    locked: Boolean(preset?.locked),
    layoutWidth: Number(preset?.layoutWidth || 100),
    layoutHeight: Number(preset?.layoutHeight || 140),
    timerSettings: mergePresetTimerSettings(preset?.timerSettings),
    fixtures: cloneFixturesForLayout(preset?.fixtures),
    tables: cloneTablesForLayout(preset?.tables),
  };
}

function mergeLayoutPresets(savedPresets) {
  const builtIns = createDefaultLayoutPresets();
  if (!Array.isArray(savedPresets)) return builtIns;

  const savedById = new Map(savedPresets.filter(Boolean).map((preset) => [preset.id, preset]));
  const mergedBuiltIns = builtIns.map((preset, index) =>
    normalizeLayoutPreset(
      {
        ...preset,
        ...(savedById.get(preset.id) || {}),
        id: preset.id,
        locked: preset.locked,
      },
      index
    )
  );

  const customPresets = savedPresets
    .filter((preset) => preset && !builtIns.some((item) => item.id === preset.id))
    .map((preset, index) => normalizeLayoutPreset(preset, index));

  return [...mergedBuiltIns, ...customPresets];
}

function prepareStoredRows(storedRows, tables, fallbackSettings = defaultSettings) {
  if (!Array.isArray(storedRows)) return [];

  const tableIds = new Set((tables || []).map((table) => table.id));
  const fallbackTableId = tables?.[0]?.id || "table-1";

  return storedRows.map((row) => {
    const createdAt = Number(row.createdAt || Date.now());
    const startTime = row.startTime || nowTimeInput();
    const servedTime = row.servedTime || row.startTime || nowTimeInput();

    return {
      id: row.id || makeId(),
      tableId: tableIds.has(row.tableId) ? row.tableId : fallbackTableId,
      label: row.label || "",
      startTime,
      servedTime,
      startTimestamp: timestampForTimeValue(startTime, row.startTimestamp, createdAt),
      servedTimestamp: timestampForTimeValue(servedTime, row.servedTimestamp, createdAt),
      servedTimeEdited: Boolean(row.servedTimeEdited),
      completed: Boolean(row.completed),
      createdAt,
      alarmed: row.alarmed || {},
      alarmedAt: row.alarmedAt || {},
      alarmRepeatAt: row.alarmRepeatAt || {},
      urgentAlarmed: row.urgentAlarmed || {},
      coverAlarmed: row.coverAlarmed || {},
      acknowledged: row.acknowledged || {},
      timeAdjustments: row.timeAdjustments || {},
      confirmationHistory: row.confirmationHistory || {},
      timerSettings: timerSettingsForRow(row, fallbackSettings),
    };
  });
}

function prepareStoredRefillReminders(storedReminders, tables) {
  if (!Array.isArray(storedReminders)) return [];

  const tableIds = new Set((tables || []).map((table) => table.id));
  return storedReminders
    .filter((reminder) => reminder && tableIds.has(reminder.tableId) && !reminder.dismissed)
    .map((reminder) => ({
      id: reminder.id || makeId(),
      rowId: reminder.rowId || "",
      tableId: reminder.tableId,
      targetTimestamp: Number(reminder.targetTimestamp || Date.now()),
      createdAt: Number(reminder.createdAt || Date.now()),
      shownAt: reminder.shownAt ? Number(reminder.shownAt) : null,
      dismissed: false,
    }));
}

function createRow(tableId, label = "", timerSettings = defaultSettings) {
  const createdAt = Date.now();
  const time = formatTime(new Date(createdAt));

  return {
    id: makeId(),
    tableId,
    label,
    startTime: time,
    servedTime: time,
    startTimestamp: createdAt,
    servedTimestamp: createdAt,
    servedTimeEdited: false,
    completed: false,
    createdAt,
    alarmed: {},
    alarmedAt: {},
    alarmRepeatAt: {},
    urgentAlarmed: {},
    coverAlarmed: {},
    acknowledged: {},
    timeAdjustments: {},
    confirmationHistory: {},
    timerSettings: timerSettingsForRow(null, timerSettings),
  };
}

function computeSchedule(row, settings) {
  const rowSettings = timerSettingsForRow(row, settings);
  const a = Number(rowSettings.flipMinutes || 0);
  const b = Number(rowSettings.finishCoalMinutes || 0);
  const c = Number(rowSettings.bowlHeatMinutes || 0);
  const maintenance = Number(rowSettings.customerMaintenanceMinutes || 20);
  const adjustment = row.timeAdjustments || {};
  const adjusted = (key) => Number(adjustment[key] || 0);
  const acknowledged = (key) => acknowledgedDate(row, key);
  const actualOrScheduled = (key, scheduledDate) => {
    const acknowledgedAt = acknowledged(key);
    return acknowledgedAt || scheduledDate;
  };

  if (rowSettings.calculationMode === "served") {
    const served = addMinutes(rowTimeDate(row, "servedTime", "servedTimestamp"), adjusted("served"));
    const maintenanceTime = actualOrScheduled("maintenanceTime", addMinutes(served, maintenance + adjusted("maintenanceTime")));
    const extraCoalFlip = actualOrScheduled("extraCoalFlip", addMinutes(maintenanceTime, a + adjusted("extraCoalFlip")));
    const replaceCoal = actualOrScheduled("replaceCoal", addMinutes(extraCoalFlip, b + adjusted("replaceCoal")));

    return {
      base: served,
      flipThree: null,
      finishThree: null,
      served,
      maintenanceTime,
      extraCoalFlip,
      replaceCoal,
      doneTime: replaceCoal,
    };
  }

  const start = rowTimeDate(row, "startTime", "startTimestamp");
  const flipThree = actualOrScheduled("flipThree", addMinutes(start, a + adjusted("flipThree")));
  const finishThree = actualOrScheduled("finishThree", addMinutes(flipThree, b + adjusted("finishThree")));
  const calculatedServed = addMinutes(finishThree, c + adjusted("served"));
  const editedServed = row.servedTimeEdited ? addMinutes(rowTimeDate(row, "servedTime", "servedTimestamp"), adjusted("served")) : null;
  const served = actualOrScheduled("served", editedServed || calculatedServed);
  const maintenanceTime = actualOrScheduled("maintenanceTime", addMinutes(served, maintenance + adjusted("maintenanceTime")));
  const extraCoalFlip = actualOrScheduled("extraCoalFlip", addMinutes(maintenanceTime, a + adjusted("extraCoalFlip")));
  const replaceCoal = actualOrScheduled("replaceCoal", addMinutes(extraCoalFlip, b + adjusted("replaceCoal")));

  return {
    base: start,
    flipThree,
    finishThree,
    served,
    maintenanceTime,
    extraCoalFlip,
    replaceCoal,
    doneTime: replaceCoal,
  };
}

function getNextTask(row, schedule, settings) {
  if (row.completed) return { key: "completed", label: "완료", time: null };

  const rowSettings = timerSettingsForRow(row, settings);
  const tasks = getTaskList(schedule, rowSettings).filter((task) => task.time);
  const next = tasks.find((task) => !row.acknowledged?.[task.key]);
  return next || { key: "allDone", label: "모든 단계 확인됨", time: null };
}

function getTaskList(schedule, settings) {
  const tasks = [];

  if (settings.calculationMode === "start") {
    tasks.push(
      { key: "flipThree", label: "숯 뒤집기", time: schedule.flipThree },
      { key: "finishThree", label: "시샤 히팅 시작", time: schedule.finishThree },
      { key: "served", label: "후카 나감", time: schedule.served }
    );
  }

  tasks.push(
    { key: "maintenanceTime", label: "숯 털기/1개 올림", time: schedule.maintenanceTime },
    { key: "extraCoalFlip", label: "숯 1개 뒤집기", time: schedule.extraCoalFlip },
    { key: "replaceCoal", label: "숯 1개 교체", time: schedule.replaceCoal, important: true }
  );

  return tasks;
}


function getLastAcknowledgedTask(row, schedule, settings) {
  const rowSettings = timerSettingsForRow(row, settings);
  const tasks = getTaskList(schedule, rowSettings).filter((task) => row.acknowledged?.[task.key]);
  return tasks[tasks.length - 1] || null;
}

function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    [0, 0.85, 1.7].forEach((delay) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const startAt = audioContext.currentTime + delay;
      const endAt = startAt + 0.55;

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 880;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.4, startAt + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endAt);

      oscillator.start(startAt);
      oscillator.stop(endAt + 0.03);
    });
  } catch (error) {
    console.warn("Audio alarm failed", error);
  }
}

function playDingDong() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const tones = [
      { frequency: 1046.5, delay: 0, duration: 0.16 },
      { frequency: 659.25, delay: 0.18, duration: 0.24 },
    ];

    tones.forEach(({ frequency, delay, duration }) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const startAt = audioContext.currentTime + delay;
      const endAt = startAt + duration;

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endAt);

      oscillator.start(startAt);
      oscillator.stop(endAt + 0.03);
    });
  } catch (error) {
    console.warn("Urgent audio alarm failed", error);
  }
}

function playLowHighDingDong() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const tones = [
      { frequency: 523.25, delay: 0, duration: 0.18 },
      { frequency: 880, delay: 0.2, duration: 0.26 },
    ];

    tones.forEach(({ frequency, delay, duration }) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const startAt = audioContext.currentTime + delay;
      const endAt = startAt + duration;

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.24, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endAt);

      oscillator.start(startAt);
      oscillator.stop(endAt + 0.03);
    });
  } catch (error) {
    console.warn("Coal lid audio alarm failed", error);
  }
}

async function getNotificationRegistration() {
  if (!("serviceWorker" in navigator)) return null;

  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;

  return navigator.serviceWorker.register("/sw.js");
}

async function requestSystemNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

async function showSystemNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;

  const notificationOptions = {
    badge: "/icon-192.png",
    icon: "/icon-192.png",
    requireInteraction: true,
    renotify: true,
    vibrate: [180, 80, 180],
    silent: false,
    ...options,
  };

  try {
    const registration = await getNotificationRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, notificationOptions);
      return true;
    }
  } catch (error) {
    console.warn("Service worker notification failed", error);
  }

  try {
    new Notification(title, notificationOptions);
    return true;
  } catch (error) {
    console.warn("System notification failed", error);
    return false;
  }
}


class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "알 수 없는 오류" };
  }

  componentDidCatch(error, info) {
    console.error("App render failed", error, info);
  }

  resetApp = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to clear storage", error);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#0B0708] p-4 text-red-50">
        <div className="mx-auto mt-10 max-w-md rounded-3xl border border-red-900/70 bg-[#120B0C] p-5 shadow-2xl shadow-red-950/50">
          <div className="text-xl font-black">앱 화면 오류가 발생했습니다</div>
          <p className="mt-2 text-sm leading-6 text-red-100/70">검정 화면 대신 이 메시지가 보이면 앱 데이터나 브라우저 캐시가 꼬인 상태일 수 있습니다.</p>
          <p className="mt-2 rounded-2xl bg-black/40 p-3 text-xs text-red-100/50">{this.state.message}</p>
          <button onClick={this.resetApp} className="mt-4 w-full rounded-2xl border border-red-700/70 bg-red-900 px-4 py-3 font-bold text-white">저장값 초기화 후 다시 열기</button>
        </div>
      </div>
    );
  }
}

function HookahTimerAppInner() {
  const defaultPreset = useMemo(() => {
    const presets = createDefaultLayoutPresets();
    return presets.find((preset) => preset.id === DEFAULT_SELECTED_PRESET_ID) || presets[0];
  }, []);
  const defaultTables = useMemo(() => cloneTablesForLayout(defaultPreset?.tables), [defaultPreset]);
  const defaultPresetFixtures = useMemo(() => cloneFixturesForLayout(defaultPreset?.fixtures), [defaultPreset]);
  const defaultAppSettings = useMemo(
    () => ({
      ...defaultSettings,
      ...mergePresetTimerSettings(defaultPreset?.timerSettings),
      layoutWidth: Number(defaultPreset?.layoutWidth || defaultSettings.layoutWidth),
      layoutHeight: Number(defaultPreset?.layoutHeight || defaultSettings.layoutHeight),
    }),
    [defaultPreset]
  );
  const [settings, setSettings] = useState(defaultAppSettings);
  const [tables, setTables] = useState(defaultTables);
  const [fixtures, setFixtures] = useState(defaultPresetFixtures);
  const [rows, setRows] = useState([]);
  const [refillReminders, setRefillReminders] = useState([]);
  const [adminMode, setAdminMode] = useState(false);
  const [adminPin, setAdminPin] = useState(DEFAULT_ADMIN_PIN);
  const [showAdminPinPrompt, setShowAdminPinPrompt] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [shift, setShift] = useState(() => normalizeShift(null));
  const [selectedTableId, setSelectedTableId] = useState(() => defaultTables[0]?.id || "table-1");
  const [selectedLayoutTarget, setSelectedLayoutTarget] = useState(() => ({ type: "table", id: defaultTables[0]?.id || "table-1" }));
  const [tick, setTick] = useState(Date.now());
  const [currentAlarm, setCurrentAlarm] = useState(null);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState("menu");
  const [showTableSettings, setShowTableSettings] = useState(false);
  const [timerMoveMode, setTimerMoveMode] = useState(false);
  const [timerMoveSourceTableId, setTimerMoveSourceTableId] = useState(null);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [tableEditMode, setTableEditMode] = useState(false);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [showTimerHelp, setShowTimerHelp] = useState(false);
  const [showClosingSummary, setShowClosingSummary] = useState(false);
  const [closingSummaryEndedAt, setClosingSummaryEndedAt] = useState(null);
  const [showScoreSummary, setShowScoreSummary] = useState(false);
  const [showClosingSmoke, setShowClosingSmoke] = useState(false);
  const [popupTableId, setPopupTableId] = useState(null);
  const [openSettingHelp, setOpenSettingHelp] = useState(null);
  const [startTimeEditor, setStartTimeEditor] = useState(null);
  const [layoutPresets, setLayoutPresets] = useState(() => createDefaultLayoutPresets());
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_SELECTED_PRESET_ID);
  const [storageReady, setStorageReady] = useState(false);
  const layoutBoardRef = useRef(null);
  const dragTargetRef = useRef(null);
  const timerCardRefs = useRef({});
  const presetImportInputRef = useRef(null);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data) {
        const loadedTables = data.tables?.length
          ? data.tables.map((table, index) => ({
              ...table,
              x: typeof table.x === "number" ? table.x : defaultTables[index % defaultTables.length]?.x ?? 8,
              y: typeof table.y === "number" ? table.y : defaultTables[index % defaultTables.length]?.y ?? 10,
            }))
          : defaultTables;
        const loadedFixtures = data.fixtures?.length
          ? data.fixtures.map((fixture, index) => ({
              ...defaultPresetFixtures[index % defaultPresetFixtures.length],
              ...fixture,
              x: typeof fixture.x === "number" ? fixture.x : defaultPresetFixtures[index % defaultPresetFixtures.length]?.x ?? 4,
              y: typeof fixture.y === "number" ? fixture.y : defaultPresetFixtures[index % defaultPresetFixtures.length]?.y ?? 4,
            }))
          : defaultPresetFixtures;
        const nextSelectedTableId = data.selectedTableId || loadedTables[0]?.id || "table-1";
        const loadedPresets = mergeLayoutPresets(data.layoutPresets);
        const loadedSettings = { ...defaultAppSettings, ...(data.settings || {}) };
        setTables(loadedTables);
        setFixtures(loadedFixtures);
        setSettings(loadedSettings);
        setSelectedTableId(nextSelectedTableId);
        setSelectedLayoutTarget(data.selectedLayoutTarget || { type: "table", id: nextSelectedTableId });
        setLayoutPresets(loadedPresets);
        setSelectedPresetId(
          loadedPresets.some((preset) => preset.id === data.selectedPresetId)
            ? data.selectedPresetId
            : loadedPresets[0]?.id || DEFAULT_SELECTED_PRESET_ID
        );
        setRows(prepareStoredRows(data.rows, loadedTables, loadedSettings));
        setRefillReminders(prepareStoredRefillReminders(data.refillReminders, loadedTables));
        setAdminMode(false);
        setAdminPin(String(data.adminPin || DEFAULT_ADMIN_PIN));
        setShift(normalizeShift(data.shift));
      }
    } catch (error) {
      console.warn("Failed to load saved data", error);
    } finally {
      setStorageReady(true);
    }
  }, [defaultTables, defaultPresetFixtures, defaultAppSettings]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, tables, fixtures, rows, refillReminders, adminPin, shift, selectedTableId, selectedLayoutTarget, layoutPresets, selectedPresetId }));
    } catch (error) {
      console.warn("Failed to save data", error);
    }
  }, [storageReady, settings, tables, fixtures, rows, refillReminders, adminPin, shift, selectedTableId, selectedLayoutTarget, layoutPresets, selectedPresetId]);

  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (adminMode) return;
    setShowTableSettings(false);
    setLayoutEditMode(false);
    setTableEditMode(false);
    setShowPresetPicker(false);
    setSettingsPanel((panel) => (panel === "preset" || panel === "alarm" ? "menu" : panel));
  }, [adminMode]);

  useEffect(() => {
    if (!settings.alarmEnabled) return;

    rows.forEach((row) => {
      if (row.completed) return;
      const schedule = computeSchedule(row, settings);
      const tableName = tables.find((table) => table.id === row.tableId)?.name || "테이블";
      const nextTask = getNextTask(row, schedule, settings);
      const time = nextTask.time;
      if (!time || Number.isNaN(time.getTime())) return;
      const alarmStepEnabled = settings.alarmSteps?.[nextTask.key] ?? true;
      if (!alarmStepEnabled) return;

      const now = Date.now();
      const diff = time.getTime() - now;
      const alreadyCoverAlarmed = row.coverAlarmed?.[nextTask.key];
      if (
        nextTask.key === COAL_LID_OPEN_TASK_KEY &&
        !alreadyCoverAlarmed &&
        diff > 60_000 &&
        diff <= COAL_LID_OPEN_ALARM_MS
      ) {
        playLowHighDingDong();
        setCurrentAlarm({
          id: `${row.id}-${COAL_LID_OPEN_LABEL}-${now}`,
          rowId: row.id,
          taskKey: nextTask.key,
          tableName,
          rowLabel: row.label || "후카",
          label: COAL_LID_OPEN_LABEL,
          time: formatDateTime(time),
          alarmedAt: now,
        });
        showSystemNotification(`${tableName} · ${COAL_LID_OPEN_LABEL}`, {
          body: `${row.label || "후카"} · ${nextTask.label}까지 10분 남았어요 · 예정 ${formatDateTime(time)}`,
          tag: `hookah-${row.id}-coal-lid-open`,
          data: { rowId: row.id, taskKey: nextTask.key, alarmType: "coal-lid-open" },
        });
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  coverAlarmed: { ...(r.coverAlarmed || {}), [nextTask.key]: true },
                }
              : r
          )
        );
        return;
      }

      const alreadyUrgentAlarmed = row.urgentAlarmed?.[nextTask.key];
      if (!alreadyUrgentAlarmed && diff > 0 && diff <= 60_000) {
        playDingDong();
        showSystemNotification(`${tableName} · 1분 남음`, {
          body: `${row.label || "후카"} · ${nextTask.label} · 예정 ${formatDateTime(time)}`,
          tag: `hookah-${row.id}-${nextTask.key}-urgent`,
          data: { rowId: row.id, taskKey: nextTask.key, alarmType: "urgent" },
        });
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  urgentAlarmed: { ...(r.urgentAlarmed || {}), [nextTask.key]: true },
                }
              : r
          )
        );
        return;
      }

      const alreadyAlarmed = row.alarmed?.[nextTask.key];
      const lastRepeatAt = Number(row.alarmRepeatAt?.[nextTask.key] || row.alarmedAt?.[nextTask.key] || 0);
      const shouldStartAlarm = !alreadyAlarmed && diff <= 0 && diff > -60_000;
      const shouldRepeatAlarm = alreadyAlarmed && diff <= 0 && (!lastRepeatAt || now - lastRepeatAt >= OVERDUE_ALARM_REPEAT_MS);

      if (shouldStartAlarm || shouldRepeatAlarm) {
        const alarmedAt = now;
        playBeep();
        setCurrentAlarm({
          id: `${row.id}-${nextTask.key}-${alarmedAt}`,
          rowId: row.id,
          taskKey: nextTask.key,
          tableName,
          rowLabel: row.label || "후카",
          label: nextTask.label,
          time: formatDateTime(time),
          alarmedAt,
        });
        showSystemNotification(`${tableName} · ${row.label || "후카"}`, {
          body: shouldRepeatAlarm
            ? `${nextTask.label} 확인이 아직 안 됐어요 · ${statusLabel(time, now)} · 예정 ${formatDateTime(time)}`
            : `${nextTask.label} 확인 필요 · 예정 ${formatDateTime(time)}`,
          tag: `hookah-${row.id}-${nextTask.key}`,
          data: { rowId: row.id, taskKey: nextTask.key },
        });

        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  alarmed: { ...(r.alarmed || {}), [nextTask.key]: true },
                  alarmedAt: { ...(r.alarmedAt || {}), [nextTask.key]: shouldStartAlarm ? alarmedAt : r.alarmedAt?.[nextTask.key] || alarmedAt },
                  alarmRepeatAt: { ...(r.alarmRepeatAt || {}), [nextTask.key]: alarmedAt },
                }
              : r
          )
        );
      }
    });
  }, [tick, rows, settings, tables]);

  const selectedTable = useMemo(() => tables.find((table) => table.id === selectedTableId) || tables[0], [tables, selectedTableId]);
  const selectedRows = useMemo(() => rows.filter((row) => row.tableId === selectedTableId), [rows, selectedTableId]);

  const timerItems = useMemo(() => {
    return rows.map((row) => {
      const schedule = computeSchedule(row, settings);
      const nextTask = getNextTask(row, schedule, settings);
      const table = tables.find((t) => t.id === row.tableId);
      return { row, schedule, nextTask, table };
    });
  }, [rows, settings, tables, tick]);

  const sortedTimerItems = useMemo(() => {
    return [...timerItems].sort((a, b) => {
      if (a.row.completed !== b.row.completed) return a.row.completed ? 1 : -1;

      if (settings.timerSortMode === "table") {
        const tableCompare = compareTableNames(a.table, b.table);
        if (tableCompare !== 0) return tableCompare;
      }

      const aTime = a.nextTask.time?.getTime?.() || Number.MAX_SAFE_INTEGER;
      const bTime = b.nextTask.time?.getTime?.() || Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return compareTableNames(a.table, b.table);
    });
  }, [timerItems, settings.timerSortMode]);

  const allRowsSorted = useMemo(() => sortedTimerItems.map((item) => item.row), [sortedTimerItems]);
  const activeRows = useMemo(() => rows.filter((row) => !row.completed), [rows]);
  const shiftActive = Boolean(shift.active && shift.startedAt);
  const operationPeriodStart = useMemo(() => Number(shift.startedAt || startOfTodayTimestamp(tick)), [shift.startedAt, tick]);
  const scoreRecords = useMemo(() => collectConfirmationRecords(rows, tables, operationPeriodStart), [rows, tables, operationPeriodStart]);
  const scoreStats = useMemo(() => scoreStatsFromRecords(scoreRecords), [scoreRecords]);
  const operationReport = useMemo(
    () => createOperationReport(rows, tables, scoreRecords, operationPeriodStart, tick),
    [rows, tables, scoreRecords, operationPeriodStart, tick]
  );
  const closingSummaryCount = operationReport.hookahCount;
  const closingSummaryMessage = useMemo(() => operationMessageFromCount(closingSummaryCount), [closingSummaryCount]);

  const upcomingTasks = useMemo(() => {
    return sortedTimerItems.filter((item) => !item.row.completed && item.nextTask.time);
  }, [sortedTimerItems]);

  const popupTimerItems = useMemo(() => {
    if (!popupTableId) return [];
    return upcomingTasks.filter((item) => item.row.tableId === popupTableId);
  }, [popupTableId, upcomingTasks]);

  const popupTable = useMemo(
    () => tables.find((table) => table.id === popupTableId) || null,
    [tables, popupTableId]
  );

  const timerMoveSourceTable = useMemo(
    () => tables.find((table) => table.id === timerMoveSourceTableId) || null,
    [tables, timerMoveSourceTableId]
  );

  const timerMoveSourceCount = useMemo(
    () => rows.filter((row) => row.tableId === timerMoveSourceTableId && !row.completed).length,
    [rows, timerMoveSourceTableId]
  );

  const dueRefillReminders = useMemo(() => {
    const activeTableIds = new Set(rows.filter((row) => !row.completed).map((row) => row.tableId));
    return refillReminders.filter(
      (reminder) =>
        !reminder.dismissed &&
        Number(reminder.targetTimestamp || 0) <= tick &&
        !activeTableIds.has(reminder.tableId)
    );
  }, [refillReminders, rows, tick]);

  const startTimeEditorRow = useMemo(
    () => rows.find((row) => row.id === startTimeEditor?.rowId) || null,
    [rows, startTimeEditor?.rowId]
  );
  const startTimeEditorDate = useMemo(
    () => timestampToDate(startTimeEditor?.draftTimestamp),
    [startTimeEditor?.draftTimestamp]
  );
  const startTimeEditorOriginalDate = useMemo(
    () => (startTimeEditorRow ? rowTimeDate(startTimeEditorRow, "startTime", "startTimestamp") : null),
    [startTimeEditorRow]
  );

  const screenAlarmActive = useMemo(
    () => upcomingTasks.some((item) => secondsUntil(item.nextTask.time, tick) !== null && secondsUntil(item.nextTask.time, tick) <= 0),
    [upcomingTasks, tick]
  );

  useEffect(() => {
    if (popupTableId && popupTimerItems.length === 0) setPopupTableId(null);
  }, [popupTableId, popupTimerItems.length]);

  useEffect(() => {
    if (!timerMoveSourceTableId) return;
    const sourceExists = tables.some((table) => table.id === timerMoveSourceTableId);
    const sourceHasActiveTimer = rows.some((row) => row.tableId === timerMoveSourceTableId && !row.completed);
    if (!sourceExists || !sourceHasActiveTimer) setTimerMoveSourceTableId(null);
  }, [timerMoveSourceTableId, tables, rows]);

  const selectedPreset = useMemo(
    () => layoutPresets.find((preset) => preset.id === selectedPresetId) || layoutPresets[0],
    [layoutPresets, selectedPresetId]
  );

  useEffect(() => {
    if (!storageReady || !selectedPresetId) return;

    const nextTimerSettings = pickPresetTimerSettings(settings);
    const nextLayoutWidth = Number(settings.layoutWidth || 100);
    const nextLayoutHeight = Number(settings.layoutHeight || 140);
    const nextFixtures = cloneFixturesForLayout(fixtures);
    const nextTables = cloneTablesForLayout(tables);

    setLayoutPresets((prev) =>
      prev.map((preset) => {
        if (preset.id !== selectedPresetId) return preset;
        const nextPreset = {
          ...preset,
          layoutWidth: nextLayoutWidth,
          layoutHeight: nextLayoutHeight,
          timerSettings: nextTimerSettings,
          fixtures: nextFixtures,
          tables: nextTables,
        };
        return JSON.stringify(nextPreset) === JSON.stringify(preset) ? preset : nextPreset;
      })
    );
  }, [
    storageReady,
    selectedPresetId,
    tables,
    fixtures,
    settings.flipMinutes,
    settings.finishCoalMinutes,
    settings.bowlHeatMinutes,
    settings.customerMaintenanceMinutes,
    settings.calculationMode,
    settings.layoutWidth,
    settings.layoutHeight,
  ]);

  function tableSummary(tableId) {
    const tableRows = rows.filter((row) => row.tableId === tableId && !row.completed);
    const refillReminder = dueRefillReminders.find((reminder) => reminder.tableId === tableId) || null;
    if (!tableRows.length) {
      return { count: 0, next: null, critical: false, soon: false, overdue: false, refillDue: Boolean(refillReminder), refillReminder };
    }

    const nextItems = tableRows
      .map((row) => {
        const schedule = computeSchedule(row, settings);
        const nextTask = getNextTask(row, schedule, settings);
        return { row, nextTask };
      })
      .filter((item) => item.nextTask.time)
      .sort((a, b) => a.nextTask.time.getTime() - b.nextTask.time.getTime());

    const next = nextItems[0] || null;
    const nextSeconds = secondsUntil(next?.nextTask?.time, tick);
    const overdue = nextSeconds !== null && nextSeconds <= 0;
    const critical = nextSeconds !== null && nextSeconds > 0 && nextSeconds <= 60;
    const soon = nextSeconds !== null && nextSeconds > 0 && nextSeconds <= 60;
    const coverDue = isCoalLidOpenWindow(next?.nextTask?.key, nextSeconds);

    return { count: tableRows.length, next, critical, soon, overdue, coverDue, nextSeconds, refillDue: false, refillReminder: null };
  }

  function updateRow(id, patch) {
    const timingChanged = ["startTime", "servedTime", "servedTimeEdited"].some((key) =>
      Object.prototype.hasOwnProperty.call(patch, key)
    );
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              ...(timingChanged ? { alarmed: {}, alarmedAt: {}, alarmRepeatAt: {}, urgentAlarmed: {}, coverAlarmed: {}, acknowledged: {}, timeAdjustments: {}, confirmationHistory: {} } : {}),
            }
          : row
      )
    );
  }

  function updateRowTime(id, timeKey, value, extraPatch = {}) {
    const timestampKey = timeKey === "startTime" ? "startTimestamp" : "servedTimestamp";
    updateRow(id, {
      [timeKey]: value,
      [timestampKey]: timestampForTimeValue(value, null),
      ...extraPatch,
    });
  }

  function openStartTimeEditor(row) {
    const baseDate = rowTimeDate(row, "startTime", "startTimestamp") || timestampToDate(row.startTimestamp) || new Date();
    setStartTimeEditor({ rowId: row.id, draftTimestamp: baseDate.getTime() });
  }

  function adjustStartTimeDraft(minutes) {
    setStartTimeEditor((prev) => {
      if (!prev) return prev;
      const baseTimestamp = Number(prev.draftTimestamp || Date.now());
      return { ...prev, draftTimestamp: baseTimestamp + minutes * 60 * 1000 };
    });
  }

  function applyStartTimeDraft() {
    if (!startTimeEditor?.rowId || !startTimeEditorDate) return;

    updateRow(startTimeEditor.rowId, {
      startTime: formatTime(startTimeEditorDate),
      startTimestamp: startTimeEditorDate.getTime(),
    });
    setStartTimeEditor(null);
  }

  function clearTaskStateFrom(row, taskKey) {
    const startIndex = TASK_ORDER.indexOf(taskKey);
    if (startIndex < 0) {
      return {
        alarmed: row.alarmed || {},
        alarmedAt: row.alarmedAt || {},
        alarmRepeatAt: row.alarmRepeatAt || {},
        urgentAlarmed: row.urgentAlarmed || {},
        coverAlarmed: row.coverAlarmed || {},
        acknowledged: row.acknowledged || {},
        confirmationHistory: row.confirmationHistory || {},
      };
    }

    const nextAlarmed = { ...(row.alarmed || {}) };
    const nextAlarmedAt = { ...(row.alarmedAt || {}) };
    const nextAlarmRepeatAt = { ...(row.alarmRepeatAt || {}) };
    const nextUrgentAlarmed = { ...(row.urgentAlarmed || {}) };
    const nextCoverAlarmed = { ...(row.coverAlarmed || {}) };
    const nextAcknowledged = { ...(row.acknowledged || {}) };
    const nextConfirmationHistory = { ...(row.confirmationHistory || {}) };

    TASK_ORDER.slice(startIndex).forEach((key) => {
      delete nextAlarmed[key];
      delete nextAlarmedAt[key];
      delete nextAlarmRepeatAt[key];
      delete nextUrgentAlarmed[key];
      delete nextCoverAlarmed[key];
      delete nextAcknowledged[key];
      delete nextConfirmationHistory[key];
    });

    return { alarmed: nextAlarmed, alarmedAt: nextAlarmedAt, alarmRepeatAt: nextAlarmRepeatAt, urgentAlarmed: nextUrgentAlarmed, coverAlarmed: nextCoverAlarmed, acknowledged: nextAcknowledged, confirmationHistory: nextConfirmationHistory };
  }

  function adjustTaskTime(rowId, taskKey, minutes) {
    if (!taskKey) return;
    const startIndex = TASK_ORDER.indexOf(taskKey);

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const taskState = clearTaskStateFrom(row, taskKey);
        return {
          ...row,
          ...taskState,
          timeAdjustments: {
            ...(row.timeAdjustments || {}),
            [taskKey]: Number(row.timeAdjustments?.[taskKey] || 0) + minutes,
          },
        };
      })
    );
    setCurrentAlarm((prev) =>
      prev?.rowId === rowId && TASK_ORDER.indexOf(prev.taskKey) >= startIndex ? null : prev
    );
  }

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function selectUpcomingTimer(row) {
    setSelectedTableId(row.tableId);
    setSelectedLayoutTarget({ type: "table", id: row.tableId });

    window.requestAnimationFrame(() => {
      timerCardRefs.current[row.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function createRefillReminderForRow(row) {
    if (!row?.tableId) return;

    const targetTimestamp = refillReminderTimeForRow(row, settings);
    setRefillReminders((prev) => {
      const withoutSameRow = prev.filter((reminder) => reminder.rowId !== row.id);
      return [
        ...withoutSameRow,
        {
          id: `refill-${row.id}-${targetTimestamp}`,
          rowId: row.id,
          tableId: row.tableId,
          targetTimestamp,
          createdAt: Date.now(),
          shownAt: null,
          dismissed: false,
        },
      ];
    });
  }

  function acknowledgeTask(rowId, taskKey) {
    if (!taskKey) return;
    const acknowledgedAt = Date.now();
    const isFinalTask = taskKey === TASK_ORDER[TASK_ORDER.length - 1];
    const rowForReminder = rows.find((row) => row.id === rowId);
    let completedRowForReminder = null;

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const rowSettings = timerSettingsForRow(row, settings);
        const schedule = computeSchedule(row, settings);
        const taskInfo = getTaskList(schedule, rowSettings).find((task) => task.key === taskKey);
        const scheduledTimestamp = taskInfo?.time?.getTime?.() || acknowledgedAt;
        const delaySeconds = Math.max(0, Math.floor((acknowledgedAt - scheduledTimestamp) / 1000));
        const score = scoreFromDelaySeconds(delaySeconds);
        const historyRecord = {
          id: `${row.id}-${taskKey}-${acknowledgedAt}`,
          taskKey,
          taskLabel: taskInfo?.label || TASK_LABELS[taskKey] || taskKey,
          scheduledTimestamp,
          acknowledgedAt,
          delaySeconds,
          score,
        };
        const previousHistory = normalizeHistoryRecords(row.confirmationHistory?.[taskKey]);
        const nextAcknowledged = { ...(row.acknowledged || {}), [taskKey]: acknowledgedAt };
        const nextRow = {
          ...row,
          acknowledged: nextAcknowledged,
          confirmationHistory: {
            ...(row.confirmationHistory || {}),
            [taskKey]: [...previousHistory, historyRecord],
          },
          completed: isFinalTask ? true : row.completed,
        };

        if (isFinalTask && rowForReminder?.id === row.id) completedRowForReminder = nextRow;
        return nextRow;
      })
    );

    if (completedRowForReminder) createRefillReminderForRow(completedRowForReminder);
    setCurrentAlarm((prev) => (prev?.rowId === rowId && prev?.taskKey === taskKey ? null : prev));
  }

  function dismissRefillRemindersForTable(tableId) {
    setRefillReminders((prev) => prev.filter((reminder) => reminder.tableId !== tableId));
  }

  function handleRefillReminderClick(event, tableId) {
    event.preventDefault();
    event.stopPropagation();
    dismissRefillRemindersForTable(tableId);
    addRow(tableId);
  }

  function restartCurrentTask(rowId, taskKey) {
    const startIndex = TASK_ORDER.indexOf(taskKey);
    if (startIndex < 0) return;

    const restartedAt = Date.now();
    const restartedTime = formatTime(new Date(restartedAt));

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const nextAlarmed = { ...(row.alarmed || {}) };
        const nextAlarmedAt = { ...(row.alarmedAt || {}) };
        const nextAlarmRepeatAt = { ...(row.alarmRepeatAt || {}) };
        const nextUrgentAlarmed = { ...(row.urgentAlarmed || {}) };
        const nextCoverAlarmed = { ...(row.coverAlarmed || {}) };
        const nextAcknowledged = { ...(row.acknowledged || {}) };
        const nextConfirmationHistory = { ...(row.confirmationHistory || {}) };

        TASK_ORDER.slice(startIndex).forEach((key) => {
          delete nextAlarmed[key];
          delete nextAlarmedAt[key];
          delete nextAlarmRepeatAt[key];
          delete nextUrgentAlarmed[key];
          delete nextCoverAlarmed[key];
          delete nextAcknowledged[key];
          delete nextConfirmationHistory[key];
        });

        const basePatch = {
          completed: false,
          alarmed: nextAlarmed,
          alarmedAt: nextAlarmedAt,
          alarmRepeatAt: nextAlarmRepeatAt,
          urgentAlarmed: nextUrgentAlarmed,
          coverAlarmed: nextCoverAlarmed,
          acknowledged: nextAcknowledged,
          confirmationHistory: nextConfirmationHistory,
        };

        if (taskKey === "flipThree") {
          return {
            ...row,
            ...basePatch,
            startTime: restartedTime,
            startTimestamp: restartedAt,
          };
        }

        if (taskKey === "finishThree") {
          nextAcknowledged.flipThree = restartedAt;
        } else if (taskKey === "served") {
          nextAcknowledged.finishThree = restartedAt;
        } else if (taskKey === "maintenanceTime") {
          if (timerSettingsForRow(row, settings).calculationMode === "served") {
            return {
              ...row,
              ...basePatch,
              servedTime: restartedTime,
              servedTimestamp: restartedAt,
              servedTimeEdited: true,
            };
          }
          nextAcknowledged.served = restartedAt;
        } else if (taskKey === "extraCoalFlip") {
          nextAcknowledged.maintenanceTime = restartedAt;
        } else if (taskKey === "replaceCoal") {
          nextAcknowledged.extraCoalFlip = restartedAt;
        }

        return {
          ...row,
          ...basePatch,
          acknowledged: nextAcknowledged,
        };
      })
    );

    setCurrentAlarm((prev) =>
      prev?.rowId === rowId && TASK_ORDER.indexOf(prev.taskKey) >= startIndex ? null : prev
    );
  }

  function undoLastAcknowledged(row) {
    const schedule = computeSchedule(row, settings);
    const lastTask = getLastAcknowledgedTask(row, schedule, settings);
    if (!lastTask) return;

    setRows((prev) =>
      prev.map((item) => {
        if (item.id !== row.id) return item;
        const nextAcknowledged = { ...(item.acknowledged || {}) };
        const nextConfirmationHistory = { ...(item.confirmationHistory || {}) };
        delete nextAcknowledged[lastTask.key];
        const records = normalizeHistoryRecords(nextConfirmationHistory[lastTask.key]);
        if (records.length > 1) nextConfirmationHistory[lastTask.key] = records.slice(0, -1);
        else delete nextConfirmationHistory[lastTask.key];
        return { ...item, acknowledged: nextAcknowledged, confirmationHistory: nextConfirmationHistory, completed: false };
      })
    );
  }

  function toggleAlarmStep(key) {
    setSettings((prev) => ({
      ...prev,
      alarmSteps: {
        ...defaultSettings.alarmSteps,
        ...(prev.alarmSteps || {}),
        [key]: !prev.alarmSteps?.[key],
      },
    }));
  }

  function addRow(tableId = selectedTableId || tables[0]?.id) {
    const tableRows = rows.filter((row) => row.tableId === tableId);
    setRefillReminders((prev) => prev.filter((reminder) => reminder.tableId !== tableId));
    setRows((prev) => [...prev, createRow(tableId, `후카 ${tableRows.length + 1}`, settings)]);
    setSelectedTableId(tableId);
    setSelectedLayoutTarget({ type: "table", id: tableId });
    setTimerMoveMode(false);
    setTimerMoveSourceTableId(null);
  }

  function addTable() {
    setTables((prev) => {
      const newTable = { id: makeId(), name: `테이블 ${prev.length + 1}`, x: 10 + ((prev.length * 18) % 70), y: 12 + ((prev.length * 14) % 66) };
      setSelectedTableId(newTable.id);
      setSelectedLayoutTarget({ type: "table", id: newTable.id });
      return [...prev, newTable];
    });
  }

  function removeLastTable() {
    if (tables.length <= 1) {
      alert("테이블은 최소 1개 이상 필요합니다.");
      return;
    }

    const lastTable = tables[tables.length - 1];
    const hasRows = rows.some((row) => row.tableId === lastTable.id);
    if (hasRows) {
      const ok = window.confirm(`${lastTable.name}에 등록된 후카가 있습니다. 테이블과 후카를 같이 삭제할까요?`);
      if (!ok) return;
    }

    const nextTables = tables.slice(0, -1);
    setTables(nextTables);
    setRows((prev) => prev.filter((row) => row.tableId !== lastTable.id));
    setRefillReminders((prev) => prev.filter((reminder) => reminder.tableId !== lastTable.id));
    if (selectedTableId === lastTable.id) {
      const nextId = nextTables[nextTables.length - 1]?.id || "table-1";
      setSelectedTableId(nextId);
      setSelectedLayoutTarget({ type: "table", id: nextId });
    }
  }

  function addMany(count) {
    setRefillReminders((prev) => prev.filter((reminder) => reminder.tableId !== selectedTableId));
    setRows((prev) => {
      const tableRows = prev.filter((row) => row.tableId === selectedTableId);
      const next = [...prev];
      for (let i = 0; i < count; i += 1) next.push(createRow(selectedTableId, `후카 ${tableRows.length + i + 1}`, settings));
      return next;
    });
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function toggleComplete(row) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, completed: !r.completed } : r)));
  }

  function updateTableName(id, name) {
    setTables((prev) => prev.map((table) => (table.id === id ? { ...table, name } : table)));
  }

  function selectedLayoutLabel() {
    if (!selectedLayoutTarget?.type) return "선택 없음";
    if (selectedLayoutTarget.type === "fixture") {
      return fixtures.find((fixture) => fixture.id === selectedLayoutTarget.id)?.name || "고정 요소";
    }
    return tables.find((table) => table.id === selectedLayoutTarget.id)?.name || "테이블";
  }

  function snapTablePosition(targetId, x, y) {
    const snapThreshold = 2;
    const nearbyDistance = 18;
    let nextX = x;
    let nextY = y;

    tables.forEach((table) => {
      if (table.id === targetId) return;
      const tableX = table.x ?? 8;
      const tableY = table.y ?? 10;
      const distance = Math.hypot(tableX - x, tableY - y);

      if (distance > nearbyDistance) return;
      if (Math.abs(tableX - x) <= snapThreshold) nextX = tableX;
      if (Math.abs(tableY - y) <= snapThreshold) nextY = tableY;
    });

    return { x: nextX, y: nextY };
  }

  function setLayoutTargetPosition(x, y) {
    const maxX = Math.max(20, Number(settings.layoutWidth || 100) - 18);
    const maxY = Math.max(20, Number(settings.layoutHeight || 140) - 16);
    let boundedX = Math.max(2, Math.min(maxX, x));
    let boundedY = Math.max(2, Math.min(maxY, y));

    if (selectedLayoutTarget.type === "table") {
      const snapped = snapTablePosition(selectedLayoutTarget.id, boundedX, boundedY);
      boundedX = Math.max(2, Math.min(maxX, snapped.x));
      boundedY = Math.max(2, Math.min(maxY, snapped.y));
    }

    if (!selectedLayoutTarget?.type) return "선택 없음";
    if (selectedLayoutTarget.type === "fixture") {
      setFixtures((prev) =>
        prev.map((fixture) =>
          fixture.id === selectedLayoutTarget.id ? { ...fixture, x: boundedX, y: boundedY } : fixture
        )
      );
      return;
    }

    setTables((prev) =>
      prev.map((table) =>
        table.id === selectedLayoutTarget.id ? { ...table, x: boundedX, y: boundedY } : table
      )
    );
  }

  function moveSelectedLayoutTarget(dx, dy) {
    if (!layoutEditMode) return;

    if (!selectedLayoutTarget?.type) return "선택 없음";
    if (selectedLayoutTarget.type === "fixture") {
      const fixture = fixtures.find((item) => item.id === selectedLayoutTarget.id);
      if (!fixture) return;
      setLayoutTargetPosition((fixture.x ?? 4) + dx, (fixture.y ?? 4) + dy);
      return;
    }

    const table = tables.find((item) => item.id === selectedLayoutTarget.id);
    if (!table) return;
    setLayoutTargetPosition((table.x ?? 8) + dx, (table.y ?? 10) + dy);
  }

  function getLayoutPositionFromPointer(event) {
    const board = layoutBoardRef.current;
    if (!board) return null;

    const rect = board.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return null;

    return {
      x: ((clientX - rect.left) / rect.width) * Number(settings.layoutWidth || 100),
      y: ((clientY - rect.top) / rect.height) * Number(settings.layoutHeight || 140),
    };
  }

  function handleLayoutBoardClick(event) {
    if (layoutEditMode) {
      if (!selectedLayoutTarget?.id || dragTargetRef.current) return;

      const position = getLayoutPositionFromPointer(event);
      if (!position) return;

      const offsetX = selectedLayoutTarget.type === "fixture" ? 7 : 10;
      const offsetY = selectedLayoutTarget.type === "fixture" ? 4 : 8;
      setLayoutTargetPosition(position.x - offsetX, position.y - offsetY);
      return;
    }

    if (event.target === event.currentTarget && !timerMoveMode) {
      setSelectedTableId(null);
      setPopupTableId(null);
    }
  }

  function startLayoutDrag(event, target) {
    if (!layoutEditMode) return;
    event.preventDefault();
    event.stopPropagation();

    setSelectedLayoutTarget(target);
    if (target.type === "table") setSelectedTableId(target.id);

    dragTargetRef.current = target;
    if (event.currentTarget.setPointerCapture && event.pointerId != null) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function moveLayoutDrag(event) {
    if (!layoutEditMode || !dragTargetRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const position = getLayoutPositionFromPointer(event);
    if (!position) return;

    const target = dragTargetRef.current;
    setSelectedLayoutTarget(target);
    const offsetX = target.type === "fixture" ? 7 : 10;
    const offsetY = target.type === "fixture" ? 4 : 8;
    setLayoutTargetPosition(position.x - offsetX, position.y - offsetY);
  }

  function endLayoutDrag(event) {
    if (!dragTargetRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragTargetRef.current = null;
  }

  function handleTimerMoveTableClick(event, tableId) {
    event.stopPropagation();

    const targetTable = tables.find((table) => table.id === tableId);
    if (!targetTable) return true;

    if (!timerMoveSourceTableId) {
      const activeCount = rows.filter((row) => row.tableId === tableId && !row.completed).length;
      if (!activeCount) {
        setNotificationStatus(`${targetTable.name}에는 이동할 타이머가 없습니다.`);
        return true;
      }
      setTimerMoveSourceTableId(tableId);
      setSelectedTableId(tableId);
      setSelectedLayoutTarget({ type: "table", id: tableId });
      setPopupTableId(null);
      setNotificationStatus(`${targetTable.name} 선택됨. 옮길 테이블을 눌러주세요.`);
      return true;
    }

    if (timerMoveSourceTableId === tableId) {
      setTimerMoveSourceTableId(null);
      setNotificationStatus("자리이동 출발 테이블 선택을 취소했습니다.");
      return true;
    }

    const sourceTable = tables.find((table) => table.id === timerMoveSourceTableId);
    const movingCount = rows.filter((row) => row.tableId === timerMoveSourceTableId && !row.completed).length;

    if (!movingCount) {
      setTimerMoveSourceTableId(null);
      setNotificationStatus("이동할 타이머가 없습니다. 다시 선택해주세요.");
      return true;
    }

    setRows((prev) =>
      prev.map((row) =>
        row.tableId === timerMoveSourceTableId && !row.completed
          ? { ...row, tableId }
          : row
      )
    );
    setSelectedTableId(tableId);
    setSelectedLayoutTarget({ type: "table", id: tableId });
    setPopupTableId(null);
    setTimerMoveMode(false);
    setTimerMoveSourceTableId(null);
    setNotificationStatus(`${sourceTable?.name || "선택한 테이블"} 타이머 ${movingCount}개를 ${targetTable.name}(으)로 이동했습니다.`);
    return true;
  }

  function selectTableOnly(event, tableId) {
    if (timerMoveMode && handleTimerMoveTableClick(event, tableId)) return;

    if (layoutEditMode) {
      event.stopPropagation();
      setSelectedTableId(tableId);
      setSelectedLayoutTarget({ type: "table", id: tableId });
      return;
    }

    setSelectedTableId(tableId);
    setSelectedLayoutTarget({ type: "table", id: tableId });

    const hasActiveTimer = upcomingTasks.some((item) => item.row.tableId === tableId);
    setPopupTableId(hasActiveTimer ? tableId : null);
  }

  function selectFixtureOnly(event, fixtureId) {
    if (layoutEditMode) event.stopPropagation();
    setSelectedLayoutTarget({ type: "fixture", id: fixtureId });
  }

  function changeLayoutSize(widthDelta, heightDelta) {
    setSettings((prev) => ({
      ...prev,
      layoutWidth: Math.max(80, Math.min(180, Number(prev.layoutWidth || 100) + widthDelta)),
      layoutHeight: Math.max(100, Math.min(240, Number(prev.layoutHeight || 140) + heightDelta)),
    }));
  }

  function resetLayoutSize() {
    setSettings((prev) => ({ ...prev, layoutWidth: 100, layoutHeight: 140 }));
  }

  function applyPresetData(preset, options = {}) {
    if (!preset) return;

    const nextTables = cloneTablesForLayout(preset.tables);
    const nextFixtures = cloneFixturesForLayout(preset.fixtures);
    const presetTimerSettings = mergePresetTimerSettings(preset.timerSettings);
    const fallbackTableId = nextTables[0]?.id || "table-1";
    const tableIdMap = new Map(tables.map((table, index) => [table.id, nextTables[index]?.id || fallbackTableId]));

    setTables(nextTables);
    setFixtures(nextFixtures);
    setSettings((prev) => ({
      ...prev,
      ...presetTimerSettings,
      layoutWidth: Number(preset.layoutWidth || prev.layoutWidth || 100),
      layoutHeight: Number(preset.layoutHeight || prev.layoutHeight || 140),
    }));
    setRows((prev) => prev.map((row) => ({ ...row, tableId: tableIdMap.get(row.tableId) || fallbackTableId })));
    setRefillReminders((prev) =>
      prev.map((reminder) => ({ ...reminder, tableId: tableIdMap.get(reminder.tableId) || fallbackTableId }))
    );
    setSelectedTableId(fallbackTableId);
    setSelectedLayoutTarget({ type: "table", id: fallbackTableId });
    setSelectedPresetId(preset.id);
    setShowPresetPicker(false);
    if (options.message) setNotificationStatus(options.message);
  }

  function applyLayoutPreset(presetId) {
    const preset = layoutPresets.find((item) => item.id === presetId);
    applyPresetData(preset);
  }

  function getCurrentPresetSnapshot(basePreset = selectedPreset) {
    if (!basePreset) return null;

    return {
      ...basePreset,
      name: basePreset.name || "이름 없는 프리셋",
      layoutWidth,
      layoutHeight,
      timerSettings: pickPresetTimerSettings(settings),
      fixtures: cloneFixturesForLayout(fixtures),
      tables: cloneTablesForLayout(tables),
    };
  }

  function saveCurrentPresetSnapshot(showMessage = true) {
    const nextPreset = getCurrentPresetSnapshot();
    if (!nextPreset) return;

    setLayoutPresets((prev) => prev.map((preset) => (preset.id === nextPreset.id ? nextPreset : preset)));
    if (showMessage) setNotificationStatus(`${nextPreset.name} 프리셋에 현재 설정을 저장했습니다.`);
  }

  function getPresetsForExport() {
    const currentSnapshot = getCurrentPresetSnapshot();
    return layoutPresets.map((preset, index) =>
      normalizeLayoutPreset(preset.id === selectedPresetId && currentSnapshot ? currentSnapshot : preset, index)
    );
  }

  function changeSelectedPresetName(value) {
    if (!selectedPreset) return;
    setLayoutPresets((prev) =>
      prev.map((preset) =>
        preset.id === selectedPreset.id ? { ...preset, name: value } : preset
      )
    );
  }

  function finalizeSelectedPresetName() {
    if (!selectedPreset) return;
    const trimmedName = selectedPreset.name?.trim() || "이름 없는 프리셋";
    setLayoutPresets((prev) =>
      prev.map((preset) =>
        preset.id === selectedPreset.id ? { ...preset, name: trimmedName } : preset
      )
    );
  }

  function exportPresetSettings() {
    const presets = getPresetsForExport();
    const payload = {
      type: "chilling-hookah-timer-presets",
      version: 1,
      exportedAt: new Date().toISOString(),
      selectedPresetId,
      layoutPresets: presets,
    };
    const fileName = `${(selectedPreset?.name || "chilling-presets").replace(/[\\/:*?"<>|]/g, "-")}-프리셋.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotificationStatus("프리셋 파일을 저장했습니다. 다른 휴대폰에서 불러오기로 적용할 수 있습니다.");
  }

  function importPresetSettings(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const importedSource = Array.isArray(parsed.layoutPresets)
          ? parsed.layoutPresets
          : Array.isArray(parsed.presets)
            ? parsed.presets
            : parsed.preset
              ? [parsed.preset]
              : [];

        if (!importedSource.length) {
          alert("불러올 프리셋이 없는 파일입니다.");
          return;
        }

        const importedPresets = importedSource.map((preset, index) =>
          normalizeLayoutPreset(
            {
              ...preset,
              id: preset.id || `imported-${makeId()}-${index + 1}`,
              locked: Boolean(preset.locked),
            },
            index
          )
        );
        const importedById = new Map(importedPresets.map((preset) => [preset.id, preset]));
        const nextPresets = mergeLayoutPresets([
          ...layoutPresets.filter((preset) => !importedById.has(preset.id)),
          ...importedPresets,
        ]);
        const nextSelectedPreset =
          importedPresets.find((preset) => preset.id === parsed.selectedPresetId) || importedPresets[0];

        setLayoutPresets(nextPresets);
        applyPresetData(nextSelectedPreset, { message: `${nextSelectedPreset.name} 프리셋을 불러왔습니다.` });
      } catch (error) {
        console.warn("Preset import failed", error);
        alert("프리셋 파일을 읽지 못했습니다. JSON 파일이 맞는지 확인해주세요.");
      } finally {
        input.value = "";
      }
    };
    reader.readAsText(file);
  }

  function addLayoutPreset() {
    const fallbackName = selectedPreset?.name ? `${selectedPreset.name} 복사본` : "새 매장 프리셋";
    const name = window.prompt("새 프리셋 이름을 입력하세요.", fallbackName);
    const trimmedName = name?.trim();
    if (!trimmedName) return;

    const newPreset = {
      id: `custom-${makeId()}`,
      name: trimmedName,
      locked: false,
      layoutWidth,
      layoutHeight,
      timerSettings: pickPresetTimerSettings(settings),
      fixtures: cloneFixturesForLayout(fixtures),
      tables: cloneTablesForLayout(tables),
    };

    setLayoutPresets((prev) => [...prev, newPreset]);
    setSelectedPresetId(newPreset.id);
    setShowPresetPicker(false);
  }

  function deleteSelectedPreset() {
    if (!selectedPreset) return;
    if (selectedPreset.locked) {
      alert("고정 프리셋은 삭제할 수 없습니다.");
      return;
    }

    const ok = window.confirm(`${selectedPreset.name}을 삭제할까요?`);
    if (!ok) return;

    setLayoutPresets((prev) => {
      const next = prev.filter((preset) => preset.id !== selectedPreset.id);
      setSelectedPresetId(next[0]?.id || DEFAULT_SELECTED_PRESET_ID);
      return next;
    });
  }

  const layoutWidth = Number(settings.layoutWidth || 100);
  const layoutHeight = Number(settings.layoutHeight || 140);
  const layoutScale = Math.max(0.62, Math.min(1, 100 / Math.max(layoutWidth, layoutHeight * 0.72)));

  async function requestNotificationPermission() {
    setSettings((prev) => ({ ...prev, alarmEnabled: true }));
    playBeep();

    const permission = await requestSystemNotificationPermission();
    if (permission === "granted") {
      const shown = await showSystemNotification(settings.appTitle || "후카 타이머", {
        body: `기기 알림 테스트 · ${formatDateTime(new Date())}`,
        tag: "hookah-test-notification",
      });
      setNotificationStatus(shown ? "기기 알림 테스트를 보냈습니다." : "기기 알림을 띄우지 못했습니다.");
      return;
    }

    if (permission === "denied") {
      setNotificationStatus("기기 알림이 차단되어 있습니다. 브라우저/기기 설정에서 알림을 허용해주세요.");
      return;
    }

    setNotificationStatus("이 브라우저에서는 기기 알림을 지원하지 않습니다.");
  }

  function toggleTimerMoveMode() {
    setTimerMoveMode((value) => {
      const next = !value;
      if (!next) setTimerMoveSourceTableId(null);
      setPopupTableId(null);
      setLayoutEditMode(false);
      return next;
    });
  }

  function toggleAdminMode() {
    if (adminMode) {
      setAdminMode(false);
      setAdminPinInput("");
      setShowAdminPinPrompt(false);
      setNotificationStatus("직원 모드로 전환했습니다. 운영에 필요한 버튼만 남겨둘게요.");
      return;
    }

    setAdminPinInput("");
    setShowAdminPinPrompt(true);
  }

  function submitAdminPin(event) {
    event?.preventDefault?.();
    if (String(adminPinInput).trim() === String(adminPin || DEFAULT_ADMIN_PIN)) {
      setAdminMode(true);
      setShowAdminPinPrompt(false);
      setAdminPinInput("");
      setNotificationStatus("관리자 모드가 켜졌습니다. 설정/프리셋/테이블 편집이 열렸어요.");
      return;
    }

    setNotificationStatus("관리자 비밀번호가 맞지 않습니다.");
    setAdminPinInput("");
  }

  function startShift() {
    const startedAt = Date.now();

    // 교대/새 영업 시작은 기록 기준만 새로 잡고, 이미 나가 있는 후카 타이머는 유지한다.
    // 타이머 전체 삭제는 관리자용 "전체 초기화"에서만 처리한다.
    setShowClosingSummary(false);
    setClosingSummaryEndedAt(null);
    setShowScoreSummary(false);
    setShowClosingSmoke(false);
    setTimerMoveMode(false);
    setTimerMoveSourceTableId(null);
    setShift({ active: true, startedAt, endedAt: null, lastReport: null });
    setNotificationStatus(`영업 시작 · 진행 중인 타이머는 유지됩니다 · ${formatDateTime(new Date(startedAt))}`);
  }

  function resetAll() {
    const ok = window.confirm("모든 후카 타이머를 초기화할까요?");
    if (!ok) return;
    setRows([]);
    setRefillReminders([]);
    setSelectedTableId(tables[0]?.id || "table-1");
    setSelectedLayoutTarget({ type: "table", id: tables[0]?.id || "table-1" });
    setPopupTableId(null);
    setTimerMoveMode(false);
    setTimerMoveSourceTableId(null);
  }

  function openClosingSummary() {
    if (!shiftActive) {
      startShift();
      return;
    }
    setClosingSummaryEndedAt(Date.now());
    setShowClosingSummary(true);
  }

  function finishClosingShift() {
    const endedAt = closingSummaryEndedAt || Date.now();
    setShift((prev) => ({
      ...prev,
      active: false,
      endedAt,
      lastReport: { ...operationReport, scoreAverage: scoreStats.average, scoreGrade: scoreStats.grade, scoreCount: scoreStats.count },
    }));
    setShowClosingSummary(false);
    setClosingSummaryEndedAt(endedAt);
    setShowClosingSmoke(true);
    setNotificationStatus(`영업 종료 · 오늘 총 ${operationReport.hookahCount}개 후카를 만들었어요.`);
  }

  function renderTimerCard(item, options = {}) {
    const { row, schedule, nextTask, table } = item;
    const diff = minutesUntil(nextTask.time);
    const secondsLeft = secondsUntil(nextTask.time, tick);
    const overdue = diff <= 0;
    const soon = diff > 0 && diff <= 1;
    const coverDue = isCoalLidOpenWindow(nextTask.key, secondsLeft);
    const alarmedAt = row.alarmedAt?.[nextTask.key];
    const alarmBase = alarmedAt || (overdue ? nextTask.time?.getTime?.() : null);
    const lastAcknowledgedTask = getLastAcknowledgedTask(row, schedule, settings);
    const historyEntries = collectConfirmationRecords([row], tables, 0).sort((a, b) => a.acknowledgedAt - b.acknowledgedAt);

    return (
      <div
        key={row.id}
        ref={!options.inPopup ? (element) => { timerCardRefs.current[row.id] = element; } : undefined}
        className={`relative overflow-hidden rounded-2xl border p-3 text-left transition hover:bg-red-950/60 ${overdue ? "border-red-400 bg-red-950/80" : soon ? "border-amber-300/70 bg-red-950/55" : coverDue ? "border-emerald-300/70 bg-emerald-950/35" : "border-red-800/70 bg-black/30"}`}
      >
        {options.inPopup && coverDue && !soon && !overdue && (
          <div className="table-state-overlay table-cover-overlay" aria-hidden="true">
            <span>숯 뚜껑<br />열어주기</span>
          </div>
        )}
        {options.inPopup && soon && !overdue && (
          <div className="table-state-overlay table-urgent-overlay" aria-hidden="true">
            <span>임박</span>
          </div>
        )}
        {options.inPopup && overdue && (
          <button
            type="button"
            onClick={() => acknowledgeTask(row.id, nextTask.key)}
            className="table-state-overlay table-confirm-overlay"
            aria-label={`${table?.name || "테이블"} ${nextTask.label} 확인`}
          >
            <span>확인</span>
          </button>
        )}
        <button type="button" onClick={() => selectUpcomingTimer(row)} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-red-100">{table?.name || "테이블"} · {row.label || "후카"}</div>
              <div className="mt-1 text-lg font-black text-white">{nextTask.label}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${overdue ? "bg-red-200 text-red-950" : soon ? "bg-amber-200 text-black" : coverDue ? "bg-emerald-200 text-emerald-950" : "bg-black/40 text-red-100/70"}`}>
              {overdue ? "확인" : soon ? "임박" : coverDue ? "뚜껑" : "예정"}
            </span>
          </div>
          <div className="mt-2 text-sm font-bold text-red-100/75">{formatTime(nextTask.time)} · {statusLabel(nextTask.time)}</div>
          {alarmBase && (
            <div className="mt-2 rounded-xl border border-amber-300/30 bg-black/25 px-3 py-2 text-sm font-black text-amber-100">
              {alarmedAt ? "알림 후" : "예정 시간 후"} {elapsedSince(alarmBase, tick)} 경과
            </div>
          )}
        </button>
        {options.inPopup && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-950/70 bg-black/30 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-red-100/40">타이머 시작시간</div>
              <div className="mt-0.5 text-sm font-black text-red-50">{formatTime(rowTimeDate(row, "startTime", "startTimestamp"))}</div>
            </div>
            <button
              type="button"
              onClick={() => openStartTimeEditor(row)}
              className="shrink-0 rounded-xl border border-red-700/70 bg-red-950/70 px-3 py-2 text-xs font-black text-red-50 hover:bg-red-900"
            >
              변경
            </button>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => adjustTaskTime(row.id, nextTask.key, -1)}
            className="rounded-xl border border-red-950/70 bg-black/35 px-3 py-2 text-sm font-bold text-red-100/70 hover:bg-red-950/60"
          >
            -1분
          </button>
          <button
            type="button"
            onClick={() => adjustTaskTime(row.id, nextTask.key, 1)}
            className="rounded-xl border border-red-950/70 bg-black/35 px-3 py-2 text-sm font-bold text-red-100/70 hover:bg-red-950/60"
          >
            +1분
          </button>
          <button
            type="button"
            onClick={() => undoLastAcknowledged(row)}
            disabled={!lastAcknowledgedTask}
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${lastAcknowledgedTask ? "border-red-950/70 bg-black/35 text-red-100/70 hover:bg-red-950/60" : "border-red-950/40 bg-black/20 text-red-100/25"}`}
          >
            이전 단계
          </button>
          <button
            type="button"
            onClick={() => acknowledgeTask(row.id, nextTask.key)}
            className="rounded-xl border border-red-600/70 bg-red-800 px-3 py-2 text-sm font-black text-red-50 hover:bg-red-700"
          >
            다음 단계
          </button>
          <button
            type="button"
            onClick={() => restartCurrentTask(row.id, nextTask.key)}
            className="col-span-2 rounded-xl border border-red-700/70 bg-red-950/65 px-3 py-2 text-sm font-black text-red-50 hover:bg-red-900/80 flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            타이머 재시작
          </button>
          <button
            type="button"
            onClick={() => removeRow(row.id)}
            className="col-span-2 rounded-xl border border-red-950/70 bg-black/45 px-3 py-2 text-sm font-bold text-red-100/70 hover:bg-red-950/70 flex items-center justify-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            타이머 삭제
          </button>
        </div>
        {options.inPopup && (
          <div className="mt-3 rounded-2xl border border-red-950/60 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-black text-red-100/50">확인 히스토리</div>
              <div className="text-[11px] font-bold text-red-100/35">{historyEntries.length}개 기록</div>
            </div>
            {historyEntries.length > 0 ? (
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {historyEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-red-950/50 bg-black/30 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-red-50">{entry.taskLabel}</span>
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-black text-red-100">{entry.score}점</span>
                    </div>
                    <div className="mt-1 text-red-100/45">예정 {formatTime(timestampToDate(entry.scheduledTimestamp))} · 확인 {formatDateTime(timestampToDate(entry.acknowledgedAt))} · {formatDelaySeconds(entry.delaySeconds)} 후</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-red-950/40 bg-black/20 px-3 py-2 text-xs font-bold text-red-100/35">아직 확인 기록이 없습니다.</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-neutral-100 p-3 md:p-8">
      {screenAlarmActive && (
        <div className="alarm-screen-flash fixed inset-0 z-30 pointer-events-none" aria-hidden="true" />
      )}
      {popupTableId && popupTimerItems.length > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm md:items-center"
          onClick={() => setPopupTableId(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-red-800/70 bg-[#120B0C] p-4 shadow-2xl shadow-red-950/70 md:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-red-100/45">테이블 타이머</div>
                <div className="mt-1 text-2xl font-black text-white">{popupTable?.name || "테이블"}</div>
                <div className="mt-1 text-sm text-red-100/55">이 테이블에서 진행 중인 후카만 표시됩니다.</div>
              </div>
              <button
                type="button"
                onClick={() => setPopupTableId(null)}
                className="rounded-full border border-red-900/70 bg-red-950/50 p-2 text-red-100 hover:bg-red-900"
                aria-label="테이블 타이머 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {popupTimerItems.map((item) => renderTimerCard(item, { inPopup: true }))}
            </div>
          </div>
        </div>
      )}
      {startTimeEditor && startTimeEditorRow && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm md:items-center"
          onClick={() => setStartTimeEditor(null)}
        >
          <div
            className="w-full max-w-sm rounded-[2rem] border border-red-700/70 bg-[#120B0C] p-4 shadow-2xl shadow-red-950/70"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-red-100/45">시작시간 변경</div>
                <div className="mt-1 text-xl font-black text-white">{startTimeEditorRow.label || "후카"}</div>
                <div className="mt-1 text-sm text-red-100/55">+ / -를 누를 때마다 1분씩 변경됩니다.</div>
              </div>
              <button
                type="button"
                onClick={() => setStartTimeEditor(null)}
                className="rounded-full border border-red-900/70 bg-red-950/50 p-2 text-red-100 hover:bg-red-900"
                aria-label="시작시간 변경 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-3xl border border-red-950/70 bg-black/35 p-4 text-center">
              <div className="text-xs font-bold text-red-100/40">변경될 시작시간</div>
              <div className="mt-1 text-4xl font-black tracking-tight text-white">{formatTime(startTimeEditorDate)}</div>
              <div className="mt-2 text-xs font-bold text-red-100/45">
                기존 {formatTime(startTimeEditorOriginalDate)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => adjustStartTimeDraft(-1)}
                className="rounded-2xl border border-red-950/70 bg-black/45 px-4 py-5 text-2xl font-black text-red-50 hover:bg-red-950/70"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => adjustStartTimeDraft(1)}
                className="rounded-2xl border border-red-700/70 bg-red-900 px-4 py-5 text-2xl font-black text-red-50 hover:bg-red-800"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={applyStartTimeDraft}
              className="mt-3 w-full rounded-2xl border border-red-600/70 bg-red-800 px-4 py-4 text-base font-black text-red-50 hover:bg-red-700"
            >
              이 시간으로 적용
            </button>
          </div>
        </div>
      )}
      {showAdminPinPrompt && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm md:items-center"
          onClick={() => { setShowAdminPinPrompt(false); setAdminPinInput(""); }}
        >
          <form
            onSubmit={submitAdminPin}
            className="w-full max-w-sm rounded-[2rem] border border-red-700/70 bg-[#120B0C] p-4 shadow-2xl shadow-red-950/70"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-red-100/45">관리자 인증</div>
                <div className="mt-1 text-xl font-black text-white">비밀번호 입력</div>
              </div>
              <button
                type="button"
                onClick={() => { setShowAdminPinPrompt(false); setAdminPinInput(""); }}
                className="rounded-full border border-red-900/70 bg-red-950/50 p-2 text-red-100 hover:bg-red-900"
                aria-label="관리자 인증 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={adminPinInput}
              onChange={(event) => setAdminPinInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4자리 PIN"
              className="mt-4 w-full rounded-2xl border border-red-950/70 bg-black/45 px-4 py-4 text-center text-3xl font-black tracking-[0.4em] text-white outline-none focus:border-red-400"
            />
            <button
              type="submit"
              className="mt-3 w-full rounded-2xl border border-red-600/70 bg-red-800 px-4 py-4 text-base font-black text-red-50 hover:bg-red-700"
            >
              관리자 모드 켜기
            </button>
          </form>
        </div>
      )}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm md:items-center"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-red-800/70 bg-[#120B0C] p-4 shadow-2xl shadow-red-950/70 md:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-red-100/45">전체 메뉴</div>
                <div className="mt-1 text-2xl font-black text-white">설정</div>
                <p className="mt-1 text-sm text-red-100/50">자주 쓰는 화면은 밖으로 빼고, 세부 설정은 여기서 관리합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-full border border-red-900/70 bg-red-950/50 p-2 text-red-100 hover:bg-red-900"
                aria-label="설정 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-3xl border border-white/10 bg-black/25 p-3 md:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-bold text-red-100/45">현재 사용 모드</div>
                  <div className="mt-1 flex items-center gap-2 text-lg font-black text-white">
                    <ShieldCheck className={`h-5 w-5 ${adminMode ? "text-red-300" : "text-neutral-400"}`} />
                    {adminMode ? "관리자 모드" : "직원 모드"}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-red-100/45">
                    직원 모드에서는 프리셋/알람/테이블 편집을 숨기고, 현장에서 쓰는 버튼만 남깁니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAdminMode}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black ${adminMode ? "border-white/10 bg-black/40 text-red-100/75 hover:bg-red-950/60" : "border-red-500/60 bg-red-700 text-white hover:bg-red-600"}`}
                >
                  {adminMode ? "직원 모드로 전환" : "관리자 모드 켜기"}
                </button>
              </div>
            </div>

            <div className={`mb-4 grid gap-2 ${adminMode ? "md:grid-cols-3" : "md:grid-cols-1"}`}>
              {adminMode && (
                <button
                  type="button"
                  onClick={() => setSettingsPanel("preset")}
                  className={`rounded-2xl border px-4 py-3 text-left font-black ${settingsPanel === "preset" ? "border-red-400 bg-red-950/80 text-white" : "border-red-950/60 bg-[#241012] text-red-100/75 hover:bg-[#321316]"}`}
                >
                  <span className="flex items-center gap-2"><Settings className="h-4 w-4" /> 프리셋 설정</span>
                  <span className="mt-1 block text-xs font-bold text-red-100/45">이름, 시간, 불러오기</span>
                </button>
              )}
              {adminMode && (
                <button
                  type="button"
                  onClick={() => setSettingsPanel("alarm")}
                  className={`rounded-2xl border px-4 py-3 text-left font-black ${settingsPanel === "alarm" ? "border-red-400 bg-red-950/80 text-white" : "border-red-950/60 bg-[#241012] text-red-100/75 hover:bg-[#321316]"}`}
                >
                  <span className="flex items-center gap-2">{settings.alarmEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} 알람 설정</span>
                  <span className="mt-1 block text-xs font-bold text-red-100/45">알람 ON/OFF, 단계별 알람</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSettingsPanel("manual")}
                className={`rounded-2xl border px-4 py-3 text-left font-black ${settingsPanel === "manual" ? "border-red-400 bg-red-950/80 text-white" : "border-red-950/60 bg-[#241012] text-red-100/75 hover:bg-[#321316]"}`}
              >
                <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> 사용설명서 보기</span>
                <span className="mt-1 block text-xs font-bold text-red-100/45">앱 사용 방법 확인</span>
              </button>
            </div>

            {settingsPanel === "menu" && (
              <div className="rounded-3xl border border-red-950/60 bg-black/25 p-5 text-center text-red-100/55">
                위 메뉴에서 필요한 설정을 선택하세요.
              </div>
            )}

            {adminMode && settingsPanel === "preset" && (
              <div>
              <div className="mb-3 rounded-2xl border border-red-950/60 bg-black/25 p-3">
                <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-black text-red-100">
                      <Settings className="h-4 w-4 text-red-200" />
                      프리셋 세팅
                    </div>
                    <p className="mt-1 text-xs text-red-100/45">여기서 바꾼 이름과 시간은 현재 프리셋에 저장됩니다. 테이블 수정은 테이블 위치 섹션의 설정 버튼에서 관리합니다.</p>
                    <label className="mt-3 block max-w-md space-y-1">
                      <span className="text-xs font-bold text-red-100/50">프리셋 이름</span>
                      <input
                        type="text"
                        value={selectedPreset?.name || ""}
                        onChange={(event) => changeSelectedPresetName(event.target.value)}
                        onBlur={finalizeSelectedPresetName}
                        placeholder="프리셋 이름"
                        className="w-full rounded-2xl border border-red-950/70 bg-black/50 px-4 py-3 text-lg font-black text-white outline-none focus:border-red-400"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs md:w-[21rem]">
                    <button onClick={() => saveCurrentPresetSnapshot(true)} className="rounded-xl border border-red-800/70 bg-red-900 px-3 py-2 font-bold text-red-50 hover:bg-red-800 flex items-center justify-center gap-1">
                      <Save className="h-3.5 w-3.5" /> 저장
                    </button>
                    <button onClick={exportPresetSettings} className="rounded-xl border border-red-800/70 bg-[#241012] px-3 py-2 font-bold text-red-100 hover:bg-[#321316] flex items-center justify-center gap-1">
                      <Download className="h-3.5 w-3.5" /> 내보내기
                    </button>
                    <button onClick={() => presetImportInputRef.current?.click()} className="col-span-2 rounded-xl border border-red-800/70 bg-black/40 px-3 py-2 font-bold text-red-100 hover:bg-red-950/70 flex items-center justify-center gap-1">
                      <Upload className="h-3.5 w-3.5" /> 다른 기기 프리셋 불러오기
                    </button>
                    <input
                      ref={presetImportInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={importPresetSettings}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <TimerSettingInput
                    label="a. 숯 3개 뒤집기"
                    value={settings.flipMinutes}
                    onChange={(value) => updateSetting("flipMinutes", value)}
                    helpKey="presetFlipMinutes"
                    openHelp={openSettingHelp}
                    setOpenHelp={setOpenSettingHelp}
                    helpText="처음 숯을 3개 올린 후 몇분후에 뒤집을까요?"
                  />
                  <TimerSettingInput
                    label="b. 숯 굽기 완료"
                    value={settings.finishCoalMinutes}
                    onChange={(value) => updateSetting("finishCoalMinutes", value)}
                    helpKey="presetFinishCoalMinutes"
                    openHelp={openSettingHelp}
                    setOpenHelp={setOpenSettingHelp}
                    helpText="숯 3개를 뒤집은 후 몇분 후에 굽기가 완료되나요?"
                  />
                  <TimerSettingInput
                    label="c. 시샤 히팅"
                    value={settings.bowlHeatMinutes}
                    onChange={(value) => updateSetting("bowlHeatMinutes", value)}
                    helpKey="presetBowlHeatMinutes"
                    openHelp={openSettingHelp}
                    setOpenHelp={setOpenSettingHelp}
                    helpText="시샤 히팅 시간은 몇분으로 할까요?"
                  />
                  <TimerSettingInput
                    label="숯 털기"
                    value={settings.customerMaintenanceMinutes}
                    onChange={(value) => updateSetting("customerMaintenanceMinutes", value)}
                    helpKey="presetCustomerMaintenanceMinutes"
                    openHelp={openSettingHelp}
                    setOpenHelp={setOpenSettingHelp}
                    helpText="후카가 손님에게 처음 나간 후 몇분 후에 숯 털기를 할까요?"
                  />
                </div>
              </div>

              <div className="mb-3 rounded-2xl border border-red-950/60 bg-black/25 p-3">
                <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 text-sm font-black text-red-100">
                    <MapPin className="h-4 w-4 text-red-200" />
                    전체 프리셋 관리
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={addLayoutPreset} className="rounded-xl border border-red-800/70 bg-red-900 px-3 py-2 font-bold text-red-50 hover:bg-red-800 flex items-center gap-1">
                      <Save className="h-3.5 w-3.5" />
                      프리셋 추가하기
                    </button>
                    <button onClick={deleteSelectedPreset} className="rounded-xl border border-red-950/70 bg-black/40 px-3 py-2 font-bold text-red-100/70 hover:bg-red-950/70 flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      지우기
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  {layoutPresets.map((preset) => {
                    const selected = preset.id === selectedPresetId;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => applyLayoutPreset(preset.id)}
                        className={`rounded-2xl border p-3 text-left transition ${selected ? "border-red-400 bg-red-950/70 text-white" : "border-red-950/60 bg-[#241012] text-red-100/75 hover:bg-[#321316]"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-black">{preset.name}</span>
                          {preset.locked && <span className="shrink-0 rounded-full border border-red-700/60 bg-black/35 px-2 py-0.5 text-[11px] text-red-100/60">기본</span>}
                        </div>
                        <div className="mt-1 text-xs text-red-100/45">{presetSummary(preset)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              </div>
            )}

            {adminMode && settingsPanel === "alarm" && (
              <div className="rounded-3xl border border-red-950/60 bg-black/25 p-3 md:p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-lg font-black text-white">
                    {settings.alarmEnabled ? <Bell className="h-5 w-5 text-red-200" /> : <BellOff className="h-5 w-5 text-red-200" />}
                    알람 설정
                  </div>
                  <span className="text-sm text-red-100/40">현재 기준: {formatDateTime(new Date(tick))}</span>
                </div>

                <button onClick={() => updateSetting("alarmEnabled", !settings.alarmEnabled)} className={`w-full rounded-2xl px-4 py-4 border flex items-center justify-center gap-2 font-black ${settings.alarmEnabled ? "bg-red-900 text-red-50 border-red-700" : "bg-black/40 border-red-950/70 text-red-100/60"}`}>
                  {settings.alarmEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {settings.alarmEnabled ? "알람 ON" : "알람 OFF"}
                </button>

                <div className="mt-4 rounded-2xl border border-red-950/60 bg-black/25 p-3">
                  <div className="mb-2 text-sm font-semibold text-red-100">단계별 알람</div>
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    {[
                      ["flipThree", "숯 뒤집기"],
                      ["finishThree", "시샤 히팅 시작"],
                      ["served", "후카 나감"],
                      ["maintenanceTime", "숯 털기/1개 올림"],
                      ["extraCoalFlip", "숯 1개 뒤집기"],
                      ["replaceCoal", "숯 1개 교체"],
                    ].map(([key, label]) => {
                      const enabled = settings.alarmSteps?.[key] ?? true;
                      return (
                        <button key={key} onClick={() => toggleAlarmStep(key)} className={`rounded-xl px-3 py-2 border flex items-center justify-center gap-2 ${enabled ? "bg-red-900/80 text-red-50 border-red-700/70" : "bg-black/40 text-red-100/40 border-red-950/60"}`}>
                          {enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {settingsPanel === "manual" && (
              <div className="rounded-3xl border border-red-950/60 bg-black/25 p-3 md:p-4">
                <div className="mb-3 flex items-center gap-2 text-lg font-black text-white">
                  <BookOpen className="h-5 w-5 text-red-200" />
                  사용설명서
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <a href={MANUAL_PDF_PATH} target="_blank" rel="noreferrer" className="rounded-xl border border-red-800/70 bg-red-900 px-3 py-2 font-bold text-red-50 hover:bg-red-800">
                    새 창으로 열기
                  </a>
                  <a href={MANUAL_PDF_PATH} download className="rounded-xl border border-red-950/70 bg-black/40 px-3 py-2 font-bold text-red-100/70 hover:bg-red-950/70">
                    PDF 다운로드
                  </a>
                </div>
                <object title="후카 타이머 사용설명서" data={MANUAL_PDF_PATH} type="application/pdf" className="h-[70vh] w-full rounded-2xl border border-red-950/70 bg-black">
                  <div className="flex h-[50vh] items-center justify-center rounded-2xl border border-red-950/70 bg-black/40 p-6 text-center text-sm text-red-100/60">
                    이 기기에서 PDF 미리보기를 지원하지 않습니다. 위의 새 창으로 열기 또는 PDF 다운로드를 눌러 확인하세요.
                  </div>
                </object>
              </div>
            )}

            {notificationStatus && (
              <div className="mt-4 rounded-2xl border border-red-950/60 bg-black/25 px-3 py-2 text-center text-sm font-bold text-red-100/60">
                {notificationStatus}
              </div>
            )}
          </div>
        </div>
      )}
      {showClosingSummary && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm md:items-center"
          onClick={() => setShowClosingSummary(false)}
        >
          <div
            className="w-full max-w-md rounded-[2rem] border border-red-500/50 bg-[#120B0C] p-5 text-center shadow-2xl shadow-red-950/70"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/15 text-red-100 shadow-lg shadow-red-950/40">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4 text-center shadow-inner shadow-black/30">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-red-100/45">오늘 일한 시간</div>
              <div className="mt-1 text-3xl font-black tracking-tight text-white">{formatWorkDuration(operationPeriodStart, closingSummaryEndedAt || tick)}</div>
            </div>
            <div className="mt-4 text-sm font-bold text-red-100/50">오늘 총 만든 후카</div>
            <div className="mt-1 text-4xl font-black tracking-tight text-white">{closingSummaryCount}개</div>
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-lg font-black leading-7 text-red-50">
              오늘 총 {closingSummaryCount}개 후카를 만들었어요!
              <br />
              오늘도 수고하셨어요!
            </div>
            <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3">
              <div className="text-xs font-bold text-amber-100/55">오늘 평균 응대 점수</div>
              <div className="mt-1 flex items-end justify-center gap-2">
                <span className="text-3xl font-black text-white">{scoreStats.average ? scoreStats.average.toFixed(1) : "-"}</span>
                <span className="pb-1 text-sm font-black text-amber-100">/ 5점 · {scoreStats.grade}</span>
              </div>
              <div className="mt-1 text-xs font-bold text-amber-100/50">확인 기록 {scoreStats.count}개 기준</div>
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-left">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
                <BarChart3 className="h-4 w-4 text-red-200" /> 오늘 영업 리포트
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold text-red-100/65">
                <div className="rounded-xl bg-white/[0.04] p-2"><span className="block text-red-100/35">영업 시작시간</span><span className="mt-0.5 block text-red-50">{formatDateTime(timestampToDate(operationPeriodStart))}</span></div>
                <div className="rounded-xl bg-white/[0.04] p-2"><span className="block text-red-100/35">영업 마감시간</span><span className="mt-0.5 block text-red-50">{formatDateTime(timestampToDate(closingSummaryEndedAt || tick))}</span></div>
                <div className="rounded-xl bg-white/[0.04] p-2"><span className="block text-red-100/35">진행 중 타이머</span><span className="mt-0.5 block text-red-50">{operationReport.activeTimerCount}개</span></div>
                <div className="rounded-xl bg-white/[0.04] p-2"><span className="block text-red-100/35">가장 바빴던 시간</span><span className="mt-0.5 block text-red-50">{operationReport.busiestHourLabel}</span></div>
                <div className="rounded-xl bg-white/[0.04] p-2"><span className="block text-red-100/35">많이 나간 테이블</span><span className="mt-0.5 block text-red-50">{operationReport.busiestTableName}</span></div>
                <div className="col-span-2 rounded-xl bg-white/[0.04] p-2"><span className="block text-red-100/35">가장 늦어졌던 단계</span><span className="mt-0.5 block text-red-50">{operationReport.slowestTaskLabel}{operationReport.slowestTaskAverageDelay ? ` · 평균 ${formatDelaySeconds(operationReport.slowestTaskAverageDelay)}` : ""}</span></div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-red-100/60">{closingSummaryMessage}</p>
            <button
              type="button"
              onClick={finishClosingShift}
              className="mt-5 w-full rounded-2xl border border-red-500/60 bg-red-600 px-4 py-4 font-black text-white shadow-lg shadow-red-950/40 hover:bg-red-500"
            >
              깔끔하게 마감 완료
            </button>
          </div>
        </div>
      )}
      {showScoreSummary && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm md:items-center"
          onClick={() => setShowScoreSummary(false)}
        >
          <div
            className="w-full max-w-md rounded-[2rem] border border-amber-400/40 bg-[#100D09] p-5 shadow-2xl shadow-amber-950/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xl font-black text-white"><Trophy className="h-5 w-5 text-amber-200" /> 점수 확인</div>
                <div className="mt-1 text-sm text-amber-100/50">영업 시작 이후 확인 반응 속도 기준입니다.</div>
              </div>
              <button type="button" onClick={() => setShowScoreSummary(false)} className="rounded-full border border-amber-300/20 bg-black/30 p-2 text-amber-100/70 hover:bg-amber-500/10" aria-label="점수 확인 닫기">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-3xl border border-amber-400/25 bg-amber-400/10 p-4 text-center">
              <div className="text-xs font-bold text-amber-100/50">현재 평균 점수</div>
              <div className="mt-1 text-5xl font-black tracking-tight text-white">{scoreStats.average ? scoreStats.average.toFixed(1) : "-"}</div>
              <div className="mt-1 text-sm font-black text-amber-100">{scoreStats.grade} 등급 · 총 {scoreStats.count}회 확인</div>
              <p className="mt-3 text-sm leading-6 text-amber-100/60">{scoreStats.message}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="text-white text-lg">5점</div><div className="mt-1 text-white/45">10초 이내</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="text-white text-lg">4점</div><div className="mt-1 text-white/45">20초 이내</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="text-white text-lg">3점</div><div className="mt-1 text-white/45">20초 초과</div></div>
            </div>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {scoreRecords.length > 0 ? scoreRecords.slice(0, 20).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-black text-white">{entry.tableName} · {entry.taskLabel}</div>
                      <div className="mt-1 text-xs text-white/45">{formatDateTime(timestampToDate(entry.acknowledgedAt))} · {formatDelaySeconds(entry.delaySeconds)} 후 확인</div>
                    </div>
                    <div className="shrink-0 rounded-full bg-amber-400/15 px-3 py-1 text-sm font-black text-amber-100">{entry.score}점</div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center text-sm font-bold text-white/45">아직 점수 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}
      {showClosingSmoke && (
        <div className="closing-smoke-overlay" role="presentation">
          <div className="closing-smoke closing-smoke-a" />
          <div className="closing-smoke closing-smoke-b" />
          <div className="closing-smoke closing-smoke-c" />
          <div className="closing-smoke closing-smoke-d" />
          <div className="closing-smoke-message">
            <div className="text-sm font-bold text-white/45">Chilling Timer</div>
            <div className="mt-2 text-3xl font-black text-white">마감 완료</div>
            <div className="mt-2 text-sm font-bold text-white/55">오늘도 고생 많았어요.</div>
            <button
              type="button"
              onClick={() => {
                setShowClosingSmoke(false);
                setShowClosingSummary(false);
                setNotificationStatus("마감 화면을 닫았습니다.");
              }}
              className="mt-6 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white/80 backdrop-blur hover:bg-white/15"
            >
              다시 열기
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl space-y-3 md:space-y-4">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/35 bg-red-500/10 shadow-lg shadow-red-950/25">
                <Clock className="h-5 w-5 text-red-300" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-tight text-white md:text-3xl">Chilling Timer</h1>
                <div className="mt-1 h-1 w-12 rounded-full bg-red-500/80" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-[11px] font-black md:flex-row md:items-center">
              <button
                type="button"
                onClick={toggleAdminMode}
                className={`rounded-full border px-3 py-1.5 transition ${adminMode ? "border-red-400/60 bg-red-500/15 text-red-100" : "border-white/10 bg-black/30 text-neutral-400 hover:border-red-400/40 hover:text-red-100"}`}
              >
                {adminMode ? "관리자" : "직원"}
              </button>
              <span className={`rounded-full border px-3 py-1.5 ${shiftActive ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/30 text-neutral-400"}`}>
                {shiftActive ? `영업중 · ${formatTime(timestampToDate(shift.startedAt))}` : "영업 시작 전"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 md:flex">
            <button
              type="button"
              onClick={() => {
                if (!adminMode) {
                  setNotificationStatus("프리셋 변경은 관리자 모드에서 할 수 있습니다.");
                  return;
                }
                setShowPresetPicker((value) => !value);
              }}
              className={`min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left outline-none transition focus:border-red-400 ${adminMode ? "hover:border-red-400/50 hover:bg-red-500/10" : "cursor-default"}`}
            >
              <span className="block text-xs font-bold text-neutral-400">현재 프리셋</span>
              <span className="mt-1 block truncate text-xl font-black tracking-tight text-white md:text-3xl">{selectedPreset?.name || "프리셋 선택"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsPanel("menu");
                setShowSettings(true);
              }}
              className="flex min-h-[4.75rem] shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/35 px-4 text-neutral-300 shadow-lg shadow-black/20 transition hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-50 md:min-h-0"
              aria-label="전체 설정 열기"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3">
            {!shiftActive ? (
              <button
                type="button"
                onClick={startShift}
                className="w-full rounded-[1.75rem] border border-emerald-400/45 bg-gradient-to-br from-emerald-500/85 to-emerald-950/90 px-5 py-4 text-left text-lg font-black text-white shadow-2xl shadow-emerald-950/30 transition hover:from-emerald-500 hover:to-emerald-900"
              >
                <span className="block">영업 시작</span>
                <span className="mt-1 block text-xs font-bold text-emerald-100/75">타이머 유지하고 기록 시작</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowScoreSummary(true)}
                className="w-full rounded-[1.75rem] border border-amber-400/35 bg-gradient-to-br from-amber-500/25 to-black/65 px-5 py-4 text-left text-lg font-black text-white shadow-2xl shadow-black/30 transition hover:border-amber-300/60 hover:from-amber-500/35"
              >
                <span className="block">점수 확인</span>
                <span className="mt-1 block text-xs font-bold text-amber-100/65">현재 {scoreStats.average ? scoreStats.average.toFixed(1) : "-"}점 · {scoreStats.grade} 등급</span>
              </button>
            )}
          </div>

          {showPresetPicker && (
            <div className="mt-3 rounded-3xl border border-white/10 bg-black/45 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-black text-neutral-100">프리셋 선택</div>
                <button type="button" onClick={addLayoutPreset} className="flex items-center gap-1 rounded-xl border border-red-500/50 bg-red-600/80 px-3 py-2 text-xs font-bold text-red-50 hover:bg-red-600">
                  <Save className="h-3.5 w-3.5" /> 새 프리셋
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {layoutPresets.map((preset) => {
                  const selected = preset.id === selectedPresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyLayoutPreset(preset.id)}
                      className={`rounded-2xl border p-3 text-left transition ${selected ? "border-red-400/80 bg-red-500/15 text-white" : "border-white/10 bg-white/[0.035] text-neutral-300 hover:border-red-400/40 hover:bg-red-500/10"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-black">{preset.name}</span>
                        {selected && <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black text-white">선택됨</span>}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">{presetSummary(preset)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </header>


        {notificationStatus && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-sm font-bold text-neutral-400 backdrop-blur-xl">
            {notificationStatus}
          </div>
        )}

        <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/25 backdrop-blur-xl md:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-black text-white"><LayoutGrid className="h-5 w-5 text-red-300" /> 테이블 위치</div>
              <p className="mt-1 text-sm text-red-100/50">테이블의 + 버튼으로 해당 테이블에 바로 후카를 추가할 수 있습니다.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={toggleTimerMoveMode}
                className={`rounded-2xl border px-3 py-3 text-sm font-black whitespace-nowrap shadow-lg shadow-black/20 ${timerMoveMode ? "border-amber-400/80 bg-amber-500/15 text-amber-100" : "border-red-950/70 bg-black/50 text-red-100/75 hover:bg-red-950/70 hover:text-red-50"}`}
                aria-label={timerMoveMode ? "자리이동 취소" : "자리이동 시작"}
              >
                자리이동
              </button>
              {adminMode && (
                <button
                  type="button"
                  onClick={() => setShowTableSettings((value) => !value)}
                  className={`rounded-2xl border p-3 shadow-lg shadow-black/20 ${showTableSettings ? "border-red-500/80 bg-red-900 text-red-50" : "border-red-950/70 bg-black/50 text-red-100/75 hover:bg-red-950/70 hover:text-red-50"}`}
                  aria-label={showTableSettings ? "테이블 설정 닫기" : "테이블 설정 열기"}
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {timerMoveMode && (
            <div className="mb-4 rounded-[1.5rem] border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-bold text-amber-100 shadow-lg shadow-amber-950/20">
              {timerMoveSourceTableId ? (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <span>{timerMoveSourceTable?.name || "선택한 테이블"}의 타이머 {timerMoveSourceCount}개 선택됨 · 옮길 테이블을 눌러주세요.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTimerMoveSourceTableId(null);
                      setNotificationStatus("자리이동 출발 테이블 선택을 취소했습니다.");
                    }}
                    className="rounded-xl border border-amber-300/40 bg-black/25 px-3 py-2 text-xs font-black text-amber-100 hover:bg-black/40"
                  >
                    다시 선택
                  </button>
                </div>
              ) : (
                <span>자리이동 모드 · 먼저 타이머가 있는 테이블을 누르고, 다음에 옮길 테이블을 눌러주세요.</span>
              )}
            </div>
          )}

          {showTableSettings && (
            <div className="mb-4 rounded-[1.5rem] border border-red-950/60 bg-black/25 p-3 md:p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-red-100">테이블 설정</div>
                  <p className="mt-1 text-xs text-red-100/45">테이블 추가, 삭제, 위치 수정, 이름 수정, 배치 크기를 여기서 관리합니다. 설정 버튼을 다시 누르면 닫힙니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTableSettings(false)}
                  className="rounded-full border border-red-950/70 bg-black/40 p-2 text-red-100/60 hover:bg-red-950/60 hover:text-red-50"
                  aria-label="테이블 설정 닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <button onClick={addTable} className="rounded-2xl border border-red-700/70 bg-red-900 px-4 py-3 text-left font-black text-red-50 hover:bg-red-800">
                  <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> 테이블 추가</span>
                  <span className="mt-1 block text-xs font-bold text-red-100/55">새 테이블 추가</span>
                </button>
                <button onClick={removeLastTable} className="rounded-2xl border border-red-950/70 bg-black/40 px-4 py-3 text-left font-black text-red-100/75 hover:bg-red-950/70">
                  <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> 테이블 삭제</span>
                  <span className="mt-1 block text-xs font-bold text-red-100/45">마지막 테이블 삭제</span>
                </button>
                <button
                  onClick={() => {
                    setLayoutEditMode((value) => !value);
                    setTimerMoveMode(false);
                    setTimerMoveSourceTableId(null);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left font-black ${layoutEditMode ? "border-red-400 bg-red-950/80 text-white" : "border-red-950/60 bg-[#241012] text-red-100/75 hover:bg-[#321316]"}`}
                >
                  <span className="flex items-center gap-2">{layoutEditMode ? <X className="h-4 w-4" /> : <Move className="h-4 w-4" />} 테이블 위치 수정</span>
                  <span className="mt-1 block text-xs font-bold text-red-100/45">드래그/방향키 이동</span>
                </button>
                <button
                  onClick={() => setTableEditMode((value) => !value)}
                  className={`rounded-2xl border px-4 py-3 text-left font-black ${tableEditMode ? "border-red-400 bg-red-950/80 text-white" : "border-red-950/60 bg-[#241012] text-red-100/75 hover:bg-[#321316]"}`}
                >
                  <span className="flex items-center gap-2">{tableEditMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />} 테이블 이름 수정</span>
                  <span className="mt-1 block text-xs font-bold text-red-100/45">이름 입력창 표시</span>
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-red-950/60 bg-black/25 p-3">
                <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-black text-red-100">배치 영역 크기</div>
                    <div className="mt-1 text-xs text-red-100/45">현재 {layoutWidth} × {layoutHeight}</div>
                  </div>
                  <button onClick={resetLayoutSize} className="rounded-xl border border-red-950/60 bg-black/35 px-3 py-2 text-xs font-bold text-red-100/70 hover:bg-red-950/50">기본값</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <button onClick={() => changeLayoutSize(20, 0)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-3 font-bold text-red-100 hover:bg-[#321316]">가로 +</button>
                  <button onClick={() => changeLayoutSize(-20, 0)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-3 font-bold text-red-100 hover:bg-[#321316]">가로 -</button>
                  <button onClick={() => changeLayoutSize(0, 20)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-3 font-bold text-red-100 hover:bg-[#321316]">세로 +</button>
                  <button onClick={() => changeLayoutSize(0, -20)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-3 font-bold text-red-100 hover:bg-[#321316]">세로 -</button>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-xs leading-5 text-red-100/45">테이블 관련 변경사항도 현재 프리셋에 같이 저장됩니다.</div>
                <button onClick={() => saveCurrentPresetSnapshot(true)} className="rounded-xl border border-red-800/70 bg-red-900 px-4 py-3 text-sm font-black text-red-50 hover:bg-red-800 flex items-center justify-center gap-2">
                  <Save className="h-4 w-4" /> 현재 프리셋 저장
                </button>
              </div>
            </div>
          )}

          <div ref={layoutBoardRef} onClick={handleLayoutBoardClick} onPointerMove={moveLayoutDrag} onPointerUp={endLayoutDrag} onPointerCancel={endLayoutDrag} className={`relative h-[620px] md:h-[720px] rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_0%,_rgba(239,68,68,0.16),_transparent_36%),linear-gradient(145deg,rgba(12,12,14,0.94),rgba(5,5,6,0.96))] overflow-hidden shadow-inner shadow-black/60 ${layoutEditMode ? "touch-none select-none cursor-crosshair" : timerMoveMode ? "touch-pan-y cursor-pointer" : "touch-pan-y"}`}>
            {fixtures.map((fixture) => {
              const selected = selectedLayoutTarget.type === "fixture" && selectedLayoutTarget.id === fixture.id;
              const Icon = fixture.type === "bar" ? Wine : DoorOpen;
              return (
                <button
                  key={fixture.id}
                  onPointerDown={(event) => startLayoutDrag(event, { type: "fixture", id: fixture.id })}
                  onClick={(event) => selectFixtureOnly(event, fixture.id)}
                  className={`absolute rounded-2xl border px-3 py-2 text-xs font-bold shadow-lg ${selected ? "border-red-300 bg-red-950/80 text-red-50" : "border-red-950/60 bg-black/45 text-red-100/45"}`}
                  style={{ left: `${((fixture.x ?? 4) / layoutWidth) * 100}%`, top: `${((fixture.y ?? 4) / layoutHeight) * 100}%`, transform: `scale(${layoutScale})`, transformOrigin: "top left" }}
                >
                  <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {fixture.name}</span>
                </button>
              );
            })}

            {tables.map((table) => {
              const summary = tableSummary(table.id);
              const selected = table.id === selectedTableId && (layoutEditMode || tableEditMode || timerMoveMode);
              const timerMoveSource = timerMoveSourceTableId === table.id;
              const timerMoveTargetable = timerMoveMode && timerMoveSourceTableId && timerMoveSourceTableId !== table.id;
              const tableCardStateClass = timerMoveSource
                ? "border-amber-300 bg-amber-500/15 shadow-lg shadow-amber-950/45"
                : timerMoveTargetable
                  ? "border-amber-300/60 bg-[#24180A]/95 shadow-lg shadow-amber-950/25"
                  : summary.overdue
                ? "border-red-400/80 bg-red-950/70 shadow-lg shadow-red-950/45"
                : summary.critical
                  ? "border-amber-400/80 bg-amber-950/45 shadow-lg shadow-amber-950/30"
                  : summary.coverDue
                    ? "border-emerald-300/80 bg-emerald-950/35 shadow-lg shadow-emerald-950/30"
                  : summary.refillDue
                    ? "border-emerald-300/80 bg-emerald-950/35 shadow-lg shadow-emerald-950/30"
                    : selected
                      ? "border-red-400 bg-red-950/80 shadow-lg shadow-red-950/50"
                      : summary.soon
                        ? "border-amber-500/70 bg-[#2B1710]/95 shadow-lg shadow-amber-950/20"
                        : summary.count
                          ? "border-red-800/70 bg-[#241012]/95"
                          : "border-red-950/60 bg-black/60";
              return (
                <div
                  key={table.id}
                  onPointerDown={(event) => startLayoutDrag(event, { type: "table", id: table.id })}
                  className="absolute w-[118px] md:w-[136px]"
                  style={{ left: `${((table.x ?? 8) / layoutWidth) * 100}%`, top: `${((table.y ?? 10) / layoutHeight) * 100}%`, transform: `scale(${layoutScale})`, transformOrigin: "top left" }}
                >
                  <div className={`relative min-h-[112px] rounded-3xl border p-3 text-left transition-all ${tableCardStateClass}`}>
                    <button onClick={(event) => selectTableOnly(event, table.id)} className="w-full text-left pr-9">
                      <div className="flex items-center justify-between gap-2">
                        <Armchair className={`h-5 w-5 ${summary.refillDue || summary.coverDue ? "text-emerald-100" : summary.critical || summary.soon ? "text-amber-100" : selected || summary.overdue ? "text-red-100" : "text-red-300/70"}`} />
                        <div className="mr-8 flex flex-col items-end gap-1">
                          {summary.count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${summary.critical || summary.soon ? "bg-black/45 text-amber-100" : "bg-red-900 text-red-50"}`}>{summary.count}</span>}
                        </div>
                      </div>
                      <div className="mt-2 truncate text-sm font-black text-white">{table.name}</div>
                      <div className={`mt-1 min-h-[34px] text-xs leading-4 ${summary.refillDue || summary.coverDue ? "text-emerald-100/75" : summary.critical || summary.soon ? "text-amber-100/85" : "text-red-100/55"}`}>
                        {summary.next ? (
                          <>
                            <div className="truncate">{summary.next.nextTask.label}</div>
                            <div className={summary.overdue || summary.critical ? "font-black text-white" : ""}>{formatTime(summary.next.nextTask.time)} · {statusLabel(summary.next.nextTask.time)}</div>
                          </>
                        ) : (
                          <div className="text-red-100/25">비어있음</div>
                        )}
                      </div>
                    </button>
                    {timerMoveMode && (timerMoveSource || timerMoveTargetable) && (
                      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-3xl border border-amber-300/40 bg-amber-400/10 backdrop-blur-[1px]">
                        <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-black text-amber-100 shadow-lg shadow-black/30">
                          {timerMoveSource ? "이동할 타이머" : "여기로 이동"}
                        </span>
                      </div>
                    )}
                    {summary.critical && !summary.overdue && !timerMoveMode && (
                      <div className="table-state-overlay table-urgent-overlay" aria-hidden="true">
                        <span>임박</span>
                      </div>
                    )}
                    {summary.coverDue && !timerMoveMode && (
                      <div className="table-state-overlay table-cover-overlay" aria-hidden="true">
                        <span>숯 뚜껑<br />열어주기</span>
                      </div>
                    )}
                    {summary.refillDue && !timerMoveMode && (
                      <button
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onTouchStart={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => handleRefillReminderClick(event, table.id)}
                        className="table-state-overlay table-refill-overlay"
                        aria-label={`${table.name} 후카 추가 알림`}
                      >
                        <span>후카 추가?</span>
                      </button>
                    )}
                    {summary.overdue && summary.next && !timerMoveMode && (
                      <button
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onTouchStart={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          acknowledgeTask(summary.next.row.id, summary.next.nextTask.key);
                        }}
                        className="table-state-overlay table-confirm-overlay"
                        aria-label={`${table.name} 확인`}
                      >
                        <span>확인</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onTouchStart={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (timerMoveMode) return;
                        addRow(table.id);
                      }}
                      disabled={timerMoveMode}
                      className={`absolute right-3 top-3 z-30 rounded-2xl border p-2 shadow-lg shadow-red-950/30 ${timerMoveMode ? "border-white/10 bg-black/35 text-white/25" : "border-red-700/70 bg-red-900 text-red-50 hover:bg-red-800"}`}
                      aria-label={`${table.name} 후카 추가`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {layoutEditMode && selected && (
                    <div className="mt-2 rounded-2xl border border-red-900/70 bg-red-950/40 px-3 py-2 text-center text-xs font-bold text-red-100">
                      선택됨 · 원하는 위치를 터치
                    </div>
                  )}
                  {tableEditMode && (
                    <input value={table.name} onChange={(e) => updateTableName(table.id, e.target.value)} className="mt-2 w-full rounded-xl bg-black/70 border border-red-950/70 px-3 py-2 text-xs outline-none focus:border-red-400" />
                  )}
                </div>
              );
            })}
          </div>
          {layoutEditMode && (
            <div className="mt-3 rounded-3xl border border-red-950/70 bg-black/35 p-3">
              <div className="mb-2 text-center text-xs font-bold text-red-100/70">선택: {selectedLayoutLabel()}</div>
              <div className="mx-auto grid w-44 grid-cols-3 gap-2">
                <div />
                <button onClick={() => moveSelectedLayoutTarget(0, -2)} className="rounded-2xl bg-[#241012] p-3 flex justify-center border border-red-950/60"><ArrowUp className="h-4 w-4" /></button>
                <div />
                <button onClick={() => moveSelectedLayoutTarget(-2, 0)} className="rounded-2xl bg-[#241012] p-3 flex justify-center border border-red-950/60"><ArrowLeft className="h-4 w-4" /></button>
                <button onClick={() => moveSelectedLayoutTarget(0, 0)} className="rounded-2xl bg-red-900/80 p-3 flex justify-center border border-red-700/70"><Move className="h-4 w-4" /></button>
                <button onClick={() => moveSelectedLayoutTarget(2, 0)} className="rounded-2xl bg-[#241012] p-3 flex justify-center border border-red-950/60"><ArrowRight className="h-4 w-4" /></button>
                <div />
                <button onClick={() => moveSelectedLayoutTarget(0, 2)} className="rounded-2xl bg-[#241012] p-3 flex justify-center border border-red-950/60"><ArrowDown className="h-4 w-4" /></button>
                <div />
              </div>
              <p className="mt-3 text-center text-xs text-red-100/45">테이블/입구/바를 드래그해서 위치를 옮길 수 있고, 배치판을 터치하거나 아래 방향키로도 조정할 수 있습니다. 테이블은 아주 가까운 다른 테이블과만 자동으로 가로/세로 정렬됩니다.</p>
            </div>
          )}
        </section>

        {shiftActive && (
          <button
            type="button"
            onClick={openClosingSummary}
            className="w-full rounded-[1.75rem] border border-red-500/50 bg-gradient-to-br from-red-700/90 to-red-950/90 px-5 py-5 text-lg font-black text-white shadow-2xl shadow-red-950/40 transition hover:from-red-600 hover:to-red-900"
          >
            퇴근!
            <span className="mt-1 block text-xs font-bold text-red-100/65">오늘 영업 리포트 보기</span>
          </button>
        )}

      </div>
    </div>
  );
}

export default function HookahTimerApp() {
  return (
    <AppErrorBoundary>
      <HookahTimerAppInner />
    </AppErrorBoundary>
  );
}

function TimerModeControl({ mode, onToggle, showHelp, onToggleHelp, disabled = false, className = "" }) {
  return (
    <div className={`relative flex w-full shrink-0 md:w-[13.5rem] ${className}`}>
      <button
        type="button"
        onClick={() => { if (!disabled) onToggle(); }}
        className={`relative w-full rounded-2xl border border-red-500/35 bg-red-500/10 px-3 py-3 pr-9 text-left shadow-lg shadow-black/20 transition ${disabled ? "cursor-default opacity-90" : "hover:border-red-400/70 hover:bg-red-500/20"}` }
      >
        <div className="flex h-full items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-black/30 text-red-200">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-[11px] font-bold text-neutral-400">타이머 세팅 기준</span>
            <span className="mt-0.5 block truncate text-sm font-black text-red-50 md:text-base">{mode === "start" ? "처음 숯 3개" : "후카 나간 시간"}</span>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleHelp();
        }}
        className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/65 p-1.5 text-neutral-300 shadow-lg hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-50"
        aria-label="타이머 세팅 기준 설명"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {showHelp && (
        <div className="fixed left-4 right-4 top-32 z-[100] rounded-2xl border border-red-500/40 bg-black/95 p-3 text-sm leading-5 text-red-50 shadow-2xl shadow-black/50 md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-80">
          타이머 자동설정을 "숯 3개 올린 시점" 혹은 "후카가 손님에게 나간 시점" 중 하나로 선택할 수 있습니다.
        </div>
      )}
    </div>
  );
}

function TimerSortControl({ value, onChange }) {
  const options = [
    ["time", "남은시간순"],
    ["table", "테이블명순"],
  ];

  return (
    <div className="flex rounded-xl border border-red-800/50 bg-black/30 p-1 text-xs font-black">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-lg px-3 py-1.5 ${value === key ? "bg-red-900 text-red-50" : "text-red-100/50 hover:bg-red-950/60"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TimerSettingInput({ label, value, onChange, helpKey, openHelp, setOpenHelp, helpText }) {
  const isOpen = openHelp === helpKey;

  return (
    <label className="relative space-y-2">
      <span className="block pr-7 text-sm text-red-100/60">{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpenHelp(isOpen ? null : helpKey);
        }}
        className="absolute right-0 top-0 rounded-full border border-red-700/80 bg-black/80 p-1 text-red-100 shadow-lg hover:bg-red-950"
        aria-label={`${label} 설명`}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl bg-black/50 border border-red-950/70 px-4 py-3 outline-none focus:border-red-400"
      />
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-red-800/80 bg-black/95 p-3 text-sm leading-5 text-red-50 shadow-2xl shadow-red-950/40">
          {helpText}
        </div>
      )}
    </label>
  );
}


function VerticalTimeRow({ label, date, important = false, confirmed = false }) {
  const diff = minutesUntil(date);
  const urgent = date && diff <= 0 && !confirmed;
  const soon = date && diff > 0 && diff <= 1;

  return (
    <div className={`grid grid-cols-[1.25fr_1fr_1fr] items-center px-3 py-3 text-sm ${urgent ? "bg-red-950/35" : ""}`}>
      <div className="font-bold text-red-50">{label}</div>
      <div className={`font-black ${urgent ? "text-red-200" : soon ? "text-amber-200" : important ? "text-white" : "text-red-50"}`}>{formatTime(date)}</div>
      <div className="text-xs text-red-100/45">{confirmed ? "확인됨" : statusLabel(date)}</div>
    </div>
  );
}

function VerticalServedTimeRow({ row, schedule, settings, onUpdate }) {
  if (settings.calculationMode !== "start") {
    return <VerticalTimeRow label="후카 나감" date={schedule.served} confirmed={Boolean(row.acknowledged?.served)} />;
  }

  const value = row.servedTimeEdited ? row.servedTime : formatTime(schedule.served);
  const confirmed = Boolean(row.acknowledged?.served);

  return (
    <div className="grid grid-cols-[1.25fr_1fr_1fr] items-center gap-2 bg-red-950/20 px-3 py-3 text-sm">
      <div className="font-bold text-red-50">후카 나감</div>
      <div>
        <input
          type="time"
          value={value === "-" ? "" : value}
          onChange={(e) => onUpdate(row.id, { servedTime: e.target.value, servedTimestamp: timestampForTimeValue(e.target.value, null), servedTimeEdited: true })}
          className="w-full rounded-xl bg-black/45 border border-red-950/70 px-2 py-2 font-black text-white outline-none focus:border-red-400"
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-red-100/45">
        <span>{confirmed ? "확인됨" : statusLabel(schedule.served)}</span>
        {row.servedTimeEdited && (
          <button onClick={() => onUpdate(row.id, { servedTimeEdited: false })} className="w-fit rounded-lg border border-red-950/70 px-2 py-0.5 text-red-100/60 hover:bg-red-950/40">
            자동
          </button>
        )}
      </div>
    </div>
  );
}

function RowActions({ row, onComplete, onRemove, mobile = false }) {
  return (
    <div className={mobile ? "grid grid-cols-2 gap-2" : "flex gap-2"}>
      <button onClick={() => onComplete(row)} className={`rounded-xl px-3 py-3 flex items-center justify-center gap-1 font-semibold ${row.completed ? "bg-neutral-900 text-red-200 border border-red-900/80 hover:bg-red-950" : "bg-red-900 text-red-50 hover:bg-red-800 border border-red-700/70"}`}>
        <CheckCircle2 className="h-4 w-4 shrink-0" /> <span className={row.completed ? "whitespace-nowrap" : ""}>{row.completed ? "완료 취소" : "완료"}</span>
      </button>
      <button onClick={() => onRemove(row.id)} className="rounded-xl bg-black/50 border border-red-950/70 px-3 py-3 hover:bg-red-950/70 flex items-center justify-center">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ServedTimeCell({ row, schedule, settings, onUpdate }) {
  if (settings.calculationMode !== "start") {
    return <TableTimeCell date={schedule.served} />;
  }

  const value = row.servedTimeEdited ? row.servedTime : formatTime(schedule.served);

  return (
    <td className="p-3 align-top">
      <input
        type="time"
        value={value === "-" ? "" : value}
        onChange={(e) => onUpdate(row.id, { servedTime: e.target.value, servedTimestamp: timestampForTimeValue(e.target.value, null), servedTimeEdited: true })}
        className="w-full rounded-xl bg-black/50 border border-red-950/70 px-3 py-2 font-semibold text-red-50 outline-none focus:border-red-400"
      />
      <div className="mt-1 flex items-center gap-2 text-red-100/40">
        <span>{statusLabel(schedule.served)}</span>
        {row.servedTimeEdited && (
          <button onClick={() => onUpdate(row.id, { servedTimeEdited: false })} className="rounded-lg border border-red-950/70 px-2 py-0.5 text-xs text-red-100/60 hover:bg-red-950/40">
            자동
          </button>
        )}
      </div>
    </td>
  );
}

function TableTimeCell({ date, important = false }) {
  if (!date) {
    return <td className="p-3 align-top text-red-100/20">-</td>;
  }

  const diff = minutesUntil(date);
  const urgent = diff <= 0;
  const soon = diff > 0 && diff <= 1;

  return (
    <td className="p-3 align-top">
      <div className={`font-semibold ${urgent ? "text-red-300" : soon ? "text-amber-200" : important ? "text-white" : "text-red-50"}`}>{formatTime(date)}</div>
      <div className="text-red-100/40 mt-1">{statusLabel(date)}</div>
    </td>
  );
}

function MobileServedTimeCell({ row, schedule, settings, onUpdate }) {
  if (settings.calculationMode !== "start") {
    return <MobileTimeCell label="후카 나감" date={schedule.served} />;
  }

  const value = row.servedTimeEdited ? row.servedTime : formatTime(schedule.served);

  return (
    <div className="rounded-2xl border border-red-800/80 bg-red-950/30 p-3">
      <div className="text-xs text-red-100/50">후카 나감</div>
      <input
        type="time"
        value={value === "-" ? "" : value}
        onChange={(e) => onUpdate(row.id, { servedTime: e.target.value, servedTimestamp: timestampForTimeValue(e.target.value, null), servedTimeEdited: true })}
        className="mt-1 w-full rounded-xl bg-black/45 border border-red-950/70 px-2 py-2 text-xl font-black text-white outline-none focus:border-red-400"
      />
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-red-100/40">
        <span>{statusLabel(schedule.served)}</span>
        {row.servedTimeEdited && (
          <button onClick={() => onUpdate(row.id, { servedTimeEdited: false })} className="rounded-lg border border-red-950/70 px-2 py-0.5 text-red-100/60 hover:bg-red-950/40">
            자동
          </button>
        )}
      </div>
    </div>
  );
}

function MobileTimeCell({ label, date, important = false }) {
  const diff = minutesUntil(date);
  const urgent = date && diff <= 0;
  const soon = date && diff > 0 && diff <= 1;

  return (
    <div className={`rounded-2xl border p-3 ${urgent ? "border-red-500/80 bg-red-950/40" : important ? "border-red-800/80 bg-red-950/30" : "border-red-950/60 bg-black/30"}`}>
      <div className="text-xs text-red-100/50">{label}</div>
      <div className={`mt-1 text-xl font-black ${urgent ? "text-red-200" : soon ? "text-amber-200" : "text-white"}`}>{formatTime(date)}</div>
      <div className="mt-1 text-xs text-red-100/40">{statusLabel(date)}</div>
    </div>
  );
}
