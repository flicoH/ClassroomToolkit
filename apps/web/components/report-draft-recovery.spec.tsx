import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleExpiredTeacherSession } from "@/lib/expired-teacher-session";
import { useAuthStore } from "@/store/authStore";
import {
  approveReportDraftRecovery,
  clearReportDraftRecovery,
  consumeReportDraft,
  getPendingReportDraft,
  getReportDraftReturnWindow,
  registerReportDraft,
  saveReportDraftsForReauthentication
} from "@/lib/report-draft-recovery";

describe("report draft recovery", () => {
  const teacherId = "teacher-1";
  const semester = { composeStep: 4, selectedStudentIds: ["s2", "s1"], courseManualText: "词汇\n句型" };
  const subject = { step: 3, selectedStudentIds: ["s3"], lessonInputs: { "0-0": "" } };
  let unregister: Array<() => void>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    unregister = [];
  });

  afterEach(() => unregister.forEach(dispose => dispose()));

  it("saves both forms locally and deletes each only after it has been restored", () => {
    unregister.push(
      registerReportDraft("semester", () => ({ teacherId, form: semester })),
      registerReportDraft("subject", () => ({ teacherId, form: subject }))
    );

    expect(saveReportDraftsForReauthentication("subject")).toBe(true);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(localStorage.key(0)!)).toContain("courseManualText");
    expect(sessionStorage.getItem(sessionStorage.key(0)!)).not.toContain("courseManualText");
    expect(getPendingReportDraft("semester", teacherId)).toBeUndefined();

    expect(approveReportDraftRecovery(teacherId)).toBe(true);
    expect(getReportDraftReturnWindow(teacherId)).toBe("subjectReports");
    const pending = getPendingReportDraft("subject", teacherId)!;
    expect(pending.form).toEqual(subject);
    expect(getPendingReportDraft("subject", teacherId)).toEqual(pending);

    consumeReportDraft("subject", pending);
    expect(getPendingReportDraft("subject", teacherId)).toBeUndefined();
    expect(getPendingReportDraft("semester", teacherId)?.form).toEqual(semester);
    consumeReportDraft("semester", getPendingReportDraft("semester", teacherId)!);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("drops pending form data when another teacher signs in or the teacher signs out", () => {
    unregister.push(registerReportDraft("semester", () => ({ teacherId, form: semester })));
    saveReportDraftsForReauthentication();

    expect(approveReportDraftRecovery("teacher-2")).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(approveReportDraftRecovery(teacherId)).toBe(false);

    saveReportDraftsForReauthentication();
    approveReportDraftRecovery(teacherId);
    clearReportDraftRecovery();
    expect(getPendingReportDraft("semester", teacherId)).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it("does not recreate a draft when a 401 arrives during explicit logout", async () => {
    useAuthStore.getState().setUser({ id: teacherId, name: "王老师", email: "" });
    unregister.push(registerReportDraft("semester", () => ({ teacherId, form: semester })));
    saveReportDraftsForReauthentication();
    let finishLogout!: () => void;
    const revoke = new Promise<void>(resolve => {
      finishLogout = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => revoke)
    );
    const logout = useAuthStore.getState().logout();
    try {
      handleExpiredTeacherSession();
      expect(Object.keys(localStorage).some(key => key.startsWith("report-draft-recovery:"))).toBe(false);
    } finally {
      finishLogout();
      await logout;
      vi.unstubAllGlobals();
    }
  });

  it("keeps a newer snapshot if cleanup is retried for a previous one", () => {
    let form = semester;
    unregister.push(registerReportDraft("semester", () => ({ teacherId, form })));
    saveReportDraftsForReauthentication();
    approveReportDraftRecovery(teacherId);
    const previous = getPendingReportDraft("semester", teacherId)!;

    form = { ...form, courseManualText: "新的课程内容" };
    saveReportDraftsForReauthentication();
    consumeReportDraft("semester", previous);
    approveReportDraftRecovery(teacherId);
    expect(getPendingReportDraft("semester", teacherId)?.form).toEqual(form);
  });

  it("clears expired and malformed local data instead of restoring it", () => {
    unregister.push(registerReportDraft("semester", () => ({ teacherId, form: semester })));
    saveReportDraftsForReauthentication();
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
    try {
      expect(approveReportDraftRecovery(teacherId)).toBe(false);
      expect(localStorage.length).toBe(0);
    } finally {
      clock.mockRestore();
    }

    saveReportDraftsForReauthentication();
    localStorage.setItem(localStorage.key(0)!, "{");
    expect(approveReportDraftRecovery(teacherId)).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
