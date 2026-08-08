(() => {
'use strict';

const DB_NAME = 'mersah-daily';
const DB_VERSION = 1;
const LEGACY_DB_NAME = 'mersah-db';
const DAY = 24 * 60 * 60 * 1000;
const TRASH_RETENTION_DAYS = 7;
const BACKUP_REMINDER_DAYS = 7;
const BACKUP_VERIFICATION_REMINDER_DAYS = 90;
const PERSISTENCE_RETRY_DAYS = 30;
const MAX_TEXT_LENGTH = 5000;
const MAX_SHORT_TEXT = 80;
const MAX_DIRECTION_LENGTH = 180;
const MAX_ID_LENGTH = 180;
const MAX_IMPORT_BYTES = 80 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_IMPORT_ENTRIES = 200000;
const MAX_IMPORT_ATTACHMENTS = 200000;
const MAX_PATH_LOG_ENTRIES = 100000;
const HEATMAP_DAYS = 90;
const BACKUP_SCHEMA_VERSION = 3;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ENTRY = 30;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_FUTURE_DRIFT_MS = DAY;
const ENTRY_PAGE_SIZE = 60;
const EXPORT_PART_RAW_BYTES = 12 * 1024 * 1024;

const ENTRY_TYPES = Object.freeze({
  task: 'مهمة',
  note: 'ملاحظة',
  idea: 'فكرة',
  decision: 'قرار',
  reflection: 'انعكاس'
});

const PATHS = Object.freeze({
  untriaged: 'غير مفرز',
  do: 'نفّذ',
  consider: 'للنظر',
  waiting: 'بانتظار',
  reference: 'مرجع'
});

const ROUTABLE_PATHS = Object.freeze({
  consider: 'للنظر',
  do: 'نفّذ',
  waiting: 'بانتظار',
  reference: 'مرجع'
});

const PATH_ICONS = Object.freeze({
  untriaged: '◇',
  do: '☑',
  consider: '✦',
  waiting: '◷',
  reference: '▤'
});

const ROUTABLE_PATH_OPTIONS = Object.freeze({
  consider: '✦ للنظر',
  do: '☑ نفّذ',
  waiting: '◷ بانتظار',
  reference: '▤ مرجع'
});

const STATUSES = Object.freeze({
  open: 'مفتوح',
  done: 'مكتمل',
  closed: 'مغلق',
  trash: 'محذوف'
});

const V0_STATE_MAP = {
  inbox: ['untriaged', 'open'],
  week: ['do', 'open'],
  later: ['consider', 'open'],
  archive: ['reference', 'done'],
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
let attachmentUrlCache = new Map();
let activeViewerAttachment = null;
let activeViewerTemporaryUrl = null;
let observedDayKey = dateKey();
let toastTimer;
let selectedDirectionTimer;
let entriesSearchTimer;
let backupExportDue = false;
let backupVerificationDue = false;
let analysisDataRevision = 0;
let renderedAnalysisRevision = -1;
let renderedAnalysisDay = '';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const elements = {
  settingsButton: $('#settingsButton'),
  todayLabel: $('#todayLabel'),
  todayDate: $('#todayDate'),
  topProgress: $('#topProgress'),
  directionButton: $('#directionButton'),
  directionDisplay: $('#directionDisplay'),
  directionDialog: $('#directionDialog'),
  directionForm: $('#directionForm'),
  directionEditor: $('#directionEditor'),
  topTasksList: $('#topTasksList'),
  quickTaskInput: $('#quickTaskInput'),
  addTopTaskButton: $('#addTopTaskButton'),
  topCandidates: $('#topCandidates'),
  todayTimeline: $('#todayTimeline'),
  loadMoreTodayButton: $('#loadMoreTodayButton'),
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
  editDialog: $('#editDialog'),
  editForm: $('#editForm'),
  editEntryId: $('#editEntryId'),
  editText: $('#editText'),
  editPath: $('#editPath'),
  editPathAge: $('#editPathAge'),
  editDueDate: $('#editDueDate'),
  editEntryAge: $('#editEntryAge'),
  editAttachmentsOptions: $('#editAttachmentsOptions'),
  editTopToday: $('#editTopToday'),
  editExistingAttachments: $('#editExistingAttachments'),
  editAttachmentInput: $('#editAttachmentInput'),
  editNewPreview: $('#editNewPreview'),
  editDeleteButton: $('#editDeleteButton'),
  attachmentViewerDialog: $('#attachmentViewerDialog'),
  attachmentViewerClose: $('#attachmentViewerClose'),
  attachmentViewerTitle: $('#attachmentViewerTitle'),
  attachmentViewerZoom: $('#attachmentViewerZoom'),
  attachmentViewerDownload: $('#attachmentViewerDownload'),
  attachmentViewerStage: $('#attachmentViewerStage'),
  attachmentViewerImage: $('#attachmentViewerImage'),
  confirmDialog: $('#confirmDialog'),
  confirmTitle: $('#confirmTitle'),
  confirmText: $('#confirmText'),
  confirmPreview: $('#confirmPreview'),
  confirmCancel: $('#confirmCancel'),
  confirmAccept: $('#confirmAccept'),
  settingsDialog: $('#settingsDialog'),
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
  restoreTrashButton: $('#restoreTrashButton'),
  emptyTrashButton: $('#emptyTrashButton'),
  toast: $('#toast'),
  toastText: $('#toastText'),
  toastAction: $('#toastAction')
};

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
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
      if (!db.objectStoreNames.contains('daily')) {
        db.createObjectStore('daily', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة البيانات.'));
    request.onblocked = () => reject(new Error('قاعدة البيانات مفتوحة في نافذة أخرى.'));
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
  return runAtomicWrite(['entries', 'daily', 'settings', 'attachments'], (stores, track) => {
    for (const storeName of ['entries', 'daily', 'settings', 'attachments']) {
      for (const value of batch[storeName] || []) {
        track(stores[storeName].put(value));
      }
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
    date: dateKey(safeDate),
    hour: safeDate.getHours(),
    minute: safeDate.getMinutes(),
    timeZone: resolvedTimeZone(),
    utcOffsetMinutes: -safeDate.getTimezoneOffset()
  };
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return dateKey();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function validDateKey(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = dateFromKey(text);
  const normalized = dateKey(d);
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
  return dateKey(date).slice(0, 7);
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

function formatDayMonth(key) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    day: 'numeric',
    month: 'long'
  }).format(dateFromKey(key));
}

function formatDayMonthNumeric(key) {
  const date = dateFromKey(key);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
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
    return new Intl.RelativeTimeFormat('ar', { numeric: 'always' }).format(-difference, 'day');
  }
  return formatDateKey(target);
}

function cardTimestamp(entry) {
  const time = formatEntryTime(entry);
  if (currentView === 'today' || currentView === 'days') return time;
  return `${time} · ${relativeDayLabel(entryDate(entry))}`;
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

function createPathEvent(path, at = nowIso(), stamp = localCreationStamp(at)) {
  return {
    path: validPath(path),
    at,
    localDate: stamp.date,
    timeZone: stamp.timeZone,
    utcOffsetMinutes: stamp.utcOffsetMinutes
  };
}

function pathLogFor(entry) {
  return Array.isArray(entry?.pathLog) ? entry.pathLog : [];
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

function entryDate(entry) {
  return validDateKey(entry?.createdLocal?.date) || dateKey(entry.createdAt);
}

function dailyRecordFor(key) {
  return dailyRecordsByDate.get(key) || null;
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
    if (entry.path === 'reference' || entry.status === 'open') {
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
  entries = entryRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  attachments = attachmentRows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  pruneAttachmentUrlCache();
  dailyRecords = dailyRows.sort((a, b) => b.date.localeCompare(a.date));
  settings = settingRows;
  settingsMap = new Map(settingRows.map(setting => [setting.key, setting.value]));
  rebuildDataIndexes();
  analysisDataRevision += 1;
  renderAll();
}

function renderAll() {
  renderStaticOptions();
  renderSettingsState();
  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === 'entries') renderEntries();
  else if (currentView === 'days') renderDays();
  else renderToday();
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
  elements.todayLabel.textContent = dayName(today);
  elements.todayDate.textContent = `${formatDayMonth(today)} · ${formatDayMonthNumeric(today)}`;
  renderTopProgress(top);
  elements.directionDisplay.textContent = record?.direction || 'حدد توجّه اليوم';
  elements.addTopTaskButton.disabled = top.length >= 3;
  renderTopTasks(today, top);
  renderTodayTimeline(today);
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
    elements.topTasksList.replaceChildren(emptyNode('لا توجد مهام عليا بعد. أضف مهمة من مسار «نفّذ».'));
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
      const marker = document.createElement('span');
      marker.className = 'chip';
      marker.textContent = formatDate(entry.createdAt);
      const title = document.createElement('p');
      title.className = 'entry-title';
      title.dir = 'auto';
      title.textContent = entry.text || 'إدخال بلا نص';
      const add = document.createElement('button');
      add.className = 'secondary-btn small-btn';
      add.textContent = 'إضافة';
      add.disabled = !canAddTop(dayKey);
      add.addEventListener('click', () => setTopToday(entry.id, dayKey));
      row.append(marker, title, add);
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
  remove.className = 'action-link danger';
  remove.textContent = '×';
  remove.title = 'إزالة من أهم المهام';
  remove.setAttribute('aria-label', 'إزالة من أهم المهام');
  remove.addEventListener('click', () => setTopToday(entry.id, null));

  row.append(checkTarget, remove);
  return row;
}

function renderTodayTimeline(dayKey) {
  const list = entriesForDate(dayKey);
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
    formatDate(entry.createdAt),
    entry.dueDate,
    entry.followUpDate
  ].filter(Boolean).join(' '));
}

function renderEntries() {
  renderAnalysisSummary();
  const query = clampString(elements.entriesSearchInput.value, 200);
  const terms = normalizeArabic(query).split(' ').filter(Boolean);
  const from = validDateKey(elements.entriesDateFrom.value) || '';
  const to = validDateKey(elements.entriesDateTo.value) || '';
  const sort = ['newest', 'oldest', 'due'].includes(elements.entriesSort.value)
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

function pathEventDate(event) {
  return validDateKey(event?.localDate) || dateKey(event?.at);
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
        return event.path === 'consider' && eventDay >= cutoff && eventDay <= today;
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
  renderedAnalysisRevision = analysisDataRevision;
  renderedAnalysisDay = today;
}

function renderPathBacklog() {
  const activeEntries = entries.filter(entry => entry.status !== 'trash');
  const counts = Object.fromEntries(Object.keys(ROUTABLE_PATHS).map(path => [path, 0]));
  activeEntries.forEach(entry => {
    if (hasOwn(counts, entry.path)) counts[entry.path] += 1;
  });
  const maxCount = Math.max(1, ...Object.values(counts));
  elements.pathBacklogSummary.textContent = activeEntries.length
    ? `للنظر ${counts.consider} · بانتظار ${counts.waiting}`
    : 'لا إدخالات';

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
    const icon = document.createElement('span');
    icon.textContent = PATH_ICONS[path];
    icon.setAttribute('aria-hidden', 'true');
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
      renderEntries();
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
  const shortLabels = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
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

function renderEntriesPathFilters(total, pathCounts) {
  const options = [
    ['all', 'الكل', ''],
    ...Object.entries(ROUTABLE_PATHS).map(([path, label]) => [path, label, PATH_ICONS[path]])
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
      const iconNode = document.createElement('span');
      iconNode.className = 'entries-path-icon';
      iconNode.textContent = icon;
      iconNode.setAttribute('aria-hidden', 'true');
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
  if (sort === 'due') {
    return sorted.sort((a, b) => {
      const aDue = validDateKey(a.dueDate) || '9999-12-31';
      const bDue = validDateKey(b.dueDate) || '9999-12-31';
      return aDue.localeCompare(bDue) || new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function entriesSortLabel(sort) {
  if (sort === 'oldest') return 'الأقدم';
  if (sort === 'due') return 'أقرب موعد';
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
    if (record.direction || record.topEntryIds?.length) set.add(record.date);
  });
  return [...set]
    .filter(key => validDateKey(key) && key.startsWith(`${month}-`))
    .sort((a, b) => b.localeCompare(a));
}

function archiveActivityMonths() {
  const months = new Set([dateKey().slice(0, 7)]);
  entriesByDate.forEach((_, key) => months.add(key.slice(0, 7)));
  dailyRecords.forEach(record => {
    if (record.direction || record.topEntryIds?.length) months.add(record.date.slice(0, 7));
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
  elements.selectedDayDirection.readOnly = !isToday && !selectedDayEditUnlocked;
  elements.editDayButton.hidden = isToday || selectedDayEditUnlocked;
  if (document.activeElement !== elements.selectedDayDirection) {
    elements.selectedDayDirection.value = record?.direction || '';
  }
  elements.selectedDayDirectionStatus.textContent = elements.selectedDayDirection.readOnly
    ? 'لتحرير يوم سابق اضغط «تحرير اليوم».'
    : 'يحفظ تلقائيًا.';

  const topWrap = document.createElement('section');
  topWrap.className = 'stack';
  const topTitle = document.createElement('h3');
  topTitle.textContent = 'أهم المهام';
  const topList = document.createElement('div');
  topList.className = 'top-list';
  const top = topEntriesFor(key);
  topList.replaceChildren(...(top.length ? top.map(entry => createTopTaskElement(entry, key)) : [emptyNode('لا توجد مهام عليا لهذا اليوم.')]));
  topWrap.append(topTitle, topList);

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
  elements.selectedDayContent.replaceChildren(topWrap, timeline);
}

function renderEntryList(container, list, emptyMessage) {
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

  const text = document.createElement('p');
  text.className = 'entry-text';
  text.dir = 'auto';
  text.textContent = entry.text || attachmentOnlyLabel(entry);

  const heading = document.createElement('div');
  heading.className = 'entry-heading';
  heading.append(createPathMenu(entry), text);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(metaText(cardTimestamp(entry)));
  const age = chip(`⏳ ${ageDaysLabel(entryAgeDays(entry))}`, 'age-chip');
  age.title = 'العمر منذ إضافة الالتقاط';
  age.setAttribute('aria-label', `العمر منذ إضافة الالتقاط: ${ageDaysLabel(entryAgeDays(entry))}`);
  meta.append(age);
  if (entry.status !== 'open') {
    const statusIcon = entry.status === 'done' ? '✓' : '●';
    meta.append(iconChip(statusIcon, STATUSES[entry.status] || entry.status, `status-${entry.status}`));
  }
  if (entry.dueDate) {
    meta.append(chip(`⏱ ${relativeDayLabel(entry.dueDate)}`, entry.dueDate < dateKey() ? 'overdue' : ''));
  }
  if (entry.topTodayDate) meta.append(iconChip('★', 'ضمن أهم المهام', 'top-marker'));

  const imageRow = createAttachmentRow(entry.id);
  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  appendEntryActions(actions, entry);
  article.append(heading, meta);
  if (imageRow) article.append(imageRow);
  article.append(actions);
  return article;
}

function metaText(text) {
  const span = document.createElement('span');
  span.className = 'meta-text';
  span.textContent = text;
  return span;
}

function chip(text, extraClass = '') {
  const span = document.createElement('span');
  span.className = `chip ${extraClass}`.trim();
  span.textContent = text;
  return span;
}

function iconChip(icon, label, extraClass = '') {
  const span = chip(icon, extraClass);
  span.title = label;
  span.setAttribute('aria-label', label);
  return span;
}

function createPathMenu(entry) {
  const details = document.createElement('details');
  details.className = 'path-menu';
  const summary = document.createElement('summary');
  summary.className = `chip path-${entry.path}`;
  const currentLabel = PATHS[entry.path] || entry.path;
  const currentIcon = document.createElement('span');
  currentIcon.className = 'path-menu-icon';
  currentIcon.textContent = PATH_ICONS[entry.path] || '◇';
  currentIcon.setAttribute('aria-hidden', 'true');
  summary.append(currentIcon);
  summary.title = currentLabel;
  summary.setAttribute('aria-label', `تغيير المسار الحالي: ${currentLabel}`);

  const options = document.createElement('div');
  options.className = 'path-menu-options';
  Object.entries(ROUTABLE_PATHS)
    .filter(([path]) => path !== entry.path)
    .forEach(([path, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `path-menu-option path-${path}`;
      const optionIcon = document.createElement('span');
      optionIcon.className = 'path-option-icon';
      optionIcon.textContent = PATH_ICONS[path];
      optionIcon.setAttribute('aria-hidden', 'true');
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
    if (temporary) {
      const url = temporaryAttachmentUrl(attachment);
      img.src = url;
      img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
      img.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
    } else {
      img.src = attachmentUrl(attachment);
    }
    open.addEventListener('click', () => openImageViewer(attachment, { temporary }));
    open.append(img);
    wrap.append(open);
  } else {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'attachment-file-open';
    const name = safeAttachmentName(attachment.name);
    open.setAttribute('aria-label', `مشاركة أو تنزيل المرفق ${name}`);
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
    size.textContent = formatBytes(Number(attachment.size || attachment.blob?.size || 0));
    copy.append(nameNode, size);
    const action = document.createElement('span');
    action.className = 'attachment-file-action';
    action.textContent = '⇩';
    action.setAttribute('aria-hidden', 'true');
    open.append(badge, copy, action);
    open.addEventListener('click', () => shareOrDownloadAttachment(attachment));
    wrap.append(open);
  }

  if (removeHandler) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attachment-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `إزالة المرفق ${safeAttachmentName(attachment.name)}`);
    remove.addEventListener('click', () => removeHandler(attachment.id));
    wrap.append(remove);
  }
  return wrap;
}

function attachmentUrl(attachment) {
  const signature = `${attachment.size || attachment.blob?.size || 0}:${attachment.createdAt || ''}`;
  const cached = attachmentUrlCache.get(attachment.id);
  if (cached?.signature === signature) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(attachment.blob);
  attachmentUrlCache.set(attachment.id, { signature, url });
  return url;
}

function openImageViewer(attachment, { temporary = false } = {}) {
  if (!isPreviewableImage(attachment)) return;
  if (activeViewerTemporaryUrl) URL.revokeObjectURL(activeViewerTemporaryUrl);
  activeViewerAttachment = attachment;
  activeViewerTemporaryUrl = temporary ? temporaryAttachmentUrl(attachment) : null;
  elements.attachmentViewerImage.src = activeViewerTemporaryUrl || attachmentUrl(attachment);
  elements.attachmentViewerImage.alt = safeAttachmentName(attachment.name, 'صورة مرفقة');
  elements.attachmentViewerImage.classList.remove('zoomed');
  elements.attachmentViewerTitle.textContent = safeAttachmentName(attachment.name, 'صورة');
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

async function shareOrDownloadAttachment(attachment) {
  if (!(attachment?.blob instanceof Blob)) {
    showToast('تعذر قراءة المرفق.');
    return;
  }
  const name = safeAttachmentName(attachment.name);
  const type = normalizedAttachmentType(attachment.type || attachment.blob.type);
  const file = new File([attachment.blob], name, { type });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.warn('تعذرت مشاركة المرفق، سيُنزّل بدلًا من ذلك:', error);
  }
  const downloadBlob = new Blob([attachment.blob], { type: 'application/octet-stream' });
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

function pruneAttachmentUrlCache() {
  const liveIds = new Set(attachments.map(attachment => attachment.id));
  attachmentUrlCache.forEach((cached, id) => {
    if (liveIds.has(id)) return;
    URL.revokeObjectURL(cached.url);
    attachmentUrlCache.delete(id);
  });
}

function appendEntryActions(container, entry) {
  if (entry.status === 'open') {
    if (entry.type === 'task' || entry.path === 'do') {
      container.append(actionButton('إكمال', () => setEntryStatus(entry.id, 'done'), 'primary', '✓'));
    }
    if (entry.path === 'consider') {
      container.append(actionButton('إغلاق', () => setEntryStatus(entry.id, 'closed'), '', '✓'));
    }
    if (entry.path === 'waiting') {
      container.append(actionButton('عاد إليّ', () => updateEntry(entry.id, { path: 'do' }), 'primary', '↩'));
    }
  } else if (entry.status === 'done' || entry.status === 'closed') {
    container.append(actionButton('إعادة فتح', () => setEntryStatus(entry.id, 'open'), 'primary', '↻'));
  }

  const today = dateKey();
  if (entry.topTodayDate === today) {
    container.append(actionButton('إزالة من أهم اليوم', () => setTopToday(entry.id, null, today), 'top', '★'));
  } else if (entry.status !== 'trash') {
    const add = actionButton('أهم اليوم', () => setTopToday(entry.id, today), 'top', '☆');
    add.disabled = !canAddTop(today, entry.id);
    container.append(add);
  }

  container.append(
    actionButton('تحرير', () => openEditDialog(entry.id), '', '✎'),
    actionButton('حذف', () => trashEntry(entry.id), 'danger', '⌫')
  );
}

function actionButton(label, handler, className = '', symbol = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `action-link ${className}`.trim();
  button.textContent = symbol || label;
  if (symbol) {
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
  const entry = {
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
    followUpDate: validDateKey(data.followUpDate),
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
  const nextEntries = [entry, ...entries.filter(item => item.id !== entry.id)];
  const dailyRecord = entry.topTodayDate
    ? dailyTopRecordForEntries(entry.topTodayDate, nextEntries, now)
    : null;
  await runAtomicWrite(
    ['entries', 'attachments', ...(dailyRecord ? ['daily'] : [])],
    (stores, track) => {
      track(stores.entries.put(entry));
      attachmentRows.forEach(attachment => track(stores.attachments.put(attachment)));
      if (dailyRecord) track(stores.daily.put(dailyRecord));
    }
  );
  entries = nextEntries;
  await refreshData();
  return entry;
}

async function updateEntry(id, patch) {
  const current = entries.find(entry => entry.id === id);
  if (!current) return null;
  const nextTopDate = patch.topTodayDate === undefined ? current.topTodayDate : validDateKey(patch.topTodayDate);
  if (nextTopDate && nextTopDate !== current.topTodayDate && !canAddTop(nextTopDate, id)) {
    showToast('لا يمكن إضافة مهمة رابعة إلى أهم اليوم.');
    return null;
  }
  const updated = buildUpdatedEntry(current, patch);
  await persistEntryUpdate(current, updated);
  await refreshData();
  return updated;
}

function buildUpdatedEntry(current, patch) {
  const now = nowIso();
  const status = patch.status ? validStatus(patch.status) : current.status;
  const path = patch.path ? validPath(patch.path) : current.path;
  const nextTopDate = patch.topTodayDate === undefined ? current.topTodayDate : validDateKey(patch.topTodayDate);
  const currentPathLog = pathLogFor(current);
  const pathLog = path === current.path
    ? currentPathLog
    : [...currentPathLog, createPathEvent(path, now)];
  return {
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
}

async function persistEntryUpdate(current, updated, { addedAttachments = [], removedAttachmentIds = [] } = {}) {
  const nextEntries = entries.map(entry => entry.id === current.id ? updated : entry);
  const datesToSync = [current.topTodayDate, updated.topTodayDate].filter(Boolean);
  const dailyUpdates = [...new Set(datesToSync)]
    .map(day => dailyTopRecordForEntries(day, nextEntries, updated.updatedAt));
  const needsAttachments = addedAttachments.length > 0 || removedAttachmentIds.length > 0;
  const storeNames = ['entries', ...(dailyUpdates.length ? ['daily'] : []), ...(needsAttachments ? ['attachments'] : [])];
  await runAtomicWrite(storeNames, (stores, track) => {
    track(stores.entries.put(updated));
    dailyUpdates.forEach(record => track(stores.daily.put(record)));
    removedAttachmentIds.forEach(id => track(stores.attachments.delete(id)));
    addedAttachments.forEach(attachment => track(stores.attachments.put(attachment)));
  });
  entries = nextEntries;
}

async function setEntryStatus(id, status) {
  await updateEntry(id, { status });
}

async function setTopToday(id, day) {
  const entry = entries.find(item => item.id === id);
  if (!entry) return;
  const patch = { topTodayDate: day };
  if (day && entry.path === 'untriaged') patch.path = 'do';
  if (day && entry.type !== 'task') patch.type = 'task';
  await updateEntry(id, patch);
}

// تأكيد بورقة سفلية بدل confirm() الأصلي: يتّسق مع الواجهة،
// ويعرض نص الإدخال حتى يرى المستخدم ما يحذفه قبل أن يؤكّد.
function askConfirm({ title = 'تأكيد', message, preview = '', accept = 'حذف', danger = true }) {
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
    setTimeout(() => elements.confirmCancel.focus(), 60);
  });
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
}

async function saveDailyDirection(day, value, statusElement) {
  const current = dailyRecordFor(day);
  const now = nowIso();
  try {
    await putRecord('daily', {
      date: day,
      direction: clampString(value, MAX_DIRECTION_LENGTH),
      topEntryIds: topEntriesFor(day).map(entry => entry.id),
      createdAt: current?.createdAt || now,
      updatedAt: now
    });
    if (statusElement) {
      statusElement.textContent = 'تم الحفظ.';
      setTimeout(() => { statusElement.textContent = 'يحفظ تلقائيًا.'; }, 1500);
    }
    await refreshData();
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

function openCaptureDialog() {
  resetCaptureForm();
  elements.captureDialog.showModal();
  setTimeout(() => elements.captureText.focus(), 80);
}

function resetCaptureForm() {
  captureDraftAttachments = [];
  elements.captureForm.reset();
  renderAttachmentPreview(elements.capturePreview, captureDraftAttachments, removeCaptureDraftAttachment);
}

async function handleCaptureSubmit(event) {
  event.preventDefault();
  let entry;
  try {
    entry = await createEntry({
      text: elements.captureText.value,
      type: 'note',
      path: 'consider',
      status: 'open',
      context: '',
      person: '',
      dueDate: null,
      followUpDate: null,
      topTodayDate: null
    }, captureDraftAttachments);
  } catch (error) {
    reportStorageFailure(error, 'حفظ الالتقاط');
    return;
  }
  if (!entry) return;
  elements.captureDialog.close();
  showToast('تم الحفظ.', 'تراجع', async () => {
    await deleteEntryCompletely(entry.id);
    await refreshData();
  }, 6000);
}

async function deleteEntryCompletely(entryId) {
  const current = entries.find(entry => entry.id === entryId);
  const nextEntries = entries.filter(entry => entry.id !== entryId);
  const dailyRecord = current?.topTodayDate
    ? dailyTopRecordForEntries(current.topTodayDate, nextEntries)
    : null;
  await runAtomicWrite(
    ['entries', 'attachments', ...(dailyRecord ? ['daily'] : [])],
    (stores, track) => {
      attachmentsFor(entryId).forEach(item => track(stores.attachments.delete(item.id)));
      track(stores.entries.delete(entryId));
      if (dailyRecord) track(stores.daily.put(dailyRecord));
    }
  );
  entries = nextEntries;
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
  if (!list.length) {
    container.replaceChildren();
    return;
  }
  container.replaceChildren(...list.map(item => createAttachmentTile(item, {
    temporary: true,
    removeHandler
  })));
}

function removeCaptureDraftAttachment(id) {
  captureDraftAttachments = captureDraftAttachments.filter(item => item.id !== id);
  renderAttachmentPreview(elements.capturePreview, captureDraftAttachments, removeCaptureDraftAttachment);
}

function removeEditNewAttachment(id) {
  editNewAttachments = editNewAttachments.filter(item => item.id !== id);
  renderAttachmentPreview(elements.editNewPreview, editNewAttachments, removeEditNewAttachment);
}

function openEditDialog(entryId) {
  const entry = entries.find(item => item.id === entryId);
  if (!entry) return;
  editNewAttachments = [];
  editRemovedAttachmentIds = new Set();
  elements.editEntryId.value = entry.id;
  elements.editText.value = entry.text || '';
  elements.editPath.value = hasOwn(ROUTABLE_PATHS, entry.path) ? entry.path : 'consider';
  updateEditPathAgeHint(entry);
  elements.editDueDate.value = entry.dueDate || '';
  elements.editEntryAge.querySelector('strong').textContent = ageDaysLabel(entryAgeDays(entry));
  elements.editTopToday.checked = entry.topTodayDate === dateKey();
  elements.editAttachmentsOptions.open = !entry.text && attachmentsFor(entry.id).length > 0;
  renderExistingAttachments(entry.id);
  renderAttachmentPreview(elements.editNewPreview, editNewAttachments, removeEditNewAttachment);
  elements.editDialog.showModal();
  setTimeout(() => elements.editText.focus(), 80);
}

function updateEditPathAgeHint(entry) {
  if (!entry) return;
  if (elements.editPath.value !== entry.path) {
    elements.editPathAge.textContent = 'يبدأ توثيق المسار الجديد عند حفظ التعديل.';
    return;
  }
  const age = currentPathAgeDays(entry);
  elements.editPathAge.textContent = age == null
    ? 'مدة هذا المسار غير متاحة قبل بدء سجل الانتقالات.'
    : `في هذا المسار منذ ${ageDaysLabel(age)}.`;
}

function renderExistingAttachments(entryId) {
  const list = attachmentsFor(entryId).filter(item => !editRemovedAttachmentIds.has(item.id));
  if (!list.length) {
    elements.editExistingAttachments.replaceChildren(emptyNode('لا توجد مرفقات حالية.'));
    return;
  }
  elements.editExistingAttachments.replaceChildren(...list.map(item => createAttachmentTile(item, {
    removeHandler: () => {
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
  const updated = buildUpdatedEntry(current, {
    text,
    path: elements.editPath.value,
    dueDate: elements.editDueDate.value,
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
  try {
    await persistEntryUpdate(current, updated, {
      addedAttachments,
      removedAttachmentIds: [...editRemovedAttachmentIds]
    });
    await refreshData();
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
  for (const entry of expired) await deleteEntryCompletely(entry.id);
  if (expired.length) await refreshData();
}

function renderSettingsState() {
  const trash = entries.filter(entry => entry.status === 'trash');
  elements.trashStatus.textContent = trash.length
    ? `${trash.length} عناصر؛ تُحذف نهائيًا بعد ${TRASH_RETENTION_DAYS} أيام.`
    : 'لا توجد عناصر محذوفة.';
  elements.restoreTrashButton.disabled = !trash.length;
  elements.emptyTrashButton.disabled = !trash.length;
}

async function restoreTrash() {
  const trash = entries.filter(entry => entry.status === 'trash');
  const now = nowIso();
  await putMany('entries', trash.map(entry => ({ ...entry, status: 'open', deletedAt: null, updatedAt: now })));
  await refreshData();
  showToast(`تمت استعادة ${trash.length} عناصر.`);
}

async function emptyTrash() {
  const trash = entries.filter(entry => entry.status === 'trash');
  if (!trash.length) return;
  const ok = await askConfirm({
    title: 'إفراغ المحذوفات',
    message: `سيُحذف ${trash.length} إدخالًا نهائيًا. لا يمكن التراجع.`,
    accept: 'إفراغ نهائيًا'
  });
  if (!ok) return;
  for (const entry of trash) await deleteEntryCompletely(entry.id);
  await refreshData();
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
    backupVerificationDue = entries.length > 0 || dailyRecords.some(record => record.direction);
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
  const hasUserData = entries.length > 0 || dailyRecords.some(record => record.direction);
  if (!hasUserData || !await updateBackupStatus()) return false;
  const lastReminderAt = await getSetting('lastBackupReminderAt');
  if (lastReminderAt && validIso(lastReminderAt)
      && Date.now() - new Date(lastReminderAt).getTime() < DAY) return true;
  await putSetting('lastBackupReminderAt', nowIso());
  showToast('حان إنشاء نسخة احتياطية مؤكدة.', 'نسخ الآن', openSettingsDialog, 9000);
  return true;
}

async function maybeRemindBackupVerification() {
  const hasUserData = entries.length > 0 || dailyRecords.some(record => record.direction);
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

  for (let index = 0; index < total; index += 1) {
    const attachmentRows = [];
    for (const attachment of groups[index]) {
      attachmentRows.push(await attachmentExportMetadata(attachment));
    }
    const payload = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      app: 'Mersah Daily',
      exportedAt,
      backupId,
      backupPart: { index: index + 1, total },
      entries: index === 0 ? entries : [],
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
      attachmentRows.push(await attachmentToExport(
        descriptor.group[attachmentIndex],
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
    .replace(/([\\`*_{}\[\]()#+.!|-])/g, '\\$1');
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
    if (!confirm(`دمج ${entryCount} إدخالًا و${attachmentCount} مرفقًا (${formatBytes(totalBytes)})${partsText}؟${integrityText} السجل الأحدث في updatedAt يفوز.`)) return;
    const importBatch = { entries: [], attachments: [], daily: [], settings: [] };
    for (const descriptor of ordered) {
      const batch = await normalizeImportPayload(descriptor.data, { verifyAttachmentIntegrity: false });
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
      alert('تم استيراد البيانات كاملة، لكن تعذر تحديث حالة الفحص. أعد فتح التطبيق وتحقق من العدد.');
    } else {
      alert(isQuotaExceededError(error)
        ? `${storageFailureMessage(error, 'استيراد النسخة')} لم يُستورد أي سجل.`
        : `تعذر الاستيراد: ${error.message || 'ملف غير صالح'}`);
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
      await normalizeImportPayload(descriptor.data, { verifyAttachmentIntegrity: false });
    }
    await recordBackupVerification(report);
    const partsText = report.ordered.length > 1 ? ` · ${report.ordered.length} أجزاء` : '';
    if (report.integrityVerified) {
      alert(`النسخة سليمة ببصمات SHA-256.\nالإدخالات: ${report.entryCount} · الأيام: ${report.dailyCount} · المرفقات: ${report.attachmentCount}${partsText}\nتم التحقق من كل مرفق ومن الأجزاء والحزمة، ولم تُدمج أو تتغيّر بياناتك.`);
    } else {
      alert(`اجتازت النسخة الفحص البنيوي فقط.\nالإدخالات: ${report.entryCount} · الأيام: ${report.dailyCount} · المرفقات: ${report.attachmentCount}${partsText}\nهذه نسخة قديمة بلا بصمات SHA-256؛ لا يمكن ضمان سلامة بايتات المرفقات، ولم تُدمج أو تتغيّر بياناتك.`);
    }
  } catch (error) {
    alert(`فشل فحص النسخة: ${error.message || 'ملف غير صالح'}`);
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
    await validateImportedAttachments(descriptor.data, descriptor.file.name);
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

async function normalizeImportPayload(data, { verifyAttachmentIntegrity = true } = {}) {
  if (!data || typeof data !== 'object') throw new Error('ملف النسخة غير صالح.');
  if (Array.isArray(data.cards) && Array.isArray(data.outcomes)) return normalizeV0Import(data.cards);
  const schemaVersion = importedBackupSchemaVersion(data);
  if (!Array.isArray(data.entries)) throw new Error('لا توجد entries في النسخة.');
  if (data.entries.length > MAX_IMPORT_ENTRIES) throw new Error(`النسخة تحتوي أكثر من ${MAX_IMPORT_ENTRIES} إدخالات.`);
  const importedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  if (importedAttachments.length > MAX_IMPORT_ATTACHMENTS) throw new Error(`النسخة تحتوي أكثر من ${MAX_IMPORT_ATTACHMENTS} مرفقات.`);

  const normalizedAttachments = [];
  for (let index = 0; index < importedAttachments.length; index += 1) {
    normalizedAttachments.push(await sanitizeImportedAttachment(importedAttachments[index], {
      schemaVersion,
      verifyDigest: verifyAttachmentIntegrity,
      label: `المرفق ${index + 1}`
    }));
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
  let previousTime = -Infinity;
  let previousPath = null;
  const createdTime = new Date(createdAt).getTime();
  const updatedTime = new Date(updatedAt).getTime();
  const log = value.map((event, index) => {
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

function sanitizeImportedEntry(entry, label = 'الإدخال') {
  const createdAt = validIso(entry?.createdAt) || nowIso();
  const updatedAt = validIso(entry?.updatedAt) || createdAt;
  if (new Date(updatedAt).getTime() < new Date(createdAt).getTime()) {
    throw new Error(`${label}: updatedAt يسبق createdAt.`);
  }
  const path = validPath(entry?.path);
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
  if (Array.isArray(data.cards) && Array.isArray(data.outcomes)) return;
  const schemaVersion = importedBackupSchemaVersion(data, fileName);
  const importedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  let validCount = 0;
  for (let index = 0; index < importedAttachments.length; index += 1) {
    await sanitizeImportedAttachment(importedAttachments[index], {
      schemaVersion,
      verifyDigest: true,
      label: `${fileName}: المرفق ${index + 1}`
    });
    validCount += 1;
  }
  if (validCount !== importedAttachments.length) {
    throw new Error(`${fileName}: عدد المرفقات المقروءة (${validCount}) لا يطابق العدد المعلن (${importedAttachments.length}).`);
  }
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

function sanitizeImportedDaily(record) {
  const key = validDateKey(record?.date);
  if (!key) return null;
  const createdAt = validIso(record?.createdAt) || nowIso();
  return {
    date: key,
    direction: clampString(record?.direction, MAX_DIRECTION_LENGTH),
    topEntryIds: Array.isArray(record?.topEntryIds) ? record.topEntryIds.map(id => safeId(id, 'entry')).slice(0, 3) : [],
    createdAt,
    updatedAt: validIso(record?.updatedAt) || createdAt
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
    if (!confirm(`استيراد ${batch.entries.length} عناصر من v0؟`)) return;
    await writeImportBatch(batch);
    migrationCommitted = true;
    await putSetting('legacyMigrationChoice', 'imported');
    await refreshData();
    setMigrationStatus(name, 'imported');
    showToast('اكتملت هجرة v0.');
  } catch (error) {
    if (migrationCommitted) {
      alert('تم استيراد عناصر v0 كاملة، لكن تعذر تسجيل اكتمال الهجرة. تحقق من العدد قبل إعادة المحاولة.');
    } else {
      alert(isQuotaExceededError(error)
        ? `${storageFailureMessage(error, 'هجرة v0')} لم يُستورد أي سجل.`
        : `تعذرت هجرة v0: ${error.message || 'خطأ غير معروف'}`);
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
  currentView = name;
  showOnlyView(name);
  renderCurrentView();
  if (changed) window.scrollTo(0, 0);
}

function showToast(message, actionLabel = '', action = null, duration = 3500) {
  clearTimeout(toastTimer);
  elements.toastText.textContent = message;
  if (actionLabel && action) {
    elements.toastAction.hidden = false;
    elements.toastAction.textContent = actionLabel;
    elements.toastAction.onclick = async () => {
      elements.toast.classList.remove('visible');
      await action();
    };
  } else {
    elements.toastAction.hidden = true;
    elements.toastAction.onclick = null;
  }
  elements.toast.classList.add('visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), duration);
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
  $$('.nav-btn[data-target]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.target)));
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
  elements.editPath.addEventListener('change', () => {
    updateEditPathAgeHint(entries.find(entry => entry.id === elements.editEntryId.value));
  });
  elements.editAttachmentInput.addEventListener('change', async () => {
    await handleAttachmentFiles(elements.editAttachmentInput.files, editNewAttachments);
    elements.editAttachmentInput.value = '';
  });
  elements.editDeleteButton.addEventListener('click', deleteEditedEntry);
  elements.attachmentViewerClose.addEventListener('click', closeImageViewer);
  elements.attachmentViewerZoom.addEventListener('click', toggleImageViewerZoom);
  elements.attachmentViewerImage.addEventListener('click', toggleImageViewerZoom);
  elements.attachmentViewerDownload.addEventListener('click', () => {
    if (activeViewerAttachment) shareOrDownloadAttachment(activeViewerAttachment);
  });
  elements.attachmentViewerDialog.addEventListener('close', resetImageViewer);
  elements.requestPersistenceButton.addEventListener('click', requestPersistence);
  elements.exportJsonButton.addEventListener('click', () => runExport(exportJson, 'لم تُحفظ نسخة JSON.'));
  elements.exportMarkdownButton.addEventListener('click', () => runExport(exportMarkdown, 'لم يُحفظ ملف Markdown.'));
  elements.exportIcloudButton.addEventListener('click', () => runExport(exportIcloudBundle, 'لم تُحفظ حزمة iCloud.'));
  elements.verifyBackupInput.addEventListener('change', () => verifyBackupFiles(elements.verifyBackupInput.files));
  elements.importInput.addEventListener('change', () => importJsonFiles(elements.importInput.files));
  elements.runMigrationButton.addEventListener('click', () => runLegacyMigration());
  elements.skipMigrationButton.addEventListener('click', skipMigration);
  elements.restoreTrashButton.addEventListener('click', restoreTrash);
  elements.emptyTrashButton.addEventListener('click', emptyTrash);
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
    document.getElementById(button.dataset.closeDialog)?.close();
  }));
  [elements.captureDialog, elements.directionDialog, elements.editDialog, elements.settingsDialog].forEach(dialog => {
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
  });
  window.addEventListener('beforeunload', () => {
    if (activeViewerTemporaryUrl) URL.revokeObjectURL(activeViewerTemporaryUrl);
    attachmentUrlCache.forEach(cached => URL.revokeObjectURL(cached.url));
    attachmentUrlCache.clear();
  });
}

async function runExport(task, failureMessage) {
  try {
    const result = await task();
    if (!result?.delivered) {
      showToast(failureMessage);
    } else if (!result.confirmed) {
      showToast('بدأ التنزيل، لكن لم يُسجّل كنسخة مؤكدة. تحقق من تطبيق الملفات.');
    }
  } catch (error) {
    console.error('فشل التصدير:', error);
    showToast(failureMessage);
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
  bindEvents();
  await openDatabase();
  await refreshData();
  await cleanOldTrash();
  await attemptAutomaticPersistence();
  updateIcloudStatus();
  await detectLegacyMigration();
  if (!await maybeRemindBackup()) await maybeRemindBackupVerification();
  await registerServiceWorker();
  window.setInterval(refreshForNewDay, 60 * 1000);
}

init().catch(error => {
  console.error(error);
  alert('تعذر تشغيل مرساة. حدّث الصفحة أو تأكد من سماح المتصفح بالتخزين المحلي.');
});
})();
