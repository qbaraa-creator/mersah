(() => {
'use strict';

const DB_NAME = 'mersah-daily';
const DB_VERSION = 4;
const LEGACY_DB_NAME = 'mersah-db';
const DAY = 24 * 60 * 60 * 1000;
const DAY_START_HOUR = 4;
const TRASH_RETENTION_DAYS = 7;
const BACKUP_REMINDER_DAYS = 7;
const BACKUP_VERIFICATION_REMINDER_DAYS = 90;
const PERSISTENCE_RETRY_DAYS = 30;
const MAX_TEXT_LENGTH = 5000;
const MAX_SHORT_TEXT = 80;
const MAX_DIRECTION_LENGTH = 500;
const MAX_ID_LENGTH = 180;
const MAX_IMPORT_BYTES = 80 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_IMPORT_ENTRIES = 200000;
const MAX_IMPORT_ATTACHMENTS = 200000;
const MAX_PATH_LOG_ENTRIES = 100000;
const MAX_ENTRY_EVENT_LOG_ENTRIES = 100000;
const HEATMAP_DAYS = 90;
const DECISION_WINDOW_MIN_EVENTS = 30;
const DECISION_WINDOW_HOURS = 3;
const MAX_DAILY_RETURNS = 7;
const MAX_WEEKLY_UNDATED_RETURNS = 10;
const DEFAULT_WEEKLY_SESSION_DAY = 5;
const RETURN_MIGRATION_SETTING = 'returnDateMigrationV91';
const WEEKLY_SESSION_COMPLETED_SETTING = 'weeklySessionCompletedDate';
const BACKUP_SCHEMA_VERSION = 6;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ENTRY = 30;
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_FUTURE_DRIFT_MS = DAY;
const ENTRY_PAGE_SIZE = 60;
const EXPORT_PART_RAW_BYTES = 12 * 1024 * 1024;
const THEME_COLORS = Object.freeze({ light: '#f3f2f2', dark: '#1b1a1a' });
const systemDarkTheme = window.matchMedia('(prefers-color-scheme: dark)');

const ENTRY_TYPES = Object.freeze({
  task: 'مهمة',
  note: 'ملاحظة',
  idea: 'فكرة',
  decision: 'قرار',
  reflection: 'انعكاس'
});

const PATHS = Object.freeze({
  untriaged: '',
  do: 'نفّذ',
  consider: 'للنظر',
  waiting: 'بانتظار'
});

const ROUTABLE_PATHS = Object.freeze({
  consider: 'للنظر',
  do: 'نفّذ',
  waiting: 'بانتظار'
});

const PATH_ICON_NAMES = Object.freeze({
  untriaged: 'pathUntriaged',
  do: 'pathDo',
  consider: 'pathConsider',
  waiting: 'pathWaiting'
});

const ROUTABLE_PATH_OPTIONS = Object.freeze({
  consider: 'للنظر',
  do: 'نفّذ',
  waiting: 'بانتظار'
});

const STATUSES = Object.freeze({
  open: 'مفتوح',
  done: 'مكتمل',
  closed: 'مغلق',
  trash: 'محذوف'
});

const RETURN_SCHEDULES = Object.freeze([
  { key: 'tomorrow', label: 'غدًا', days: 1 },
  { key: 'this-week', label: 'هذا الأسبوع', days: 3 },
  { key: 'next-week', label: 'الأسبوع القادم', days: 7 },
  { key: 'month', label: 'بعد شهر', days: 30 },
  { key: 'session', label: 'الجلسة', days: null }
]);

const ENTRY_EVENT_TYPES = new Set([
  'created',
  'path_changed',
  'status_changed',
  'text_updated',
  'due_date_changed',
  'return_date_changed',
  'return_deferred',
  'top_added',
  'top_removed',
  'attachments_added',
  'attachments_removed'
]);

const V0_STATE_MAP = {
  inbox: ['untriaged', 'open'],
  week: ['do', 'open'],
  later: ['consider', 'open'],
  archive: ['consider', 'done'],
  trash: ['untriaged', 'trash']
};

let databasePromise;
let entries = [];
let attachments = [];
let dailyRecords = [];
let settings = [];
let settingsMap = new Map();
let dailyRecordsByDate = new Map();
let entriesByDate = new Map();
let entriesByPath = new Map();
let topEntriesByDate = new Map();
let attachmentsByEntry = new Map();
let searchTextByEntryId = new Map();
let currentView = 'today';
let activeEntriesPath = 'all';
let selectedDay = dateKey();
let selectedDayEditUnlocked = false;
let activeArchiveMonth = dateKey().slice(0, 7);
let todayEntriesLimit = ENTRY_PAGE_SIZE;
let selectedDayEntriesLimit = ENTRY_PAGE_SIZE;
let entriesResultsLimit = ENTRY_PAGE_SIZE;
let captureDraftAttachments = [];
let editNewAttachments = [];
let editRemovedAttachmentIds = new Set();
let attachmentImageObserver = null;
const observedAttachmentImages = new Set();
let attachmentImageFallbackFrame = 0;
let activeViewerAttachment = null;
let activeViewerTemporaryUrl = null;
let activeFileViewerAttachment = null;
let activeDetailsEntryId = null;
let activeShareEntryId = null;
let observedDayKey = dateKey();
let toastTimer;
let captureReturnTimer;
let activeReturnPicker = null;
let visualViewportBaseHeight = window.visualViewport?.height || window.innerHeight;
let selectedDirectionTimer;
let entriesSearchTimer;
let backupExportDue = false;
let backupVerificationDue = false;
let analysisDataRevision = 0;
let renderedAnalysisRevision = -1;
let renderedAnalysisDay = '';
const viewScrollPositions = new Map([
  ['today', 0],
  ['entries', 0],
  ['days', 0]
]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const elements = {
  settingsButton: $('#settingsButton'),
  brandToday: $('#brandToday'),
  yearProgress: $('#yearProgress'),
  topProgress: $('#topProgress'),
  directionButton: $('#directionButton'),
  directionDisplay: $('#directionDisplay'),
  directionDialog: $('#directionDialog'),
  directionForm: $('#directionForm'),
  directionEditor: $('#directionEditor'),
  topTasksList: $('#topTasksList'),
  openTopTaskDialog: $('#openTopTaskDialog'),
  topTaskDialog: $('#topTaskDialog'),
  quickTaskInput: $('#quickTaskInput'),
  addTopTaskButton: $('#addTopTaskButton'),
  topCandidates: $('#topCandidates'),
  returnedTodaySection: $('#returnedTodaySection'),
  returnedTodayCount: $('#returnedTodayCount'),
  returnedTodayList: $('#returnedTodayList'),
  weeklySessionSection: $('#weeklySessionSection'),
  openWeeklySessionButton: $('#openWeeklySessionButton'),
  weeklySessionButtonStatus: $('#weeklySessionButtonStatus'),
  weeklySessionDialog: $('#weeklySessionDialog'),
  weeklyOverdueGroup: $('#weeklyOverdueGroup'),
  weeklyOverdueList: $('#weeklyOverdueList'),
  weeklyDueGroup: $('#weeklyDueGroup'),
  weeklyDueList: $('#weeklyDueList'),
  weeklyWaitingGroup: $('#weeklyWaitingGroup'),
  weeklyWaitingList: $('#weeklyWaitingList'),
  weeklyUndatedGroup: $('#weeklyUndatedGroup'),
  weeklyUndatedList: $('#weeklyUndatedList'),
  completeWeeklySessionButton: $('#completeWeeklySessionButton'),
  todayTimeline: $('#todayTimeline'),
  todayLogCount: $('#todayLogCount'),
  loadMoreTodayButton: $('#loadMoreTodayButton'),
  openEveningCloseButton: $('#openEveningCloseButton'),
  eveningCloseButtonStatus: $('#eveningCloseButtonStatus'),
  eveningCloseDialog: $('#eveningCloseDialog'),
  eveningCloseForm: $('#eveningCloseForm'),
  eveningResolvedCount: $('#eveningResolvedCount'),
  eveningCompletedCount: $('#eveningCompletedCount'),
  eveningOpenDoCount: $('#eveningOpenDoCount'),
  eveningOpenDoMore: $('#eveningOpenDoMore'),
  eveningOpenDoList: $('#eveningOpenDoList'),
  eveningTomorrowDirection: $('#eveningTomorrowDirection'),
  eveningClosedStatus: $('#eveningClosedStatus'),
  saveEveningCloseButton: $('#saveEveningCloseButton'),
  saveEveningCloseBackupButton: $('#saveEveningCloseBackupButton'),
  analysisOldestRow: $('#analysisOldestRow'),
  analysisResolutionRow: $('#analysisResolutionRow'),
  analysisResolutionRate: $('#analysisResolutionRate'),
  analysisResolutionDetail: $('#analysisResolutionDetail'),
  analysisOldestAge: $('#analysisOldestAge'),
  analysisOldestDetail: $('#analysisOldestDetail'),
  analysisTopCompletion: $('#analysisTopCompletion'),
  analysisTopDetail: $('#analysisTopDetail'),
  pathBacklogSummary: $('#pathBacklogSummary'),
  pathBacklogList: $('#pathBacklogList'),
  captureHeatmapSummary: $('#captureHeatmapSummary'),
  captureHeatmap: $('#captureHeatmap'),
  decisionWindowSummary: $('#decisionWindowSummary'),
  decisionWindowCopy: $('#decisionWindowCopy'),
  entriesSearchInput: $('#entriesSearchInput'),
  entriesPathFilters: $('#entriesPathFilters'),
  entriesFilterOptions: $('#entriesFilterOptions'),
  entriesFilterSummary: $('#entriesFilterSummary'),
  entriesDateFrom: $('#entriesDateFrom'),
  entriesDateTo: $('#entriesDateTo'),
  entriesSort: $('#entriesSort'),
  clearEntriesFiltersButton: $('#clearEntriesFiltersButton'),
  entriesCount: $('#entriesCount'),
  entriesResultsNote: $('#entriesResultsNote'),
  entriesList: $('#entriesList'),
  loadMoreEntriesButton: $('#loadMoreEntriesButton'),
  archivePreviousMonthButton: $('#archivePreviousMonthButton'),
  archiveNextMonthButton: $('#archiveNextMonthButton'),
  archiveMonthInput: $('#archiveMonthInput'),
  archiveMonthLabel: $('#archiveMonthLabel'),
  archiveMonthNumeric: $('#archiveMonthNumeric'),
  archiveMonthSummary: $('#archiveMonthSummary'),
  daysList: $('#daysList'),
  selectedDayPanel: $('#selectedDayPanel'),
  selectedDayTitle: $('#selectedDayTitle'),
  selectedDayMeta: $('#selectedDayMeta'),
  selectedDayDirection: $('#selectedDayDirection'),
  selectedDayDirectionLabel: $('#selectedDayDirectionLabel'),
  selectedDayDirectionDisplay: $('#selectedDayDirectionDisplay'),
  selectedDayDirectionStatus: $('#selectedDayDirectionStatus'),
  editDayButton: $('#editDayButton'),
  selectedDayContent: $('#selectedDayContent'),
  captureFab: $('#captureFab'),
  captureDialog: $('#captureDialog'),
  captureForm: $('#captureForm'),
  captureText: $('#captureText'),
  captureCameraInput: $('#captureCameraInput'),
  captureFileInput: $('#captureFileInput'),
  capturePreview: $('#capturePreview'),
  captureStatus: $('#captureStatus'),
  saveCaptureButton: $('#saveCaptureButton'),
  editDialog: $('#editDialog'),
  editForm: $('#editForm'),
  editEntryId: $('#editEntryId'),
  editText: $('#editText'),
  editTextUnlockButton: $('#editTextUnlockButton'),
  editPath: $('#editPath'),
  editReturnDate: $('#editReturnDate'),
  editReturnPickerButton: $('#editReturnPickerButton'),
  editReturnSummary: $('#editReturnSummary'),
  editPathAge: $('#editPathAge'),
  editEntryAge: $('#editEntryAge'),
  editAttachmentsOptions: $('#editAttachmentsOptions'),
  editTopToday: $('#editTopToday'),
  editTopTodayButton: $('#editTopTodayButton'),
  editExistingAttachments: $('#editExistingAttachments'),
  editAttachmentInput: $('#editAttachmentInput'),
  editNewPreview: $('#editNewPreview'),
  editDeleteButton: $('#editDeleteButton'),
  returnPickerDialog: $('#returnPickerDialog'),
  returnPickerCurrent: $('#returnPickerCurrent'),
  returnPickerOptions: $('#returnPickerOptions'),
  returnPickerCustomForm: $('#returnPickerCustomForm'),
  returnPickerCustomDate: $('#returnPickerCustomDate'),
  attachmentViewerDialog: $('#attachmentViewerDialog'),
  attachmentViewerClose: $('#attachmentViewerClose'),
  attachmentViewerTitle: $('#attachmentViewerTitle'),
  attachmentViewerZoom: $('#attachmentViewerZoom'),
  attachmentViewerDownload: $('#attachmentViewerDownload'),
  attachmentViewerStage: $('#attachmentViewerStage'),
  attachmentViewerImage: $('#attachmentViewerImage'),
  fileViewerDialog: $('#fileViewerDialog'),
  fileViewerClose: $('#fileViewerClose'),
  fileViewerTitle: $('#fileViewerTitle'),
  fileViewerNote: $('#fileViewerNote'),
  fileViewerText: $('#fileViewerText'),
  fileViewerDownload: $('#fileViewerDownload'),
  entryDetailsDialog: $('#entryDetailsDialog'),
  entryDetailsText: $('#entryDetailsText'),
  entryDetailsCreated: $('#entryDetailsCreated'),
  entryDetailsAge: $('#entryDetailsAge'),
  entryDetailsPath: $('#entryDetailsPath'),
  entryDetailsAttachments: $('#entryDetailsAttachments'),
  entryDetailsEvents: $('#entryDetailsEvents'),
  entryDetailsShare: $('#entryDetailsShare'),
  entryDetailsEdit: $('#entryDetailsEdit'),
  entryShareDialog: $('#entryShareDialog'),
  entrySharePreview: $('#entrySharePreview'),
  entryShareNote: $('#entryShareNote'),
  entryShareSystemButton: $('#entryShareSystemButton'),
  entryShareThingsButton: $('#entryShareThingsButton'),
  entryCopyTextButton: $('#entryCopyTextButton'),
  confirmDialog: $('#confirmDialog'),
  confirmTitle: $('#confirmTitle'),
  confirmText: $('#confirmText'),
  confirmPreview: $('#confirmPreview'),
  confirmCancel: $('#confirmCancel'),
  confirmAccept: $('#confirmAccept'),
  settingsDialog: $('#settingsDialog'),
  themeColor: $('#themeColor'),
  themeLightButton: $('#themeLightButton'),
  themeDarkButton: $('#themeDarkButton'),
  weeklySessionDay: $('#weeklySessionDay'),
  storageStatus: $('#storageStatus'),
  storageMeter: $('#storageMeter'),
  storageMeterFill: $('#storageMeterFill'),
  requestPersistenceButton: $('#requestPersistenceButton'),
  icloudStatus: $('#icloudStatus'),
  exportIcloudButton: $('#exportIcloudButton'),
  exportStatus: $('#exportStatus'),
  exportJsonButton: $('#exportJsonButton'),
  exportMarkdownButton: $('#exportMarkdownButton'),
  backupVerificationStatus: $('#backupVerificationStatus'),
  verifyBackupInput: $('#verifyBackupInput'),
  importInput: $('#importInput'),
  migrationStatus: $('#migrationStatus'),
  runMigrationButton: $('#runMigrationButton'),
  skipMigrationButton: $('#skipMigrationButton'),
  trashStatus: $('#trashStatus'),
  trashDialog: $('#trashDialog'),
  trashList: $('#trashList'),
  viewTrashButton: $('#viewTrashButton'),
  restoreTrashButton: $('#restoreTrashButton'),
  emptyTrashButton: $('#emptyTrashButton'),
  captureReturnBar: $('#captureReturnBar'),
  captureReturnText: $('#captureReturnText'),
  captureReturnChangeButton: $('#captureReturnChangeButton'),
  toast: $('#toast'),
  toastText: $('#toastText'),
  toastActions: $('#toastActions')
};

function openDatabase() {
  if (databasePromise) return databasePromise;
  const pending = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      const error = new Error('التخزين المحلي غير متاح في هذا السياق.');
      error.code = 'STORAGE_UNAVAILABLE';
      reject(error);
      return;
    }
    let settled = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('path', 'path', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
        store.createIndex('followUpDate', 'followUpDate', { unique: false });
        store.createIndex('topTodayDate', 'topTodayDate', { unique: false });
      }
      if (!db.objectStoreNames.contains('attachments')) {
        const store = db.createObjectStore('attachments', { keyPath: 'id' });
        store.createIndex('entryId', 'entryId', { unique: false });
      }
      if (!db.objectStoreNames.contains('attachmentData')) {
        db.createObjectStore('attachmentData', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('daily')) {
        db.createObjectStore('daily', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (event.oldVersion < 3) {
        const entryStore = request.transaction.objectStore('entries');
        const cursorRequest = entryStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const migrated = entryWithoutRemovedPath(cursor.value);
          if (migrated !== cursor.value) cursor.update(migrated);
          cursor.continue();
        };
      }
      if (event.oldVersion < 4) {
        const attachmentStore = request.transaction.objectStore('attachments');
        const attachmentDataStore = request.transaction.objectStore('attachmentData');
        const cursorRequest = attachmentStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const attachment = cursor.value;
          if (attachment?.blob instanceof Blob) {
            attachmentDataStore.put({ id: attachment.id, blob: attachment.blob });
            cursor.update(attachmentMetadata(attachment));
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.addEventListener('versionchange', () => {
        db.close();
        databasePromise = null;
        showToast('يوجد تحديث لقاعدة مرساة. أعد فتح التطبيق.');
      });
      resolve(db);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error('تعذر فتح قاعدة البيانات.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      const error = new Error('قاعدة مرساة مفتوحة في تبويب آخر.');
      error.code = 'DB_BLOCKED';
      reject(error);
    };
  });
  databasePromise = pending.catch(error => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function getAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getRecord(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function putRecord(storeName, value) {
  return runAtomicWrite([storeName], (stores, track) => {
    track(stores[storeName].put(value));
    return value;
  });
}

async function putMany(storeName, values) {
  if (!values.length) return;
  return runAtomicWrite([storeName], (stores, track) => {
    values.forEach(value => track(stores[storeName].put(value)));
  });
}

async function deleteRecord(storeName, key) {
  return runAtomicWrite([storeName], (stores, track) => {
    track(stores[storeName].delete(key));
  });
}

async function writeImportBatch(batch) {
  return runAtomicWrite(['entries', 'daily', 'settings', 'attachments', 'attachmentData'], (stores, track) => {
    for (const storeName of ['entries', 'daily', 'settings']) {
      for (const value of batch[storeName] || []) {
        track(stores[storeName].put(value));
      }
    }
    for (const attachment of batch.attachments || []) {
      track(stores.attachments.put(attachmentMetadata(attachment)));
      track(stores.attachmentData.put(attachmentDataRecord(attachment)));
    }
  });
}

async function runAtomicWrite(storeNames, writer) {
  const db = await openDatabase();
  const names = [...new Set(storeNames)];
  return new Promise((resolve, reject) => {
    let result;
    let callbackError = null;
    let requestError = null;
    const tx = db.transaction(names, 'readwrite');
    const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
    const track = request => {
      request.addEventListener('error', () => {
        if (!requestError) requestError = request.error;
      }, { once: true });
      return request;
    };
    try {
      result = writer(stores, track);
      if (result && typeof result.then === 'function') {
        throw new TypeError('كاتب معاملة IndexedDB يجب أن يكون متزامنًا.');
      }
    } catch (error) {
      callbackError = error;
      try {
        tx.abort();
      } catch (abortError) {
        reject(callbackError);
      }
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => {};
    tx.onabort = () => reject(
      callbackError || requestError || tx.error || new Error('تم إلغاء معاملة الحفظ.')
    );
  });
}

async function getSetting(key, fallback = null) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const request = tx.objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result?.value ?? fallback);
    request.onerror = () => reject(request.error);
  });
}

async function putSetting(key, value) {
  const record = { key, value, updatedAt: nowIso() };
  await putRecord('settings', record);
  settings = [record, ...settings.filter(item => item.key !== key)];
  settingsMap.set(key, value);
}

function validTheme(value) {
  return value === 'light' || value === 'dark' ? value : null;
}

function effectiveTheme(preference = validTheme(settingsMap.get('theme'))) {
  return preference || (systemDarkTheme.matches ? 'dark' : 'light');
}

function renderThemeControl(theme = effectiveTheme()) {
  elements.themeLightButton?.setAttribute('aria-pressed', String(theme === 'light'));
  elements.themeDarkButton?.setAttribute('aria-pressed', String(theme === 'dark'));
}

function applyTheme(preference = validTheme(settingsMap.get('theme'))) {
  const theme = effectiveTheme(preference);
  document.documentElement.dataset.theme = theme;
  if (elements.themeColor) elements.themeColor.content = THEME_COLORS[theme];
  renderThemeControl(theme);
}

async function selectTheme(theme) {
  const nextTheme = validTheme(theme);
  if (!nextTheme) return;
  const previousTheme = validTheme(settingsMap.get('theme'));
  applyTheme(nextTheme);
  try {
    await putSetting('theme', nextTheme);
  } catch (error) {
    applyTheme(previousTheme);
    reportStorageFailure(error, 'حفظ المظهر');
  }
}

function uid(prefix = 'id') {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isQuotaExceededError(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.name === 'QuotaExceededError'
        || /quota|storage.+full|disk.+full/i.test(String(current.message || ''))) return true;
    current = current.cause;
  }
  return false;
}

function storageFailureMessage(error, action = 'حفظ البيانات') {
  if (error?.code === 'DB_BLOCKED') {
    return `تعذر ${action}: أغلق تبويبات مرساة الأخرى، ثم أعد المحاولة.`;
  }
  if (error?.code === 'STORAGE_UNAVAILABLE' || location.protocol === 'file:') {
    return `تعذر ${action}: افتح مرساة عبر HTTPS أو localhost، لا من ملف index.html مباشرة.`;
  }
  if (isQuotaExceededError(error)) {
    return `تعذر ${action}: مساحة تخزين مرساة غير كافية. لم تُحفظ تغييرات جزئية؛ صدّر نسخة ثم حرّر مساحة من الجهاز.`;
  }
  return `تعذر ${action}. بقيت البيانات السابقة كما هي.`;
}

function reportStorageFailure(error, action = 'حفظ البيانات') {
  console.error(`فشل ${action}:`, error);
  showToast(
    storageFailureMessage(error, action),
    isQuotaExceededError(error) ? 'النسخ الاحتياطي' : '',
    isQuotaExceededError(error) ? openSettingsDialog : null,
    10_000
  );
}

function nowIso() { return new Date().toISOString(); }
function pad(value) { return String(value).padStart(2, '0'); }

function resolvedTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (error) {
    return null;
  }
}

function localCreationStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    date: civilDateKey(safeDate),
    hour: safeDate.getHours(),
    minute: safeDate.getMinutes(),
    timeZone: resolvedTimeZone(),
    utcOffsetMinutes: -safeDate.getTimezoneOffset()
  };
}

function civilDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return civilDateKey();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return dateKey();
  const civilDay = civilDateKey(date);
  return date.getHours() < DAY_START_HOUR ? shiftDateKey(civilDay, -1) : civilDay;
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return civilDateKey(date);
}

function weeklySessionDayValue(value = settingsMap.get('weeklySessionDay')) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : DEFAULT_WEEKLY_SESSION_DAY;
}

function nextWeeklySessionDate(fromKey = dateKey()) {
  const from = dateFromKey(fromKey);
  let offset = (weeklySessionDayValue() - from.getDay() + 7) % 7;
  if (offset === 0) offset = 7;
  return shiftDateKey(fromKey, offset);
}

function scheduledReturnCount(targetDate, exceptEntryId = null, today = dateKey()) {
  const carryOverdue = targetDate === shiftDateKey(today, 1);
  return entries.filter(entry => entry.id !== exceptEntryId
    && entry.status === 'open'
    && validDateKey(entry.followUpDate)
    && (entry.followUpDate === targetDate || (carryOverdue && entry.followUpDate <= today))).length;
}

function resolveReturnSchedule(schedule, exceptEntryId = null, today = dateKey(), { enforceCapacity = true } = {}) {
  const requestedDate = schedule.key === 'session'
    ? nextWeeklySessionDate(today)
    : shiftDateKey(today, schedule.days);
  const sessionDate = nextWeeklySessionDate(today);
  const shifted = enforceCapacity && schedule.key !== 'session' && requestedDate !== sessionDate
    && scheduledReturnCount(requestedDate, exceptEntryId, today) >= MAX_DAILY_RETURNS;
  return {
    ...schedule,
    requestedDate,
    date: shifted ? sessionDate : requestedDate,
    shifted
  };
}

function resolvedReturnSchedules(exceptEntryId = null, today = dateKey(), options = {}) {
  return RETURN_SCHEDULES.map(schedule => resolveReturnSchedule(schedule, exceptEntryId, today, options));
}

function validDateKey(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = dateFromKey(text);
  const normalized = civilDateKey(d);
  return Number.isNaN(d.getTime()) || normalized !== text ? null : text;
}

function validMonthKey(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}$/.test(text)) return null;
  const [year, month] = text.split('-').map(Number);
  return year >= 1 && month >= 1 && month <= 12 ? text : null;
}

function monthDate(key) {
  const [year, month] = String(key).split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function shiftMonthKey(key, amount) {
  const date = monthDate(key);
  date.setMonth(date.getMonth() + amount);
  return civilDateKey(date).slice(0, 7);
}

function validIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now() + MAX_FUTURE_DRIFT_MS) return null;
  return d.toISOString();
}

function formatDateKey(key) {
  const d = dateFromKey(key);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEntryTime(entry) {
  const local = entry?.createdLocal;
  if (Number.isInteger(local?.hour) && Number.isInteger(local?.minute)) {
    return `${pad(local.hour)}:${pad(local.minute)}`;
  }
  return formatTime(entry?.createdAt);
}

function formatHeaderDayMonth(key) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    day: 'numeric',
    month: 'long'
  }).format(dateFromKey(key));
}

function formatNumber(value, minimumIntegerDigits = 1) {
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    useGrouping: false,
    minimumIntegerDigits
  }).format(value);
}

function formatMonthLabel(key) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    month: 'long',
    year: 'numeric'
  }).format(monthDate(key));
}

function formatMonthNumeric(key) {
  const [year, month] = key.split('-');
  return `${month}/${year}`;
}

function daysBetweenKeys(olderKey, newerKey) {
  const older = dateFromKey(olderKey);
  const newer = dateFromKey(newerKey);
  return Math.round((Date.UTC(newer.getFullYear(), newer.getMonth(), newer.getDate())
    - Date.UTC(older.getFullYear(), older.getMonth(), older.getDate())) / DAY);
}

function entryAgeDays(entry) {
  return Math.max(0, daysBetweenKeys(entryDate(entry), dateKey()));
}

function ageDaysLabel(days) {
  if (days === 0) return 'اليوم';
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days >= 3 && days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}

function entryCountLabel(count) {
  if (count === 0) return 'دون إدخالات';
  if (count === 1) return 'إدخال واحد';
  if (count === 2) return 'إدخالان';
  if (count >= 3 && count <= 10) return `${count} إدخالات`;
  return `${count} إدخالًا`;
}

function savedDayCountLabel(count) {
  if (count === 0) return 'لا أيام محفوظة';
  if (count === 1) return 'يوم محفوظ';
  if (count === 2) return 'يومان محفوظان';
  if (count >= 3 && count <= 10) return `${count} أيام محفوظة`;
  return `${count} يومًا محفوظًا`;
}

function relativeDayLabel(key) {
  const target = validDateKey(key);
  if (!target) return '';
  const difference = Math.round((dateFromKey(dateKey()).getTime() - dateFromKey(target).getTime()) / DAY);
  if (difference === 0) return 'اليوم';
  if (difference === 1) return 'أمس';
  if (difference === -1) return 'غدًا';
  if (Math.abs(difference) <= 6) {
    return new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'always' }).format(-difference, 'day');
  }
  return formatDateKey(target);
}

function returnDateSummary(key) {
  const date = validDateKey(key);
  if (!date) return 'غير محددة';
  const distance = daysBetweenKeys(dateKey(), date);
  const relative = relativeDayLabel(date);
  const calendar = formatHeaderDayMonth(date);
  return Math.abs(distance) <= 6 ? `${relative} · ${calendar}` : calendar;
}

function dayName(key) {
  return new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(dateFromKey(key));
}

function clampString(value, maxLength) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function safeId(value, prefix) {
  const id = clampString(value, MAX_ID_LENGTH).replace(/\s+/g, '_');
  return id || uid(prefix);
}

function stripDefiniteArticle(text) {
  return text.replace(/(^|\s)ال(\p{L}{3,})/gu, '$1$2');
}

function normalizeArabic(value = '') {
  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#@._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripDefiniteArticle(normalized);
}

function canonicalFromExisting(value, field) {
  const clean = clampString(value, MAX_SHORT_TEXT).replace(/\s+/g, ' ');
  if (!clean) return '';
  const normalized = normalizeArabic(clean);
  const existing = entries
    .map(entry => entry[field])
    .filter(Boolean)
    .find(item => normalizeArabic(item) === normalized);
  return existing || clean;
}

function validType(value) {
  return hasOwn(ENTRY_TYPES, value) ? value : 'note';
}

function validPath(value) {
  return hasOwn(PATHS, value) ? value : 'consider';
}

function activePathValue(value) {
  return value === 'reference' ? 'consider' : value;
}

function pathLogWithoutRemovedPath(value) {
  if (!Array.isArray(value) || !value.some(event => event?.path === 'reference')) return value;
  const result = [];
  value.forEach(event => {
    if (!event || typeof event !== 'object') {
      result.push(event);
      return;
    }
    const path = activePathValue(event.path);
    if (result.at(-1)?.path === path) return;
    result.push(path === event.path ? event : { ...event, path });
  });
  return result;
}

function eventLogWithoutRemovedPath(value) {
  if (!Array.isArray(value) || !value.some(event =>
    event?.to === 'reference' || event?.from === 'reference'
  )) return value;
  const result = [];
  value.forEach(event => {
    if (!event || typeof event !== 'object') {
      result.push(event);
      return;
    }
    if (event.type === 'created' && event.to === 'reference') {
      result.push({ ...event, to: 'consider' });
      return;
    }
    if (event.type === 'path_changed') {
      const from = activePathValue(event.from);
      const to = activePathValue(event.to);
      if (from === to) return;
      result.push(from === event.from && to === event.to ? event : { ...event, from, to });
      return;
    }
    result.push(event);
  });
  return result;
}

function entryWithoutRemovedPath(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const path = activePathValue(entry.path);
  const pathLog = pathLogWithoutRemovedPath(entry.pathLog);
  const eventLog = eventLogWithoutRemovedPath(entry.eventLog);
  if (path === entry.path && pathLog === entry.pathLog && eventLog === entry.eventLog) return entry;
  return { ...entry, path: validPath(path), pathLog, eventLog };
}

function createPathEvent(path, at = nowIso(), stamp = localCreationStamp(at)) {
  return {
    path: validPath(path),
    at,
    localDate: stamp.date,
    timeZone: stamp.timeZone,
    utcOffsetMinutes: stamp.utcOffsetMinutes
  };
}

function createEntryEvent(type, at = nowIso(), details = {}, stamp = localCreationStamp(at)) {
  return {
    id: uid('event'),
    type: ENTRY_EVENT_TYPES.has(type) ? type : 'text_updated',
    at,
    localDate: stamp?.date || civilDateKey(at),
    localHour: Number.isInteger(stamp?.hour) ? stamp.hour : new Date(at).getHours(),
    localMinute: Number.isInteger(stamp?.minute) ? stamp.minute : new Date(at).getMinutes(),
    timeZone: stamp?.timeZone || null,
    utcOffsetMinutes: Number.isInteger(stamp?.utcOffsetMinutes) ? stamp.utcOffsetMinutes : null,
    ...details
  };
}

function storedEntryEventLog(entry) {
  return Array.isArray(entry?.eventLog) ? entry.eventLog : [];
}

function derivedLegacyEventLog(entry) {
  const createdAt = validIso(entry?.createdAt) || nowIso();
  const updatedAt = validIso(entry?.updatedAt) || createdAt;
  const createdStamp = entry?.createdLocal || localCreationStamp(createdAt);
  const pathEvents = pathLogFor(entry);
  const initialPath = pathEvents[0]?.path;
  const events = [createEntryEvent('created', createdAt, {
    ...(initialPath ? { to: initialPath } : {}),
    estimated: true
  }, createdStamp)];
  for (let index = 1; index < pathEvents.length; index += 1) {
    const previous = pathEvents[index - 1];
    const current = pathEvents[index];
    events.push(createEntryEvent('path_changed', current.at, {
      from: previous.path,
      to: current.path,
      estimated: true
    }, {
      date: current.localDate,
      hour: localPartsAtOffset(current.at, current.utcOffsetMinutes ?? -new Date(current.at).getTimezoneOffset()).hour,
      minute: localPartsAtOffset(current.at, current.utcOffsetMinutes ?? -new Date(current.at).getTimezoneOffset()).minute,
      timeZone: current.timeZone,
      utcOffsetMinutes: current.utcOffsetMinutes
    }));
  }
  attachmentsFor(entry.id).forEach(attachment => {
    const attachmentAt = validIso(attachment.createdAt) || createdAt;
    const at = new Date(attachmentAt) < new Date(createdAt)
      ? createdAt
      : new Date(attachmentAt) > new Date(updatedAt) ? updatedAt : attachmentAt;
    events.push(createEntryEvent('attachments_added', at, {
      count: 1,
      names: [safeAttachmentName(attachment.name)],
      estimated: true
    }));
  });
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function entryEventLog(entry) {
  const stored = storedEntryEventLog(entry);
  return stored.length ? stored : derivedLegacyEventLog(entry);
}

function appendEventsToEntry(entry, events, baseEntry = entry) {
  if (!events.length) return entry;
  const combined = [...entryEventLog(baseEntry), ...events]
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const limited = combined.length <= MAX_ENTRY_EVENT_LOG_ENTRIES
    ? combined
    : [combined[0], ...combined.slice(-(MAX_ENTRY_EVENT_LOG_ENTRIES - 1))];
  return { ...entry, eventLog: limited };
}

function entryChangeEvents(current, updated, at) {
  const events = [];
  if (updated.path !== current.path) {
    events.push(createEntryEvent('path_changed', at, { from: current.path, to: updated.path }));
  }
  if (updated.status !== current.status) {
    events.push(createEntryEvent('status_changed', at, { from: current.status, to: updated.status }));
  }
  if (updated.text !== current.text) events.push(createEntryEvent('text_updated', at));
  if (updated.dueDate !== current.dueDate) {
    events.push(createEntryEvent('due_date_changed', at, { from: current.dueDate, to: updated.dueDate }));
  }
  if (updated.followUpDate !== current.followUpDate) {
    events.push(createEntryEvent('return_date_changed', at, {
      from: current.followUpDate,
      to: updated.followUpDate
    }));
  }
  if (updated.topTodayDate !== current.topTodayDate) {
    events.push(createEntryEvent(updated.topTodayDate ? 'top_added' : 'top_removed', at, {
      from: current.topTodayDate,
      to: updated.topTodayDate
    }));
  }
  return events;
}

function pathLogFor(entry) {
  return Array.isArray(entry?.pathLog) ? entry.pathLog : [];
}

function limitPathLog(log) {
  if (log.length <= MAX_PATH_LOG_ENTRIES) return log;
  return [log[0], ...log.slice(-(MAX_PATH_LOG_ENTRIES - 1))];
}

function currentPathEvent(entry) {
  const log = pathLogFor(entry);
  const event = log.at(-1);
  return event?.path === entry.path && validIso(event.at) ? event : null;
}

function currentPathAgeDays(entry) {
  const event = currentPathEvent(entry);
  return event ? Math.max(0, Math.floor((Date.now() - new Date(event.at).getTime()) / DAY)) : null;
}

function validStatus(value) {
  return hasOwn(STATUSES, value) ? value : 'open';
}

function attachmentsFor(entryId) {
  return attachmentsByEntry.get(entryId) || [];
}

function attachmentMetadata(attachment) {
  const size = Number(attachment?.size || attachment?.blob?.size || 0);
  return {
    id: attachment.id,
    entryId: attachment.entryId,
    name: safeAttachmentName(attachment.name),
    type: normalizedAttachmentType(attachment.type || attachment?.blob?.type),
    size: Number.isSafeInteger(size) && size >= 0 ? size : 0,
    createdAt: attachment.createdAt || nowIso()
  };
}

function attachmentDataRecord(attachment) {
  if (!(attachment?.blob instanceof Blob)) throw new Error('بيانات المرفق غير متاحة للحفظ.');
  return { id: attachment.id, blob: attachment.blob };
}

async function attachmentWithBlob(attachment) {
  if (attachment?.blob instanceof Blob) return attachment;
  const stored = await getRecord('attachmentData', attachment?.id);
  if (!(stored?.blob instanceof Blob)) throw new Error('تعذر قراءة بيانات المرفق.');
  if (Number.isSafeInteger(attachment?.size) && attachment.size !== stored.blob.size) {
    throw new Error('حجم المرفق لا يطابق بياناته المحفوظة.');
  }
  return { ...attachment, blob: stored.blob };
}

function entryDate(entry) {
  const localDate = validDateKey(entry?.createdLocal?.date);
  const localHour = Number(entry?.createdLocal?.hour);
  if (localDate && Number.isInteger(localHour) && localHour >= 0 && localHour <= 23) {
    return localHour < DAY_START_HOUR ? shiftDateKey(localDate, -1) : localDate;
  }
  return localDate || dateKey(entry.createdAt);
}

function dailyRecordFor(key) {
  return dailyRecordsByDate.get(key) || null;
}

function dailyRecordHasContent(record) {
  return Boolean(record?.direction || record?.topEntryIds?.length || record?.closure);
}

function dayClosureFor(key) {
  const closure = dailyRecordFor(key)?.closure;
  return closure && typeof closure === 'object' ? closure : null;
}

function topEntriesFor(dayKey) {
  return topEntriesByDate.get(dayKey) || [];
}

function entriesForDate(dayKey) {
  return entriesByDate.get(dayKey) || [];
}

function rebuildDataIndexes() {
  dailyRecordsByDate = new Map(dailyRecords.map(record => [record.date, record]));
  entriesByDate = new Map();
  entriesByPath = new Map();
  topEntriesByDate = new Map();
  attachmentsByEntry = new Map();
  searchTextByEntryId = new Map();

  attachments.forEach(attachment => {
    const list = attachmentsByEntry.get(attachment.entryId) || [];
    list.push(attachment);
    attachmentsByEntry.set(attachment.entryId, list);
  });

  const topCandidates = new Map();
  entries.forEach(entry => {
    if (entry.status === 'trash') return;
    searchTextByEntryId.set(entry.id, entrySearchText(entry));
    const day = entryDate(entry);
    const dayEntries = entriesByDate.get(day) || [];
    dayEntries.push(entry);
    entriesByDate.set(day, dayEntries);
    if (entry.status === 'open') {
      const pathEntries = entriesByPath.get(entry.path) || [];
      pathEntries.push(entry);
      entriesByPath.set(entry.path, pathEntries);
    }
    if (entry.topTodayDate) {
      const top = topCandidates.get(entry.topTodayDate) || [];
      top.push(entry);
      topCandidates.set(entry.topTodayDate, top);
    }
  });

  topCandidates.forEach((list, day) => {
    const record = dailyRecordsByDate.get(day);
    const order = new Map((record?.topEntryIds || []).map((id, index) => [id, index]));
    list.sort((a, b) => {
      const ai = order.has(a.id) ? order.get(a.id) : 99;
      const bi = order.has(b.id) ? order.get(b.id) : 99;
      if (ai !== bi) return ai - bi;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    topEntriesByDate.set(day, list.slice(0, 3));
  });
}

function canAddTop(dayKey, exceptId = null) {
  return topEntriesFor(dayKey).filter(entry => entry.id !== exceptId).length < 3;
}

async function syncDailyTop(dayKey) {
  await putRecord('daily', dailyTopRecordForEntries(dayKey, entries));
}

function dailyTopRecordForEntries(dayKey, sourceEntries, timestamp = nowIso()) {
  const current = dailyRecordFor(dayKey);
  const order = new Map((current?.topEntryIds || []).map((id, index) => [id, index]));
  const ids = sourceEntries
    .filter(entry => entry.status !== 'trash' && entry.topTodayDate === dayKey)
    .sort((a, b) => {
      const ai = order.has(a.id) ? order.get(a.id) : 99;
      const bi = order.has(b.id) ? order.get(b.id) : 99;
      if (ai !== bi) return ai - bi;
      return new Date(a.createdAt) - new Date(b.createdAt);
    })
    .slice(0, 3)
    .map(entry => entry.id);
  return {
    date: dayKey,
    direction: current?.direction || '',
    topEntryIds: ids,
    closure: current?.closure || null,
    createdAt: current?.createdAt || timestamp,
    updatedAt: timestamp
  };
}

async function refreshData() {
  const [entryRows, attachmentRows, dailyRows, settingRows] = await Promise.all([
    getAll('entries'),
    getAll('attachments'),
    getAll('daily'),
    getAll('settings')
  ]);
  entries = entryRows;
  attachments = attachmentRows;
  dailyRecords = dailyRows;
  settings = settingRows;
  settingsMap = new Map(settingRows.map(setting => [setting.key, setting.value]));
  refreshDataViews({ applyStoredTheme: true });
}

async function migrateLegacyReturnDates() {
  if (settingsMap.has(RETURN_MIGRATION_SETTING)) return;
  const today = dateKey();
  const sessionDate = nextWeeklySessionDate(today);
  const migratedEntries = entries
    .filter(entry => entry.status === 'open'
      && validDateKey(entry.followUpDate)
      && entry.followUpDate < today)
    .map(entry => buildUpdatedEntry(entry, { followUpDate: sessionDate }));
  const completedAt = nowIso();
  const marker = {
    key: RETURN_MIGRATION_SETTING,
    value: { completedAt, moved: migratedEntries.length, targetDate: sessionDate },
    updatedAt: completedAt
  };
  await runAtomicWrite(['entries', 'settings'], (stores, track) => {
    migratedEntries.forEach(entry => track(stores.entries.put(entry)));
    track(stores.settings.put(marker));
  });
  if (migratedEntries.length) {
    const migratedById = new Map(migratedEntries.map(entry => [entry.id, entry]));
    entries = entries.map(entry => migratedById.get(entry.id) || entry);
  }
  settings = [marker, ...settings.filter(item => item.key !== RETURN_MIGRATION_SETTING)];
  settingsMap.set(RETURN_MIGRATION_SETTING, marker.value);
  refreshDataViews();
}

function refreshDataViews({ applyStoredTheme = false } = {}) {
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  attachments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  dailyRecords.sort((a, b) => b.date.localeCompare(a.date));
  if (applyStoredTheme) applyTheme();
  rebuildDataIndexes();
  analysisDataRevision += 1;
  renderAll();
}

function upsertDailyRecords(records) {
  if (!records.length) return;
  const byDate = new Map(dailyRecords.map(record => [record.date, record]));
  records.forEach(record => byDate.set(record.date, record));
  dailyRecords = [...byDate.values()];
}

function renderAll() {
  renderStaticOptions();
  renderSettingsState();
  renderCurrentView();
  if (elements.trashDialog.open) renderTrashDialog();
  if (elements.entryDetailsDialog.open && activeDetailsEntryId) {
    renderEntryDetails(activeDetailsEntryId);
  }
  if (elements.weeklySessionDialog.open) renderWeeklySessionDialog();
  if (elements.eveningCloseDialog.open) renderEveningCloseDialog();
}

function renderCurrentView() {
  renderHeaderDate();
  if (currentView === 'entries') renderEntries();
  else if (currentView === 'days') renderDays();
  else renderToday();
}

function renderHeaderDate() {
  const today = dateKey();
  const date = dateFromKey(today);
  const progress = yearProgressFor(today);
  elements.brandToday.textContent = `${dayName(today)} ${formatHeaderDayMonth(today)} · ${formatNumber(date.getMonth() + 1)}`;
  elements.yearProgress.textContent = `اليوم ${formatNumber(progress.ordinal)} · بقي ${formatNumber(progress.remaining)}`;
}

function yearProgressFor(key) {
  const date = dateFromKey(key);
  const year = date.getFullYear();
  const start = Date.UTC(year, 0, 1);
  const nextYear = Date.UTC(year + 1, 0, 1);
  const current = Date.UTC(year, date.getMonth(), date.getDate());
  const total = Math.round((nextYear - start) / DAY);
  const ordinal = Math.floor((current - start) / DAY) + 1;
  return { ordinal, total, remaining: total - ordinal };
}

function refreshForNewDay() {
  const currentDayKey = dateKey();
  if (currentDayKey === observedDayKey) return;
  observedDayKey = currentDayKey;
  renderCurrentView();
}

function renderStaticOptions() {
  fillSelect(elements.editPath, ROUTABLE_PATH_OPTIONS);
}

function fillSelect(select, options) {
  const current = select.value;
  const nodes = Object.entries(options).map(([value, label]) => new Option(label, value));
  select.replaceChildren(...nodes);
  if (current && hasOwn(options, current)) select.value = current;
}

function renderToday() {
  const today = dateKey();
  const record = dailyRecordFor(today);
  const top = topEntriesFor(today);
  renderTopProgress(top);
  const direction = String(record?.direction || '').trim();
  elements.directionDisplay.textContent = direction;
  elements.directionDisplay.hidden = !direction;
  elements.directionButton.classList.toggle('has-direction', Boolean(direction));
  elements.directionButton.setAttribute('aria-label', direction ? `توجّه اليوم: ${direction}` : 'توجّه اليوم');
  elements.addTopTaskButton.disabled = top.length >= 3;
  elements.openTopTaskDialog.hidden = top.length >= 3;
  if (top.length >= 3 && elements.topTaskDialog.open) elements.topTaskDialog.close();
  renderReturnedToday(today);
  renderTopTasks(today, top);
  renderWeeklySessionButton(today);
  renderEveningCloseButton(today);
  renderTodayTimeline(today);
}

function deferredReturnCount(entry) {
  return storedEntryEventLog(entry).filter(event => event.type === 'return_deferred').length;
}

function returnedEntriesFor(today = dateKey()) {
  return entries
    .filter(entry => entry.status === 'open'
      && validDateKey(entry.followUpDate)
      && entry.followUpDate <= today
      && entry.topTodayDate !== today)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)
      || new Date(a.createdAt) - new Date(b.createdAt));
}

function returnActionButton(label, handler, { className = '', iconName = '', disabled = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `return-action ${className}`.trim();
  button.disabled = disabled;
  if (iconName) button.append(uiIcon(iconName));
  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);
  button.addEventListener('click', handler);
  return button;
}

function buildReturnDateOptions(entry, details) {
  const options = document.createElement('div');
  options.className = 'return-date-options';
  resolvedReturnSchedules(entry.id, dateKey(), { enforceCapacity: false }).forEach(schedule => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'return-date-option';
    button.textContent = schedule.shifted ? `${schedule.label} ← الجلسة` : schedule.label;
    button.addEventListener('click', async () => {
      details.removeAttribute('open');
      await scheduleEntryReturn(entry.id, schedule.key, { deferred: true });
    });
    options.append(button);
  });
  return options;
}

function createReturnDateMenu(entry) {
  const details = document.createElement('details');
  details.className = 'return-defer-menu';
  const summary = document.createElement('summary');
  summary.textContent = 'أجّل';
  details.append(summary, buildReturnDateOptions(entry, details));
  return details;
}

function createEntryDeferMenu(entry) {
  const details = document.createElement('details');
  details.className = 'entry-defer-menu';
  const summary = document.createElement('summary');
  summary.append(uiIcon('defer'));
  summary.title = 'أجّل';
  summary.setAttribute('aria-label', 'أجّل');
  details.append(summary, buildReturnDateOptions(entry, details));
  return details;
}

function createReturnCard(entry) {
  const card = document.createElement('article');
  card.className = `return-card path-${entry.path}`;
  card.dataset.entryId = entry.id;

  const head = document.createElement('div');
  head.className = 'return-card-head';
  const text = document.createElement('button');
  text.type = 'button';
  text.className = 'return-card-text';
  text.dir = 'auto';
  text.textContent = entry.text || attachmentOnlyLabel(entry);
  text.setAttribute('aria-label', `عرض تفاصيل الالتقاطة: ${text.textContent}`);
  text.addEventListener('click', () => openEntryDetails(entry.id));
  const path = document.createElement('span');
  path.className = `chip path-${entry.path}`;
  path.title = PATHS[entry.path] || 'دون مسار';
  path.setAttribute('aria-label', path.title);
  path.append(pathIcon(entry.path));
  head.append(text, path);

  const meta = document.createElement('div');
  meta.className = 'return-card-meta';
  const today = dateKey();
  const overdueDays = validDateKey(entry.followUpDate)
    ? Math.max(0, daysBetweenKeys(entry.followUpDate, today))
    : 0;
  if (overdueDays > 0) {
    const overdue = document.createElement('span');
    overdue.className = 'return-overdue';
    overdue.textContent = `متأخر ${ageDaysLabel(overdueDays)}`;
    meta.append(overdue);
  } else if (entry.followUpDate === today) {
    meta.append(document.createTextNode('موعده اليوم'));
  } else if (validDateKey(entry.followUpDate)) {
    meta.append(document.createTextNode(`يعود ${relativeDayLabel(entry.followUpDate)}`));
  } else {
    meta.append(document.createTextNode('بلا تاريخ عودة'));
  }
  const deferredCount = deferredReturnCount(entry);
  if (deferredCount >= 3) {
    const deferred = document.createElement('span');
    deferred.textContent = `· أُجّل ${formatNumber(deferredCount)} مرات`;
    meta.append(deferred);
  }

  const actions = document.createElement('div');
  actions.className = 'return-actions';
  const topDisabled = !canAddTop(today, entry.id);
  actions.append(
    returnActionButton('تمّ', () => setEntryStatus(entry.id, 'done'), { className: 'primary', iconName: 'check' }),
    createReturnDateMenu(entry),
    returnActionButton('أهم اليوم', () => setTopToday(entry.id, today), {
      className: 'top',
      iconName: 'star',
      disabled: topDisabled
    }),
    returnActionButton('أغلق', () => setEntryStatus(entry.id, 'closed'))
  );
  card.append(head, meta, actions);
  return card;
}

function renderReturnedToday(today = dateKey()) {
  const list = returnedEntriesFor(today);
  const overdue = list.filter(entry => entry.followUpDate < today).length;
  elements.returnedTodaySection.hidden = list.length === 0;
  elements.returnedTodayCount.textContent = overdue
    ? `${formatNumber(list.length)} · متأخر ${formatNumber(overdue)}`
    : formatNumber(list.length);
  elements.returnedTodayList.replaceChildren(...list.map(createReturnCard));
}

function intentionallyClearedReturnDate(entry) {
  const latest = storedEntryEventLog(entry).slice().reverse()
    .find(event => event.type === 'return_date_changed');
  return Boolean(latest && !latest.to);
}

function waitingStagnationDays(entry) {
  const pathAge = currentPathAgeDays(entry);
  if (pathAge != null) return pathAge;
  const lastChange = validIso(entry.updatedAt) || validIso(entry.createdAt);
  return lastChange ? Math.max(0, Math.floor((Date.now() - new Date(lastChange).getTime()) / DAY)) : 0;
}

function weeklySessionLists(today = dateKey()) {
  const source = entries.filter(entry => entry.status === 'open' && entry.topTodayDate !== today);
  const used = new Set();
  const take = (predicate, sorter, limit = Infinity) => source
    .filter(entry => !used.has(entry.id) && predicate(entry))
    .sort(sorter)
    .slice(0, limit)
    .map(entry => {
      used.add(entry.id);
      return entry;
    });
  const byReturnThenCreated = (a, b) => (a.followUpDate || '').localeCompare(b.followUpDate || '')
    || new Date(a.createdAt) - new Date(b.createdAt);
  const overdue = take(entry => validDateKey(entry.followUpDate) && entry.followUpDate < today, byReturnThenCreated);
  const due = take(entry => validDateKey(entry.followUpDate) === today, byReturnThenCreated);
  const waiting = take(
    entry => entry.path === 'waiting' && waitingStagnationDays(entry) >= 7,
    (a, b) => waitingStagnationDays(b) - waitingStagnationDays(a)
  );
  const undated = take(
    entry => !validDateKey(entry.followUpDate) && !intentionallyClearedReturnDate(entry),
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    MAX_WEEKLY_UNDATED_RETURNS
  );
  return { overdue, due, waiting, undated };
}

function renderWeeklySessionGroup(group, container, list) {
  group.hidden = list.length === 0;
  container.replaceChildren(...list.map(createReturnCard));
}

function renderWeeklySessionDialog() {
  const lists = weeklySessionLists();
  renderWeeklySessionGroup(elements.weeklyOverdueGroup, elements.weeklyOverdueList, lists.overdue);
  renderWeeklySessionGroup(elements.weeklyDueGroup, elements.weeklyDueList, lists.due);
  renderWeeklySessionGroup(elements.weeklyWaitingGroup, elements.weeklyWaitingList, lists.waiting);
  renderWeeklySessionGroup(elements.weeklyUndatedGroup, elements.weeklyUndatedList, lists.undated);
}

function renderWeeklySessionButton(today = dateKey()) {
  const isSessionDay = dateFromKey(today).getDay() === weeklySessionDayValue();
  const completed = settingsMap.get(WEEKLY_SESSION_COMPLETED_SETTING) === today;
  elements.weeklySessionSection.hidden = !isSessionDay || completed;
  if (!isSessionDay || completed) return;
  const lists = weeklySessionLists(today);
  const count = Object.values(lists).reduce((sum, list) => sum + list.length, 0);
  elements.weeklySessionButtonStatus.textContent = count
    ? `${formatNumber(count)} عناصر للمراجعة`
    : 'لا عناصر معلقة؛ ثبّت عادة الجلسة';
}

function openWeeklySessionDialog() {
  renderWeeklySessionDialog();
  if (!elements.weeklySessionDialog.open) elements.weeklySessionDialog.showModal();
}

async function completeWeeklySession() {
  const today = dateKey();
  await putSetting(WEEKLY_SESSION_COMPLETED_SETTING, today);
  elements.weeklySessionDialog.close();
  renderToday();
  showToast('اكتملت جلسة مرساة.');
}

function dayClosingSummary(day) {
  const resolvedIds = new Set();
  const completedIds = new Set();
  entries.forEach(entry => {
    storedEntryEventLog(entry).forEach(event => {
      if (recordedOperationalDate(event.localDate, event.localHour, event.at) !== day) return;
      if (event.type === 'path_changed'
          && ['consider', 'untriaged'].includes(event.from)
          && !['consider', 'untriaged'].includes(event.to)
          && !['consider', 'untriaged'].includes(entry.path)) {
        resolvedIds.add(entry.id);
      }
      if (event.type === 'status_changed' && ['done', 'closed'].includes(event.to)
          && ['done', 'closed'].includes(entry.status)) {
        completedIds.add(entry.id);
      }
    });
  });
  const openDo = [...(entriesByPath.get('do') || [])].sort((a, b) => {
    const aTop = a.topTodayDate === day ? 1 : 0;
    const bTop = b.topTodayDate === day ? 1 : 0;
    if (aTop !== bTop) return bTop - aTop;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return {
    resolved: resolvedIds.size,
    completed: completedIds.size,
    openDo
  };
}

function renderEveningCloseButton(day) {
  const closure = dayClosureFor(day);
  if (!closure) {
    elements.eveningCloseButtonStatus.textContent = 'رتّب الغد واحفظ نسختك';
    elements.openEveningCloseButton.setAttribute('aria-label', 'إغلاق اليوم وترتيب الغد');
    return;
  }
  const backupText = closure.backupAt ? ' · نسخة مؤكدة' : '';
  elements.eveningCloseButtonStatus.textContent = `أُغلق ${formatTime(closure.closedAt)}${backupText}`;
  elements.openEveningCloseButton.setAttribute('aria-label', `تعديل إغلاق اليوم، أُغلق الساعة ${formatTime(closure.closedAt)}`);
}

function renderEveningCloseDialog() {
  const today = dateKey();
  const tomorrow = shiftDateKey(today, 1);
  const summary = dayClosingSummary(today);
  const closure = dayClosureFor(today);
  const tomorrowRecord = dailyRecordFor(tomorrow);
  elements.eveningResolvedCount.textContent = formatNumber(summary.resolved);
  elements.eveningCompletedCount.textContent = formatNumber(summary.completed);
  elements.eveningOpenDoCount.textContent = formatNumber(summary.openDo.length);
  const visibleOpen = summary.openDo.slice(0, 3);
  elements.eveningOpenDoMore.textContent = summary.openDo.length > visibleOpen.length
    ? `+${formatNumber(summary.openDo.length - visibleOpen.length)}`
    : '';
  if (visibleOpen.length) {
    elements.eveningOpenDoList.replaceChildren(...visibleOpen.map(createReturnCard));
  } else {
    const empty = document.createElement('p');
    empty.className = 'evening-open-empty';
    empty.textContent = 'لا شيء مفتوح.';
    elements.eveningOpenDoList.replaceChildren(empty);
  }
  if (document.activeElement !== elements.eveningTomorrowDirection) {
    elements.eveningTomorrowDirection.value = tomorrowRecord?.direction || closure?.tomorrowDirection || '';
  }
  elements.eveningClosedStatus.textContent = closure
    ? `محفوظ منذ ${formatTime(closure.closedAt)}${closure.backupAt ? ' · النسخة مؤكدة' : ''}`
    : 'سيُحفظ ملخص اليوم مع توجّه الغد.';
}

function openEveningCloseDialog() {
  renderEveningCloseDialog();
  elements.eveningCloseDialog.showModal();
}

function renderTopProgress(top) {
  const completed = top.filter(entry => entry.status === 'done').length;
  const dots = Array.from({ length: 3 }, (_, index) => {
    const dot = document.createElement('span');
    dot.className = 'top-progress-dot';
    if (index < top.length) dot.classList.add('assigned');
    if (index < completed) dot.classList.add('done');
    return dot;
  });
  elements.topProgress.replaceChildren(...dots);
  elements.topProgress.setAttribute('aria-label', `${completed} من 3 مهام مكتملة`);
}

function renderTopTasks(dayKey, top) {
  if (!top.length) {
    const note = document.createElement('p');
    note.className = 'top-empty';
    note.textContent = 'ثلاث مهام تكفي اليوم';
    elements.topTasksList.replaceChildren(note);
  } else {
    elements.topTasksList.replaceChildren(...top.map(entry => createTopTaskElement(entry, dayKey)));
  }

  const candidates = (entriesByPath.get('do') || []).filter(entry =>
    entry.topTodayDate !== dayKey
  ).slice(0, 8);

  if (!candidates.length) {
    elements.topCandidates.replaceChildren(emptyNode('لا توجد مهام مفتوحة في مسار «نفّذ».'));
  } else {
    elements.topCandidates.replaceChildren(...candidates.map(entry => {
      const row = document.createElement('div');
      row.className = 'top-item';
      const title = document.createElement('p');
      title.className = 'entry-title';
      title.dir = 'auto';
      title.textContent = entry.text || 'إدخال بلا نص';
      const add = document.createElement('button');
      add.className = 'action-link primary';
      add.textContent = '+';
      add.title = 'إضافة إلى أهم اليوم';
      add.setAttribute('aria-label', 'إضافة إلى أهم اليوم');
      add.disabled = !canAddTop(dayKey);
      add.addEventListener('click', async () => {
        await setTopToday(entry.id, dayKey);
        if (elements.topTaskDialog.open) elements.topTaskDialog.close();
      });
      row.append(title, add);
      return row;
    }));
  }
}

function createTopTaskElement(entry, dayKey) {
  const row = document.createElement('div');
  row.className = `top-item top-task-item${entry.status === 'done' ? ' done' : ''}`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox';
  checkbox.checked = entry.status === 'done';
  checkbox.setAttribute('aria-label', `إكمال ${entry.text || 'المهمة'}`);
  checkbox.addEventListener('change', async () => {
    const nextStatus = checkbox.checked ? 'done' : 'open';
    try {
      await setEntryStatus(entry.id, nextStatus);
    } catch (error) {
      checkbox.checked = nextStatus !== 'done';
      reportStorageFailure(error, 'تحديث المهمة');
    }
  });

  const title = document.createElement('p');
  title.className = 'entry-title';
  title.dir = 'auto';
  title.textContent = entry.text || attachmentOnlyLabel(entry);

  const checkTarget = document.createElement('label');
  checkTarget.className = 'top-task-check';
  checkTarget.title = checkbox.getAttribute('aria-label');
  checkTarget.append(checkbox, title);

  const remove = document.createElement('button');
  remove.className = 'action-link top-task-remove';
  remove.textContent = '×';
  remove.title = 'إزالة من أهم المهام';
  remove.setAttribute('aria-label', 'إزالة من أهم المهام');
  remove.addEventListener('click', () => setTopToday(entry.id, null));

  row.append(checkTarget, remove);
  return row;
}

function renderTodayTimeline(dayKey) {
  const list = entriesForDate(dayKey);
  elements.todayLogCount.textContent = formatNumber(list.length);
  renderEntryList(elements.todayTimeline, list.slice(0, todayEntriesLimit), 'سجل اليوم فارغ. زر الالتقاط ينتظر أول سطر.');
  elements.loadMoreTodayButton.hidden = list.length <= todayEntriesLimit;
}

function entrySearchText(entry) {
  return normalizeArabic([
    entry.text,
    entry.context,
    entry.person,
    PATHS[entry.path],
    STATUSES[entry.status],
    formatDate(entry.createdAt)
  ].filter(Boolean).join(' '));
}

function renderEntries() {
  const query = clampString(elements.entriesSearchInput.value, 200);
  const terms = normalizeArabic(query).split(' ').filter(Boolean);
  const from = validDateKey(elements.entriesDateFrom.value) || '';
  const to = validDateKey(elements.entriesDateTo.value) || '';
  const sort = ['newest', 'oldest'].includes(elements.entriesSort.value)
    ? elements.entriesSort.value
    : 'newest';

  const matchingBeforePath = entries.filter(entry => {
    if (entry.status === 'trash') return false;
    const createdDay = entryDate(entry);
    if (from && createdDay < from) return false;
    if (to && createdDay > to) return false;
    if (!terms.length) return true;
    const haystack = searchTextByEntryId.get(entry.id) || entrySearchText(entry);
    return terms.every(term => haystack.includes(term));
  });

  const pathCounts = Object.fromEntries(Object.keys(ROUTABLE_PATHS).map(path => [path, 0]));
  matchingBeforePath.forEach(entry => {
    if (hasOwn(pathCounts, entry.path)) pathCounts[entry.path] += 1;
  });
  renderEntriesPathFilters(matchingBeforePath.length, pathCounts);

  const filtered = activeEntriesPath === 'all'
    ? matchingBeforePath
    : matchingBeforePath.filter(entry => entry.path === activeEntriesPath);
  const results = sortEntriesResults(filtered, sort);
  const shown = results.slice(0, entriesResultsLimit);
  const hasFilters = Boolean(query || from || to || activeEntriesPath !== 'all' || sort !== 'newest');

  elements.entriesCount.textContent = String(results.length);
  elements.entriesResultsNote.textContent = entriesResultsNote(query, results.length, shown.length, sort);
  elements.loadMoreEntriesButton.hidden = shown.length >= results.length;
  elements.clearEntriesFiltersButton.disabled = !hasFilters;
  updateEntriesFilterSummary(from, to, sort);
  renderEntryList(
    elements.entriesList,
    shown,
    hasFilters ? 'لا توجد نتائج مطابقة.' : 'لا توجد التقاطات بعد.'
  );
}

function isLikelyDirectTopTask(entry) {
  return entry.type === 'task'
    && entry.path === 'do'
    && entry.topTodayDate === entryDate(entry);
}

function hasCompletePathHistory(entry) {
  const first = pathLogFor(entry)[0];
  return Boolean(first && validIso(first.at) === validIso(entry.createdAt));
}

function recordedOperationalDate(localDate, localHour, fallbackTimestamp) {
  const key = validDateKey(localDate);
  const hour = Number(localHour);
  if (key && Number.isInteger(hour) && hour >= 0 && hour <= 23) {
    return hour < DAY_START_HOUR ? shiftDateKey(key, -1) : key;
  }
  return key || dateKey(fallbackTimestamp);
}

function pathEventDate(event) {
  const offset = Number(event?.utcOffsetMinutes);
  const hour = Number.isInteger(offset) && offset >= -840 && offset <= 840 && validIso(event?.at)
    ? localPartsAtOffset(event.at, offset).hour
    : null;
  return recordedOperationalDate(event?.localDate, hour, event?.at);
}

function renderAnalysisSummary() {
  const today = dateKey();
  if (renderedAnalysisRevision === analysisDataRevision && renderedAnalysisDay === today) return;
  const cutoff = shiftDateKey(today, -6);
  let estimatedResolutionEntries = 0;
  const recentEntries = entries.filter(entry => {
    if (entry.status === 'trash') return false;
    if (hasCompletePathHistory(entry)) {
      return pathLogFor(entry).some(event => {
        const eventDay = pathEventDate(event);
        return ['untriaged', 'consider'].includes(event.path) && eventDay >= cutoff && eventDay <= today;
      });
    }
    const createdDay = entryDate(entry);
    const included = createdDay >= cutoff && createdDay <= today && !isLikelyDirectTopTask(entry);
    if (included) estimatedResolutionEntries += 1;
    return included;
  });
  const resolvedEntries = recentEntries.filter(entry => !['consider', 'untriaged'].includes(entry.path));
  elements.analysisResolutionRate.textContent = recentEntries.length
    ? `${Math.round((resolvedEntries.length / recentEntries.length) * 100)}%`
    : '—';
  elements.analysisResolutionDetail.textContent = recentEntries.length
    ? `${resolvedEntries.length} من ${recentEntries.length}${estimatedResolutionEntries ? ` · ${estimatedResolutionEntries} تقديري` : ' · 7 أيام'}`
    : 'لا التقاطات جديدة';

  const stuckEntries = entries.filter(entry => entry.status !== 'trash' && entry.path === 'consider');
  const oldestAge = stuckEntries.reduce((oldest, entry) => Math.max(oldest, entryAgeDays(entry)), 0);
  elements.analysisOldestAge.textContent = stuckEntries.length ? ageDaysLabel(oldestAge) : '—';
  elements.analysisOldestDetail.textContent = stuckEntries.length
    ? `${stuckEntries.length} في للنظر`
    : 'لا عوالق';

  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const recentTopIds = dailyRecords
    .filter(record => record.date >= cutoff && record.date <= today)
    .flatMap(record => Array.isArray(record.topEntryIds) ? record.topEntryIds : []);
  const completedTop = recentTopIds.filter(id => entryById.get(id)?.status === 'done').length;
  elements.analysisTopCompletion.textContent = recentTopIds.length
    ? `${completedTop}/${recentTopIds.length}`
    : '—';
  elements.analysisTopDetail.textContent = recentTopIds.length ? 'آخر 7 أيام' : 'لم تُحدد مهام';
  renderPathBacklog();
  renderCaptureHeatmap(today);
  renderDecisionWindow(today);
  renderedAnalysisRevision = analysisDataRevision;
  renderedAnalysisDay = today;
}

function renderPathBacklog() {
  const activeEntries = entries.filter(entry => entry.status !== 'trash');
  const counts = Object.fromEntries(Object.keys(ROUTABLE_PATHS).map(path => [path, 0]));
  activeEntries.forEach(entry => {
    if (hasOwn(counts, entry.path)) counts[entry.path] += 1;
  });
  const routedCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const maxCount = Math.max(1, ...Object.values(counts));
  elements.pathBacklogSummary.textContent = routedCount
    ? `للنظر ${counts.consider} · بانتظار ${counts.waiting}`
    : 'لا إدخالات في المسارات';

  const oldThresholds = { consider: 30, waiting: 14 };
  const rows = Object.entries(ROUTABLE_PATHS).map(([path, label]) => {
    const pathEntries = activeEntries.filter(entry => entry.path === path);
    const threshold = oldThresholds[path];
    let oldCount = 0;
    let estimatedOldCount = 0;
    if (threshold) {
      pathEntries.forEach(entry => {
        const trackedAge = currentPathAgeDays(entry);
        const age = trackedAge ?? entryAgeDays(entry);
        if (age >= threshold) {
          oldCount += 1;
          if (trackedAge == null) estimatedOldCount += 1;
        }
      });
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `path-backlog-row path-${path}`;
    const oldText = threshold && oldCount ? ` · ${oldCount} قديم${estimatedOldCount ? '*' : ''}` : '';
    button.setAttribute('aria-label', `${label}: ${entryCountLabel(pathEntries.length)}${oldCount ? `، منها ${oldCount} أقدم من ${threshold} يومًا${estimatedOldCount ? ' وبعضها تقديري لغياب سجل انتقال سابق' : ''}` : ''}`);
    if (estimatedOldCount) button.title = '* العمر التقديري محسوب منذ إنشاء الإدخال لعدم وجود سجل انتقال قديم.';

    const name = document.createElement('span');
    name.className = 'path-backlog-name';
    const icon = pathIcon(path);
    const text = document.createElement('span');
    text.textContent = label;
    name.append(icon, text);

    const track = document.createElement('span');
    track.className = 'path-backlog-track';
    const fill = document.createElement('span');
    fill.className = 'path-backlog-fill';
    fill.style.setProperty('--bar-width', `${Math.round((pathEntries.length / maxCount) * 100)}%`);
    track.append(fill);

    const meta = document.createElement('span');
    meta.className = 'path-backlog-meta';
    meta.textContent = `${pathEntries.length}${oldText}`;
    button.append(name, track, meta);
    button.addEventListener('click', () => {
      activeEntriesPath = path;
      entriesResultsLimit = ENTRY_PAGE_SIZE;
      switchView('entries');
    });
    return button;
  });
  elements.pathBacklogList.replaceChildren(...rows);
}

function entryCreatedHour(entry) {
  const hour = Number(entry?.createdLocal?.hour);
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  const createdAt = new Date(entry.createdAt);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt.getHours();
}

function renderCaptureHeatmap(today) {
  const cutoff = shiftDateKey(today, -(HEATMAP_DAYS - 1));
  const dayLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const shortLabels = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let total = 0;
  let fallbackCount = 0;
  entries.forEach(entry => {
    if (entry.status === 'trash') return;
    const createdDay = entryDate(entry);
    if (createdDay < cutoff || createdDay > today) return;
    const hour = entryCreatedHour(entry);
    if (hour == null) return;
    const weekday = dateFromKey(createdDay).getDay();
    matrix[weekday][hour] += 1;
    total += 1;
    if (!entry.createdLocal) fallbackCount += 1;
  });

  let peakCount = 0;
  let peakDay = 0;
  let peakHour = 0;
  matrix.forEach((hours, day) => hours.forEach((count, hour) => {
    if (count > peakCount) {
      peakCount = count;
      peakDay = day;
      peakHour = hour;
    }
  }));
  elements.captureHeatmapSummary.textContent = total
    ? `${dayLabels[peakDay]} ${pad(peakHour)}:00 · 90 يومًا${fallbackCount ? ' *' : ''}`
    : 'لا إدخالات · 90 يومًا';
  elements.captureHeatmap.title = fallbackCount
    ? '* بعض السجلات أقدم من حفظ المنطقة الزمنية، فحُسبت بتوقيت الجهاز الحالي.'
    : '';
  elements.captureHeatmap.setAttribute('aria-label', total
    ? `خريطة أوقات ${total} إدخالًا خلال آخر 90 يومًا. أعلى كثافة ${dayLabels[peakDay]} الساعة ${peakHour}، بعدد ${peakCount}.${fallbackCount ? ` ${fallbackCount} إدخالًا قديمًا حُسب بتوقيت الجهاز الحالي.` : ''}`
    : 'لا توجد التقاطات في آخر 90 يومًا.');

  const rows = matrix.map((hours, day) => {
    const row = document.createElement('div');
    row.className = 'heatmap-row';
    const label = document.createElement('span');
    label.className = 'heatmap-day';
    label.textContent = shortLabels[day];
    row.append(label, ...hours.map((count, hour) => {
      const cell = document.createElement('span');
      const level = peakCount && count ? Math.max(1, Math.ceil((count / peakCount) * 4)) : 0;
      cell.className = `heatmap-cell${level ? ` level-${level}` : ''}`;
      cell.title = `${dayLabels[day]} ${pad(hour)}:00 · ${count}`;
      cell.setAttribute('aria-hidden', 'true');
      return cell;
    }));
    return row;
  });
  const axis = document.createElement('div');
  axis.className = 'heatmap-axis';
  axis.setAttribute('aria-hidden', 'true');
  [['axis-spacer', ''], ['hour-0', '0'], ['hour-6', '6'], ['hour-12', '12'], ['hour-18', '18'], ['hour-23', '23']]
    .forEach(([className, text]) => {
      const label = document.createElement('span');
      label.className = className;
      label.textContent = text;
      axis.append(label);
    });
  elements.captureHeatmap.replaceChildren(...rows, axis);
}

function isDocumentedDecisionEvent(event) {
  if (!event || event.estimated) return false;
  if (event.type === 'status_changed' && event.to === 'done') return true;
  return event.type === 'path_changed'
    && ['consider', 'untriaged'].includes(event.from)
    && !['consider', 'untriaged'].includes(event.to);
}

function decisionEventsNeededLabel(count) {
  if (count === 1) return 'حدث حسم موثق واحد';
  if (count === 2) return 'حدثي حسم موثقين';
  if (count >= 3 && count <= 10) return `${count} أحداث حسم موثقة`;
  return `${count} حدث حسم موثق`;
}

function renderDecisionWindow(today) {
  const cutoff = shiftDateKey(today, -(HEATMAP_DAYS - 1));
  const hourly = Array(24).fill(0);
  let total = 0;
  entries.forEach(entry => {
    if (entry.status === 'trash') return;
    storedEntryEventLog(entry).forEach(event => {
      if (!isDocumentedDecisionEvent(event)) return;
      const eventDay = recordedOperationalDate(event.localDate, event.localHour, event.at);
      const hour = Number(event.localHour);
      if (eventDay < cutoff || eventDay > today || !Number.isInteger(hour) || hour < 0 || hour > 23) return;
      hourly[hour] += 1;
      total += 1;
    });
  });

  if (total < DECISION_WINDOW_MIN_EVENTS) {
    const remaining = DECISION_WINDOW_MIN_EVENTS - total;
    elements.decisionWindowSummary.textContent = `${total}/${DECISION_WINDOW_MIN_EVENTS} حدثًا`;
    elements.decisionWindowCopy.textContent = `تظهر بعد ${decisionEventsNeededLabel(remaining)}.`;
    return;
  }

  let peakStart = 0;
  let peakCount = -1;
  for (let start = 0; start < 24; start += 1) {
    let count = 0;
    for (let offset = 0; offset < DECISION_WINDOW_HOURS; offset += 1) {
      count += hourly[(start + offset) % 24];
    }
    if (count > peakCount) {
      peakStart = start;
      peakCount = count;
    }
  }
  const peakEnd = (peakStart + DECISION_WINDOW_HOURS) % 24;
  const range = `${pad(peakStart)}:00–${pad(peakEnd)}:00`;
  elements.decisionWindowSummary.textContent = `${range} · ${total} حدثًا`;
  elements.decisionWindowCopy.textContent = `أكثر أوقات الحسم في آخر 90 يومًا: ${range}، وفيها ${peakCount} من ${total} حدثًا موثقًا.`;
}

function renderEntriesPathFilters(total, pathCounts) {
  const options = [
    ['all', 'الكل', ''],
    ...Object.entries(ROUTABLE_PATHS).map(([path, label]) => [path, label, path])
  ];
  elements.entriesPathFilters.replaceChildren(...options.map(([path, label, icon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `entries-path-button${path === 'all' ? '' : ` path-${path}`}${activeEntriesPath === path ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(activeEntriesPath === path));
    const count = path === 'all' ? total : pathCounts[path] || 0;
    const name = document.createElement('span');
    name.className = 'entries-path-name';
    if (icon) {
      const iconNode = pathIcon(icon);
      iconNode.classList.add('entries-path-icon');
      const labelNode = document.createElement('span');
      labelNode.textContent = label;
      name.append(iconNode, labelNode);
    } else {
      name.textContent = label;
    }
    const countNode = document.createElement('span');
    countNode.className = 'count';
    countNode.textContent = String(count);
    button.setAttribute('aria-label', `${label}، ${entryCountLabel(count)}`);
    button.append(name, countNode);
    button.addEventListener('click', () => {
      if (activeEntriesPath === path) return;
      activeEntriesPath = path;
      entriesResultsLimit = ENTRY_PAGE_SIZE;
      renderEntries();
    });
    return button;
  }));
}

function sortEntriesResults(list, sort) {
  const sorted = [...list];
  if (sort === 'oldest') {
    return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function entriesSortLabel(sort) {
  if (sort === 'oldest') return 'الأقدم';
  return 'الأحدث';
}

function updateEntriesFilterSummary(from, to, sort) {
  const parts = [entriesSortLabel(sort)];
  if (from && to) parts.push(`${formatDateKey(from)}–${formatDateKey(to)}`);
  else if (from) parts.push(`من ${formatDateKey(from)}`);
  else if (to) parts.push(`حتى ${formatDateKey(to)}`);
  elements.entriesFilterSummary.textContent = parts.join(' · ');
}

function entriesResultsNote(query, total, shown, sort) {
  const parts = [];
  if (query) parts.push(`«${query}»`);
  parts.push(entryCountLabel(total));
  if (shown < total) parts.push(`تظهر ${shown}`);
  parts.push(entriesSortLabel(sort));
  return parts.join(' · ');
}

function scheduleEntriesSearch() {
  clearTimeout(entriesSearchTimer);
  entriesResultsLimit = ENTRY_PAGE_SIZE;
  entriesSearchTimer = setTimeout(() => {
    renderEntries();
  }, 100);
}

function handleEntriesDateChange(changed) {
  const from = elements.entriesDateFrom.value;
  const to = elements.entriesDateTo.value;
  if (from && to && from > to) {
    if (changed === 'from') elements.entriesDateTo.value = from;
    else elements.entriesDateFrom.value = to;
  }
  entriesResultsLimit = ENTRY_PAGE_SIZE;
  renderEntries();
}

function clearEntriesFilters() {
  clearTimeout(entriesSearchTimer);
  elements.entriesSearchInput.value = '';
  elements.entriesDateFrom.value = '';
  elements.entriesDateTo.value = '';
  elements.entriesSort.value = 'newest';
  activeEntriesPath = 'all';
  entriesResultsLimit = ENTRY_PAGE_SIZE;
  renderEntries();
  elements.entriesSearchInput.focus();
}

function renderDays() {
  renderAnalysisSummary();
  const keys = archiveDayKeys(activeArchiveMonth);
  const activityMonths = archiveActivityMonths();
  const earliestMonth = activityMonths.at(-1) || dateKey().slice(0, 7);
  const currentMonth = dateKey().slice(0, 7);
  const entryCount = keys.reduce((sum, key) => sum + entriesForDate(key).length, 0);

  elements.archiveMonthLabel.textContent = formatMonthLabel(activeArchiveMonth);
  elements.archiveMonthNumeric.textContent = formatMonthNumeric(activeArchiveMonth);
  elements.archiveMonthInput.value = activeArchiveMonth;
  elements.archiveMonthInput.min = earliestMonth;
  elements.archiveMonthInput.max = currentMonth;
  elements.archivePreviousMonthButton.disabled = activeArchiveMonth <= earliestMonth;
  elements.archiveNextMonthButton.disabled = activeArchiveMonth >= currentMonth;
  elements.archiveMonthSummary.textContent = `${savedDayCountLabel(keys.length)} · ${entryCountLabel(entryCount)}`;

  if (!keys.length) {
    elements.daysList.replaceChildren(emptyNode('لا توجد أيام محفوظة في هذا الشهر.'));
    elements.selectedDayPanel.hidden = true;
    return;
  }

  if (!keys.includes(selectedDay)) {
    selectedDay = keys[0];
    selectedDayEditUnlocked = selectedDay === dateKey();
    selectedDayEntriesLimit = ENTRY_PAGE_SIZE;
  }
  elements.selectedDayPanel.hidden = false;
  elements.daysList.replaceChildren(...keys.map(key => createDayButton(key)));
  renderSelectedDay();
}

function archiveDayKeys(month) {
  const set = new Set(entriesByDate.keys());
  dailyRecords.forEach(record => {
    if (record.date <= dateKey() && dailyRecordHasContent(record)) set.add(record.date);
  });
  return [...set]
    .filter(key => validDateKey(key) && key.startsWith(`${month}-`))
    .sort((a, b) => b.localeCompare(a));
}

function dayKeys() {
  const set = new Set(entriesByDate.keys());
  dailyRecords.forEach(record => {
    if (record.date <= dateKey() && dailyRecordHasContent(record)) set.add(record.date);
  });
  return [...set].filter(validDateKey).sort((a, b) => b.localeCompare(a));
}

function archiveActivityMonths() {
  const months = new Set([dateKey().slice(0, 7)]);
  entriesByDate.forEach((_, key) => months.add(key.slice(0, 7)));
  dailyRecords.forEach(record => {
    if (record.date <= dateKey() && dailyRecordHasContent(record)) months.add(record.date.slice(0, 7));
  });
  return [...months].filter(validMonthKey).sort((a, b) => b.localeCompare(a));
}

function setArchiveMonth(month) {
  const valid = validMonthKey(month);
  if (!valid || valid > dateKey().slice(0, 7)) return;
  activeArchiveMonth = valid;
  const keys = archiveDayKeys(valid);
  selectedDay = keys[0] || '';
  selectedDayEditUnlocked = selectedDay === dateKey();
  selectedDayEntriesLimit = ENTRY_PAGE_SIZE;
  renderDays();
}

function createDayButton(key) {
  const count = entriesForDate(key).length;
  const button = document.createElement('button');
  button.className = `day-button${selectedDay === key ? ' active' : ''}`;
  button.type = 'button';
  button.setAttribute('aria-label', `${dayName(key)} ${formatDateKey(key)}، ${entryCountLabel(count)}`);
  const date = document.createElement('strong');
  date.textContent = pad(dateFromKey(key).getDate());
  const weekday = document.createElement('span');
  weekday.className = 'weekday';
  weekday.textContent = dayName(key);
  const meta = document.createElement('span');
  meta.className = 'count';
  meta.textContent = entryCountLabel(count);
  button.append(date, weekday, meta);
  button.addEventListener('click', () => {
    selectedDay = key;
    selectedDayEditUnlocked = key === dateKey();
    selectedDayEntriesLimit = ENTRY_PAGE_SIZE;
    renderDays();
  });
  return button;
}

function renderSelectedDay() {
  const key = selectedDay || dateKey();
  const record = dailyRecordFor(key);
  const isToday = key === dateKey();
  elements.selectedDayTitle.textContent = `${dayName(key)} · ${formatDateKey(key)}`;
  elements.selectedDayMeta.textContent = isToday ? 'اليوم الحالي' : 'سجل يوم سابق';
  const archivedDirectionLocked = !isToday && !selectedDayEditUnlocked;
  const hasDirection = Boolean(record?.direction);
  elements.selectedDayDirection.readOnly = archivedDirectionLocked;
  elements.selectedDayDirection.hidden = archivedDirectionLocked;
  elements.selectedDayDirectionDisplay.hidden = !(archivedDirectionLocked && hasDirection);
  elements.selectedDayDirectionDisplay.textContent = hasDirection ? record.direction : '';
  elements.selectedDayDirectionLabel.hidden = archivedDirectionLocked && !hasDirection;
  elements.editDayButton.hidden = isToday || selectedDayEditUnlocked;
  if (document.activeElement !== elements.selectedDayDirection) {
    elements.selectedDayDirection.value = record?.direction || '';
  }
  elements.selectedDayDirectionStatus.hidden = archivedDirectionLocked;
  elements.selectedDayDirectionStatus.textContent = archivedDirectionLocked ? '' : 'يحفظ تلقائيًا.';

  const topWrap = document.createElement('section');
  topWrap.className = 'stack';
  const topTitle = document.createElement('h3');
  topTitle.textContent = 'أهم المهام';
  const topList = document.createElement('div');
  topList.className = 'top-list';
  const top = topEntriesFor(key);
  topList.replaceChildren(...(top.length ? top.map(entry => createTopTaskElement(entry, key)) : [emptyNode('لا توجد مهام عليا لهذا اليوم.')]));
  topWrap.append(topTitle, topList);

  const closure = createArchivedClosure(record?.closure);

  const timeline = document.createElement('section');
  timeline.className = 'stack';
  const timelineTitle = document.createElement('h3');
  timelineTitle.textContent = 'السجل الزمني';
  const list = document.createElement('div');
  list.className = 'card-list';
  const dayEntries = entriesForDate(key);
  renderEntryList(list, dayEntries.slice(0, selectedDayEntriesLimit), 'لا توجد إدخالات في هذا اليوم.');
  timeline.append(timelineTitle, list);
  if (dayEntries.length > selectedDayEntriesLimit) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'quiet-btn';
    more.textContent = 'عرض إدخالات أقدم';
    more.addEventListener('click', () => {
      selectedDayEntriesLimit += ENTRY_PAGE_SIZE;
      renderSelectedDay();
    });
    timeline.append(more);
  }
  elements.selectedDayContent.replaceChildren(...[closure, topWrap, timeline].filter(Boolean));
}

function createArchivedClosure(closure) {
  if (!closure) return null;
  const section = document.createElement('section');
  section.className = 'archived-closure';
  const head = document.createElement('div');
  head.className = 'archived-closure-head';
  const title = document.createElement('h3');
  title.textContent = 'إغلاق اليوم';
  const time = document.createElement('span');
  time.textContent = formatTime(closure.closedAt);
  head.append(title, time);
  const summary = document.createElement('p');
  summary.className = 'archived-closure-summary';
  summary.textContent = `حُسم ${formatNumber(closure.summary.resolved)} · أُنجز ${formatNumber(closure.summary.completed)} · بقي في نفّذ ${formatNumber(closure.summary.openDo)}`;
  section.append(head, summary);
  if (closure.tomorrowDirection) {
    const direction = document.createElement('p');
    direction.className = 'archived-closure-direction';
    direction.dir = 'auto';
    direction.textContent = `توجّه الغد: ${closure.tomorrowDirection}`;
    section.append(direction);
  }
  return section;
}

function renderEntryList(container, list, emptyMessage) {
  releaseObservedAttachmentImages(container);
  if (!list.length) {
    container.replaceChildren(emptyNode(emptyMessage));
    return;
  }
  container.replaceChildren(...list.map(entry => createEntryCard(entry)));
}

function createEntryCard(entry) {
  const article = document.createElement('article');
  article.className = `card entry-card path-${entry.path}`;
  article.dataset.entryId = entry.id;

  const text = document.createElement('button');
  text.type = 'button';
  text.className = 'entry-text entry-open';
  text.dir = 'auto';
  text.textContent = entry.text || attachmentOnlyLabel(entry);
  text.setAttribute('aria-label', `عرض تفاصيل الالتقاطة: ${entry.text || attachmentOnlyLabel(entry)}`);
  text.addEventListener('click', () => openEntryDetails(entry.id));

  const heading = document.createElement('div');
  heading.className = 'entry-heading';
  heading.append(createPathMenu(entry), text);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const age = chip('', 'age-chip');
  age.append(uiIcon('hourglass'), document.createTextNode(ageDaysLabel(entryAgeDays(entry))));
  age.title = 'العمر منذ إضافة الالتقاط';
  age.setAttribute('aria-label', `العمر منذ إضافة الالتقاط: ${ageDaysLabel(entryAgeDays(entry))}`);
  meta.append(age);
  if (entry.status !== 'open') {
    meta.append(iconChip('check', STATUSES[entry.status] || entry.status, `status-${entry.status}`));
  }
  if (entry.topTodayDate) meta.append(iconChip('starFilled', 'ضمن أهم المهام', 'top-marker'));

  const imageRow = createAttachmentRow(entry.id);
  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  appendEntryActions(actions, entry);
  article.append(heading, meta);
  if (imageRow) article.append(imageRow);
  article.append(actions);
  return article;
}

function entryEventDateTime(event) {
  const key = validDateKey(event?.localDate) || civilDateKey(event?.at);
  const hour = Number.isInteger(event?.localHour) ? event.localHour : new Date(event?.at).getHours();
  const minute = Number.isInteger(event?.localMinute) ? event.localMinute : new Date(event?.at).getMinutes();
  return `${formatDateKey(key)} · ${pad(hour)}:${pad(minute)}`;
}

function attachmentNamesLabel(event) {
  const names = Array.isArray(event.names) ? event.names.filter(Boolean) : [];
  if (!names.length) return '';
  const visible = names.slice(0, 2).join('، ');
  return names.length > 2 ? `${visible}، و${names.length - 2} أخرى` : visible;
}

function entryEventLabel(event) {
  switch (event.type) {
    case 'created':
      return event.to && PATHS[event.to]
        ? `أُنشئت في «${PATHS[event.to]}»`
        : 'أُنشئت الالتقاطة';
    case 'path_changed': {
      const from = PATHS[event.from] || '';
      const to = PATHS[event.to] || '';
      if (!from && to) return `حُدّد المسار «${to}»`;
      if (from && !to) return `أُزيل المسار «${from}»`;
      return `تغيّر المسار من «${from || event.from}» إلى «${to || event.to}»`;
    }
    case 'status_changed':
      return `تغيّرت الحالة من «${STATUSES[event.from] || event.from}» إلى «${STATUSES[event.to] || event.to}»`;
    case 'text_updated':
      return 'عُدّل نص الالتقاطة';
    case 'due_date_changed':
      return event.to ? `حُدّد موعد التنفيذ: ${formatDateKey(event.to)}` : 'أُزيل موعد التنفيذ';
    case 'return_date_changed':
      return event.to ? `حُدّد تاريخ العودة: ${formatDateKey(event.to)}` : 'أُزيل تاريخ العودة';
    case 'return_deferred':
      return event.to ? `أُجّلت العودة إلى ${formatDateKey(event.to)}` : 'أُجّلت العودة';
    case 'top_added':
      return `أُضيفت إلى أهم يوم ${formatDateKey(event.to)}`;
    case 'top_removed':
      return `أُزيلت من أهم يوم ${formatDateKey(event.from)}`;
    case 'attachments_added': {
      const names = attachmentNamesLabel(event);
      return `أُضيف ${event.count === 1 ? 'مرفق' : `${event.count} مرفقات`}${names ? `: ${names}` : ''}`;
    }
    case 'attachments_removed': {
      const names = attachmentNamesLabel(event);
      return `أُزيل ${event.count === 1 ? 'مرفق' : `${event.count} مرفقات`}${names ? `: ${names}` : ''}`;
    }
    default:
      return 'حُدّثت الالتقاطة';
  }
}

function renderEntryDetails(entryId) {
  const entry = entries.find(item => item.id === entryId);
  if (!entry) {
    elements.entryDetailsDialog.close();
    return false;
  }
  activeDetailsEntryId = entry.id;
  elements.entryDetailsText.textContent = entry.text || attachmentOnlyLabel(entry);
  elements.entryDetailsCreated.textContent = `${formatDateKey(entryDate(entry))} · ${formatEntryTime(entry)}`;
  elements.entryDetailsAge.replaceChildren(
    uiIcon('hourglass'),
    document.createTextNode(ageDaysLabel(entryAgeDays(entry)))
  );
  const pathFact = elements.entryDetailsPath.closest('.entry-details-fact');
  const hasPath = entry.path !== 'untriaged' && Boolean(PATHS[entry.path]);
  pathFact.hidden = !hasPath;
  elements.entryDetailsPath.className = hasPath ? `path-${entry.path}` : '';
  elements.entryDetailsPath.replaceChildren(...(hasPath
    ? [pathIcon(entry.path), document.createTextNode(PATHS[entry.path])]
    : []));
  elements.entryDetailsShare.hidden = entry.status === 'trash';
  elements.entryDetailsEdit.hidden = entry.status === 'trash';

  releaseObservedAttachmentImages(elements.entryDetailsAttachments);
  const attachmentRow = createAttachmentRow(entry.id);
  if (attachmentRow) {
    const heading = document.createElement('h3');
    heading.textContent = 'المرفقات';
    elements.entryDetailsAttachments.replaceChildren(heading, attachmentRow);
    elements.entryDetailsAttachments.hidden = false;
  } else {
    elements.entryDetailsAttachments.replaceChildren();
    elements.entryDetailsAttachments.hidden = true;
  }

  const eventItems = entryEventLog(entry).slice().reverse().map(event => {
    const item = document.createElement('li');
    item.className = 'entry-event';
    const label = document.createElement('span');
    label.className = 'entry-event-label';
    label.textContent = `${entryEventLabel(event)}${event.estimated ? ' · تقديري' : ''}`;
    const time = document.createElement('time');
    time.className = 'entry-event-time';
    time.dateTime = event.at;
    time.textContent = entryEventDateTime(event);
    item.append(label, time);
    return item;
  });
  elements.entryDetailsEvents.replaceChildren(...eventItems);
  return true;
}

function openEntryDetails(entryId) {
  if (!renderEntryDetails(entryId)) return;
  if (!elements.entryDetailsDialog.open) elements.entryDetailsDialog.showModal();
}

function chip(text, extraClass = '') {
  const span = document.createElement('span');
  span.className = `chip ${extraClass}`.trim();
  span.textContent = text;
  return span;
}

const UI_ICON_PATHS = Object.freeze({
  edit: [
    'M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6L7 20.7a2 2 0 0 0 .8-.5z',
    'm15 5 4 4'
  ],
  hourglass: [
    'M5 22h14M5 2h14M7 2v4.2c0 .5.2 1 .6 1.4L12 12l4.4-4.4c.4-.4.6-.9.6-1.4V2M7 22v-4.2c0-.5.2-1 .6-1.4L12 12l4.4 4.4c.4.4.6.9.6 1.4V22'
  ],
  trash: [
    'M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6'
  ],
  check: [
    'm5 12 4 4L19 6'
  ],
  star: [
    'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'
  ],
  starFilled: [
    'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'
  ],
  reopen: [
    'M3 12a9 9 0 1 0 3-6.7M3 4v6h6'
  ],
  return: [
    'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v2'
  ],
  share: [
    'M12 16V3M7 8l5-5 5 5M5 13v7h14v-7'
  ],
  pathUntriaged: [
    'm12 3 9 9-9 9-9-9z'
  ],
  pathDo: [
    'M4 4h16v16H4zM8 12l3 3 6-7'
  ],
  pathConsider: [
    'm12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM19 16v4M17 18h4'
  ],
  pathWaiting: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2'
  ],
  defer: [
    'M4 5h16v16H4z',
    'M4 9h16',
    'M8 3v4M16 3v4'
  ]
});

function uiIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ui-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  (UI_ICON_PATHS[name] || []).forEach(data => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    svg.append(path);
  });
  if (name === 'starFilled') svg.classList.add('is-filled');
  return svg;
}

function pathIcon(path) {
  const icon = uiIcon(PATH_ICON_NAMES[path] || PATH_ICON_NAMES.untriaged);
  icon.classList.add('path-svg-icon');
  return icon;
}

function iconChip(iconName, label, extraClass = '') {
  const span = chip('', extraClass);
  span.append(uiIcon(iconName));
  span.title = label;
  span.setAttribute('aria-label', label);
  return span;
}

function createPathMenu(entry) {
  const details = document.createElement('details');
  details.className = 'path-menu';
  const summary = document.createElement('summary');
  summary.className = `chip path-${entry.path}`;
  const hasPath = entry.path !== 'untriaged' && Boolean(PATHS[entry.path]);
  const currentLabel = hasPath ? PATHS[entry.path] : 'اختيار مسار';
  const currentIcon = pathIcon(entry.path);
  currentIcon.classList.add('path-menu-icon');
  summary.append(currentIcon);
  summary.title = currentLabel;
  summary.setAttribute('aria-label', hasPath ? `تغيير المسار الحالي: ${currentLabel}` : currentLabel);

  const options = document.createElement('div');
  options.className = 'path-menu-options';
  Object.entries(ROUTABLE_PATHS)
    .filter(([path]) => path !== entry.path)
    .forEach(([path, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `path-menu-option path-${path}`;
      const optionIcon = pathIcon(path);
      optionIcon.classList.add('path-option-icon');
      const optionLabel = document.createElement('span');
      optionLabel.textContent = label;
      button.append(optionIcon, optionLabel);
      button.addEventListener('click', async event => {
        event.stopPropagation();
        details.open = false;
        await updateEntry(entry.id, { path });
        showToast(label);
      });
      options.append(button);
    });

  details.addEventListener('toggle', () => {
    if (details.open) {
      $$('.path-menu[open]').forEach(menu => {
        if (menu !== details) menu.removeAttribute('open');
      });
    }
    queueMicrotask(() => {
      document.body.classList.toggle('path-menu-open', Boolean($('.path-menu[open]')));
    });
  });
  details.append(summary, options);
  return details;
}

function createAttachmentRow(entryId) {
  const list = attachmentsFor(entryId);
  if (!list.length) return null;
  const row = document.createElement('div');
  row.className = 'thumb-row';
  row.append(...list.map(attachment => createAttachmentTile(attachment)));
  return row;
}

function safeAttachmentName(value, fallback = 'file.bin') {
  const clean = String(value || '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim() || fallback;
  if (clean.length <= 160) return clean;
  const dot = clean.lastIndexOf('.');
  const extension = dot > 0 && clean.length - dot <= 21 ? clean.slice(dot) : '';
  return `${clean.slice(0, 160 - extension.length)}${extension}`;
}

function normalizedAttachmentType(value) {
  const type = clampString(value, 100).toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)
    ? type
    : 'application/octet-stream';
}

function isPreviewableImage(attachment) {
  const type = normalizedAttachmentType(attachment?.type || attachment?.blob?.type);
  return type.startsWith('image/') && type !== 'image/svg+xml';
}

function attachmentExtension(attachment) {
  const name = safeAttachmentName(attachment?.name, '');
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function isPreviewableText(attachment) {
  const type = normalizedAttachmentType(attachment?.type || attachment?.blob?.type);
  const extension = attachmentExtension(attachment);
  return ['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(type)
    || ['txt', 'md', 'markdown', 'csv', 'json', 'log'].includes(extension);
}

function attachmentBadge(attachment) {
  const type = normalizedAttachmentType(attachment?.type || attachment?.blob?.type);
  const extension = safeAttachmentName(attachment?.name, '').split('.').pop()?.toUpperCase() || '';
  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('audio/')) return '♪';
  if (type.startsWith('video/')) return '▶';
  if (/spreadsheet|excel|csv/.test(type) || ['XLS', 'XLSX', 'CSV'].includes(extension)) return 'XLS';
  if (/word|document/.test(type) || ['DOC', 'DOCX', 'ODT'].includes(extension)) return 'DOC';
  if (/zip|compressed|archive/.test(type) || ['ZIP', 'RAR', '7Z'].includes(extension)) return 'ZIP';
  return extension && extension.length <= 4 ? extension : 'FILE';
}

function temporaryAttachmentUrl(attachment) {
  return URL.createObjectURL(attachment.blob);
}

function setAttachmentImageState(img, state) {
  img.dataset.loadState = state;
  const open = img.closest('.attachment-open');
  if (!open) return;
  const retry = open.querySelector('.attachment-retry');
  if (retry) retry.hidden = state !== 'error';
  open.classList.toggle('is-load-error', state === 'error');
  open.setAttribute('aria-label', state === 'error'
    ? `تعذر تحميل ${img.alt}. اضغط لإعادة المحاولة.`
    : open.dataset.openLabel);
}

function setRevokingImageSource(img, attachment) {
  const url = temporaryAttachmentUrl(attachment);
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
  };
  const fallback = setTimeout(revoke, 60_000);
  const settled = state => {
    clearTimeout(fallback);
    setTimeout(revoke, 1000);
    setAttachmentImageState(img, state);
  };
  const onLoad = () => {
    img.removeEventListener('error', onError);
    settled('loaded');
  };
  const onError = () => {
    img.removeEventListener('load', onLoad);
    settled('error');
  };
  img.addEventListener('load', onLoad, { once: true });
  img.addEventListener('error', onError, { once: true });
  setAttachmentImageState(img, 'loading');
  img.src = url;
}

async function loadAttachmentImage(img, attachment) {
  try {
    const loaded = await attachmentWithBlob(attachment);
    if (!img.isConnected) return;
    setRevokingImageSource(img, loaded);
  } catch (error) {
    if (img.isConnected) setAttachmentImageState(img, 'error');
    console.warn('تعذر تحميل مصغّر المرفق:', error);
  }
}

function takeObservedAttachmentImage(img) {
  attachmentImageObserver?.unobserve(img);
  observedAttachmentImages.delete(img);
  if (img.__mersahAttachmentFallback) clearTimeout(img.__mersahAttachmentFallback);
  const attachment = img.__mersahAttachment;
  delete img.__mersahAttachment;
  delete img.__mersahAttachmentFallback;
  return attachment;
}

function loadObservedAttachmentImage(img) {
  const attachment = takeObservedAttachmentImage(img);
  if (attachment) loadAttachmentImage(img, attachment);
}

function attachmentImageNearViewport(img) {
  if (!img.isConnected || document.visibilityState === 'hidden' || !img.getClientRects().length) return false;
  const rect = img.getBoundingClientRect();
  const margin = 160;
  return rect.width > 0 && rect.height > 0
    && rect.bottom >= -margin && rect.top <= window.innerHeight + margin
    && rect.right >= -margin && rect.left <= window.innerWidth + margin;
}

function checkObservedAttachmentImages() {
  attachmentImageFallbackFrame = 0;
  observedAttachmentImages.forEach(img => {
    if (!img.isConnected) {
      takeObservedAttachmentImage(img);
    } else if (attachmentImageNearViewport(img)) {
      loadObservedAttachmentImage(img);
    }
  });
}

function queueAttachmentImageFallbackCheck() {
  if (attachmentImageFallbackFrame) return;
  attachmentImageFallbackFrame = requestAnimationFrame(checkObservedAttachmentImages);
}

function observeAttachmentImage(img, attachment) {
  if (!('IntersectionObserver' in window)) {
    loadAttachmentImage(img, attachment);
    return;
  }
  if (!attachmentImageObserver) {
    attachmentImageObserver = new IntersectionObserver(records => {
      records.forEach(record => {
        if (!record.isIntersecting) return;
        loadObservedAttachmentImage(record.target);
      });
    }, { rootMargin: '160px 0px' });
  }
  setAttachmentImageState(img, 'waiting');
  img.__mersahAttachment = attachment;
  img.__mersahAttachmentFallback = setTimeout(queueAttachmentImageFallbackCheck, 2000);
  observedAttachmentImages.add(img);
  attachmentImageObserver.observe(img);
}

function releaseObservedAttachmentImages(root) {
  if (!root) return;
  root.querySelectorAll('img').forEach(img => takeObservedAttachmentImage(img));
}

function createAttachmentTile(attachment, { temporary = false, removeHandler = null } = {}) {
  const wrap = document.createElement('div');
  const image = isPreviewableImage(attachment);
  wrap.className = `${removeHandler ? 'preview-item' : 'thumb'} ${image ? 'attachment-image' : 'attachment-file'}`;

  if (image) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'attachment-open';
    open.setAttribute('aria-label', `عرض الصورة ${safeAttachmentName(attachment.name, 'صورة')}`);
    const img = document.createElement('img');
    img.alt = safeAttachmentName(attachment.name, 'صورة مرفقة');
    img.loading = 'lazy';
    const retry = document.createElement('span');
    retry.className = 'attachment-retry';
    retry.hidden = true;
    retry.title = 'إعادة تحميل الصورة';
    retry.setAttribute('aria-hidden', 'true');
    retry.append(uiIcon('reopen'));
    open.dataset.openLabel = `عرض الصورة ${safeAttachmentName(attachment.name, 'صورة')}`;
    open.append(img, retry);
    if (temporary) {
      setRevokingImageSource(img, attachment);
    } else {
      observeAttachmentImage(img, attachment);
    }
    open.addEventListener('click', () => {
      if (img.dataset.loadState === 'error') {
        if (temporary) setRevokingImageSource(img, attachment);
        else loadAttachmentImage(img, attachment);
        return;
      }
      openImageViewer(attachment, { temporary });
    });
    wrap.append(open);
  } else {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'attachment-file-open';
    const name = safeAttachmentName(attachment.name);
    const previewableText = isPreviewableText(attachment);
    open.setAttribute('aria-label', `${previewableText ? 'عرض' : 'فتح أو مشاركة'} المرفق ${name}`);
    const badge = document.createElement('span');
    badge.className = 'attachment-file-badge';
    badge.textContent = attachmentBadge(attachment);
    badge.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'attachment-file-copy';
    const nameNode = document.createElement('span');
    nameNode.className = 'attachment-file-name';
    nameNode.textContent = name;
    const size = document.createElement('span');
    size.className = 'attachment-file-size';
    size.dir = 'ltr';
    size.textContent = formatBytes(Number(attachment.size || attachment.blob?.size || 0));
    copy.append(nameNode, size);
    const action = document.createElement('span');
    action.className = 'attachment-file-action';
    action.textContent = previewableText ? '⌕' : '⇩';
    action.setAttribute('aria-hidden', 'true');
    open.append(badge, copy, action);
    open.addEventListener('click', () => {
      if (previewableText) openTextFileViewer(attachment);
      else shareOrDownloadAttachment(attachment);
    });
    wrap.append(open);
  }

  if (removeHandler) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attachment-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `إزالة المرفق ${safeAttachmentName(attachment.name)}`);
    remove.addEventListener('click', async () => {
      if (remove.disabled) return;
      remove.disabled = true;
      try {
        await removeHandler(attachment.id);
      } finally {
        if (remove.isConnected) remove.disabled = false;
      }
    });
    wrap.append(remove);
  }
  return wrap;
}

async function openImageViewer(attachment, { temporary = false } = {}) {
  if (!isPreviewableImage(attachment)) return;
  let loaded;
  try {
    loaded = temporary ? attachment : await attachmentWithBlob(attachment);
  } catch (error) {
    showToast('تعذر قراءة الصورة المرفقة.');
    return;
  }
  if (activeViewerTemporaryUrl) URL.revokeObjectURL(activeViewerTemporaryUrl);
  activeViewerAttachment = loaded;
  activeViewerTemporaryUrl = temporaryAttachmentUrl(loaded);
  elements.attachmentViewerImage.src = activeViewerTemporaryUrl;
  elements.attachmentViewerImage.alt = safeAttachmentName(loaded.name, 'صورة مرفقة');
  elements.attachmentViewerImage.classList.remove('zoomed');
  elements.attachmentViewerTitle.textContent = safeAttachmentName(loaded.name, 'صورة');
  elements.attachmentViewerZoom.textContent = '+';
  elements.attachmentViewerZoom.setAttribute('aria-label', 'تكبير الصورة');
  elements.attachmentViewerZoom.title = 'تكبير';
  elements.attachmentViewerStage.scrollTo(0, 0);
  elements.attachmentViewerDialog.showModal();
  elements.attachmentViewerClose.focus();
}

function closeImageViewer() {
  if (elements.attachmentViewerDialog.open) elements.attachmentViewerDialog.close();
}

function resetImageViewer() {
  if (activeViewerTemporaryUrl) URL.revokeObjectURL(activeViewerTemporaryUrl);
  activeViewerTemporaryUrl = null;
  activeViewerAttachment = null;
  elements.attachmentViewerImage.removeAttribute('src');
  elements.attachmentViewerImage.classList.remove('zoomed');
}

function toggleImageViewerZoom() {
  const zoomed = elements.attachmentViewerImage.classList.toggle('zoomed');
  elements.attachmentViewerZoom.textContent = zoomed ? '−' : '+';
  elements.attachmentViewerZoom.setAttribute('aria-label', zoomed ? 'تصغير الصورة' : 'تكبير الصورة');
  elements.attachmentViewerZoom.title = zoomed ? 'تصغير' : 'تكبير';
  if (!zoomed) elements.attachmentViewerStage.scrollTo(0, 0);
}

async function openTextFileViewer(attachment) {
  if (!isPreviewableText(attachment)) return;
  try {
    const loaded = await attachmentWithBlob(attachment);
    const name = safeAttachmentName(loaded.name);
    const truncated = loaded.blob.size > MAX_TEXT_PREVIEW_BYTES;
    const text = await loaded.blob.slice(0, MAX_TEXT_PREVIEW_BYTES).text();
    activeFileViewerAttachment = loaded;
    elements.fileViewerTitle.textContent = name;
    elements.fileViewerText.textContent = text || 'الملف فارغ.';
    elements.fileViewerNote.textContent = truncated
      ? `تُعرض أول ${formatBytes(MAX_TEXT_PREVIEW_BYTES)} فقط. افتح الملف خارجيًا لقراءته كاملًا.`
      : 'معاينة نصية آمنة للقراءة فقط.';
    elements.fileViewerDialog.showModal();
    elements.fileViewerClose.focus();
  } catch (error) {
    showToast('تعذرت معاينة الملف؛ يمكنك فتحه خارجيًا.');
  }
}

function closeTextFileViewer() {
  if (elements.fileViewerDialog.open) elements.fileViewerDialog.close();
}

function resetTextFileViewer() {
  activeFileViewerAttachment = null;
  elements.fileViewerTitle.textContent = '';
  elements.fileViewerNote.textContent = '';
  elements.fileViewerText.textContent = '';
}

async function shareOrDownloadAttachment(attachment) {
  let loaded;
  try {
    loaded = await attachmentWithBlob(attachment);
  } catch (error) {
    showToast('تعذر قراءة المرفق.');
    return;
  }
  const name = safeAttachmentName(loaded.name);
  const type = normalizedAttachmentType(loaded.type || loaded.blob.type);
  const file = new File([loaded.blob], name, { type });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.warn('تعذرت مشاركة المرفق، سيُنزّل بدلًا من ذلك:', error);
  }
  const downloadBlob = new Blob([loaded.blob], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(downloadBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  showToast('بدأ تنزيل المرفق.');
}

function entryTextForSharing(entry) {
  return clampString(entry?.text, MAX_TEXT_LENGTH).trim();
}

function openEntryShareDialog(entryId) {
  const entry = entries.find(item => item.id === entryId && item.status !== 'trash');
  if (!entry) return;
  const text = entryTextForSharing(entry);
  const attachmentCount = attachmentsFor(entry.id).length;
  activeShareEntryId = entry.id;
  elements.entrySharePreview.textContent = text || attachmentOnlyLabel(entry);
  elements.entryShareSystemButton.disabled = !text;
  elements.entryShareThingsButton.disabled = !text;
  elements.entryShareThingsButton.dataset.url = text ? thingsAddUrl(text) : '';
  elements.entryCopyTextButton.disabled = !text;
  if (!text) {
    elements.entryShareNote.textContent = 'لا يوجد نص لنسخه. شارك المرفق من داخل الالتقاطة.';
    elements.entryShareNote.hidden = false;
  } else if (attachmentCount) {
    elements.entryShareNote.textContent = 'سيُنقل النص فقط؛ شارك المرفقات كلًا على حدة.';
    elements.entryShareNote.hidden = false;
  } else {
    elements.entryShareNote.textContent = '';
    elements.entryShareNote.hidden = true;
  }
  elements.entryShareDialog.showModal();
  elements.entryShareSystemButton.focus();
}

async function copyPlainText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('تعذر استخدام الحافظة الحديثة، ستُجرّب الطريقة الاحتياطية:', error);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

async function copyActiveEntryText() {
  const entry = entries.find(item => item.id === activeShareEntryId);
  const text = entryTextForSharing(entry);
  if (!text) return;
  const copied = await copyPlainText(text);
  if (copied) {
    elements.entryShareDialog.close();
    showToast('نُسخ النص.');
  } else {
    showToast('تعذر نسخ النص.');
  }
}

async function shareActiveEntryText() {
  const entry = entries.find(item => item.id === activeShareEntryId);
  const text = entryTextForSharing(entry);
  if (!text) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'مرساة', text });
      elements.entryShareDialog.close();
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('تعذرت مشاركة النص، سيُنسخ بدلًا من ذلك:', error);
    }
  }
  await copyActiveEntryText();
}

function thingsAddUrl(text) {
  const clean = text.trim();
  const lineBreak = clean.indexOf('\n');
  let title = lineBreak >= 0 ? clean.slice(0, lineBreak).trim() : clean;
  let notes = lineBreak >= 0 ? clean.slice(lineBreak + 1).trim() : '';
  if (title.length > 240) {
    notes = [title.slice(240), notes].filter(Boolean).join('\n');
    title = title.slice(0, 240);
  }
  const params = new URLSearchParams({ title, reveal: 'true' });
  if (notes) params.set('notes', notes);
  return `things:///add?${params.toString()}`;
}

function sendActiveEntryToThings() {
  const entry = entries.find(item => item.id === activeShareEntryId);
  const text = entryTextForSharing(entry);
  if (!text) return;
  const url = elements.entryShareThingsButton.dataset.url || thingsAddUrl(text);
  elements.entryShareDialog.close();
  window.location.href = url;
}

function appendEntryActions(container, entry) {
  if (entry.status === 'open') {
    if (entry.type === 'task' || entry.path === 'do') {
      container.append(actionButton('إكمال', () => setEntryStatus(entry.id, 'done'), 'primary', 'check'));
    } else if (entry.path === 'consider') {
      container.append(actionButton('إغلاق', () => setEntryStatus(entry.id, 'closed'), '', 'check'));
    }
    container.append(createEntryDeferMenu(entry));
  } else if (entry.status === 'done' || entry.status === 'closed') {
    container.append(actionButton('إعادة فتح', () => setEntryStatus(entry.id, 'open'), 'primary', 'reopen'));
  }

  const today = dateKey();
  if (entry.topTodayDate === today) {
    container.append(actionButton('إزالة من أهم اليوم', () => setTopToday(entry.id, null), 'top', 'starFilled'));
  } else if (entry.status !== 'trash') {
    const add = actionButton('أهم اليوم', () => setTopToday(entry.id, today), 'top', 'star');
    add.disabled = !canAddTop(today, entry.id);
    container.append(add);
  }

  container.append(
    actionButton('نسخ إلى تطبيق', () => openEntryShareDialog(entry.id), '', 'share'),
    actionButton('تحرير', () => openEditDialog(entry.id), '', 'edit'),
    actionButton('حذف', () => trashEntry(entry.id), 'danger', 'trash')
  );
}

function actionButton(label, handler, className = '', iconName = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `action-link ${className}`.trim();
  if (iconName) button.append(uiIcon(iconName));
  else button.textContent = label;
  if (iconName) {
    button.title = label;
    button.setAttribute('aria-label', label);
  }
  button.addEventListener('click', handler);
  return button;
}

function emptyNode(message) {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = message;
  return empty;
}

function attachmentOnlyLabel(entry) {
  const count = attachmentsFor(entry.id).length;
  return count ? `إدخال مرفقات (${count})` : 'إدخال بلا نص';
}

async function createEntry(data, attachmentDrafts = []) {
  const now = nowIso();
  const createdAt = validIso(data.createdAt) || now;
  const path = validPath(data.path);
  const createdLocal = localCreationStamp(createdAt);
  const topDate = data.topTodayDate || null;
  if (topDate && !canAddTop(topDate)) {
    showToast('لا يمكن إضافة مهمة رابعة إلى أهم اليوم.');
    return null;
  }
  let entry = {
    id: data.id || uid('entry'),
    text: clampString(data.text, MAX_TEXT_LENGTH),
    type: validType(data.type),
    path,
    status: validStatus(data.status),
    createdAt,
    updatedAt: data.updatedAt || now,
    createdLocal,
    pathLog: [createPathEvent(path, createdAt, createdLocal)],
    completedAt: data.completedAt || null,
    deletedAt: data.deletedAt || null,
    context: canonicalFromExisting(data.context, 'context'),
    person: canonicalFromExisting(data.person, 'person'),
    dueDate: validDateKey(data.dueDate),
    followUpDate: data.followUpDate === undefined
      ? resolveReturnSchedule(RETURN_SCHEDULES[0]).date
      : validDateKey(data.followUpDate),
    topTodayDate: validDateKey(topDate),
    legacy: data.legacy || { source: null, state: null }
  };
  if (!entry.text && !attachmentDrafts.length) {
    showToast('أضف نصًا أو مرفقًا أولًا.');
    return null;
  }
  const attachmentRows = attachmentDrafts.map(item => ({
    id: item.id || uid('attachment'),
    entryId: entry.id,
    name: safeAttachmentName(item.name),
    type: normalizedAttachmentType(item.type || item.blob?.type),
    size: item.size || item.blob?.size || 0,
    blob: item.blob,
    createdAt: item.createdAt || now
  }));
  const initialEvents = [createEntryEvent('created', createdAt, { to: path }, createdLocal)];
  if (entry.topTodayDate) {
    initialEvents.push(createEntryEvent('top_added', createdAt, { to: entry.topTodayDate }, createdLocal));
  }
  if (attachmentRows.length) {
    initialEvents.push(createEntryEvent('attachments_added', createdAt, {
      count: attachmentRows.length,
      names: attachmentRows.map(attachment => attachment.name)
    }, createdLocal));
  }
  entry = { ...entry, eventLog: initialEvents };
  const nextEntries = [entry, ...entries.filter(item => item.id !== entry.id)];
  const dailyRecord = entry.topTodayDate
    ? dailyTopRecordForEntries(entry.topTodayDate, nextEntries, now)
    : null;
  await runAtomicWrite(
    ['entries', 'attachments', 'attachmentData', ...(dailyRecord ? ['daily'] : [])],
    (stores, track) => {
      track(stores.entries.put(entry));
      attachmentRows.forEach(attachment => {
        track(stores.attachments.put(attachmentMetadata(attachment)));
        track(stores.attachmentData.put(attachmentDataRecord(attachment)));
      });
      if (dailyRecord) track(stores.daily.put(dailyRecord));
    }
  );
  entries = nextEntries;
  attachments.push(...attachmentRows.map(attachmentMetadata));
  if (dailyRecord) upsertDailyRecords([dailyRecord]);
  refreshDataViews();
  return entry;
}

async function updateEntry(id, patch, { extraEvent = null } = {}) {
  const current = entries.find(entry => entry.id === id);
  if (!current) return null;
  const nextTopDate = patch.topTodayDate === undefined ? current.topTodayDate : validDateKey(patch.topTodayDate);
  if (nextTopDate && nextTopDate !== current.topTodayDate && !canAddTop(nextTopDate, id)) {
    showToast('لا يمكن إضافة مهمة رابعة إلى أهم اليوم.');
    return null;
  }
  let updated = buildUpdatedEntry(current, patch);
  if (extraEvent?.type && ENTRY_EVENT_TYPES.has(extraEvent.type)) {
    updated = appendEventsToEntry(updated, [createEntryEvent(
      extraEvent.type,
      updated.updatedAt,
      extraEvent.details || {}
    )], updated);
  }
  await persistEntryUpdate(current, updated);
  refreshDataViews();
  return updated;
}

function buildUpdatedEntry(current, patch) {
  const now = nowIso();
  const status = patch.status ? validStatus(patch.status) : current.status;
  const path = patch.path ? validPath(patch.path) : current.path;
  const nextTopDate = patch.topTodayDate === undefined ? current.topTodayDate : validDateKey(patch.topTodayDate);
  const currentPathLog = pathLogFor(current);
  const pathLog = limitPathLog(path === current.path
    ? currentPathLog
    : [...currentPathLog, createPathEvent(path, now)]);
  const updated = {
    ...current,
    ...patch,
    type: patch.type ? validType(patch.type) : current.type,
    path,
    pathLog,
    status,
    text: patch.text === undefined ? current.text : clampString(patch.text, MAX_TEXT_LENGTH),
    context: patch.context === undefined ? current.context : canonicalFromExisting(patch.context, 'context'),
    person: patch.person === undefined ? current.person : canonicalFromExisting(patch.person, 'person'),
    dueDate: patch.dueDate === undefined ? current.dueDate : validDateKey(patch.dueDate),
    followUpDate: patch.followUpDate === undefined ? current.followUpDate : validDateKey(patch.followUpDate),
    topTodayDate: nextTopDate,
    completedAt: status === 'done' ? (current.completedAt || now) : null,
    deletedAt: status === 'trash' ? (current.deletedAt || now) : null,
    updatedAt: now
  };
  return appendEventsToEntry(updated, entryChangeEvents(current, updated, now), current);
}

async function persistEntryUpdate(current, updated, { addedAttachments = [], removedAttachmentIds = [] } = {}) {
  const nextEntries = entries.map(entry => entry.id === current.id ? updated : entry);
  const datesToSync = [current.topTodayDate, updated.topTodayDate].filter(Boolean);
  const dailyUpdates = [...new Set(datesToSync)]
    .map(day => dailyTopRecordForEntries(day, nextEntries, updated.updatedAt));
  const needsAttachments = addedAttachments.length > 0 || removedAttachmentIds.length > 0;
  const storeNames = ['entries', ...(dailyUpdates.length ? ['daily'] : []), ...(needsAttachments ? ['attachments', 'attachmentData'] : [])];
  await runAtomicWrite(storeNames, (stores, track) => {
    track(stores.entries.put(updated));
    dailyUpdates.forEach(record => track(stores.daily.put(record)));
    removedAttachmentIds.forEach(id => {
      track(stores.attachments.delete(id));
      track(stores.attachmentData.delete(id));
    });
    addedAttachments.forEach(attachment => {
      track(stores.attachments.put(attachmentMetadata(attachment)));
      track(stores.attachmentData.put(attachmentDataRecord(attachment)));
    });
  });
  entries = nextEntries;
  if (needsAttachments) {
    const removedIds = new Set(removedAttachmentIds);
    attachments = attachments
      .filter(attachment => !removedIds.has(attachment.id))
      .concat(addedAttachments.map(attachmentMetadata));
  }
  upsertDailyRecords(dailyUpdates);
}

async function setEntryStatus(id, status) {
  await updateEntry(id, { status });
}

async function setTopToday(id, day) {
  const entry = entries.find(item => item.id === id);
  if (!entry) return;
  // «أهم اليوم» مرآة للأولوية فقط؛ تاريخ العودة يبقى حتى يُحسم أو يُؤجّل صراحةً.
  const patch = { topTodayDate: day };
  if (day && entry.type !== 'task') patch.type = 'task';
  await updateEntry(id, patch);
}

async function scheduleEntryReturn(entryId, scheduleKey, { deferred = false } = {}) {
  const current = entries.find(entry => entry.id === entryId);
  const schedule = RETURN_SCHEDULES.find(item => item.key === scheduleKey);
  if (!current || !schedule) return null;
  const resolved = resolveReturnSchedule(schedule, entryId, dateKey(), { enforceCapacity: !deferred });
  const updated = await updateEntry(entryId, {
    followUpDate: resolved.date
  }, deferred ? {
    extraEvent: {
      type: 'return_deferred',
      details: { from: current.followUpDate, to: resolved.date }
    }
  } : {});
  if (!updated) return null;
  showToast(resolved.shifted
    ? `اليوم المختار ممتلئ؛ نُقلت العودة إلى جلسة ${formatDateKey(resolved.date)}.`
    : `تعود الالتقاطة ${returnDateSummary(resolved.date)}.`);
  return updated;
}

function hideCaptureReturnConfirmation() {
  clearTimeout(captureReturnTimer);
  elements.captureReturnBar.hidden = true;
}

function showCaptureReturnConfirmation(entry, duration = 10_000) {
  clearTimeout(captureReturnTimer);
  elements.captureReturnText.textContent = `حُفظت · تعود ${returnDateSummary(entry.followUpDate)}`;
  elements.captureReturnChangeButton.dataset.entryId = entry.id;
  elements.captureReturnBar.hidden = false;
  captureReturnTimer = setTimeout(() => {
    elements.captureReturnBar.hidden = true;
  }, duration);
}

function updateEditReturnSummary() {
  elements.editReturnSummary.textContent = returnDateSummary(elements.editReturnDate.value);
}

function setEditTopTodayState(selected) {
  elements.editTopToday.checked = selected;
  elements.editTopTodayButton.setAttribute('aria-pressed', String(selected));
  elements.editTopTodayButton.title = selected ? 'إزالة من أهم اليوم' : 'إضافة إلى أهم اليوم';
  elements.editTopTodayButton.setAttribute('aria-label', elements.editTopTodayButton.title);
}

function renderReturnPicker() {
  const context = activeReturnPicker;
  if (!context) return;
  const selectedDate = validDateKey(context.selectedDate);
  const currentStrong = document.createElement('strong');
  currentStrong.textContent = returnDateSummary(selectedDate);
  elements.returnPickerCurrent.replaceChildren(document.createTextNode('العودة الحالية: '), currentStrong);
  const schedules = resolvedReturnSchedules(context.entryId, dateKey(), { enforceCapacity: false });
  const buttons = schedules.map(schedule => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'return-picker-option';
    button.setAttribute('aria-pressed', String(schedule.date === selectedDate));
    const label = document.createElement('strong');
    label.textContent = schedule.label;
    const date = document.createElement('span');
    date.textContent = formatHeaderDayMonth(schedule.date);
    button.append(label, date);
    button.addEventListener('click', () => applyReturnPickerDate(schedule.date));
    return button;
  });
  elements.returnPickerOptions.replaceChildren(...buttons);
  elements.returnPickerCustomDate.min = dateKey();
  elements.returnPickerCustomDate.value = selectedDate && selectedDate >= dateKey()
    ? selectedDate
    : shiftDateKey(dateKey(), 1);
}

function openReturnPicker(context) {
  activeReturnPicker = {
    mode: context.mode,
    entryId: context.entryId || null,
    selectedDate: validDateKey(context.selectedDate)
  };
  hideCaptureReturnConfirmation();
  renderReturnPicker();
  elements.returnPickerDialog.showModal();
}

async function applyReturnPickerDate(value) {
  const date = validDateKey(value);
  const context = activeReturnPicker;
  if (!date || !context) return;
  if (context.mode === 'edit') {
    elements.editReturnDate.value = date;
    updateEditReturnSummary();
    elements.returnPickerDialog.close();
    return;
  }
  const entry = entries.find(item => item.id === context.entryId);
  if (!entry) {
    elements.returnPickerDialog.close();
    return;
  }
  try {
    const updated = await updateEntry(entry.id, { followUpDate: date });
    elements.returnPickerDialog.close();
    if (updated) showCaptureReturnConfirmation(updated, 4_500);
  } catch (error) {
    reportStorageFailure(error, 'تغيير تاريخ العودة');
  }
}

// ورقة تأكيد سفلية تتّسق مع الواجهة،
// ويعرض نص الإدخال حتى يرى المستخدم ما يحذفه قبل أن يؤكّد.
function askConfirm({ title = 'تأكيد', message, preview = '', accept = 'حذف', danger = true, cancel = 'إلغاء' }) {
  return new Promise(resolve => {
    const dlg = elements.confirmDialog;
    elements.confirmTitle.textContent = title;
    elements.confirmText.textContent = message;
    if (preview) {
      elements.confirmPreview.textContent = preview;
      elements.confirmPreview.hidden = false;
    } else {
      elements.confirmPreview.textContent = '';
      elements.confirmPreview.hidden = true;
    }
    elements.confirmAccept.textContent = accept;
    elements.confirmAccept.className = danger ? 'danger-btn' : 'primary-btn';
    elements.confirmCancel.hidden = !cancel;
    elements.confirmCancel.textContent = cancel || '';

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      elements.confirmAccept.removeEventListener('click', onAccept);
      elements.confirmCancel.removeEventListener('click', onCancel);
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onAccept = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(false);
    elements.confirmAccept.addEventListener('click', onAccept);
    elements.confirmCancel.addEventListener('click', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    setTimeout(() => (cancel ? elements.confirmCancel : elements.confirmAccept).focus(), 60);
  });
}

function showNotice(title, message, preview = '') {
  return askConfirm({ title, message, preview, accept: 'حسنًا', danger: false, cancel: null });
}

async function trashEntry(id) {
  const entry = entries.find(item => item.id === id);
  if (!entry) return;
  const ok = await askConfirm({
    title: 'حذف الالتقاط',
    message: 'سيُنقل إلى المحذوفات ويبقى قابلًا للاستعادة سبعة أيام.',
    preview: entry.text || attachmentOnlyLabel(entry),
    accept: 'حذف'
  });
  if (!ok) return false;
  await updateEntry(id, { status: 'trash' });
  showToast('نُقل الإدخال إلى المحذوفات.', 'تراجع', async () => {
    await updateEntry(id, { status: entry.status, deletedAt: null });
  });
  return true;
}

async function addQuickTopTask() {
  const text = clampString(elements.quickTaskInput.value, MAX_TEXT_LENGTH);
  if (!text) return;
  const today = dateKey();
  if (!canAddTop(today)) {
    showToast('أزل أو استبدل مهمة قبل إضافة الرابعة.');
    return;
  }
  try {
    await createEntry({
      text,
      type: 'task',
      path: 'do',
      status: 'open',
      topTodayDate: today
    });
  } catch (error) {
    reportStorageFailure(error, 'حفظ المهمة');
    return;
  }
  elements.quickTaskInput.value = '';
  if (elements.topTaskDialog.open) elements.topTaskDialog.close();
}

async function saveDailyDirection(day, value, statusElement) {
  const current = dailyRecordFor(day);
  const now = nowIso();
  const record = {
    date: day,
    direction: clampString(value, MAX_DIRECTION_LENGTH),
    topEntryIds: topEntriesFor(day).map(entry => entry.id),
    closure: current?.closure || null,
    createdAt: current?.createdAt || now,
    updatedAt: now
  };
  try {
    await putRecord('daily', record);
    if (statusElement) {
      statusElement.textContent = 'تم الحفظ.';
      setTimeout(() => { statusElement.textContent = 'يحفظ تلقائيًا.'; }, 1500);
    }
    upsertDailyRecords([record]);
    refreshDataViews();
    return true;
  } catch (error) {
    if (statusElement) statusElement.textContent = 'تعذر الحفظ؛ بقي النص السابق محفوظًا.';
    reportStorageFailure(error, 'حفظ توجّه اليوم');
    return false;
  }
}

function openDirectionDialog() {
  elements.directionEditor.value = dailyRecordFor(dateKey())?.direction || '';
  elements.directionDialog.showModal();
  setTimeout(() => elements.directionEditor.focus(), 80);
}

async function handleDirectionSubmit(event) {
  event.preventDefault();
  if (!await saveDailyDirection(dateKey(), elements.directionEditor.value)) return;
  elements.directionDialog.close();
  showToast('تم حفظ توجّه اليوم.');
}

function scheduleSelectedDirectionSave() {
  if (elements.selectedDayDirection.readOnly) return;
  clearTimeout(selectedDirectionTimer);
  elements.selectedDayDirectionStatus.textContent = 'جارٍ الحفظ…';
  selectedDirectionTimer = setTimeout(() => {
    saveDailyDirection(selectedDay, elements.selectedDayDirection.value, elements.selectedDayDirectionStatus);
  }, 650);
}

function dailyRecordWith(day, updates, timestamp = nowIso()) {
  const current = dailyRecordFor(day);
  return {
    date: day,
    direction: current?.direction || '',
    topEntryIds: topEntriesFor(day).map(entry => entry.id),
    closure: current?.closure || null,
    createdAt: current?.createdAt || timestamp,
    updatedAt: timestamp,
    ...updates
  };
}

async function saveEveningClose({ withBackup = false } = {}) {
  const today = dateKey();
  const tomorrow = shiftDateKey(today, 1);
  const now = nowIso();
  const currentClosure = dayClosureFor(today);
  const summary = dayClosingSummary(today);
  const tomorrowDirection = clampString(elements.eveningTomorrowDirection.value, MAX_DIRECTION_LENGTH);
  const closure = {
    version: 1,
    closedAt: currentClosure?.closedAt || now,
    updatedAt: now,
    local: currentClosure?.local || localCreationStamp(now),
    summary: {
      resolved: summary.resolved,
      completed: summary.completed,
      openDo: summary.openDo.length
    },
    tomorrowDirection,
    backupAt: currentClosure?.backupAt || null
  };
  const todayRecord = dailyRecordWith(today, { closure }, now);
  const tomorrowCurrent = dailyRecordFor(tomorrow);
  const records = [todayRecord];
  if (tomorrowDirection || tomorrowCurrent) {
    records.push(dailyRecordWith(tomorrow, { direction: tomorrowDirection }, now));
  }

  elements.saveEveningCloseButton.disabled = true;
  elements.saveEveningCloseBackupButton.disabled = true;
  try {
    await runAtomicWrite(['daily'], (stores, track) => {
      records.forEach(record => track(stores.daily.put(record)));
    });
    upsertDailyRecords(records);
    refreshDataViews();
    elements.eveningCloseDialog.close();
    showToast(withBackup ? 'تم إغلاق اليوم. اختر مكان حفظ النسخة.' : 'تم إغلاق اليوم.');
  } catch (error) {
    reportStorageFailure(error, 'إغلاق اليوم');
    return false;
  } finally {
    elements.saveEveningCloseButton.disabled = false;
    elements.saveEveningCloseBackupButton.disabled = false;
  }

  if (withBackup) {
    const result = await runExport(exportIcloudBundle, 'تم حفظ الإغلاق، لكن لم تُحفظ النسخة.');
    if (result?.confirmed) await markEveningCloseBackup(today);
  }
  return true;
}

async function markEveningCloseBackup(day) {
  const current = dailyRecordFor(day);
  if (!current?.closure) return;
  const now = nowIso();
  const record = {
    ...current,
    closure: { ...current.closure, backupAt: now, updatedAt: now },
    updatedAt: now
  };
  try {
    await putRecord('daily', record);
    upsertDailyRecords([record]);
    refreshDataViews();
  } catch (error) {
    reportStorageFailure(error, 'تسجيل النسخة مع إغلاق اليوم');
  }
}

async function handleEveningCloseSubmit(event) {
  event.preventDefault();
  await saveEveningClose();
}

function openCaptureDialog() {
  hideCaptureReturnConfirmation();
  resetCaptureForm();
  elements.captureDialog.showModal();
  setTimeout(() => elements.captureText.focus(), 80);
}

function resetCaptureForm() {
  captureDraftAttachments = [];
  elements.captureForm.reset();
  elements.captureStatus.textContent = '';
  elements.captureStatus.classList.remove('is-pending');
  elements.captureStatus.hidden = true;
  elements.saveCaptureButton.disabled = false;
  renderAttachmentPreview(elements.capturePreview, captureDraftAttachments, removeCaptureDraftAttachment);
}

async function handleCaptureSubmit(event) {
  event.preventDefault();
  if (elements.saveCaptureButton.disabled) return;
  if (!elements.captureText.value.trim() && !captureDraftAttachments.length) {
    elements.captureStatus.textContent = 'أضف نصًا أو مرفقًا أولًا.';
    elements.captureStatus.classList.remove('is-pending');
    elements.captureStatus.hidden = false;
    return;
  }
  elements.saveCaptureButton.disabled = true;
  elements.captureStatus.textContent = 'جارٍ الحفظ…';
  elements.captureStatus.classList.add('is-pending');
  elements.captureStatus.hidden = false;
  let entry;
  try {
    const defaultReturn = resolveReturnSchedule(RETURN_SCHEDULES[0]);
    entry = await createEntry({
      text: elements.captureText.value,
      type: 'note',
      path: 'consider',
      status: 'open',
      context: '',
      person: '',
      dueDate: null,
      followUpDate: defaultReturn.date,
      topTodayDate: null
    }, captureDraftAttachments);
  } catch (error) {
    elements.captureStatus.textContent = storageFailureMessage(error, 'حفظ الالتقاط');
    elements.captureStatus.classList.remove('is-pending');
    elements.saveCaptureButton.disabled = false;
    reportStorageFailure(error, 'حفظ الالتقاط');
    return;
  }
  if (!entry) {
    elements.captureStatus.textContent = 'تعذر حفظ الالتقاط. تحقق من النص أو المرفق.';
    elements.captureStatus.classList.remove('is-pending');
    elements.saveCaptureButton.disabled = false;
    elements.captureStatus.hidden = false;
    return;
  }
  elements.captureStatus.textContent = '';
  elements.captureStatus.hidden = true;
  elements.captureDialog.close();
  showCaptureReturnConfirmation(entry);
}

async function deleteEntryCompletely(entryId) {
  await deleteEntriesCompletely([entryId]);
}

async function deleteEntriesCompletely(entryIds) {
  const ids = new Set(entryIds);
  const removedEntries = entries.filter(entry => ids.has(entry.id));
  if (!removedEntries.length) return;
  const nextEntries = entries.filter(entry => !ids.has(entry.id));
  const dailyUpdates = [...new Set(removedEntries.map(entry => entry.topTodayDate).filter(Boolean))]
    .map(day => dailyTopRecordForEntries(day, nextEntries));
  const removedAttachmentIds = attachments
    .filter(attachment => ids.has(attachment.entryId))
    .map(attachment => attachment.id);
  await runAtomicWrite(
    ['entries', 'attachments', 'attachmentData', ...(dailyUpdates.length ? ['daily'] : [])],
    (stores, track) => {
      removedAttachmentIds.forEach(id => {
        track(stores.attachments.delete(id));
        track(stores.attachmentData.delete(id));
      });
      removedEntries.forEach(entry => track(stores.entries.delete(entry.id)));
      dailyUpdates.forEach(record => track(stores.daily.put(record)));
    }
  );
  entries = nextEntries;
  attachments = attachments.filter(attachment => !ids.has(attachment.entryId));
  upsertDailyRecords(dailyUpdates);
}

async function handleAttachmentFiles(fileList, target, { imagesOnly = false } = {}) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  const existingCount = target === editNewAttachments
    ? attachmentsFor(elements.editEntryId.value).filter(item => !editRemovedAttachmentIds.has(item.id)).length
    : 0;
  for (const file of files) {
    if (existingCount + target.length >= MAX_ATTACHMENTS_PER_ENTRY) {
      showToast(`الحد الأقصى ${MAX_ATTACHMENTS_PER_ENTRY} مرفقًا لكل إدخال.`);
      break;
    }
    const image = looksLikeImageFile(file);
    if (imagesOnly && !image) {
      showToast(`الملف ${safeAttachmentName(file.name)} ليس صورة.`);
      continue;
    }
    if (image && file.size > MAX_IMAGE_SOURCE_BYTES) {
      showToast(`الصورة ${safeAttachmentName(file.name)} تتجاوز ${formatBytes(MAX_IMAGE_SOURCE_BYTES)}.`);
      continue;
    }
    if (!image && file.size > MAX_ATTACHMENT_BYTES) {
      showToast(`المرفق ${safeAttachmentName(file.name)} يتجاوز ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
      continue;
    }
    try {
      const processed = image ? await processImage(file) : draftAttachmentFromFile(file);
      if (processed.blob.size > MAX_ATTACHMENT_BYTES) {
        showToast(`المرفق ${safeAttachmentName(file.name)} يتجاوز ${formatBytes(MAX_ATTACHMENT_BYTES)} بعد المعالجة.`);
        continue;
      }
      target.push(processed);
    } catch (error) {
      console.warn('تعذر معالجة المرفق:', error);
      showToast(`تعذر حفظ المرفق: ${safeAttachmentName(file.name)}`);
    }
  }
  renderAttachmentPreview(
    target === captureDraftAttachments ? elements.capturePreview : elements.editNewPreview,
    target,
    target === captureDraftAttachments ? removeCaptureDraftAttachment : removeEditNewAttachment
  );
}

function looksLikeImageFile(file) {
  if (String(file?.type || '').startsWith('image/')) return true;
  return /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(String(file?.name || ''));
}

function draftAttachmentFromFile(file) {
  return {
    id: uid('draft'),
    name: safeAttachmentName(file.name),
    type: normalizedAttachmentType(file.type),
    size: file.size,
    blob: file
  };
}

async function processImage(file) {
  const original = {
    id: uid('draft'),
    name: safeAttachmentName(file.name, `image-${Date.now()}.jpg`),
    type: normalizedAttachmentType(file.type || 'image/jpeg'),
    size: file.size,
    blob: file
  };
  try {
    const bitmap = await loadImageBitmap(file);
    const maxEdge = Math.max(bitmap.width, bitmap.height);
    if (file.type === 'image/png' && maxEdge <= MAX_IMAGE_EDGE && file.size <= 1200 * 1024) {
      return original;
    }
    if (maxEdge <= MAX_IMAGE_EDGE && file.size <= 900 * 1024 && file.type === 'image/jpeg') {
      return original;
    }
    const scale = Math.min(1, MAX_IMAGE_EDGE / maxEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    return {
      ...original,
      name: original.name.replace(/\.[^.]+$/, '') + '.jpg',
      type: 'image/jpeg',
      size: blob.size,
      blob
    };
  } catch (error) {
    return { ...original, type: 'application/octet-stream' };
  }
}

function loadImageBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة الصورة.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('تعذر ضغط الصورة.')), type, quality);
  });
}

function renderAttachmentPreview(container, list, removeHandler) {
  releaseObservedAttachmentImages(container);
  if (!list.length) {
    container.replaceChildren();
    return;
  }
  container.replaceChildren(...list.map(item => createAttachmentTile(item, {
    temporary: true,
    removeHandler
  })));
}

async function confirmAttachmentRemoval(attachment, message) {
  return askConfirm({
    title: 'إزالة المرفق',
    message,
    preview: safeAttachmentName(attachment?.name),
    accept: 'إزالة'
  });
}

async function removeCaptureDraftAttachment(id) {
  const attachment = captureDraftAttachments.find(item => item.id === id);
  if (!attachment || !await confirmAttachmentRemoval(attachment, 'سيُزال هذا المرفق من الالتقاطة الجديدة.')) return;
  captureDraftAttachments = captureDraftAttachments.filter(item => item.id !== id);
  renderAttachmentPreview(elements.capturePreview, captureDraftAttachments, removeCaptureDraftAttachment);
}

async function removeEditNewAttachment(id) {
  const attachment = editNewAttachments.find(item => item.id === id);
  if (!attachment || !await confirmAttachmentRemoval(attachment, 'سيُزال هذا المرفق المضاف قبل حفظ التعديل.')) return;
  editNewAttachments = editNewAttachments.filter(item => item.id !== id);
  renderAttachmentPreview(elements.editNewPreview, editNewAttachments, removeEditNewAttachment);
}

function openEditDialog(entryId) {
  const entry = entries.find(item => item.id === entryId);
  if (!entry) return;
  hideCaptureReturnConfirmation();
  editNewAttachments = [];
  editRemovedAttachmentIds = new Set();
  elements.editEntryId.value = entry.id;
  elements.editText.value = entry.text || '';
  resizeEditTextField();
  setEditTextUnlocked(false);
  const editPathOptions = entry.path === 'untriaged'
    ? { untriaged: 'اختر مسارًا', ...ROUTABLE_PATH_OPTIONS }
    : ROUTABLE_PATH_OPTIONS;
  fillSelect(elements.editPath, editPathOptions);
  elements.editPath.value = hasOwn(editPathOptions, entry.path) ? entry.path : 'untriaged';
  elements.editReturnDate.value = validDateKey(entry.followUpDate) || '';
  updateEditReturnSummary();
  updateEditPathAgeHint(entry);
  elements.editEntryAge.querySelector('strong').textContent = ageDaysLabel(entryAgeDays(entry));
  setEditTopTodayState(entry.topTodayDate === dateKey());
  elements.editAttachmentsOptions.open = !entry.text && attachmentsFor(entry.id).length > 0;
  renderExistingAttachments(entry.id);
  renderAttachmentPreview(elements.editNewPreview, editNewAttachments, removeEditNewAttachment);
  elements.editDialog.showModal();
  setTimeout(() => elements.editTextUnlockButton.focus(), 80);
}

function resizeEditTextField() {
  elements.editText.style.height = 'auto';
  const minimum = elements.editText.readOnly ? 64 : 104;
  elements.editText.style.height = `${Math.min(156, Math.max(minimum, elements.editText.scrollHeight))}px`;
}

function setEditTextUnlocked(unlocked, { focus = false } = {}) {
  elements.editText.readOnly = !unlocked;
  elements.editText.classList.toggle('is-unlocked', unlocked);
  elements.editTextUnlockButton.replaceChildren(
    uiIcon(unlocked ? 'check' : 'edit')
  );
  elements.editTextUnlockButton.setAttribute('aria-pressed', String(unlocked));
  elements.editTextUnlockButton.setAttribute('aria-label', unlocked ? 'إنهاء تعديل النص' : 'تعديل النص');
  elements.editTextUnlockButton.title = unlocked ? 'إنهاء تعديل النص' : 'تعديل النص';
  resizeEditTextField();
  if (unlocked && focus) setTimeout(() => elements.editText.focus(), 40);
}

function updateEditPathAgeHint(entry) {
  if (!entry) return;
  if (elements.editPath.value === 'untriaged') {
    elements.editPathAge.textContent = 'لم يُختر مسار بعد';
    elements.editPathAge.hidden = false;
    return;
  }
  if (elements.editPath.value !== entry.path) {
    elements.editPathAge.textContent = 'المسار الجديد يبدأ عند الحفظ';
    elements.editPathAge.hidden = false;
    return;
  }
  const age = currentPathAgeDays(entry);
  elements.editPathAge.hidden = age == null;
  elements.editPathAge.textContent = age == null ? '' : `في المسار منذ ${ageDaysLabel(age)}`;
}

function renderExistingAttachments(entryId) {
  releaseObservedAttachmentImages(elements.editExistingAttachments);
  const list = attachmentsFor(entryId).filter(item => !editRemovedAttachmentIds.has(item.id));
  if (!list.length) {
    elements.editExistingAttachments.replaceChildren(emptyNode('لا توجد مرفقات حالية.'));
    return;
  }
  elements.editExistingAttachments.replaceChildren(...list.map(item => createAttachmentTile(item, {
    removeHandler: async () => {
      const confirmed = await confirmAttachmentRemoval(item, 'سيُحذف هذا المرفق عند حفظ التعديل. لا يمكن استعادته بعد الحفظ.');
      if (!confirmed) return;
      editRemovedAttachmentIds.add(item.id);
      renderExistingAttachments(entryId);
    }
  })));
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const id = elements.editEntryId.value;
  const current = entries.find(entry => entry.id === id);
  if (!current) return;
  const hasAttachments = attachmentsFor(id).some(item => !editRemovedAttachmentIds.has(item.id)) || editNewAttachments.length;
  const text = clampString(elements.editText.value, MAX_TEXT_LENGTH);
  if (!text && !hasAttachments) {
    showToast('لا يمكن حفظ إدخال فارغ بلا نص أو مرفقات.');
    return;
  }
  const today = dateKey();
  const topTodayDate = elements.editTopToday.checked
    ? today
    : (current.topTodayDate === today ? null : current.topTodayDate);
  if (topTodayDate && topTodayDate !== current.topTodayDate && !canAddTop(topTodayDate, id)) {
    showToast('لا يمكن إضافة مهمة رابعة إلى أهم اليوم.');
    return;
  }
  let updated = buildUpdatedEntry(current, {
    text,
    path: elements.editPath.value,
    followUpDate: elements.editReturnDate.value || null,
    topTodayDate
  });
  const now = nowIso();
  const addedAttachments = editNewAttachments.map(item => ({
    id: uid('attachment'),
    entryId: id,
    name: safeAttachmentName(item.name),
    type: normalizedAttachmentType(item.type || item.blob?.type),
    size: item.size || item.blob?.size || 0,
    blob: item.blob,
    createdAt: now
  }));
  const currentAttachments = attachmentsFor(id);
  const removedAttachments = currentAttachments.filter(item => editRemovedAttachmentIds.has(item.id));
  const attachmentEvents = [];
  if (addedAttachments.length) {
    attachmentEvents.push(createEntryEvent('attachments_added', now, {
      count: addedAttachments.length,
      names: addedAttachments.map(attachment => attachment.name)
    }));
  }
  if (removedAttachments.length) {
    attachmentEvents.push(createEntryEvent('attachments_removed', now, {
      count: removedAttachments.length,
      names: removedAttachments.map(attachment => safeAttachmentName(attachment.name))
    }));
  }
  updated = { ...appendEventsToEntry(updated, attachmentEvents), updatedAt: now };
  try {
    await persistEntryUpdate(current, updated, {
      addedAttachments,
      removedAttachmentIds: [...editRemovedAttachmentIds]
    });
    refreshDataViews();
  } catch (error) {
    reportStorageFailure(error, 'حفظ التعديل');
    return;
  }
  elements.editDialog.close();
  showToast('تم حفظ التعديل.');
}

async function deleteEditedEntry() {
  const id = elements.editEntryId.value;
  if (!id) return;
  const removed = await trashEntry(id);
  if (removed) elements.editDialog.close();
}

async function cleanOldTrash() {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * DAY;
  const expired = entries.filter(entry => entry.status === 'trash' && entry.deletedAt && new Date(entry.deletedAt).getTime() < cutoff);
  if (!expired.length) return;
  await deleteEntriesCompletely(expired.map(entry => entry.id));
  refreshDataViews();
}

function renderSettingsState() {
  elements.weeklySessionDay.value = String(weeklySessionDayValue());
  const trash = trashEntries();
  elements.trashStatus.textContent = trash.length
    ? `${trash.length} عناصر؛ تُحذف نهائيًا بعد ${TRASH_RETENTION_DAYS} أيام.`
    : 'لا توجد عناصر محذوفة.';
  elements.restoreTrashButton.disabled = !trash.length;
  elements.emptyTrashButton.disabled = !trash.length;
}

async function saveWeeklySessionDay() {
  const previous = weeklySessionDayValue();
  const next = weeklySessionDayValue(elements.weeklySessionDay.value);
  elements.weeklySessionDay.value = String(next);
  try {
    await putSetting('weeklySessionDay', next);
    renderToday();
  } catch (error) {
    elements.weeklySessionDay.value = String(previous);
    reportStorageFailure(error, 'حفظ يوم جلسة مرساة');
  }
}

function trashEntries() {
  return entries
    .filter(entry => entry.status === 'trash')
    .sort((a, b) => new Date(b.deletedAt || b.updatedAt) - new Date(a.deletedAt || a.updatedAt));
}

function trashDaysRemaining(entry) {
  const deletedAt = validIso(entry.deletedAt) || validIso(entry.updatedAt);
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const elapsedDays = Math.max(0, Math.floor((Date.now() - new Date(deletedAt).getTime()) / DAY));
  return Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
}

function statusBeforeTrash(entry) {
  const event = entryEventLog(entry).slice().reverse().find(item =>
    item.type === 'status_changed'
      && item.to === 'trash'
      && ['open', 'done', 'closed'].includes(item.from)
  );
  return event?.from || 'open';
}

function renderTrashDialog() {
  const trash = trashEntries();
  if (!trash.length) {
    elements.trashList.replaceChildren(emptyNode('لا توجد عناصر محذوفة خلال آخر سبعة أيام.'));
    return;
  }

  const rows = trash.map(entry => {
    const row = document.createElement('article');
    row.className = 'trash-entry';

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'trash-entry-main';
    main.setAttribute('aria-label', 'عرض تفاصيل الالتقاطة المحذوفة');
    main.addEventListener('click', () => openEntryDetails(entry.id));

    const text = document.createElement('span');
    text.className = 'trash-entry-text';
    text.dir = 'auto';
    text.textContent = entry.text || attachmentOnlyLabel(entry);

    const deletedAt = validIso(entry.deletedAt) || validIso(entry.updatedAt);
    const remaining = trashDaysRemaining(entry);
    const meta = document.createElement('span');
    meta.className = 'trash-entry-meta';
    meta.textContent = deletedAt
      ? `حُذفت ${formatDate(deletedAt)} · ${formatTime(deletedAt)} · بقي ${remaining} ${remaining === 1 ? 'يوم' : 'أيام'}`
      : `بقي ${remaining} أيام`;
    main.append(text, meta);

    const actions = document.createElement('div');
    actions.className = 'trash-entry-actions';
    actions.append(
      actionButton('استعادة', () => restoreTrashEntry(entry.id), 'primary', 'reopen'),
      actionButton('حذف نهائي', () => deleteTrashEntry(entry.id), 'danger', 'trash')
    );
    row.append(main, actions);
    return row;
  });
  elements.trashList.replaceChildren(...rows);
}

function openTrashDialog() {
  renderTrashDialog();
  if (!elements.trashDialog.open) elements.trashDialog.showModal();
}

async function restoreTrashEntry(entryId) {
  const entry = entries.find(item => item.id === entryId && item.status === 'trash');
  if (!entry) return;
  const restored = await updateEntry(entryId, { status: statusBeforeTrash(entry), deletedAt: null });
  if (restored) showToast('تمت استعادة الالتقاطة.');
}

async function deleteTrashEntry(entryId) {
  const entry = entries.find(item => item.id === entryId && item.status === 'trash');
  if (!entry) return;
  const ok = await askConfirm({
    title: 'حذف نهائي',
    message: 'سيُحذف هذا الإدخال ومرفقاته نهائيًا. لا يمكن التراجع.',
    preview: entry.text || attachmentOnlyLabel(entry),
    accept: 'حذف نهائيًا'
  });
  if (!ok) return;
  await deleteEntryCompletely(entry.id);
  refreshDataViews();
  showToast('تم الحذف نهائيًا.');
}

async function restoreTrash() {
  const trash = trashEntries();
  if (!trash.length) return;
  const restoredEntries = trash.map(entry => buildUpdatedEntry(entry, {
    status: statusBeforeTrash(entry),
    deletedAt: null
  }));
  const restoredById = new Map(restoredEntries.map(entry => [entry.id, entry]));
  const nextEntries = entries.map(entry => restoredById.get(entry.id) || entry);
  const dailyUpdates = [...new Set(restoredEntries.map(entry => entry.topTodayDate).filter(Boolean))]
    .map(day => dailyTopRecordForEntries(day, nextEntries));
  await runAtomicWrite(['entries', ...(dailyUpdates.length ? ['daily'] : [])], (stores, track) => {
    restoredEntries.forEach(entry => track(stores.entries.put(entry)));
    dailyUpdates.forEach(record => track(stores.daily.put(record)));
  });
  entries = nextEntries;
  upsertDailyRecords(dailyUpdates);
  refreshDataViews();
  showToast(`تمت استعادة ${trash.length} عناصر.`);
}

async function emptyTrash() {
  const trash = trashEntries();
  if (!trash.length) return;
  const attachmentCount = trash.reduce((total, entry) => total + attachmentsFor(entry.id).length, 0);
  const previewItems = trash
    .slice(0, 3)
    .map(entry => entry.text || attachmentOnlyLabel(entry));
  const remainingCount = trash.length - previewItems.length;
  const preview = `${previewItems.join('\n')}${remainingCount > 0 ? `\nو${remainingCount} عناصر أخرى` : ''}`;
  const ok = await askConfirm({
    title: 'إفراغ المحذوفات نهائيًا؟',
    message: `سيُحذف كل ما في المحذوفات نهائيًا. الإدخالات: ${trash.length} · المرفقات: ${attachmentCount}. لا يمكن التراجع.`,
    preview,
    accept: 'إفراغ نهائيًا'
  });
  if (!ok) return;
  await deleteEntriesCompletely(trash.map(entry => entry.id));
  refreshDataViews();
  showToast('تم إفراغ المحذوفات.');
}

async function checkPersistence() {
  if (!navigator.storage) {
    elements.storageStatus.textContent = 'المتصفح لا يعرض حالة التخزين الدائم. استخدم تصدير JSON بانتظام.';
    elements.storageMeter.hidden = true;
    elements.requestPersistenceButton.disabled = true;
    return;
  }
  try {
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const usageBytes = Number(estimate?.usage || 0);
    const quotaBytes = Number(estimate?.quota || 0);
    const hasEstimate = quotaBytes > 0;
    const usage = hasEstimate ? formatBytes(usageBytes) : null;
    const quota = hasEstimate ? formatBytes(quotaBytes) : null;
    const available = hasEstimate ? formatBytes(Math.max(0, quotaBytes - usageBytes)) : null;
    const percent = hasEstimate ? Math.min(100, (usageBytes / quotaBytes) * 100) : 0;
    elements.storageStatus.textContent = persisted
      ? `التخزين الدائم مفعّل${usage ? ` · ${usage} من ${quota} · المتاح ${available}` : ''}.`
      : `التخزين محلي لكنه غير مضمون ضد الإخلاء${usage ? ` · ${usage} من ${quota} · المتاح ${available}` : ''}.`;
    elements.storageMeter.hidden = !hasEstimate || usageBytes <= 0;
    elements.storageMeterFill.style.width = `${percent}%`;
    elements.storageMeter.classList.toggle('warning', percent >= 80);
    elements.storageMeter.setAttribute('aria-valuenow', String(Math.round(percent)));
    elements.requestPersistenceButton.disabled = persisted || !navigator.storage.persist;
  } catch (error) {
    elements.storageStatus.textContent = 'تعذر فحص التخزين. صدّر JSON دوريًا.';
    elements.storageMeter.hidden = true;
  }
}

async function requestPersistence(options = {}) {
  const silent = options?.silent === true;
  if (!navigator.storage?.persist) {
    if (!silent) showToast('المتصفح لا يوفر طلب التخزين الدائم.');
    return false;
  }
  let granted = false;
  try {
    granted = await navigator.storage.persist();
  } catch (error) {
    console.warn('تعذر طلب التخزين الدائم:', error);
  }
  await checkPersistence();
  if (!silent) {
    showToast(granted ? 'تم تفعيل التخزين الدائم.' : 'لم يمنح المتصفح التخزين الدائم؛ استمر بالنسخ الاحتياطي.');
  }
  return granted;
}

async function attemptAutomaticPersistence() {
  if (!navigator.storage?.persisted || !navigator.storage?.persist) {
    await checkPersistence();
    return;
  }
  try {
    if (await navigator.storage.persisted()) {
      await checkPersistence();
      return;
    }
    const lastAttemptAt = await getSetting('lastPersistenceAutoAttemptAt');
    if (lastAttemptAt && validIso(lastAttemptAt)
        && Date.now() - new Date(lastAttemptAt).getTime() < PERSISTENCE_RETRY_DAYS * DAY) {
      await checkPersistence();
      return;
    }
    await requestPersistence({ silent: true });
    await putSetting('lastPersistenceAutoAttemptAt', nowIso());
  } catch (error) {
    console.warn('تعذرت محاولة حماية التخزين تلقائيًا:', error);
    await checkPersistence();
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function updateBackupStatus() {
  const lastExportAt = await getSetting('lastExportAt');
  const lastExportAttemptAt = await getSetting('lastExportAttemptAt');
  let due = false;
  if (!lastExportAt || !validIso(lastExportAt)) {
    elements.exportStatus.textContent = lastExportAttemptAt && validIso(lastExportAttemptAt)
      ? `بدأ تنزيل نسخة في ${formatDate(lastExportAttemptAt)}، لكن التطبيق لم يستطع تأكيد حفظها.`
      : 'لم تُنشأ نسخة JSON مؤكدة بعد. JSON الكامل هو نسخة الاستعادة الوحيدة.';
    due = true;
  } else {
    const ageDays = Math.floor((Date.now() - new Date(lastExportAt).getTime()) / DAY);
    due = ageDays >= BACKUP_REMINDER_DAYS;
    elements.exportStatus.textContent = due
      ? `آخر نسخة JSON قبل ${ageDays} أيام؛ يُنصح بالتصدير الآن.`
      : `آخر نسخة JSON: ${formatDate(lastExportAt)} · ${formatTime(lastExportAt)}.`;
  }
  backupExportDue = due;
  updateSettingsSafetyBadge();
  return due;
}

function updateSettingsSafetyBadge() {
  const due = backupExportDue || backupVerificationDue;
  elements.settingsButton.classList.toggle('backup-due', due);
  const label = backupExportDue
    ? 'الإعدادات، النسخ الاحتياطي مستحق'
    : backupVerificationDue
      ? 'الإعدادات، فحص النسخة الاحتياطية مستحق'
      : 'الإعدادات';
  elements.settingsButton.setAttribute('aria-label', label);
  elements.settingsButton.title = label.replace('،', ' ·');
}

async function updateBackupVerificationStatus() {
  const lastVerifiedAt = await getSetting('lastBackupVerifiedAt');
  const summary = await getSetting('lastBackupVerifiedSummary', {});
  const verifiedAt = validIso(lastVerifiedAt);
  const hasSha256Verification = summary?.integrity === 'SHA-256';
  backupVerificationDue = false;
  if (!verifiedAt || !hasSha256Verification) {
    elements.backupVerificationStatus.textContent = verifiedAt
      ? 'الفحص السابق كان بنيوياً فقط. افحص نسخة حديثة للتحقق من المرفقات ببصمات SHA-256.'
      : 'لم تُفحص نسخة حديثة ببصمات SHA-256 بعد. الفحص لا يدمج أو يغيّر إدخالاتك.';
    backupVerificationDue = entries.length > 0 || dailyRecords.some(dailyRecordHasContent);
  } else {
    const ageDays = Math.floor((Date.now() - new Date(verifiedAt).getTime()) / DAY);
    backupVerificationDue = ageDays >= BACKUP_VERIFICATION_REMINDER_DAYS;
    const counts = Number.isInteger(summary?.entries)
      ? ` · الإدخالات: ${summary.entries} · المرفقات: ${Number(summary.attachments || 0)}`
      : '';
    elements.backupVerificationStatus.textContent = backupVerificationDue
      ? `آخر فحص قبل ${ageDays} يومًا؛ حان فحص نسخة حديثة.`
      : `آخر فحص SHA-256: ${formatDate(verifiedAt)} · ${formatTime(verifiedAt)}${counts}.`;
  }
  updateSettingsSafetyBadge();
  return backupVerificationDue;
}

async function maybeRemindBackup() {
  const hasUserData = entries.length > 0 || dailyRecords.some(dailyRecordHasContent);
  if (!hasUserData || !await updateBackupStatus()) return false;
  const lastReminderAt = await getSetting('lastBackupReminderAt');
  if (lastReminderAt && validIso(lastReminderAt)
      && Date.now() - new Date(lastReminderAt).getTime() < DAY) return true;
  await putSetting('lastBackupReminderAt', nowIso());
  showToast('حان إنشاء نسخة احتياطية مؤكدة.', 'نسخ الآن', openSettingsDialog, 9000);
  return true;
}

async function maybeRemindBackupVerification() {
  const hasUserData = entries.length > 0 || dailyRecords.some(dailyRecordHasContent);
  if (!hasUserData || !await updateBackupVerificationStatus()) return;
  const lastReminderAt = await getSetting('lastBackupVerificationReminderAt');
  if (lastReminderAt && validIso(lastReminderAt)
      && Date.now() - new Date(lastReminderAt).getTime() < BACKUP_REMINDER_DAYS * DAY) return;
  await putSetting('lastBackupVerificationReminderAt', nowIso());
  showToast('حان فحص نسخة احتياطية حديثة.', 'فحص الآن', openSettingsDialog, 9000);
}

function updateIcloudStatus() {
  let canShareFiles = false;
  try {
    const probe = new File(['{}'], 'mersah-probe.json', { type: 'application/json' });
    canShareFiles = Boolean(navigator.share && navigator.canShare?.({ files: [probe] }));
  } catch (error) {
    canShareFiles = false;
  }
  elements.icloudStatus.textContent = canShareFiles
    ? 'جاهز للحفظ عبر نافذة المشاركة. اختر Files ثم iCloud Drive ومجلد مرساة.'
    : 'المتصفح لا يدعم مشاركة الملفات مباشرة؛ سيستخدم تنزيل الملفات بدلًا من ذلك.';
}

function attachmentExportGroups() {
  const groups = [];
  let group = [];
  let groupBytes = 0;
  for (const attachment of attachments) {
    const size = Number(attachment.size || attachment.blob?.size || 0);
    if (group.length && groupBytes + size > EXPORT_PART_RAW_BYTES) {
      groups.push(group);
      group = [];
      groupBytes = 0;
    }
    group.push(attachment);
    groupBytes += size;
  }
  if (group.length || !groups.length) groups.push(group);
  return groups;
}

async function buildBackupFiles(stamp) {
  const groups = attachmentExportGroups();
  const total = groups.length;
  const exportedAt = nowIso();
  const backupId = uid('backup');
  const partDescriptors = [];
  const exportEntries = entries.map(entry => storedEntryEventLog(entry).length
    ? entry
    : { ...entry, eventLog: entryEventLog(entry) });

  for (let index = 0; index < total; index += 1) {
    const attachmentRows = [];
    for (const attachment of groups[index]) {
      const loaded = await attachmentWithBlob(attachment);
      attachmentRows.push(await attachmentExportMetadata(loaded));
    }
    const payload = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      app: 'Mersah Daily',
      exportedAt,
      backupId,
      backupPart: { index: index + 1, total },
      entries: index === 0 ? exportEntries : [],
      attachments: attachmentRows,
      daily: index === 0 ? dailyRecords : [],
      settings: index === 0 ? settings : []
    };
    partDescriptors.push({
      group: groups[index],
      payload,
      partSha256: await sha256Text(canonicalJson(backupPartIntegrityProjection(payload)))
    });
  }

  const bundleSha256 = await sha256Text(canonicalJson({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId,
    exportedAt,
    parts: partDescriptors.map((descriptor, index) => ({
      index: index + 1,
      sha256: descriptor.partSha256
    }))
  }));
  const files = [];
  for (let index = 0; index < partDescriptors.length; index += 1) {
    const descriptor = partDescriptors[index];
    const attachmentRows = [];
    for (let attachmentIndex = 0; attachmentIndex < descriptor.group.length; attachmentIndex += 1) {
      const loaded = await attachmentWithBlob(descriptor.group[attachmentIndex]);
      attachmentRows.push(await attachmentToExport(
        loaded,
        descriptor.payload.attachments[attachmentIndex]
      ));
    }
    const payload = {
      ...descriptor.payload,
      attachments: attachmentRows,
      integrity: {
        algorithm: 'SHA-256',
        partSha256: descriptor.partSha256,
        bundleSha256
      }
    };
    const suffix = total > 1 ? `-part-${String(index + 1).padStart(2, '0')}-of-${String(total).padStart(2, '0')}` : '';
    files.push(new File(
      [JSON.stringify(payload)],
      `mersah-daily-backup-${stamp}${suffix}.json`,
      { type: 'application/json' }
    ));
  }
  return files;
}

async function attachmentExportMetadata(attachment) {
  if (!(attachment?.blob instanceof Blob)) throw new Error('تعذر قراءة أحد المرفقات للتصدير.');
  return {
    id: attachment.id,
    entryId: attachment.entryId,
    name: attachment.name,
    type: attachment.type,
    size: attachment.blob.size,
    createdAt: attachment.createdAt,
    sha256: await sha256Blob(attachment.blob)
  };
}

async function attachmentToExport(attachment, metadata) {
  return { ...metadata, data: await blobToBase64(attachment.blob) };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(data, type) {
  const binary = atob(data || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const pairs = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${pairs.join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

function backupPartIntegrityProjection(payload) {
  const projection = { ...payload };
  delete projection.integrity;
  projection.attachments = (Array.isArray(payload.attachments) ? payload.attachments : []).map(item => {
    const metadata = { ...item };
    delete metadata.data;
    return metadata;
  });
  return projection;
}

async function sha256Blob(blob) {
  if (!crypto?.subtle) throw new Error('حساب بصمة النسخة يتطلب فتح مرساة عبر HTTPS أو localhost.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value) {
  return sha256Blob(new Blob([value], { type: 'text/plain;charset=utf-8' }));
}

function validSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

async function exportJson() {
  const stamp = fileDate();
  const files = await buildBackupFiles(stamp);
  const result = await deliverFiles(files, `mersah-daily-${stamp}`);
  await recordBackupDelivery(result);
  if (result.confirmed && files.length === 1) {
    showToast('تم حفظ نسخة JSON مؤكدة.');
  } else if (result.delivered && files.length > 1) {
    showToast(`قُسّمت النسخة إلى ${files.length} ملفات لحماية ذاكرة الآيفون.`);
  }
  return result;
}

async function exportMarkdown() {
  return deliverFile(`mersah-daily-${fileDate()}.md`, buildMarkdown(), 'text/markdown');
}

async function exportIcloudBundle() {
  const stamp = fileDate();
  const backupFiles = await buildBackupFiles(stamp);
  const files = [
    ...backupFiles,
    new File([buildMarkdown()], `mersah-daily-${stamp}.md`, { type: 'text/markdown' })
  ];
  const result = await deliverFiles(files, `mersah-daily-${stamp}`);
  await recordBackupDelivery(result);
  if (result.confirmed) {
    showToast(backupFiles.length > 1
      ? `حُفظت حزمة iCloud في ${backupFiles.length} أجزاء JSON مع Markdown.`
      : 'تم حفظ حزمة iCloud.');
  }
  return result;
}

async function recordBackupDelivery(result) {
  if (!result?.delivered) return;
  const timestamp = nowIso();
  if (result.confirmed) {
    await putSetting('lastExportAt', timestamp);
  } else {
    await putSetting('lastExportAttemptAt', timestamp);
  }
  await updateBackupStatus();
}

function fileDate() {
  return dateKey();
}

function buildMarkdown() {
  const sections = [];
  sections.push('---');
  sections.push(`exported: ${formatDate(new Date())}`);
  sections.push('source: Mersah Daily');
  sections.push('schema: 1');
  sections.push('---', '');
  dayKeys().forEach(day => {
    const record = dailyRecordFor(day);
    const dayEntries = entriesForDate(day);
    sections.push(`# ${dayName(day)} · ${formatDateKey(day)}`, '');
    if (record?.direction) sections.push(`> ${escapeMarkdown(record.direction)}`, '');
    if (record?.closure) {
      const closure = record.closure;
      sections.push('## إغلاق اليوم', '');
      sections.push(`- حُسم: ${closure.summary.resolved}`);
      sections.push(`- أُنجز: ${closure.summary.completed}`);
      sections.push(`- بقي في نفّذ: ${closure.summary.openDo}`);
      if (closure.tomorrowDirection) {
        sections.push(`- توجّه الغد: ${escapeMarkdown(closure.tomorrowDirection)}`);
      }
      sections.push('');
    }
    const top = topEntriesFor(day);
    sections.push('## أهم المهام', '');
    if (!top.length) sections.push('_لا توجد._');
    top.forEach(entry => sections.push(markdownEntry(entry, true)));
    sections.push('');
    Object.entries(PATHS).forEach(([path, label]) => {
      const list = dayEntries.filter(entry => entry.path === path);
      sections.push(`## ${label}`, '');
      if (!list.length) sections.push('_فارغ._');
      list.forEach(entry => sections.push(markdownEntry(entry, false)));
      sections.push('');
    });
  });
  return sections.join('\n');
}

function markdownEntry(entry, checkbox) {
  const box = checkbox || entry.type === 'task' ? `- [${entry.status === 'done' ? 'x' : ' '}]` : '-';
  const parts = [escapeMarkdown(entry.text || attachmentOnlyLabel(entry))];
  if (entry.context) parts.push(`#${contextTag(entry.context)}`);
  if (entry.person) parts.push(`@${escapeMarkdown(entry.person)}`);
  const names = attachmentsFor(entry.id).map(item => item.name).join(', ');
  if (names) parts.push(`مرفقات: ${escapeMarkdown(names)}`);
  return `${box} ${formatEntryTime(entry)} — ${parts.join(' · ')}`;
}

function contextTag(context) {
  return String(context).trim().replace(/\s+/g, '_').replace(/[\\/#[\]^|]/g, '');
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_\[\]])/g, '\\$1');
}

async function deliverFile(name, content, type) {
  return deliverFiles([new File([content], name, { type })], name);
}

async function deliverFiles(files, title) {
  try {
    if (navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({ files, title });
      return { delivered: true, confirmed: true, method: 'share' };
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { delivered: false, confirmed: false, method: 'share' };
    }
    console.warn('تعذرت المشاركة، سيُجرّب التنزيل:', error);
  }
  try {
    for (const [index, file] of files.entries()) {
      if (index) await wait(220);
      const url = URL.createObjectURL(file);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.rel = 'noopener';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    }
    return { delivered: true, confirmed: false, method: 'download' };
  } catch (error) {
    console.error('تعذر بدء تنزيل الملفات:', error);
    return { delivered: false, confirmed: false, method: 'download' };
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function importJsonFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  let importCommitted = false;
  try {
    const report = await readBackupFileSet(files, true);
    const { ordered, entryCount, attachmentCount, totalBytes } = report;
    const partsText = ordered.length > 1 ? ` · ${ordered.length} أجزاء مكتملة` : '';
    const integrityText = report.integrityVerified
      ? ' تم التحقق من سلامة البايتات ببصمات SHA-256.'
      : ' هذه نسخة قديمة بلا بصمات؛ اجتازت الفحص البنيوي فقط.';
    const approved = await askConfirm({
      title: 'استيراد نسخة احتياطية',
      message: `سيُدمج ${entryCount} إدخالًا و${attachmentCount} مرفقًا (${formatBytes(totalBytes)})${partsText}. السجل الأحدث في updatedAt يفوز.`,
      preview: integrityText.trim(),
      accept: 'دمج النسخة',
      danger: false
    });
    if (!approved) return;
    const importBatch = { entries: [], attachments: [], daily: [], settings: [] };
    for (const descriptor of ordered) {
      const batch = await normalizeImportPayload(descriptor.data, {
        verifyAttachmentIntegrity: false,
        prevalidatedAttachments: descriptor.normalizedAttachments
      });
      for (const storeName of ['entries', 'attachments', 'daily', 'settings']) {
        for (const value of batch[storeName]) importBatch[storeName].push(value);
      }
    }
    const importedRecords = importBatch.entries.length + importBatch.attachments.length + importBatch.daily.length;
    await writeImportBatch(importBatch);
    importCommitted = true;
    await recordBackupVerification(report);
    await refreshData();
    elements.settingsDialog.close();
    showToast(report.integrityVerified
      ? `اكتمل استيراد ${importedRecords} سجلات بعد تحقق SHA-256.`
      : `اكتمل استيراد ${importedRecords} سجلات من نسخة قديمة بلا بصمات.`);
  } catch (error) {
    if (importCommitted) {
      await showNotice('اكتمل الاستيراد', 'تم استيراد البيانات كاملة، لكن تعذر تحديث حالة الفحص. أعد فتح التطبيق وتحقق من العدد.');
    } else {
      await showNotice('تعذر الاستيراد', isQuotaExceededError(error)
        ? `${storageFailureMessage(error, 'استيراد النسخة')} لم يُستورد أي سجل.`
        : `${error.message || 'ملف غير صالح'}`);
    }
  } finally {
    elements.importInput.value = '';
  }
}

async function verifyBackupFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  try {
    const report = await readBackupFileSet(files, false);
    for (const descriptor of report.ordered) {
      await normalizeImportPayload(descriptor.data, {
        verifyAttachmentIntegrity: false,
        prevalidatedAttachments: descriptor.normalizedAttachments
      });
    }
    await recordBackupVerification(report);
    const partsText = report.ordered.length > 1 ? ` · ${report.ordered.length} أجزاء` : '';
    if (report.integrityVerified) {
      await showNotice('النسخة سليمة', `النسخة سليمة ببصمات SHA-256.\nالإدخالات: ${report.entryCount} · الأيام: ${report.dailyCount} · المرفقات: ${report.attachmentCount}${partsText}\nتم التحقق من كل مرفق ومن الأجزاء والحزمة، ولم تُدمج أو تتغيّر بياناتك.`);
    } else {
      await showNotice('فحص بنيوي فقط', `اجتازت النسخة الفحص البنيوي فقط.\nالإدخالات: ${report.entryCount} · الأيام: ${report.dailyCount} · المرفقات: ${report.attachmentCount}${partsText}\nهذه نسخة قديمة بلا بصمات SHA-256؛ لا يمكن ضمان سلامة بايتات المرفقات، ولم تُدمج أو تتغيّر بياناتك.`);
    }
  } catch (error) {
    await showNotice('فشل فحص النسخة', error.message || 'ملف غير صالح');
  } finally {
    elements.verifyBackupInput.value = '';
  }
}

async function readBackupFileSet(files, includeExistingEntries) {
  if (files.some(file => file.size > MAX_IMPORT_BYTES)) {
    throw new Error(`أحد الملفات يتجاوز ${formatBytes(MAX_IMPORT_BYTES)}.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
    throw new Error(`مجموع الملفات يتجاوز ${formatBytes(MAX_IMPORT_TOTAL_BYTES)}.`);
  }
  const descriptors = [];
  for (const file of files) {
    const data = JSON.parse(await file.text());
    descriptors.push({ ...inspectImportPayload(file, data), data });
  }
  const ordered = validateImportFileSet(descriptors);
  const entryCount = ordered.reduce((sum, item) => sum + item.entryCount, 0);
  const attachmentCount = ordered.reduce((sum, item) => sum + item.attachmentCount, 0);
  const dailyCount = ordered.reduce((sum, item) => sum + item.dailyCount, 0);
  if (entryCount > MAX_IMPORT_ENTRIES) {
    throw new Error(`النسخة تحتوي ${entryCount} إدخالًا، والحد الآمن ${MAX_IMPORT_ENTRIES}.`);
  }
  if (attachmentCount > MAX_IMPORT_ATTACHMENTS) {
    throw new Error(`النسخة تحتوي ${attachmentCount} مرفقًا، والحد الآمن ${MAX_IMPORT_ATTACHMENTS}.`);
  }
  const integrityProtected = await verifyImportIntegritySet(ordered);
  for (const descriptor of ordered) {
    descriptor.normalizedAttachments = await validateImportedAttachments(descriptor.data, descriptor.file.name);
  }
  assertImportAttachmentLinks(ordered, includeExistingEntries);
  return {
    ordered,
    entryCount,
    attachmentCount,
    dailyCount,
    totalBytes,
    integrityVerified: integrityProtected
  };
}

async function recordBackupVerification(report) {
  if (!report.integrityVerified) return;
  const timestamp = nowIso();
  await putSetting('lastBackupVerifiedAt', timestamp);
  await putSetting('lastBackupVerifiedSummary', {
    entries: report.entryCount,
    attachments: report.attachmentCount,
    daily: report.dailyCount,
    parts: report.ordered.length,
    bytes: report.totalBytes,
    integrity: 'SHA-256'
  });
  await updateBackupVerificationStatus();
}

function inspectImportPayload(file, data) {
  if (!data || typeof data !== 'object') throw new Error(`${file.name}: ملف غير صالح.`);
  const legacy = Array.isArray(data.cards) && Array.isArray(data.outcomes);
  if (legacy) {
    return {
      file,
      legacy: true,
      schemaVersion: 0,
      part: null,
      identity: null,
      entryCount: data.cards.length,
      attachmentCount: 0,
      dailyCount: 0,
      entryIds: data.cards.map(card => importRecordId(`entry_${card?.id || ''}`)).filter(Boolean),
      attachmentEntryIds: []
    };
  }
  const schemaVersion = importedBackupSchemaVersion(data, file.name);
  if (!Array.isArray(data.entries)) throw new Error(`${file.name}: لا توجد entries في النسخة.`);
  const importedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  const rawPart = data.backupPart;
  let part = null;
  if (rawPart != null) {
    const index = Number(rawPart.index);
    const total = Number(rawPart.total);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) {
      throw new Error(`${file.name}: رقم جزء النسخة غير صالح.`);
    }
    part = { index, total };
  }
  const backupId = clampString(data.backupId, MAX_ID_LENGTH);
  const exportedAt = clampString(data.exportedAt, MAX_ID_LENGTH);
  const identityValue = backupId || exportedAt
    ? `${backupId || 'legacy'}|${exportedAt || 'unknown'}`
    : null;
  return {
    file,
    legacy: false,
    schemaVersion,
    part,
    identity: identityValue || null,
    entryCount: data.entries.length,
    attachmentCount: importedAttachments.length,
    dailyCount: Array.isArray(data.daily) ? data.daily.length : 0,
    entryIds: data.entries.map(entry => importRecordId(entry?.id)).filter(Boolean),
    attachmentEntryIds: importedAttachments.map(item => importRecordId(item?.entryId)).filter(Boolean)
  };
}

function importRecordId(value) {
  const id = clampString(value, MAX_ID_LENGTH).replace(/\s+/g, '_');
  return id || null;
}

function validateImportFileSet(descriptors) {
  const legacy = descriptors.filter(item => item.legacy);
  if (legacy.length) {
    if (descriptors.length !== 1) throw new Error('اختر ملف v0 وحده دون خلطه بملفات نسخة أخرى.');
    if (legacy[0].entryCount > MAX_IMPORT_ENTRIES) {
      throw new Error(`نسخة v0 تحتوي أكثر من ${MAX_IMPORT_ENTRIES} عناصر.`);
    }
    return legacy;
  }

  const withParts = descriptors.filter(item => item.part);
  if (!withParts.length) {
    if (descriptors.length !== 1) {
      throw new Error('هذه الملفات لا تحمل أرقام أجزاء. اختر ملف نسخة قديمة واحدًا فقط.');
    }
    return descriptors;
  }
  if (withParts.length !== descriptors.length) {
    throw new Error('لا تخلط أجزاء نسخة مرقمة مع ملف غير مرقم.');
  }

  const schemaVersions = new Set(descriptors.map(item => item.schemaVersion));
  if (schemaVersions.size !== 1) throw new Error('أجزاء النسخة تستخدم إصدارات مختلفة ولا يمكن خلطها.');

  const identities = new Set(descriptors.map(item => item.identity));
  if (identities.has(null) || identities.size !== 1) {
    throw new Error('الملفات المختارة لا تنتمي إلى نسخة احتياطية واحدة.');
  }
  const totals = new Set(descriptors.map(item => item.part.total));
  if (totals.size !== 1) throw new Error('عدد الأجزاء الكلي غير متطابق بين الملفات.');
  const total = descriptors[0].part.total;
  const byIndex = new Map();
  descriptors.forEach(item => {
    if (byIndex.has(item.part.index)) throw new Error(`الجزء ${item.part.index} مكرر.`);
    byIndex.set(item.part.index, item);
  });
  const missing = [];
  for (let index = 1; index <= total; index += 1) {
    if (!byIndex.has(index)) missing.push(index);
  }
  if (missing.length || descriptors.length !== total) {
    throw new Error(`النسخة غير مكتملة. الأجزاء المطلوبة: ${total}، والمفقود: ${missing.join('، ') || 'غير معروف'}.`);
  }
  return [...descriptors].sort((a, b) => a.part.index - b.part.index);
}

function importedBackupSchemaVersion(data, label = 'النسخة') {
  const value = data.schemaVersion == null ? 1 : Number(data.schemaVersion);
  if (!Number.isInteger(value) || value < 1 || value > BACKUP_SCHEMA_VERSION) {
    throw new Error(`${label}: إصدار النسخة غير مدعوم.`);
  }
  return value;
}

async function verifyImportIntegritySet(descriptors) {
  if (!descriptors.length || descriptors[0].legacy || descriptors[0].schemaVersion < 2) return false;
  const partHashes = [];
  let expectedBundleSha256 = null;
  for (const descriptor of descriptors) {
    const integrity = descriptor.data.integrity;
    if (integrity?.algorithm !== 'SHA-256'
        || !validSha256(integrity.partSha256)
        || !validSha256(integrity.bundleSha256)) {
      throw new Error(`${descriptor.file.name}: بيانات بصمة SHA-256 ناقصة أو غير صالحة.`);
    }
    const actualPartSha256 = await sha256Text(canonicalJson(backupPartIntegrityProjection(descriptor.data)));
    if (actualPartSha256 !== integrity.partSha256.toLowerCase()) {
      throw new Error(`${descriptor.file.name}: محتوى الجزء لا يطابق بصمته. قد تكون النسخة تالفة.`);
    }
    const bundleSha256 = integrity.bundleSha256.toLowerCase();
    if (expectedBundleSha256 && bundleSha256 !== expectedBundleSha256) {
      throw new Error('بصمة الحزمة غير متطابقة بين الأجزاء.');
    }
    expectedBundleSha256 = bundleSha256;
    partHashes.push({ index: descriptor.part?.index || 1, sha256: actualPartSha256 });
  }
  const first = descriptors[0].data;
  const actualBundleSha256 = await sha256Text(canonicalJson({
    schemaVersion: descriptors[0].schemaVersion,
    backupId: first.backupId,
    exportedAt: first.exportedAt,
    parts: partHashes
  }));
  if (actualBundleSha256 !== expectedBundleSha256) {
    throw new Error('بصمة الحزمة الكاملة غير مطابقة. قد تكون النسخة ناقصة أو تالفة.');
  }
  return true;
}

function assertImportAttachmentLinks(descriptors, includeExistingEntries = true) {
  const knownEntryIds = new Set(includeExistingEntries ? entries.map(entry => entry.id) : []);
  descriptors.forEach(item => item.entryIds.forEach(id => knownEntryIds.add(id)));
  const orphanCount = descriptors.reduce((count, item) =>
    count + item.attachmentEntryIds.filter(id => !knownEntryIds.has(id)).length, 0);
  if (orphanCount) {
    throw new Error(`النسخة تحتوي ${orphanCount} مرفقًا بلا إدخال مرتبط. لم يُستورد شيء.`);
  }
}

async function normalizeImportPayload(data, {
  verifyAttachmentIntegrity = true,
  prevalidatedAttachments = null
} = {}) {
  if (!data || typeof data !== 'object') throw new Error('ملف النسخة غير صالح.');
  if (Array.isArray(data.cards) && Array.isArray(data.outcomes)) return normalizeV0Import(data.cards);
  const schemaVersion = importedBackupSchemaVersion(data);
  if (!Array.isArray(data.entries)) throw new Error('لا توجد entries في النسخة.');
  if (data.entries.length > MAX_IMPORT_ENTRIES) throw new Error(`النسخة تحتوي أكثر من ${MAX_IMPORT_ENTRIES} إدخالات.`);
  const importedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  if (importedAttachments.length > MAX_IMPORT_ATTACHMENTS) throw new Error(`النسخة تحتوي أكثر من ${MAX_IMPORT_ATTACHMENTS} مرفقات.`);

  const normalizedAttachments = Array.isArray(prevalidatedAttachments)
    ? prevalidatedAttachments
    : [];
  if (!Array.isArray(prevalidatedAttachments)) {
    for (let index = 0; index < importedAttachments.length; index += 1) {
      normalizedAttachments.push(await sanitizeImportedAttachment(importedAttachments[index], {
        schemaVersion,
        verifyDigest: verifyAttachmentIntegrity,
        label: `المرفق ${index + 1}`
      }));
    }
  }
  if (normalizedAttachments.length !== importedAttachments.length) {
    throw new Error(`عدد المرفقات المقروءة (${normalizedAttachments.length}) لا يطابق العدد المعلن (${importedAttachments.length}).`);
  }

  const existingEntries = new Map(entries.map(entry => [entry.id, entry]));
  const existingDaily = new Map(dailyRecords.map(record => [record.date, record]));
  const existingSettings = new Map(settings.map(setting => [setting.key, setting]));
  const batch = {
    entries: data.entries
      .map((entry, index) => sanitizeImportedEntry(entry, `الإدخال ${index + 1}`))
      .filter(entry => shouldImport(entry, existingEntries.get(entry.id))),
    attachments: normalizedAttachments,
    daily: (Array.isArray(data.daily) ? data.daily : []).map(sanitizeImportedDaily).filter(record => record && shouldImport(record, existingDaily.get(record.date))),
    settings: (Array.isArray(data.settings) ? data.settings : []).map(sanitizeImportedSetting).filter(setting => setting && shouldImport(setting, existingSettings.get(setting.key)))
  };
  return batch;
}

function normalizeV0Import(cards) {
  if (cards.length > MAX_IMPORT_ENTRIES) throw new Error(`نسخة v0 تحتوي أكثر من ${MAX_IMPORT_ENTRIES} عناصر.`);
  const existingEntries = new Map(entries.map(entry => [entry.id, entry]));
  const converted = cards.map(card => {
    const [path, status] = V0_STATE_MAP[card?.state] || ['untriaged', 'open'];
    const createdAt = validIso(card?.createdAt) || nowIso();
    const updatedAt = validIso(card?.updatedAt) || createdAt;
    return {
      id: `entry_${safeId(card?.id, 'legacy')}`,
      text: clampString(card?.text, MAX_TEXT_LENGTH),
      type: 'note',
      path,
      status,
      createdAt,
      updatedAt,
      createdLocal: null,
      pathLog: [],
      eventLog: [],
      completedAt: status === 'done' ? updatedAt : null,
      deletedAt: status === 'trash' ? (validIso(card?.deletedAt) || updatedAt) : null,
      context: clampString(card?.context, MAX_SHORT_TEXT),
      person: '',
      dueDate: null,
      followUpDate: null,
      topTodayDate: null,
      legacy: { source: 'v0', state: card?.state || null }
    };
  }).filter(entry => entry.text && shouldImport(entry, existingEntries.get(entry.id)));
  return { entries: converted, attachments: [], daily: [], settings: [] };
}

function sanitizeImportedTimeZone(value, label) {
  if (value == null || value === '') return null;
  const timeZone = clampString(value, 80);
  if (!timeZone) throw new Error(`${label}: المنطقة الزمنية غير صالحة.`);
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch (error) {
    throw new Error(`${label}: المنطقة الزمنية غير معروفة.`);
  }
  return timeZone;
}

function sanitizeImportedOffset(value, label) {
  if (value == null) return null;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
    throw new Error(`${label}: فرق التوقيت غير صالح.`);
  }
  return offset;
}

function localPartsAtOffset(iso, offsetMinutes) {
  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function sanitizeImportedCreatedLocal(value, createdAt, label) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: ختم وقت الإنشاء المحلي غير صالح.`);
  }
  const date = validDateKey(value.date);
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  if (!date || !Number.isInteger(hour) || hour < 0 || hour > 23
      || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`${label}: تاريخ أو ساعة الإنشاء المحلية غير صالحة.`);
  }
  const timeZone = sanitizeImportedTimeZone(value.timeZone, label);
  const utcOffsetMinutes = sanitizeImportedOffset(value.utcOffsetMinutes, label);
  if (utcOffsetMinutes != null) {
    const expected = localPartsAtOffset(createdAt, utcOffsetMinutes);
    if (expected.date !== date || expected.hour !== hour || expected.minute !== minute) {
      throw new Error(`${label}: ختم الإنشاء المحلي لا يطابق createdAt وفرق التوقيت.`);
    }
  }
  return {
    date,
    hour,
    minute,
    timeZone,
    utcOffsetMinutes
  };
}

function sanitizeImportedPathLog(value, currentPath, createdAt, updatedAt, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label}: سجل المسارات ليس قائمة.`);
  if (value.length > MAX_PATH_LOG_ENTRIES) {
    throw new Error(`${label}: سجل المسارات يتجاوز الحد الآمن (${MAX_PATH_LOG_ENTRIES}).`);
  }
  const activeValue = pathLogWithoutRemovedPath(value);
  let previousTime = -Infinity;
  let previousPath = null;
  const createdTime = new Date(createdAt).getTime();
  const updatedTime = new Date(updatedAt).getTime();
  const log = activeValue.map((event, index) => {
    const eventLabel = `${label}، انتقال المسار ${index + 1}`;
    if (!event || typeof event !== 'object' || Array.isArray(event) || !hasOwn(PATHS, event.path)) {
      throw new Error(`${eventLabel}: المسار غير صالح.`);
    }
    const at = validIso(event.at);
    if (!at) throw new Error(`${eventLabel}: الوقت غير صالح.`);
    const timestamp = new Date(at).getTime();
    if (timestamp < createdTime || timestamp > updatedTime) {
      throw new Error(`${eventLabel}: الوقت خارج عمر الإدخال.`);
    }
    if (timestamp < previousTime) throw new Error(`${eventLabel}: ترتيب الأوقات غير تصاعدي.`);
    if (event.path === previousPath) throw new Error(`${eventLabel}: انتقال مكرر إلى المسار نفسه.`);
    const localDate = event.localDate == null ? null : validDateKey(event.localDate);
    if (event.localDate != null && !localDate) throw new Error(`${eventLabel}: التاريخ المحلي غير صالح.`);
    previousTime = timestamp;
    previousPath = event.path;
    const timeZone = sanitizeImportedTimeZone(event.timeZone, eventLabel);
    const utcOffsetMinutes = sanitizeImportedOffset(event.utcOffsetMinutes, eventLabel);
    if (localDate && utcOffsetMinutes != null
        && localPartsAtOffset(at, utcOffsetMinutes).date !== localDate) {
      throw new Error(`${eventLabel}: التاريخ المحلي لا يطابق الوقت وفرق التوقيت.`);
    }
    return {
      path: event.path,
      at,
      localDate,
      timeZone,
      utcOffsetMinutes
    };
  });
  if (log.length && log.at(-1).path !== currentPath) {
    throw new Error(`${label}: آخر مسار في السجل لا يطابق المسار الحالي.`);
  }
  return log;
}

function sanitizeImportedEventLog(value, createdAt, updatedAt, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label}: سجل الأحداث ليس قائمة.`);
  if (value.length > MAX_ENTRY_EVENT_LOG_ENTRIES) {
    throw new Error(`${label}: سجل الأحداث يتجاوز الحد الآمن (${MAX_ENTRY_EVENT_LOG_ENTRIES}).`);
  }
  const activeValue = eventLogWithoutRemovedPath(value);
  const createdTime = new Date(createdAt).getTime();
  const updatedTime = new Date(updatedAt).getTime();
  let previousTime = -Infinity;
  return activeValue.map((event, index) => {
    const eventLabel = `${label}، الحدث ${index + 1}`;
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || !ENTRY_EVENT_TYPES.has(event.type)) {
      throw new Error(`${eventLabel}: النوع غير صالح.`);
    }
    const at = validIso(event.at);
    if (!at) throw new Error(`${eventLabel}: الوقت غير صالح.`);
    const timestamp = new Date(at).getTime();
    if (timestamp < createdTime || timestamp > updatedTime) {
      throw new Error(`${eventLabel}: الوقت خارج عمر الإدخال.`);
    }
    if (timestamp < previousTime) throw new Error(`${eventLabel}: ترتيب الأوقات غير تصاعدي.`);
    previousTime = timestamp;

    const localDate = event.localDate == null ? null : validDateKey(event.localDate);
    const localHour = event.localHour == null ? null : Number(event.localHour);
    const localMinute = event.localMinute == null ? null : Number(event.localMinute);
    if (event.localDate != null && !localDate) throw new Error(`${eventLabel}: التاريخ المحلي غير صالح.`);
    if ((localHour == null) !== (localMinute == null)
        || (localHour != null && (!Number.isInteger(localHour) || localHour < 0 || localHour > 23
          || !Number.isInteger(localMinute) || localMinute < 0 || localMinute > 59))) {
      throw new Error(`${eventLabel}: الساعة المحلية غير صالحة.`);
    }
    const timeZone = sanitizeImportedTimeZone(event.timeZone, eventLabel);
    const utcOffsetMinutes = sanitizeImportedOffset(event.utcOffsetMinutes, eventLabel);
    if (utcOffsetMinutes != null && (localDate || localHour != null)) {
      const expected = localPartsAtOffset(at, utcOffsetMinutes);
      if ((localDate && expected.date !== localDate)
          || (localHour != null && (expected.hour !== localHour || expected.minute !== localMinute))) {
        throw new Error(`${eventLabel}: الوقت المحلي لا يطابق at وفرق التوقيت.`);
      }
    }

    const sanitized = {
      id: safeId(event.id, 'event'),
      type: event.type,
      at,
      localDate,
      localHour,
      localMinute,
      timeZone,
      utcOffsetMinutes
    };
    if (event.estimated === true) sanitized.estimated = true;
    if (event.type === 'created') {
      if (event.to == null || event.to === '') sanitized.to = null;
      else {
        if (!hasOwn(PATHS, event.to)) throw new Error(`${eventLabel}: مسار الإنشاء غير صالح.`);
        sanitized.to = event.to;
      }
    } else if (event.type === 'path_changed') {
      if (!hasOwn(PATHS, event.from) || !hasOwn(PATHS, event.to) || event.from === event.to) {
        throw new Error(`${eventLabel}: انتقال المسار غير صالح.`);
      }
      sanitized.from = event.from;
      sanitized.to = event.to;
    } else if (event.type === 'status_changed') {
      if (!hasOwn(STATUSES, event.from) || !hasOwn(STATUSES, event.to) || event.from === event.to) {
        throw new Error(`${eventLabel}: انتقال الحالة غير صالح.`);
      }
      sanitized.from = event.from;
      sanitized.to = event.to;
    } else if (event.type === 'due_date_changed' || event.type === 'return_date_changed'
        || event.type === 'return_deferred' || event.type === 'top_added' || event.type === 'top_removed') {
      for (const field of ['from', 'to']) {
        if (event[field] == null || event[field] === '') {
          sanitized[field] = null;
        } else {
          const key = validDateKey(event[field]);
          if (!key) throw new Error(`${eventLabel}: التاريخ في ${field} غير صالح.`);
          sanitized[field] = key;
        }
      }
    } else if (event.type === 'attachments_added' || event.type === 'attachments_removed') {
      const count = Number(event.count);
      if (!Number.isInteger(count) || count < 1 || count > MAX_ATTACHMENTS_PER_ENTRY) {
        throw new Error(`${eventLabel}: عدد المرفقات غير صالح.`);
      }
      if (!Array.isArray(event.names) || event.names.length !== count) {
        throw new Error(`${eventLabel}: أسماء المرفقات لا تطابق عددها.`);
      }
      sanitized.count = count;
      sanitized.names = event.names.map(name => safeAttachmentName(name));
    }
    return sanitized;
  });
}

function sanitizeImportedEntry(entry, label = 'الإدخال') {
  const createdAt = validIso(entry?.createdAt) || nowIso();
  const updatedAt = validIso(entry?.updatedAt) || createdAt;
  if (new Date(updatedAt).getTime() < new Date(createdAt).getTime()) {
    throw new Error(`${label}: updatedAt يسبق createdAt.`);
  }
  const path = validPath(entry?.path);
  const eventLog = sanitizeImportedEventLog(entry?.eventLog, createdAt, updatedAt, label);
  if (eventLog.length) {
    if (eventLog[0].type !== 'created'
        || eventLog.filter(event => event.type === 'created').length !== 1) {
      throw new Error(`${label}: سجل الأحداث يجب أن يبدأ بحدث إنشاء واحد.`);
    }
    const latestKnownPath = eventLog.slice().reverse().find(event =>
      event.type === 'path_changed' || (event.type === 'created' && event.to)
    );
    if (latestKnownPath?.to && latestKnownPath.to !== path) {
      throw new Error(`${label}: آخر مسار في سجل الأحداث لا يطابق المسار الحالي.`);
    }
  }
  return {
    id: safeId(entry?.id, 'entry'),
    text: clampString(entry?.text, MAX_TEXT_LENGTH),
    type: validType(entry?.type),
    path,
    status: validStatus(entry?.status),
    createdAt,
    updatedAt,
    createdLocal: sanitizeImportedCreatedLocal(entry?.createdLocal, createdAt, label),
    pathLog: sanitizeImportedPathLog(entry?.pathLog, path, createdAt, updatedAt, label),
    eventLog,
    completedAt: validIso(entry?.completedAt),
    deletedAt: validIso(entry?.deletedAt),
    context: clampString(entry?.context, MAX_SHORT_TEXT),
    person: clampString(entry?.person, MAX_SHORT_TEXT),
    dueDate: validDateKey(entry?.dueDate),
    followUpDate: validDateKey(entry?.followUpDate),
    topTodayDate: validDateKey(entry?.topTodayDate),
    legacy: {
      source: entry?.legacy?.source || null,
      state: entry?.legacy?.state || null
    }
  };
}

async function validateImportedAttachments(data, fileName) {
  if (Array.isArray(data.cards) && Array.isArray(data.outcomes)) return [];
  const schemaVersion = importedBackupSchemaVersion(data, fileName);
  const importedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  const normalizedAttachments = [];
  for (let index = 0; index < importedAttachments.length; index += 1) {
    normalizedAttachments.push(await sanitizeImportedAttachment(importedAttachments[index], {
      schemaVersion,
      verifyDigest: true,
      label: `${fileName}: المرفق ${index + 1}`
    }));
  }
  if (normalizedAttachments.length !== importedAttachments.length) {
    throw new Error(`${fileName}: عدد المرفقات المقروءة (${normalizedAttachments.length}) لا يطابق العدد المعلن (${importedAttachments.length}).`);
  }
  return normalizedAttachments;
}

async function sanitizeImportedAttachment(item, { schemaVersion = 1, verifyDigest = true, label = 'المرفق' } = {}) {
  if (!item || typeof item !== 'object') throw new Error(`${label}: سجل المرفق غير صالح.`);
  if (!clampString(item.id, MAX_ID_LENGTH)) throw new Error(`${label}: معرّف المرفق مفقود.`);
  if (!clampString(item.entryId, MAX_ID_LENGTH)) throw new Error(`${label}: الإدخال المرتبط مفقود.`);
  if (typeof item.data !== 'string' || !item.data.length) throw new Error(`${label}: بيانات المرفق مفقودة.`);
  let blob;
  try {
    blob = base64ToBlob(item.data, item.type);
  } catch (error) {
    throw new Error(`${label}: بيانات المرفق Base64 غير صالحة.`);
  }
  const declaredSize = Number(item.size);
  if (item.size != null && (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize !== blob.size)) {
    throw new Error(`${label}: حجم المرفق لا يطابق الحجم المعلن.`);
  }
  if (schemaVersion >= 2) {
    if (!validSha256(item.sha256)) throw new Error(`${label}: بصمة SHA-256 مفقودة أو غير صالحة.`);
    if (verifyDigest) {
      const actualSha256 = await sha256Blob(blob);
      if (actualSha256 !== item.sha256.toLowerCase()) {
        throw new Error(`${label}: بايتات المرفق لا تطابق بصمته. قد يكون المرفق تالفًا.`);
      }
    }
  }
  return {
    id: safeId(item.id, 'attachment'),
    entryId: safeId(item.entryId, 'entry'),
    name: safeAttachmentName(item.name),
    type: normalizedAttachmentType(item.type),
    size: blob.size,
    blob,
    createdAt: validIso(item.createdAt) || nowIso()
  };
}

function sanitizeImportedDayClosure(value, day, recordUpdatedAt) {
  if (value == null) return null;
  const label = `إغلاق يوم ${day}`;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Number(value.version) !== 1) {
    throw new Error(`${label}: السجل غير صالح.`);
  }
  const closedAt = validIso(value.closedAt);
  const updatedAt = validIso(value.updatedAt) || closedAt;
  if (!closedAt || !updatedAt) throw new Error(`${label}: وقت الإغلاق غير صالح.`);
  const closedTime = new Date(closedAt).getTime();
  const updatedTime = new Date(updatedAt).getTime();
  const recordUpdatedTime = new Date(recordUpdatedAt).getTime();
  if (updatedTime < closedTime || updatedTime > recordUpdatedTime) {
    throw new Error(`${label}: ترتيب أوقات الإغلاق غير صالح.`);
  }
  const local = sanitizeImportedCreatedLocal(value.local, closedAt, label);
  const operationalDay = local
    ? recordedOperationalDate(local.date, local.hour, closedAt)
    : null;
  if (!local || (local.date !== day && operationalDay !== day)) {
    throw new Error(`${label}: التاريخ المحلي لا يطابق اليوم.`);
  }
  if (!value.summary || typeof value.summary !== 'object' || Array.isArray(value.summary)) {
    throw new Error(`${label}: الملخص غير صالح.`);
  }
  const summary = {};
  for (const field of ['resolved', 'completed', 'openDo']) {
    const count = Number(value.summary[field]);
    if (!Number.isInteger(count) || count < 0 || count > MAX_IMPORT_ENTRIES) {
      throw new Error(`${label}: قيمة ${field} غير صالحة.`);
    }
    summary[field] = count;
  }
  const backupAt = value.backupAt == null ? null : validIso(value.backupAt);
  if (value.backupAt != null && !backupAt) throw new Error(`${label}: وقت النسخة غير صالح.`);
  if (backupAt) {
    const backupTime = new Date(backupAt).getTime();
    if (backupTime < closedTime || backupTime > updatedTime) {
      throw new Error(`${label}: وقت النسخة خارج مدة الإغلاق.`);
    }
  }
  return {
    version: 1,
    closedAt,
    updatedAt,
    local,
    summary,
    tomorrowDirection: clampString(value.tomorrowDirection, MAX_DIRECTION_LENGTH),
    backupAt
  };
}

function sanitizeImportedDaily(record) {
  const key = validDateKey(record?.date);
  if (!key) return null;
  const createdAt = validIso(record?.createdAt) || nowIso();
  const updatedAt = validIso(record?.updatedAt) || createdAt;
  if (new Date(updatedAt).getTime() < new Date(createdAt).getTime()) {
    throw new Error(`سجل يوم ${key}: updatedAt يسبق createdAt.`);
  }
  return {
    date: key,
    direction: clampString(record?.direction, MAX_DIRECTION_LENGTH),
    topEntryIds: Array.isArray(record?.topEntryIds) ? record.topEntryIds.map(id => safeId(id, 'entry')).slice(0, 3) : [],
    closure: sanitizeImportedDayClosure(record?.closure, key, updatedAt),
    createdAt,
    updatedAt
  };
}

function sanitizeImportedSetting(setting) {
  if (!setting?.key) return null;
  return {
    key: safeId(setting.key, 'setting'),
    value: setting.value,
    updatedAt: validIso(setting.updatedAt) || nowIso()
  };
}

function shouldImport(imported, existing) {
  if (!existing) return true;
  const importedTime = new Date(imported.updatedAt || imported.createdAt || 0).getTime();
  const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
  return importedTime > existingTime;
}

async function detectLegacyMigration() {
  const choice = await getSetting('legacyMigrationChoice');
  const storedName = await getSetting('legacyMigrationDbName');
  if (storedName && choice !== 'imported' && choice !== 'skipped') {
    setMigrationStatus(storedName, 'ready');
    return;
  }
  if (choice) {
    setMigrationStatus(null, choice);
    return;
  }
  if (!indexedDB.databases) {
    elements.migrationStatus.textContent = 'المتصفح لا يدعم فحص قواعد IndexedDB تلقائيًا. استخدم استيراد JSON إن احتجت v0.';
    return;
  }
  try {
    const databases = await indexedDB.databases();
    for (const info of databases) {
      if (!info.name || info.name === DB_NAME) continue;
      if (await looksLikeLegacyDb(info.name)) {
        await putSetting('legacyMigrationDbName', info.name);
        await putSetting('legacyMigrationChoice', 'offered');
        setMigrationStatus(info.name, 'ready');
        showToast('وجدت مرساة نسخة v0 محلية.', 'استيراد', () => runLegacyMigration(info.name), 9000);
        return;
      }
    }
    await putSetting('legacyMigrationChoice', 'none');
    setMigrationStatus(null, 'none');
  } catch (error) {
    elements.migrationStatus.textContent = 'تعذر فحص وجود v0 تلقائيًا.';
  }
}

function looksLikeLegacyDb(name) {
  return new Promise(resolve => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const ok = db.objectStoreNames.contains('cards') && db.objectStoreNames.contains('outcomes');
      db.close();
      resolve(ok);
    };
    request.onerror = () => resolve(false);
    request.onupgradeneeded = event => {
      event.target.transaction.abort();
      resolve(false);
    };
  });
}

function setMigrationStatus(dbName, state) {
  if (state === 'ready' || state === 'offered') {
    elements.migrationStatus.textContent = `وجدت قاعدة v0: ${dbName || LEGACY_DB_NAME}. لن يحدث شيء دون موافقتك.`;
    elements.runMigrationButton.disabled = false;
    return;
  }
  elements.runMigrationButton.disabled = true;
  if (state === 'imported') elements.migrationStatus.textContent = 'تم استيراد v0 سابقًا.';
  else if (state === 'skipped') elements.migrationStatus.textContent = 'تم تجاهل هجرة v0 بناءً على اختيارك.';
  else elements.migrationStatus.textContent = 'لم أجد قاعدة v0 محلية.';
}

async function runLegacyMigration(dbName = null) {
  const name = dbName || await getSetting('legacyMigrationDbName') || LEGACY_DB_NAME;
  let migrationCommitted = false;
  try {
    const legacyCards = await readLegacyCards(name);
    const batch = normalizeV0Import(legacyCards);
    if (!batch.entries.length) {
      await putSetting('legacyMigrationChoice', 'imported');
      setMigrationStatus(name, 'imported');
      showToast('لا توجد عناصر v0 جديدة للاستيراد.');
      return;
    }
    const approved = await askConfirm({
      title: 'استيراد مرساة v0',
      message: `سيُدمج ${batch.entries.length} عنصرًا من القاعدة القديمة مع بيانات مرساة الحالية.`,
      accept: 'استيراد v0',
      danger: false
    });
    if (!approved) return;
    await writeImportBatch(batch);
    migrationCommitted = true;
    await putSetting('legacyMigrationChoice', 'imported');
    await refreshData();
    setMigrationStatus(name, 'imported');
    showToast('اكتملت هجرة v0.');
  } catch (error) {
    if (migrationCommitted) {
      await showNotice('اكتملت الهجرة', 'تم استيراد عناصر v0 كاملة، لكن تعذر تسجيل اكتمال الهجرة. تحقق من العدد قبل إعادة المحاولة.');
    } else {
      await showNotice('تعذرت هجرة v0', isQuotaExceededError(error)
        ? `${storageFailureMessage(error, 'هجرة v0')} لم يُستورد أي سجل.`
        : `${error.message || 'خطأ غير معروف'}`);
    }
  }
}

function readLegacyCards(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cards')) {
        db.close();
        reject(new Error('لا تحتوي القاعدة على cards.'));
        return;
      }
      const tx = db.transaction('cards', 'readonly');
      const all = tx.objectStore('cards').getAll();
      all.onsuccess = () => {
        db.close();
        resolve(all.result || []);
      };
      all.onerror = () => {
        db.close();
        reject(all.error);
      };
    };
    request.onerror = () => reject(request.error);
  });
}

async function skipMigration() {
  await putSetting('legacyMigrationChoice', 'skipped');
  setMigrationStatus(null, 'skipped');
}

function showOnlyView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.view === name));
  $$('.nav-btn').forEach(button => {
    const active = button.dataset.target === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function switchView(name) {
  const changed = currentView !== name;
  if (changed) hideCaptureReturnConfirmation();
  if (changed) viewScrollPositions.set(currentView, window.scrollY);
  currentView = name;
  showOnlyView(name);
  renderCurrentView();
  if (changed) {
    requestAnimationFrame(() => window.scrollTo({
      top: viewScrollPositions.get(name) || 0,
      behavior: 'auto'
    }));
  }
}

function showToastActions(message, actions = [], duration = 3500) {
  clearTimeout(toastTimer);
  elements.toastText.textContent = message;
  const buttons = actions.filter(item => item?.label && typeof item.action === 'function').map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.addEventListener('click', async () => {
      elements.toast.classList.remove('visible');
      await item.action();
    });
    return button;
  });
  elements.toastActions.replaceChildren(...buttons);
  elements.toast.classList.add('visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), duration);
}

function showToast(message, actionLabel = '', action = null, duration = 3500) {
  showToastActions(message, actionLabel && action ? [{ label: actionLabel, action }] : [], duration);
}

function editableKeyboardTarget(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) return !node.disabled && !node.readOnly;
  if (!(node instanceof HTMLInputElement) || node.disabled || node.readOnly) return false;
  return !['button', 'checkbox', 'radio', 'range', 'file', 'hidden', 'submit'].includes(node.type);
}

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height || window.innerHeight;
  const active = document.activeElement;
  const hasEditableFocus = editableKeyboardTarget(active);
  if (!hasEditableFocus && viewportHeight > visualViewportBaseHeight - 80) {
    visualViewportBaseHeight = Math.max(visualViewportBaseHeight, viewportHeight);
  }
  const viewportDrop = Math.max(0, visualViewportBaseHeight - viewportHeight);
  const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - (viewport?.offsetTop || 0));
  const keyboardOpen = hasEditableFocus && viewportDrop > 80;
  document.documentElement.style.setProperty('--visual-viewport-height', `${Math.max(240, viewportHeight)}px`);
  document.documentElement.style.setProperty('--keyboard-inset', `${keyboardOpen ? keyboardInset : 0}px`);
  document.body.classList.toggle('keyboard-open', keyboardOpen);
  if (keyboardOpen && active instanceof HTMLElement && active.closest('dialog[open]')) {
    requestAnimationFrame(() => active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }));
  }
}

async function openSettingsDialog() {
  elements.settingsButton.classList.add('active');
  if (!elements.settingsDialog.open) elements.settingsDialog.showModal();
  updateIcloudStatus();
  await Promise.all([checkPersistence(), updateBackupStatus(), updateBackupVerificationStatus()]);
}

function bindEvents() {
  window.addEventListener('unhandledrejection', event => {
    if (!isQuotaExceededError(event.reason)) return;
    event.preventDefault();
    reportStorageFailure(event.reason);
  });
  elements.settingsButton.addEventListener('click', openSettingsDialog);
  elements.settingsDialog.addEventListener('close', () => elements.settingsButton.classList.remove('active'));
  elements.themeLightButton.addEventListener('click', () => selectTheme('light'));
  elements.themeDarkButton.addEventListener('click', () => selectTheme('dark'));
  elements.weeklySessionDay.addEventListener('change', saveWeeklySessionDay);
  systemDarkTheme.addEventListener?.('change', () => {
    if (!validTheme(settingsMap.get('theme'))) applyTheme(null);
  });
  $$('.nav-btn[data-target]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.target)));
  elements.analysisOldestRow.addEventListener('click', () => {
    activeEntriesPath = 'consider';
    elements.entriesSort.value = 'oldest';
    entriesResultsLimit = ENTRY_PAGE_SIZE;
    switchView('entries');
  });
  elements.analysisResolutionRow.addEventListener('click', () => {
    const today = dateKey();
    activeEntriesPath = 'all';
    elements.entriesDateFrom.value = shiftDateKey(today, -6);
    elements.entriesDateTo.value = today;
    elements.entriesSort.value = 'newest';
    entriesResultsLimit = ENTRY_PAGE_SIZE;
    switchView('entries');
  });
  elements.openTopTaskDialog.addEventListener('click', () => {
    if (!elements.topTaskDialog.open) elements.topTaskDialog.showModal();
    setTimeout(() => elements.quickTaskInput.focus(), 80);
  });
  elements.captureFab.addEventListener('click', openCaptureDialog);
  elements.captureForm.addEventListener('submit', handleCaptureSubmit);
  elements.captureText.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
      event.preventDefault();
      elements.captureForm.requestSubmit();
    }
  });
  elements.captureCameraInput.addEventListener('change', async () => {
    await handleAttachmentFiles(elements.captureCameraInput.files, captureDraftAttachments, { imagesOnly: true });
    elements.captureCameraInput.value = '';
  });
  elements.captureFileInput.addEventListener('change', async () => {
    await handleAttachmentFiles(elements.captureFileInput.files, captureDraftAttachments);
    elements.captureFileInput.value = '';
  });
  elements.directionButton.addEventListener('click', openDirectionDialog);
  elements.directionForm.addEventListener('submit', handleDirectionSubmit);
  elements.openEveningCloseButton.addEventListener('click', openEveningCloseDialog);
  elements.openWeeklySessionButton.addEventListener('click', openWeeklySessionDialog);
  elements.completeWeeklySessionButton.addEventListener('click', completeWeeklySession);
  elements.eveningCloseForm.addEventListener('submit', handleEveningCloseSubmit);
  elements.saveEveningCloseBackupButton.addEventListener('click', () => saveEveningClose({ withBackup: true }));
  elements.quickTaskInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      addQuickTopTask();
    }
  });
  elements.addTopTaskButton.addEventListener('click', addQuickTopTask);
  elements.loadMoreTodayButton.addEventListener('click', () => {
    todayEntriesLimit += ENTRY_PAGE_SIZE;
    renderTodayTimeline(dateKey());
  });
  elements.entriesSearchInput.addEventListener('input', scheduleEntriesSearch);
  elements.entriesDateFrom.addEventListener('change', () => handleEntriesDateChange('from'));
  elements.entriesDateTo.addEventListener('change', () => handleEntriesDateChange('to'));
  elements.entriesSort.addEventListener('change', () => {
    entriesResultsLimit = ENTRY_PAGE_SIZE;
    renderEntries();
  });
  elements.clearEntriesFiltersButton.addEventListener('click', clearEntriesFilters);
  elements.loadMoreEntriesButton.addEventListener('click', () => {
    entriesResultsLimit += ENTRY_PAGE_SIZE;
    renderEntries();
  });
  elements.archivePreviousMonthButton.addEventListener('click', () => setArchiveMonth(shiftMonthKey(activeArchiveMonth, -1)));
  elements.archiveNextMonthButton.addEventListener('click', () => setArchiveMonth(shiftMonthKey(activeArchiveMonth, 1)));
  elements.archiveMonthInput.addEventListener('change', () => setArchiveMonth(elements.archiveMonthInput.value));
  elements.editDayButton.addEventListener('click', () => {
    selectedDayEditUnlocked = true;
    renderSelectedDay();
    elements.selectedDayDirection.focus();
  });
  elements.selectedDayDirection.addEventListener('input', scheduleSelectedDirectionSave);
  elements.editForm.addEventListener('submit', handleEditSubmit);
  elements.editTextUnlockButton.addEventListener('click', () => {
    setEditTextUnlocked(elements.editText.readOnly, { focus: elements.editText.readOnly });
  });
  elements.editText.addEventListener('input', resizeEditTextField);
  elements.editPath.addEventListener('change', () => {
    updateEditPathAgeHint(entries.find(entry => entry.id === elements.editEntryId.value));
  });
  elements.editReturnPickerButton.addEventListener('click', () => {
    openReturnPicker({
      mode: 'edit',
      entryId: elements.editEntryId.value,
      selectedDate: elements.editReturnDate.value
    });
  });
  elements.editTopTodayButton.addEventListener('click', () => {
    setEditTopTodayState(!elements.editTopToday.checked);
  });
  elements.returnPickerCustomForm.addEventListener('submit', event => {
    event.preventDefault();
    applyReturnPickerDate(elements.returnPickerCustomDate.value);
  });
  elements.returnPickerDialog.addEventListener('close', () => {
    activeReturnPicker = null;
  });
  elements.captureReturnChangeButton.addEventListener('click', () => {
    const entry = entries.find(item => item.id === elements.captureReturnChangeButton.dataset.entryId);
    if (!entry) {
      hideCaptureReturnConfirmation();
      return;
    }
    openReturnPicker({ mode: 'entry', entryId: entry.id, selectedDate: entry.followUpDate });
  });
  elements.editAttachmentInput.addEventListener('change', async () => {
    await handleAttachmentFiles(elements.editAttachmentInput.files, editNewAttachments);
    elements.editAttachmentInput.value = '';
  });
  elements.editDeleteButton.addEventListener('click', deleteEditedEntry);
  elements.entryDetailsEdit.addEventListener('click', () => {
    const entryId = activeDetailsEntryId;
    elements.entryDetailsDialog.close();
    if (entryId) openEditDialog(entryId);
  });
  elements.entryDetailsShare.addEventListener('click', () => {
    const entryId = activeDetailsEntryId;
    elements.entryDetailsDialog.close();
    if (entryId) openEntryShareDialog(entryId);
  });
  elements.entryDetailsDialog.addEventListener('close', () => {
    activeDetailsEntryId = null;
  });
  elements.entryShareSystemButton.addEventListener('click', shareActiveEntryText);
  elements.entryShareThingsButton.addEventListener('click', sendActiveEntryToThings);
  elements.entryCopyTextButton.addEventListener('click', copyActiveEntryText);
  elements.entryShareDialog.addEventListener('close', () => {
    activeShareEntryId = null;
  });
  elements.attachmentViewerClose.addEventListener('click', closeImageViewer);
  elements.attachmentViewerZoom.addEventListener('click', toggleImageViewerZoom);
  elements.attachmentViewerImage.addEventListener('click', toggleImageViewerZoom);
  elements.attachmentViewerDownload.addEventListener('click', () => {
    if (activeViewerAttachment) shareOrDownloadAttachment(activeViewerAttachment);
  });
  elements.attachmentViewerDialog.addEventListener('close', resetImageViewer);
  elements.fileViewerClose.addEventListener('click', closeTextFileViewer);
  elements.fileViewerDownload.addEventListener('click', () => {
    if (activeFileViewerAttachment) shareOrDownloadAttachment(activeFileViewerAttachment);
  });
  elements.fileViewerDialog.addEventListener('close', resetTextFileViewer);
  elements.requestPersistenceButton.addEventListener('click', requestPersistence);
  elements.exportJsonButton.addEventListener('click', () => runExport(exportJson, 'لم تُحفظ نسخة JSON.'));
  elements.exportMarkdownButton.addEventListener('click', () => runExport(exportMarkdown, 'لم يُحفظ ملف Markdown.'));
  elements.exportIcloudButton.addEventListener('click', () => runExport(exportIcloudBundle, 'لم تُحفظ حزمة iCloud.'));
  elements.verifyBackupInput.addEventListener('change', () => verifyBackupFiles(elements.verifyBackupInput.files));
  elements.importInput.addEventListener('change', () => importJsonFiles(elements.importInput.files));
  elements.runMigrationButton.addEventListener('click', () => runLegacyMigration());
  elements.skipMigrationButton.addEventListener('click', skipMigration);
  elements.viewTrashButton.addEventListener('click', openTrashDialog);
  elements.restoreTrashButton.addEventListener('click', restoreTrash);
  elements.emptyTrashButton.addEventListener('click', emptyTrash);
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
    document.getElementById(button.dataset.closeDialog)?.close();
  }));
  [elements.topTaskDialog, elements.captureDialog, elements.directionDialog, elements.eveningCloseDialog, elements.returnPickerDialog,
    elements.weeklySessionDialog, elements.editDialog,
    elements.entryDetailsDialog, elements.entryShareDialog, elements.fileViewerDialog, elements.trashDialog, elements.settingsDialog].forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const openDialogs = $$('dialog[open]');
    const dialog = openDialogs[openDialogs.length - 1];
    if (!dialog) return;
    event.preventDefault();
    dialog.close();
  });
  document.addEventListener('click', event => {
    $$('.path-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
    $$('.return-defer-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
    $$('.entry-defer-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });
  window.addEventListener('scroll', queueAttachmentImageFallbackCheck, { passive: true, capture: true });
  window.addEventListener('resize', queueAttachmentImageFallbackCheck, { passive: true });
  window.addEventListener('resize', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });
  document.addEventListener('focusin', () => setTimeout(syncVisualViewport, 40));
  document.addEventListener('focusout', () => setTimeout(syncVisualViewport, 80));
  window.addEventListener('orientationchange', () => {
    visualViewportBaseHeight = window.visualViewport?.height || window.innerHeight;
    setTimeout(syncVisualViewport, 120);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueAttachmentImageFallbackCheck();
  });
  window.addEventListener('beforeunload', () => {
    attachmentImageObserver?.disconnect();
    observedAttachmentImages.forEach(img => takeObservedAttachmentImage(img));
    if (attachmentImageFallbackFrame) cancelAnimationFrame(attachmentImageFallbackFrame);
    if (activeViewerTemporaryUrl) URL.revokeObjectURL(activeViewerTemporaryUrl);
  });
  syncVisualViewport();
}

async function runExport(task, failureMessage) {
  try {
    const result = await task();
    if (!result?.delivered) {
      showToast(failureMessage);
    } else if (!result.confirmed) {
      showToast('بدأ التنزيل، لكن لم يُسجّل كنسخة مؤكدة. تحقق من تطبيق الملفات.');
    }
    return result;
  } catch (error) {
    console.error('فشل التصدير:', error);
    showToast(failureMessage);
    return null;
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
      updateViaCache: 'none'
    });
    await registration.update();
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}

async function init() {
  applyTheme(null);
  bindEvents();
  await openDatabase();
  await refreshData();
  await migrateLegacyReturnDates();
  await cleanOldTrash();
  await attemptAutomaticPersistence();
  updateIcloudStatus();
  await detectLegacyMigration();
  if (!await maybeRemindBackup()) await maybeRemindBackupVerification();
  await registerServiceWorker();
  window.setInterval(refreshForNewDay, 60 * 1000);
}

init().catch(async error => {
  if (error?.code === 'DB_BLOCKED') console.warn(error.message);
  else console.error(error);
  await showNotice('تعذر تشغيل مرساة', storageFailureMessage(error, 'تشغيل مرساة'));
});
})();
