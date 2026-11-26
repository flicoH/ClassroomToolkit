import { createUuid } from "./id";

const keyPrefix = "report-draft-recovery:v1:";
const tabKey = "report-draft-recovery-tab";
const approvalKey = "report-draft-recovery-approved";
const draftLifetime = 24 * 60 * 60 * 1000;

export const reportDraftReturnPath = "/?resumeReport=1";
const reportWindows = { semester: "semesterReportStudio", subject: "subjectReports" } as const;
export type ReportDraftKind = keyof typeof reportWindows;
const kinds = Object.keys(reportWindows) as ReportDraftKind[];

export type PendingReportDraft = { id: string; savedAt: number; form: unknown };
type StoredReportDrafts = {
  version: 1;
  teacherId: string;
  preferred: ReportDraftKind;
  drafts: Partial<Record<ReportDraftKind, PendingReportDraft>>;
};
type ActiveDraft = { teacherId: string; form: object; editedAt?: number };
const sources = new Map<ReportDraftKind, () => ActiveDraft | undefined>();

export function registerReportDraft(kind: ReportDraftKind, capture: () => ActiveDraft | undefined) {
  sources.set(kind, capture);
  return () => {
    if (sources.get(kind) === capture) sources.delete(kind);
  };
}

function currentStorageKey() {
  const tabId = sessionStorage.getItem(tabKey);
  return tabId ? keyPrefix + tabId : undefined;
}

export function isDraftRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDraftText(value: unknown): value is string {
  return typeof value === "string";
}

export function isDraftList<T>(value: unknown, item: (value: unknown) => value is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}

export function isDraftMap<T>(value: unknown, item: (value: unknown) => value is T): value is Record<string, T> {
  return isDraftRecord(value) && Object.values(value).every(item);
}

/** Serialized forms also carry empty and unfinished input. Validate shape before applying business rules. */
export function readReportDraftForm<T extends object>(
  value: unknown,
  defaults: T,
  validate: (form: Record<string, unknown>) => boolean
): T | undefined {
  if (!isDraftRecord(value) || !validate(value)) return undefined;
  const fields = Object.keys(defaults) as Array<keyof T & string>;
  if (
    !fields.every(
      key =>
        (Array.isArray(defaults[key]) ? Array.isArray(value[key]) : typeof value[key] === typeof defaults[key]) ||
        (key === "lessonNumber" && typeof value[key] === "number")
    )
  )
    return undefined;
  return Object.fromEntries(fields.map(key => [key, value[key]])) as T;
}

function writeDrafts(key: string, record: StoredReportDrafts) {
  if (kinds.some(kind => record.drafts[kind])) localStorage.setItem(key, JSON.stringify(record));
  else localStorage.removeItem(key);
}

function readDrafts(key: string) {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;

  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    // A partial or obsolete payload cannot be restored safely.
  }
  if (
    !isDraftRecord(record) ||
    record.version !== 1 ||
    typeof record.teacherId !== "string" ||
    !record.teacherId ||
    !isDraftRecord(record.drafts) ||
    (record.preferred !== "semester" && record.preferred !== "subject")
  ) {
    localStorage.removeItem(key);
    return undefined;
  }

  const drafts: StoredReportDrafts["drafts"] = {};
  const now = Date.now();
  let prune = false;
  for (const kind of kinds) {
    const entry = record.drafts[kind];
    if (
      isDraftRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.savedAt === "number" &&
      entry.savedAt <= now &&
      now - entry.savedAt < draftLifetime &&
      isDraftRecord(entry.form)
    ) {
      drafts[kind] = { id: entry.id, savedAt: entry.savedAt, form: entry.form };
    } else if (entry !== undefined) {
      prune = true;
    }
  }
  const result: StoredReportDrafts = { version: 1, teacherId: record.teacherId, preferred: record.preferred, drafts };
  if (prune || !Object.keys(drafts).length) writeDrafts(key, result);
  return Object.keys(drafts).length ? result : undefined;
}

export function pruneExpiredReportDrafts() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(keyPrefix)) readDrafts(key);
    }
  } catch {
    // Browser storage can be disabled even on pages that do not have a draft.
  }
}

/** Capture all edited reports before a hard reload, including work in background windows. */
export function saveReportDraftsForReauthentication(preferred?: ReportDraftKind, currentTeacherId?: string) {
  const edited = kinds.flatMap(kind => {
    const draft = sources.get(kind)?.();
    return draft ? [{ kind, ...draft }] : [];
  });
  edited.sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0));
  const teacherId = currentTeacherId ?? edited[0]?.teacherId;
  if (!teacherId) return false;
  const eligible = edited.filter(draft => draft.teacherId === teacherId);

  try {
    const existingKey = currentStorageKey();
    const previous = existingKey ? readDrafts(existingKey) : undefined;
    const pending = previous?.teacherId === teacherId ? previous : undefined;
    if (!eligible.length && !pending) return false;

    let key = existingKey;
    if (!key) {
      const tabId = createUuid();
      sessionStorage.setItem(tabKey, tabId);
      key = keyPrefix + tabId;
    }
    sessionStorage.removeItem(approvalKey);
    const drafts = { ...pending?.drafts };
    for (const { kind, form } of eligible) {
      drafts[kind] = { id: createUuid(), savedAt: Date.now(), form };
    }
    const target =
      (preferred && drafts[preferred] ? preferred : undefined) ?? eligible[0]?.kind ?? pending?.preferred ?? "semester";
    writeDrafts(key, { version: 1, teacherId, preferred: target, drafts });
    return true;
  } catch (error) {
    if (eligible.length) throw error;
    return false;
  }
}

export function clearReportDraftRecovery() {
  try {
    const key = currentStorageKey();
    sessionStorage.removeItem(approvalKey);
    if (key) localStorage.removeItem(key);
    sessionStorage.removeItem(tabKey);
  } catch {
    // An unavailable cache must never block logout.
  }
}

/** Only a successful login response can authorize the saved teacher's forms. */
export function approveReportDraftRecovery(teacherId?: string) {
  try {
    const key = currentStorageKey();
    const record = key ? readDrafts(key) : undefined;
    if (key && teacherId && record?.teacherId === teacherId) {
      sessionStorage.setItem(approvalKey, teacherId);
      return true;
    }
  } catch {
    // Continue login if storage is unavailable.
  }
  clearReportDraftRecovery();
  return false;
}

function readApprovedDrafts(teacherId?: string) {
  if (!teacherId) return undefined;
  try {
    if (sessionStorage.getItem(approvalKey) !== teacherId) return undefined;
    const key = currentStorageKey();
    const record = key ? readDrafts(key) : undefined;
    return record?.teacherId === teacherId ? record : undefined;
  } catch {
    return undefined;
  }
}

export function getPendingReportDraft(kind: ReportDraftKind, teacherId?: string) {
  return readApprovedDrafts(teacherId)?.drafts[kind];
}

export function getReportDraftReturnWindow(teacherId?: string) {
  const record = readApprovedDrafts(teacherId);
  if (!record) return undefined;
  const target = record.drafts[record.preferred] ? record.preferred : kinds.find(kind => record.drafts[kind]);
  return target ? reportWindows[target] : undefined;
}

/** Remove only the applied snapshot so a cleanup retry cannot remove a newer form. */
export function consumeReportDraft(kind: ReportDraftKind, applied: PendingReportDraft) {
  const key = currentStorageKey();
  if (!key) return;
  const record = readDrafts(key);
  if (!record || record.drafts[kind]?.id !== applied.id) return;
  delete record.drafts[kind];
  writeDrafts(key, record);
  if (!kinds.some(kind => record.drafts[kind])) {
    sessionStorage.removeItem(approvalKey);
    sessionStorage.removeItem(tabKey);
  }
}
