import { createUuid } from "@/lib/id";

// 桌面窗口使用前端 contentKey，统计接口使用稳定的后端功能标识。
const features: Record<string, string> = {
  countdown: "countdown",
  randomPicker: "random-picker",
  studentManagement: "students",
  taskStats: "task-stats",
  seatingChart: "seating-chart",
  petPoints: "pet-points",
  gachaMachine: "gacha-machine",
  stickyNotes: "sticky-notes",
  stickyNotesList: "sticky-notes"
};
/** 功能打开事件采用尽力上报，不通过会弹出错误提示的业务请求封装。 */
export function trackFeatureOpen(contentKey: string) {
  const feature = contentKey.startsWith("stickyNoteQuick") ? "sticky-notes" : features[contentKey];
  if (!feature || typeof window === "undefined") return;
  const eventId = createUuid();
  void fetch("/api/analytics/events", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature, kind: "open", eventId })
  }).catch(() => {
    // 网络失败在此忽略，不中断课堂；到达后端后的写入失败由后端日志记录。
  });
}
