import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Bell, BellOff, CheckCircle2, RotateCcw, Trash2, Clock, Settings, Armchair, LayoutGrid, Pencil, X, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, DoorOpen, Wine, CircleHelp, BookOpen, MapPin, Save } from "lucide-react";

const STORAGE_KEY = "hookah-timer-v2";
const MANUAL_PDF_PATH = "/hookah_timer_user_manual-3.pdf";

const defaultFixtures = [
  { id: "entrance", name: "입구", x: 4, y: 4, type: "entrance" },
  { id: "bar", name: "바 / 준비공간", x: 68, y: 82, type: "bar" },
];

const TASK_ORDER = ["flipThree", "finishThree", "served", "maintenanceTime", "extraCoalFlip", "replaceCoal"];

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
  appTitle: "칠링 후카 타이머",
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

function createLayoutPreset(id, name, positions, options = {}) {
  return {
    id,
    name,
    locked: Boolean(options.locked),
    layoutWidth: options.layoutWidth || 100,
    layoutHeight: options.layoutHeight || 140,
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
    createLayoutPreset(
      "preset-seongsu",
      "성수점 프리셋",
      [
        [8, 10],
        [38, 10],
        [68, 10],
        [8, 38],
        [38, 38],
        [68, 38],
        [18, 66],
        [58, 66],
      ],
      {
        locked: true,
        layoutWidth: 100,
        layoutHeight: 140,
        fixtures: [
          { id: "seongsu-entrance", name: "입구", x: 4, y: 4, type: "entrance" },
          { id: "seongsu-bar", name: "바 / 준비공간", x: 68, y: 82, type: "bar" },
        ],
      }
    ),
    createLayoutPreset(
      "preset-undercity",
      "언더시티 프리셋",
      [
        [7, 10],
        [30, 10],
        [53, 10],
        [76, 10],
        [7, 39],
        [30, 39],
        [53, 39],
        [76, 39],
        [22, 72],
        [61, 72],
      ],
      {
        locked: true,
        layoutWidth: 120,
        layoutHeight: 160,
        fixtures: [
          { id: "undercity-entrance", name: "입구", x: 4, y: 8, type: "entrance" },
          { id: "undercity-bar", name: "바 / 준비공간", x: 88, y: 96, type: "bar" },
        ],
      }
    ),
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
    fixtures: cloneFixturesForLayout(preset?.fixtures),
    tables: cloneTablesForLayout(preset?.tables),
  };
}

function mergeLayoutPresets(savedPresets) {
  const builtIns = createDefaultLayoutPresets();
  const customPresets = Array.isArray(savedPresets)
    ? savedPresets
        .filter((preset) => preset && !preset.locked && !builtIns.some((item) => item.id === preset.id))
        .map((preset, index) => normalizeLayoutPreset(preset, index))
    : [];

  return [...builtIns, ...customPresets];
}

function prepareStoredRows(storedRows, tables) {
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
      acknowledged: row.acknowledged || {},
      timeAdjustments: row.timeAdjustments || {},
    };
  });
}

function createRow(tableId, label = "") {
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
    acknowledged: {},
    timeAdjustments: {},
  };
}

function computeSchedule(row, settings) {
  const a = Number(settings.flipMinutes || 0);
  const b = Number(settings.finishCoalMinutes || 0);
  const c = Number(settings.bowlHeatMinutes || 0);
  const maintenance = Number(settings.customerMaintenanceMinutes || 20);
  const adjustment = row.timeAdjustments || {};
  const adjusted = (key) => Number(adjustment[key] || 0);
  const acknowledged = (key) => acknowledgedDate(row, key);
  const actualOrScheduled = (key, scheduledDate) => acknowledged(key) || scheduledDate;

  if (settings.calculationMode === "served") {
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

  const tasks = getTaskList(schedule, settings).filter((task) => task.time);
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
  const tasks = getTaskList(schedule, settings).filter((task) => row.acknowledged?.[task.key]);
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
  const defaultTables = useMemo(() => makeDefaultTables(), []);
  const [settings, setSettings] = useState(defaultSettings);
  const [tables, setTables] = useState(defaultTables);
  const [fixtures, setFixtures] = useState(defaultFixtures);
  const [rows, setRows] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState("table-1");
  const [selectedLayoutTarget, setSelectedLayoutTarget] = useState({ type: "table", id: "table-1" });
  const [tick, setTick] = useState(Date.now());
  const [currentAlarm, setCurrentAlarm] = useState(null);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [tableEditMode, setTableEditMode] = useState(false);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [showTimerHelp, setShowTimerHelp] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [openSettingHelp, setOpenSettingHelp] = useState(null);
  const [layoutPresets, setLayoutPresets] = useState(() => createDefaultLayoutPresets());
  const [selectedPresetId, setSelectedPresetId] = useState("preset-seongsu");
  const [storageReady, setStorageReady] = useState(false);
  const layoutBoardRef = useRef(null);
  const dragTargetRef = useRef(null);
  const timerCardRefs = useRef({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const oldSaved = JSON.parse(localStorage.getItem("hookah-timer-v1") || "null");
      const data = saved || oldSaved;
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
              ...defaultFixtures[index % defaultFixtures.length],
              ...fixture,
              x: typeof fixture.x === "number" ? fixture.x : defaultFixtures[index % defaultFixtures.length]?.x ?? 4,
              y: typeof fixture.y === "number" ? fixture.y : defaultFixtures[index % defaultFixtures.length]?.y ?? 4,
            }))
          : defaultFixtures;
        const nextSelectedTableId = data.selectedTableId || loadedTables[0]?.id || "table-1";
        const loadedPresets = mergeLayoutPresets(data.layoutPresets);
        setTables(loadedTables);
        setFixtures(loadedFixtures);
        setSettings({ ...defaultSettings, ...(data.settings || {}) });
        setSelectedTableId(nextSelectedTableId);
        setSelectedLayoutTarget(data.selectedLayoutTarget || { type: "table", id: nextSelectedTableId });
        setLayoutPresets(loadedPresets);
        setSelectedPresetId(
          loadedPresets.some((preset) => preset.id === data.selectedPresetId)
            ? data.selectedPresetId
            : loadedPresets[0]?.id || "preset-seongsu"
        );
        setRows(prepareStoredRows(data.rows, loadedTables));
      }
    } catch (error) {
      console.warn("Failed to load saved data", error);
    } finally {
      setStorageReady(true);
    }
  }, [defaultTables]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, tables, fixtures, rows, selectedTableId, selectedLayoutTarget, layoutPresets, selectedPresetId }));
    } catch (error) {
      console.warn("Failed to save data", error);
    }
  }, [storageReady, settings, tables, fixtures, rows, selectedTableId, selectedLayoutTarget, layoutPresets, selectedPresetId]);

  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!settings.alarmEnabled) return;

    rows.forEach((row) => {
      if (row.completed) return;
      const schedule = computeSchedule(row, settings);
      const tableName = tables.find((table) => table.id === row.tableId)?.name || "테이블";
      const nextTask = getNextTask(row, schedule, settings);
      const time = nextTask.time;
      if (!time || Number.isNaN(time.getTime())) return;
      if (!settings.alarmSteps?.[nextTask.key]) return;

      const diff = time.getTime() - Date.now();
      const alreadyAlarmed = row.alarmed?.[nextTask.key];
      if (!alreadyAlarmed && diff <= 0 && diff > -60_000) {
        const alarmedAt = Date.now();
        playBeep();
        showSystemNotification(`${tableName} · ${row.label || "후카"}`, {
          body: `${nextTask.label} · ${formatDateTime(time)}`,
          tag: `hookah-${row.id}-${nextTask.key}`,
          data: { rowId: row.id, taskKey: nextTask.key },
        }).then((shown) => {
          if (shown) return;
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
        });

        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  alarmed: { ...(r.alarmed || {}), [nextTask.key]: true },
                  alarmedAt: { ...(r.alarmedAt || {}), [nextTask.key]: alarmedAt },
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

  const upcomingTasks = useMemo(() => {
    return sortedTimerItems.filter((item) => !item.row.completed && item.nextTask.time);
  }, [sortedTimerItems]);

  const selectedPreset = useMemo(
    () => layoutPresets.find((preset) => preset.id === selectedPresetId) || layoutPresets[0],
    [layoutPresets, selectedPresetId]
  );

  function tableSummary(tableId) {
    const tableRows = rows.filter((row) => row.tableId === tableId && !row.completed);
    if (!tableRows.length) return { count: 0, next: null, urgent: false };

    const nextItems = tableRows
      .map((row) => {
        const schedule = computeSchedule(row, settings);
        const nextTask = getNextTask(row, schedule, settings);
        return { row, nextTask };
      })
      .filter((item) => item.nextTask.time)
      .sort((a, b) => a.nextTask.time.getTime() - b.nextTask.time.getTime());

    const next = nextItems[0] || null;
    const urgent = Boolean(next?.nextTask?.time && minutesUntil(next.nextTask.time) <= 0);
    return { count: tableRows.length, next, urgent };
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
              ...(timingChanged ? { alarmed: {}, alarmedAt: {}, acknowledged: {}, timeAdjustments: {} } : {}),
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

  function clearTaskStateFrom(row, taskKey) {
    const startIndex = TASK_ORDER.indexOf(taskKey);
    if (startIndex < 0) {
      return {
        alarmed: row.alarmed || {},
        alarmedAt: row.alarmedAt || {},
        acknowledged: row.acknowledged || {},
      };
    }

    const nextAlarmed = { ...(row.alarmed || {}) };
    const nextAlarmedAt = { ...(row.alarmedAt || {}) };
    const nextAcknowledged = { ...(row.acknowledged || {}) };

    TASK_ORDER.slice(startIndex).forEach((key) => {
      delete nextAlarmed[key];
      delete nextAlarmedAt[key];
      delete nextAcknowledged[key];
    });

    return { alarmed: nextAlarmed, alarmedAt: nextAlarmedAt, acknowledged: nextAcknowledged };
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

  function toggleLayoutSettings() {
    setShowLayoutSettings((value) => {
      if (value) {
        setTableEditMode(false);
        setLayoutEditMode(false);
      }
      return !value;
    });
  }

  function selectUpcomingTimer(row) {
    setSelectedTableId(row.tableId);
    setSelectedLayoutTarget({ type: "table", id: row.tableId });

    window.requestAnimationFrame(() => {
      timerCardRefs.current[row.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function acknowledgeTask(rowId, taskKey) {
    if (!taskKey) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, acknowledged: { ...(row.acknowledged || {}), [taskKey]: Date.now() } }
          : row
      )
    );
    setCurrentAlarm((prev) => (prev?.rowId === rowId && prev?.taskKey === taskKey ? null : prev));
  }

  function undoLastAcknowledged(row) {
    const schedule = computeSchedule(row, settings);
    const lastTask = getLastAcknowledgedTask(row, schedule, settings);
    if (!lastTask) return;

    setRows((prev) =>
      prev.map((item) => {
        if (item.id !== row.id) return item;
        const nextAcknowledged = { ...(item.acknowledged || {}) };
        delete nextAcknowledged[lastTask.key];
        return { ...item, acknowledged: nextAcknowledged };
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

  function addRow(tableId = selectedTableId) {
    const tableRows = rows.filter((row) => row.tableId === tableId);
    setRows((prev) => [...prev, createRow(tableId, `후카 ${tableRows.length + 1}`)]);
    setSelectedTableId(tableId);
    setSelectedLayoutTarget({ type: "table", id: tableId });
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
    if (selectedTableId === lastTable.id) {
      const nextId = nextTables[nextTables.length - 1]?.id || "table-1";
      setSelectedTableId(nextId);
      setSelectedLayoutTarget({ type: "table", id: nextId });
    }
  }

  function addMany(count) {
    setRows((prev) => {
      const tableRows = prev.filter((row) => row.tableId === selectedTableId);
      const next = [...prev];
      for (let i = 0; i < count; i += 1) next.push(createRow(selectedTableId, `후카 ${tableRows.length + i + 1}`));
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

  function setSelectedLayoutPositionFromPointer(event) {
    if (!layoutEditMode || !selectedLayoutTarget?.id || dragTargetRef.current) return;

    const position = getLayoutPositionFromPointer(event);
    if (!position) return;

    const offsetX = selectedLayoutTarget.type === "fixture" ? 7 : 10;
    const offsetY = selectedLayoutTarget.type === "fixture" ? 4 : 8;
    setLayoutTargetPosition(position.x - offsetX, position.y - offsetY);
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

  function selectTableOnly(event, tableId) {
    if (layoutEditMode) event.stopPropagation();
    setSelectedTableId(tableId);
    setSelectedLayoutTarget({ type: "table", id: tableId });
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

  function applyLayoutPreset(presetId) {
    const preset = layoutPresets.find((item) => item.id === presetId);
    if (!preset) return;

    const nextTables = cloneTablesForLayout(preset.tables);
    const nextFixtures = cloneFixturesForLayout(preset.fixtures);
    const fallbackTableId = nextTables[0]?.id || "table-1";
    const tableIdMap = new Map(tables.map((table, index) => [table.id, nextTables[index]?.id || fallbackTableId]));

    setTables(nextTables);
    setFixtures(nextFixtures);
    setSettings((prev) => ({
      ...prev,
      layoutWidth: Number(preset.layoutWidth || prev.layoutWidth || 100),
      layoutHeight: Number(preset.layoutHeight || prev.layoutHeight || 140),
    }));
    setRows((prev) => prev.map((row) => ({ ...row, tableId: tableIdMap.get(row.tableId) || fallbackTableId })));
    setSelectedTableId(fallbackTableId);
    setSelectedLayoutTarget({ type: "table", id: fallbackTableId });
    setSelectedPresetId(preset.id);
  }

  function addLayoutPreset() {
    const fallbackName = `${settings.appTitle || "매장"} 프리셋`;
    const name = window.prompt("프리셋 이름을 입력하세요.", fallbackName);
    const trimmedName = name?.trim();
    if (!trimmedName) return;

    const newPreset = {
      id: `custom-${makeId()}`,
      name: trimmedName,
      locked: false,
      layoutWidth,
      layoutHeight,
      fixtures: cloneFixturesForLayout(fixtures),
      tables: cloneTablesForLayout(tables),
    };

    setLayoutPresets((prev) => [...prev, newPreset]);
    setSelectedPresetId(newPreset.id);
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
      setSelectedPresetId(next[0]?.id || "preset-seongsu");
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

  function resetAll() {
    const ok = window.confirm("모든 후카 타이머를 초기화할까요?");
    if (!ok) return;
    setRows([]);
    setSelectedTableId(tables[0]?.id || "table-1");
    setSelectedLayoutTarget({ type: "table", id: tables[0]?.id || "table-1" });
  }

  return (
    <div className="min-h-screen bg-[#0B0708] text-neutral-100 p-3 md:p-8">
      {currentAlarm && (
        <div className="fixed inset-x-3 top-3 z-50 mx-auto max-w-md">
          <div className="rounded-3xl border border-red-500/80 bg-[#120B0C] p-4 shadow-2xl shadow-red-950/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-red-100">{currentAlarm.tableName} · {currentAlarm.rowLabel}</div>
                <div className="mt-1 text-xl font-black text-white">{currentAlarm.label}</div>
                <div className="mt-1 text-sm text-red-100/60">{currentAlarm.time}</div>
                {currentAlarm.alarmedAt && (
                  <div className="mt-2 rounded-xl border border-red-800/70 bg-black/30 px-3 py-2 text-sm font-black text-amber-100">
                    알림 후 {elapsedSince(currentAlarm.alarmedAt, tick)} 경과
                  </div>
                )}
                {currentAlarm.rowId && currentAlarm.taskKey && (
                  <button
                    type="button"
                    onClick={() => {
                      acknowledgeTask(currentAlarm.rowId, currentAlarm.taskKey);
                      setCurrentAlarm(null);
                    }}
                    className="mt-3 rounded-xl border border-red-700/70 bg-red-900 px-4 py-2 text-sm font-black text-red-50 hover:bg-red-800"
                  >
                    확인
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCurrentAlarm(null)}
                className="rounded-full border border-red-900/70 bg-red-950/50 p-2 text-red-100 hover:bg-red-900"
                aria-label="알림 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl space-y-4 md:space-y-5">
        <header className="rounded-[2rem] border border-red-950/60 bg-gradient-to-br from-[#1A0709] via-[#10090A] to-black p-4 md:p-6 shadow-2xl shadow-red-950/20">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-red-950/70 p-3 shadow-lg shadow-red-950/40 border border-red-900/60">
              <Clock className="h-7 w-7 text-red-200" />
            </div>
            <div className="min-w-0 flex-1">
              <input
                value={settings.appTitle || ""}
                onChange={(e) => updateSetting("appTitle", e.target.value)}
                className="w-full rounded-2xl bg-black/20 border border-red-950/50 px-3 py-2 text-3xl md:text-4xl font-black tracking-tight text-white outline-none focus:border-red-400"
                placeholder="앱 이름"
              />
              <p className="text-red-100/60 mt-1 text-sm md:text-base">테이블별 후카 진행도와 숯 교체 타이밍을 한번에 관리합니다.</p>
            </div>
          </div>
        </header>

        <section className="rounded-[1.75rem] bg-red-950/35 border border-red-700/60 p-4 md:p-5 shadow-xl shadow-red-950/20">
          <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xl font-black text-white">
                <Clock className="h-5 w-5 text-red-200" />
                곧 해야 할 일
              </div>
              <p className="mt-1 text-sm text-red-100/55">가장 먼저 처리할 작업부터 순서대로 표시합니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TimerSortControl value={settings.timerSortMode || "time"} onChange={(value) => updateSetting("timerSortMode", value)} />
              <div className="text-sm font-bold text-red-100/60">진행 중 {activeRows.length}개</div>
              <button onClick={resetAll} className="rounded-xl bg-red-950/70 text-red-100 px-3 py-2 hover:bg-red-900/80 flex items-center gap-2 border border-red-800/50 text-sm font-bold">
                <RotateCcw className="h-4 w-4" />
                모든 후카 타이머 초기화
              </button>
            </div>
          </div>
          {upcomingTasks.length > 0 ? (
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-2">
              {upcomingTasks.slice(0, 8).map(({ row, schedule, nextTask, table }) => {
                const diff = minutesUntil(nextTask.time);
                const overdue = diff <= 0;
                const soon = diff > 0 && diff <= 5;
                const alarmedAt = row.alarmedAt?.[nextTask.key];
                const alarmBase = alarmedAt || (overdue ? nextTask.time?.getTime?.() : null);
                const lastAcknowledgedTask = getLastAcknowledgedTask(row, schedule, settings);
                return (
                  <div
                    key={row.id}
                    className={`rounded-2xl border p-3 text-left transition hover:bg-red-950/60 ${overdue ? "border-red-400 bg-red-950/80" : soon ? "border-amber-300/70 bg-red-950/55" : "border-red-800/70 bg-black/30"}`}
                  >
                    <button type="button" onClick={() => selectUpcomingTimer(row)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-red-100">{table?.name || "테이블"} · {row.label || "후카"}</div>
                          <div className="mt-1 text-lg font-black text-white">{nextTask.label}</div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${overdue ? "bg-red-200 text-red-950" : soon ? "bg-amber-200 text-black" : "bg-black/40 text-red-100/70"}`}>
                          {overdue ? "확인 대기" : soon ? "임박" : "예정"}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-bold text-red-100/75">{formatTime(nextTask.time)} · {statusLabel(nextTask.time)}</div>
                      {alarmBase && (
                        <div className="mt-2 rounded-xl border border-amber-300/30 bg-black/25 px-3 py-2 text-sm font-black text-amber-100">
                          {alarmedAt ? "알림 후" : "예정 시간 후"} {elapsedSince(alarmBase, tick)} 경과
                        </div>
                      )}
                    </button>
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
                        onClick={() => removeRow(row.id)}
                        className="col-span-2 rounded-xl border border-red-950/70 bg-black/45 px-3 py-2 text-sm font-bold text-red-100/70 hover:bg-red-950/70 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        타이머 삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-red-950/60 bg-black/25 p-4 text-center text-red-100/45">진행 중인 후카가 없습니다. 테이블 위치에서 +를 눌러 추가하세요.</div>
          )}
        </section>

        <section className="rounded-[1.75rem] bg-[#120B0C] border border-red-950/60 p-4 md:p-5 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-black text-white"><LayoutGrid className="h-5 w-5 text-red-200" /> 테이블 위치</div>
              <p className="mt-1 text-sm text-red-100/50">테이블의 + 버튼으로 해당 테이블에 바로 후카를 추가할 수 있습니다.</p>
            </div>
            <button onClick={toggleLayoutSettings} className={`rounded-2xl px-4 py-3 border font-bold flex items-center gap-2 ${showLayoutSettings ? "bg-red-900 text-red-50 border-red-700" : "bg-black/40 text-red-100/70 hover:bg-red-950/70 border-red-950/70"}`}>
              {showLayoutSettings ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
              테이블 위치 설정
            </button>
          </div>

          <TimerModeControl
            mode={settings.calculationMode}
            onToggle={() => updateSetting("calculationMode", settings.calculationMode === "start" ? "served" : "start")}
            showHelp={showTimerHelp}
            onToggleHelp={() => setShowTimerHelp((value) => !value)}
          />

          {showLayoutSettings && (
            <>
              <div className="mb-3 rounded-2xl border border-red-950/60 bg-black/25 p-3">
                <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 text-sm font-black text-red-100">
                    <MapPin className="h-4 w-4 text-red-200" />
                    테이블 위치 프리셋
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
                          {preset.locked && <span className="shrink-0 rounded-full border border-red-700/60 bg-black/35 px-2 py-0.5 text-[11px] text-red-100/60">고정</span>}
                        </div>
                        <div className="mt-1 text-xs text-red-100/45">{preset.tables.length}개 테이블 · {preset.layoutWidth} × {preset.layoutHeight}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-3 grid gap-2 md:grid-cols-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <button onClick={removeLastTable} className="rounded-xl bg-black/40 text-red-100/70 hover:bg-red-950/70 border border-red-950/70 px-3 py-2 font-bold flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> 테이블 삭제
                  </button>
                  <button onClick={addTable} className="rounded-xl bg-red-900 text-red-50 hover:bg-red-800 border border-red-700/70 px-3 py-2 font-bold flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> 테이블 추가
                  </button>
                  <button onClick={() => setLayoutEditMode((value) => !value)} className={`rounded-xl px-3 py-2 border font-bold flex items-center gap-1 ${layoutEditMode ? "bg-red-900 text-red-50 border-red-700" : "bg-black/40 border-red-950/70 text-red-100/60"}`}>
                    {layoutEditMode ? <X className="h-3.5 w-3.5" /> : <Move className="h-3.5 w-3.5" />}
                    테이블 위치 수정
                  </button>
                  <button onClick={() => setTableEditMode((value) => !value)} className={`rounded-xl px-3 py-2 border font-bold flex items-center gap-1 ${tableEditMode ? "bg-red-900 text-red-50 border-red-700" : "bg-black/40 border-red-950/70 text-red-100/60"}`}>
                    {tableEditMode ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    테이블 이름 수정
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs md:justify-end">
                  <span className="rounded-xl border border-red-950/60 bg-black/30 px-3 py-2 text-red-100/50">배치 영역 {layoutWidth} × {layoutHeight}</span>
                  <button onClick={() => changeLayoutSize(20, 0)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-2 text-red-100 hover:bg-[#321316]">가로 +</button>
                  <button onClick={() => changeLayoutSize(-20, 0)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-2 text-red-100 hover:bg-[#321316]">가로 -</button>
                  <button onClick={() => changeLayoutSize(0, 20)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-2 text-red-100 hover:bg-[#321316]">세로 +</button>
                  <button onClick={() => changeLayoutSize(0, -20)} className="rounded-xl border border-red-950/60 bg-[#241012] px-3 py-2 text-red-100 hover:bg-[#321316]">세로 -</button>
                  <button onClick={resetLayoutSize} className="rounded-xl border border-red-950/60 bg-black/35 px-3 py-2 text-red-100/70 hover:bg-red-950/50">기본</button>
                </div>
              </div>
            </>
          )}

          <div ref={layoutBoardRef} onClick={setSelectedLayoutPositionFromPointer} onPointerMove={moveLayoutDrag} onPointerUp={endLayoutDrag} onPointerCancel={endLayoutDrag} className={`relative h-[620px] md:h-[720px] rounded-[2rem] border border-red-950/70 bg-[radial-gradient(circle_at_top_left,_rgba(127,29,29,0.28),_rgba(0,0,0,0.15)_42%),linear-gradient(135deg,rgba(0,0,0,0.55),rgba(36,16,18,0.55))] overflow-hidden ${layoutEditMode ? "touch-none select-none cursor-crosshair" : "touch-pan-y"}`}>
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
              const selected = table.id === selectedTableId;
              return (
                <div
                  key={table.id}
                  onPointerDown={(event) => startLayoutDrag(event, { type: "table", id: table.id })}
                  className="absolute w-[118px] md:w-[136px]"
                  style={{ left: `${((table.x ?? 8) / layoutWidth) * 100}%`, top: `${((table.y ?? 10) / layoutHeight) * 100}%`, transform: `scale(${layoutScale})`, transformOrigin: "top left" }}
                >
                  <div className={`relative min-h-[112px] rounded-3xl border p-3 text-left transition-all ${selected ? "border-red-400 bg-red-950/80 shadow-lg shadow-red-950/50" : summary.urgent ? "border-red-500/80 bg-red-950/60" : summary.count ? "border-red-800/70 bg-[#241012]/95" : "border-red-950/60 bg-black/60"}`}>
                    <button onClick={(event) => selectTableOnly(event, table.id)} className="w-full text-left pr-9">
                      <div className="flex items-center justify-between gap-2">
                        <Armchair className={`h-5 w-5 ${selected ? "text-red-100" : "text-red-300/70"}`} />
                        {summary.count > 0 && <span className="mr-8 rounded-full bg-red-900 px-2 py-0.5 text-xs font-bold text-red-50">{summary.count}</span>}
                      </div>
                      <div className="mt-2 truncate text-sm font-black text-white">{table.name}</div>
                      <div className="mt-1 min-h-[34px] text-xs leading-4 text-red-100/55">
                        {summary.next ? (
                          <>
                            <div className="truncate">{summary.next.nextTask.label}</div>
                            <div className={summary.urgent ? "font-bold text-red-200" : ""}>{formatTime(summary.next.nextTask.time)} · {statusLabel(summary.next.nextTask.time)}</div>
                          </>
                        ) : (
                          <div className="text-red-100/25">비어있음</div>
                        )}
                      </div>
                    </button>
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
                        addRow(table.id);
                      }}
                      className="absolute right-3 top-3 rounded-2xl bg-red-900 text-red-50 hover:bg-red-800 border border-red-700/70 p-2 shadow-lg shadow-red-950/30"
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

        <section className="rounded-[1.75rem] bg-[#120B0C] border border-red-950/60 p-4 md:p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xl font-black text-white">전체 후카 타이머</div>
              <p className="mt-1 text-sm text-red-100/50">모든 테이블의 후카를 {settings.timerSortMode === "table" ? "테이블 이름 순" : "남은시간이 적은 순"}으로 표시합니다.</p>
            </div>
          </div>

          <section className="space-y-3">
            {allRowsSorted.map((row) => {
              const schedule = computeSchedule(row, settings);
              const nextTask = getNextTask(row, schedule, settings);
              const table = tables.find((item) => item.id === row.tableId);
              const taskList = getTaskList(schedule, settings);
              const due = Boolean(nextTask.time && nextTask.time.getTime() <= Date.now());
              const alarmedAt = nextTask.time ? row.alarmedAt?.[nextTask.key] : null;
              const alarmBase = nextTask.time ? alarmedAt || (due ? nextTask.time.getTime() : null) : null;
              const lastAcknowledgedTask = getLastAcknowledgedTask(row, schedule, settings);
              const cardClass = row.completed
                ? "bg-black text-neutral-400 opacity-90 border-neutral-900"
                : due
                ? "bg-red-950/50 border-red-700/80 shadow-red-950/30"
                : "bg-[#120B0C] border-red-950/60";

              return (
                <article
                  key={row.id}
                  ref={(element) => {
                    if (element) timerCardRefs.current[row.id] = element;
                    else delete timerCardRefs.current[row.id];
                  }}
                  className={`scroll-mt-4 rounded-[1.75rem] border p-4 shadow-xl ${cardClass}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-red-100/70">
                        <span className="rounded-full border border-red-950/70 bg-black/30 px-3 py-1">{table?.name || "테이블"}</span>
                        <span className="text-red-100/35">후카 나감 {formatTime(schedule.served)}</span>
                      </div>
                      <input value={row.label} onChange={(e) => updateRow(row.id, { label: e.target.value })} className="w-full rounded-2xl bg-black/50 border border-red-950/70 px-4 py-3 text-xl font-bold outline-none focus:border-red-400" placeholder="예: 후카 1" />
                    </div>

                    <div className="w-full md:w-56">
                      <label className="block">
                        <span className="mb-1 block text-xs text-red-100/50">{settings.calculationMode === "start" ? "숯 3개 올린 시간" : "후카 나간 시간"}</span>
                        <input
                          type="time"
                          value={settings.calculationMode === "start" ? row.startTime : row.servedTime}
                          onChange={(e) =>
                            settings.calculationMode === "start"
                              ? updateRowTime(row.id, "startTime", e.target.value, { servedTimeEdited: false })
                              : updateRowTime(row.id, "servedTime", e.target.value)
                          }
                          className="w-full rounded-2xl bg-black/50 border border-red-950/70 px-4 py-3 text-2xl font-black outline-none focus:border-red-400"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-red-950/30 border border-red-900/50 p-4">
                    <div className="text-xs text-red-100/50">다음 할 일</div>
                    <div className="mt-1 text-2xl font-black text-white">{nextTask.label}</div>
                    <div className="mt-1 text-red-100/70">{nextTask.time ? `${formatTime(nextTask.time)} · ${statusLabel(nextTask.time)}` : "-"}</div>
                    {alarmBase && (
                      <div className="mt-3 rounded-xl border border-amber-300/30 bg-black/25 px-3 py-2 text-sm font-black text-amber-100">
                        {alarmedAt ? "알림 후" : "예정 시간 후"} {elapsedSince(alarmBase, tick)} 경과
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                      {nextTask.time && (
                        <>
                          <button onClick={() => adjustTaskTime(row.id, nextTask.key, -1)} className="rounded-xl border border-red-950/70 bg-black/35 px-4 py-2 text-sm font-bold text-red-100/70 hover:bg-red-950/60">
                            -1분
                          </button>
                          <button onClick={() => adjustTaskTime(row.id, nextTask.key, 1)} className="rounded-xl border border-red-950/70 bg-black/35 px-4 py-2 text-sm font-bold text-red-100/70 hover:bg-red-950/60">
                            +1분
                          </button>
                          <button
                            onClick={() => undoLastAcknowledged(row)}
                            disabled={!lastAcknowledgedTask}
                            className={`rounded-xl border px-4 py-2 text-sm font-bold ${lastAcknowledgedTask ? "border-red-950/70 bg-black/35 text-red-100/70 hover:bg-red-950/60" : "border-red-950/40 bg-black/20 text-red-100/25"}`}
                          >
                            이전 단계
                          </button>
                          <button onClick={() => acknowledgeTask(row.id, nextTask.key)} className="rounded-xl border border-red-600/70 bg-red-800 px-4 py-2 text-sm font-black text-red-50 hover:bg-red-700">
                            다음 단계
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-red-950/60">
                    <div className="grid grid-cols-[1.25fr_1fr_1fr] bg-[#241012] px-3 py-2 text-xs font-bold text-red-100/70">
                      <div>단계</div>
                      <div>시간</div>
                      <div>상태</div>
                    </div>
                    <div className="divide-y divide-red-950/50">
                      {taskList.map((task) =>
                        task.key === "served" ? (
                          <VerticalServedTimeRow key={task.key} row={row} schedule={schedule} settings={settings} onUpdate={updateRow} />
                        ) : (
                          <VerticalTimeRow key={task.key} label={task.label} date={task.time} important={task.important} confirmed={Boolean(row.acknowledged?.[task.key])} />
                        )
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <RowActions row={row} onComplete={toggleComplete} onRemove={removeRow} mobile />
                  </div>
                </article>
              );
            })}
            {allRowsSorted.length === 0 && (
              <div className="rounded-3xl border border-red-950/60 bg-black/25 p-6 text-center text-red-100/40">아직 추가된 후카가 없습니다.</div>
            )}
          </section>
        </section>

        {showSettings && (
          <section className="rounded-[1.75rem] bg-[#120B0C] border border-red-950/60 p-4 md:p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-lg font-black text-white">
                <Settings className="h-5 w-5 text-red-200" />
                설정
              </div>
              <span className="text-sm text-red-100/40">현재 기준: {formatDateTime(new Date(tick))}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <TimerSettingInput
                label="a. 숯 3개 뒤집기"
                value={settings.flipMinutes}
                onChange={(value) => updateSetting("flipMinutes", value)}
                helpKey="flipMinutes"
                openHelp={openSettingHelp}
                setOpenHelp={setOpenSettingHelp}
                helpText="처음 숯을 3개 올린 후 몇분후에 뒤집을까요?"
              />
              <TimerSettingInput
                label="b. 숯 굽기 완료"
                value={settings.finishCoalMinutes}
                onChange={(value) => updateSetting("finishCoalMinutes", value)}
                helpKey="finishCoalMinutes"
                openHelp={openSettingHelp}
                setOpenHelp={setOpenSettingHelp}
                helpText="숯 3개를 뒤집은 후 몇분 후에 굽기가 완료되나요?"
              />
              <TimerSettingInput
                label="c. 시샤 히팅"
                value={settings.bowlHeatMinutes}
                onChange={(value) => updateSetting("bowlHeatMinutes", value)}
                helpKey="bowlHeatMinutes"
                openHelp={openSettingHelp}
                setOpenHelp={setOpenSettingHelp}
                helpText="시샤 히팅 시간은 몇분으로 할까요?"
              />
              <TimerSettingInput
                label="숯 털기"
                value={settings.customerMaintenanceMinutes}
                onChange={(value) => updateSetting("customerMaintenanceMinutes", value)}
                helpKey="customerMaintenanceMinutes"
                openHelp={openSettingHelp}
                setOpenHelp={setOpenSettingHelp}
                helpText="후카가 손님에게 처음 나간 후 몇분 후에 숯 털기를 할까요?"
              />
              <button onClick={() => updateSetting("alarmEnabled", !settings.alarmEnabled)} className={`rounded-2xl px-4 py-3 border flex items-center justify-center gap-2 ${settings.alarmEnabled ? "bg-red-900 text-red-50 border-red-700" : "bg-black/40 border-red-950/70 text-red-100/60"}`}>
                {settings.alarmEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                {settings.alarmEnabled ? "알람 ON" : "알람 OFF"}
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-red-950/60 bg-black/25 p-3">
              <div className="mb-2 text-sm font-semibold text-red-100">단계별 알람</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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
          </section>
        )}

        {showManual && (
          <section className="rounded-[1.75rem] bg-[#120B0C] border border-red-950/60 p-4 md:p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-lg font-black text-white">
                <BookOpen className="h-5 w-5 text-red-200" />
                사용설명서
              </div>
              <button onClick={() => setShowManual(false)} className="rounded-2xl border border-red-950/70 bg-black/40 p-2 text-red-100 hover:bg-red-950/70" aria-label="사용설명서 닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe title="후카 타이머 사용설명서" src={MANUAL_PDF_PATH} className="h-[70vh] w-full rounded-2xl border border-red-950/70 bg-black" />
          </section>
        )}

        <footer className="grid gap-2 rounded-[1.75rem] border border-red-950/60 bg-[#120B0C] p-3 shadow-xl md:grid-cols-3">
          <button onClick={() => setShowSettings((value) => !value)} className={`rounded-2xl px-3 py-3 border flex items-center justify-center gap-2 font-bold ${showSettings ? "bg-red-900 text-red-50 border-red-700" : "bg-[#241012] hover:bg-[#321316] border-red-950/60 text-red-100"}`}>
            {showSettings ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            설정
          </button>
          <button onClick={() => setShowManual((value) => !value)} className={`rounded-2xl px-3 py-3 border flex items-center justify-center gap-2 font-bold ${showManual ? "bg-red-900 text-red-50 border-red-700" : "bg-[#241012] hover:bg-[#321316] border-red-950/60 text-red-100"}`}>
            {showManual ? <X className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
            사용설명서 보기
          </button>
          <button onClick={requestNotificationPermission} className="rounded-2xl bg-[#241012] px-3 py-3 hover:bg-[#321316] border border-red-950/60 flex items-center justify-center gap-2 font-bold text-red-100">
            {settings.alarmEnabled ? <Bell className="h-4 w-4 text-red-200" /> : <BellOff className="h-4 w-4" />}
            알림 허용
          </button>
          {notificationStatus && (
            <div className="rounded-2xl border border-red-950/60 bg-black/25 px-3 py-2 text-center text-sm font-bold text-red-100/60 md:col-span-3">
              {notificationStatus}
            </div>
          )}
        </footer>

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

function TimerModeControl({ mode, onToggle, showHelp, onToggleHelp }) {
  return (
    <div className="mb-3 rounded-2xl border border-red-950/60 bg-black/25 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-black text-red-100">타이머 세팅 기준</div>
          <p className="mt-1 text-xs text-red-100/45">테이블 + 버튼으로 후카를 추가하기 전에 기준을 먼저 선택하세요.</p>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-2xl border border-red-800/70 bg-red-950/70 px-4 py-3 text-left hover:bg-red-900/80"
          >
            <span className="block text-xs text-red-100/60">현재 기준</span>
            <span className="font-bold text-red-50">{mode === "start" ? "처음 숯 3개" : "후카 나간 시간"}</span>
          </button>
          <button
            type="button"
            onClick={onToggleHelp}
            className="rounded-full border border-red-700/80 bg-black/80 p-2 text-red-100 shadow-lg hover:bg-red-950"
            aria-label="타이머 세팅 기준 설명"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
          {showHelp && (
            <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-red-800/80 bg-black/95 p-3 text-sm leading-5 text-red-50 shadow-2xl shadow-red-950/40">
              타이머 자동설정을 "숯 3개 올린 시점" 혹은 "후카가 손님에게 나간 시점" 중 하나로 선택할 수 있습니다.
            </div>
          )}
        </div>
      </div>
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
  const soon = date && diff > 0 && diff <= 3;

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
  const soon = diff > 0 && diff <= 3;

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
  const soon = date && diff > 0 && diff <= 3;

  return (
    <div className={`rounded-2xl border p-3 ${urgent ? "border-red-500/80 bg-red-950/40" : important ? "border-red-800/80 bg-red-950/30" : "border-red-950/60 bg-black/30"}`}>
      <div className="text-xs text-red-100/50">{label}</div>
      <div className={`mt-1 text-xl font-black ${urgent ? "text-red-200" : soon ? "text-amber-200" : "text-white"}`}>{formatTime(date)}</div>
      <div className="mt-1 text-xs text-red-100/40">{statusLabel(date)}</div>
    </div>
  );
}
