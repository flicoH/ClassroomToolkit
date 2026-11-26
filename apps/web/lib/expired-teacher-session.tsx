import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { isTeacherLogoutInProgress, useAuthStore } from "@/store/authStore";
import { useWindowStore } from "@/store/windowStore";
import { cookieStorage } from "./cookie";
import { reportDraftReturnPath, saveReportDraftsForReauthentication } from "./report-draft-recovery";

let handlingExpiry = false;

export function handleExpiredTeacherSession() {
  if (handlingExpiry || isTeacherLogoutInProgress()) return;
  handlingExpiry = true;
  const teacherId = useAuthStore.getState().user?.id;

  function goToLogin(resume: boolean) {
    cookieStorage.clearAll();
    try {
      localStorage.removeItem("auth-storage");
    } catch {
      // A blocked cache must not prevent login.
    }
    // The authenticated BFF's 401 has already cleared or checked the session cookie.
    window.location.replace(resume ? `/login?redirect=${encodeURIComponent(reportDraftReturnPath)}` : "/login");
  }

  function tryToSave() {
    const front = useWindowStore
      .getState()
      .windows.reduce<
        { contentKey: string; zIndex: number } | undefined
      >((current, win) => (win.state !== "minimized" && (!current || win.zIndex > current.zIndex) ? win : current), undefined);
    const preferred =
      front?.contentKey === "semesterReportStudio"
        ? "semester"
        : front?.contentKey === "subjectReports"
          ? "subject"
          : undefined;
    try {
      const resume = Boolean(teacherId && saveReportDraftsForReauthentication(preferred, teacherId));
      toast.error("登录已过期，请重新登录");
      goToLogin(resume);
    } catch {
      toast.custom(
        <div role="alert" className="pointer-events-auto max-w-sm rounded-lg border bg-background p-3 shadow-md">
          <p className="text-sm">暂存失败，请复制重要内容后重新登录。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={tryToSave}>
              重试暂存
            </Button>
            <Button size="sm" onClick={() => goToLogin(false)}>
              重新登录
            </Button>
          </div>
        </div>,
        { id: "report-draft-save-failed", duration: Infinity }
      );
    }
  }

  tryToSave();
}
