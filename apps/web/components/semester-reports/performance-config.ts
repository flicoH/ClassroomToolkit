export type PerformanceField = { label: string; options: string[] };
export type PerformanceSubject = { subjectId: string; name: string; performanceConfig?: PerformanceField[] | null };
export function defaultPerformanceConfig(): PerformanceField[] {
  return [
    { label: "课程任务", options: ["独立完成", "基本完成", "需要帮助"] },
    { label: "听指令反应", options: ["能听懂并反应", "基本听懂", "需要引导"] },
    { label: "课堂参与", options: ["主动参与", "引导参与", "需要鼓励"] },
    { label: "专注情况", options: ["专注稳定", "基本专注", "需要提醒"] }
  ];
}
