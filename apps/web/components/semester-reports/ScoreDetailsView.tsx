"use client";

import { useEffect, useState } from "react";

export type ScoreDetails = {
  positive: number;
  negative: number;
  net: number;
  count: number;
  records: Array<{ label: string; delta: number; createdAt: string | null }>;
};

function scoreDate(value: string | null) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未记录"
    : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" });
}

type ScoreFilter = "all" | "positive" | "negative";

/** The shared view filters visible rows only; the frozen period totals never change. */
export function ScoreDetailsView({ details }: { details: ScoreDetails }) {
  const [filter, setFilter] = useState<ScoreFilter>("all");
  useEffect(() => setFilter("all"), [details]);
  const visibleRecords = details.records.filter(record =>
    filter === "positive" ? record.delta > 0 : filter === "negative" ? record.delta < 0 : true
  );
  const filterLabel = filter === "positive" ? "加分" : "扣分";
  const buttonClass = (selected: boolean) =>
    `min-h-11 rounded-lg p-2 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${selected ? "ring-2 ring-indigo-500 ring-offset-1" : "hover:ring-1 hover:ring-indigo-300"}`;
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="筛选积分明细">
        <button
          type="button"
          className={`${buttonClass(filter === "positive")} bg-emerald-50 text-emerald-800`}
          aria-pressed={filter === "positive"}
          onClick={() => setFilter("positive")}
        >
          加分 {details.positive}
        </button>
        <button
          type="button"
          className={`${buttonClass(filter === "negative")} bg-rose-50 text-rose-800`}
          aria-pressed={filter === "negative"}
          onClick={() => setFilter("negative")}
        >
          扣分 {Math.abs(details.negative)}
        </button>
        <button
          type="button"
          className={`${buttonClass(filter === "all")} bg-indigo-50 text-indigo-800`}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          净积分 {details.net > 0 ? "+" : ""}
          {details.net}
        </button>
      </div>
      {details.count === 0 ? (
        <p className="text-slate-500">本周期暂无积分加减记录。</p>
      ) : (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs text-slate-500">
            共 {details.count} 条{details.count > details.records.length ? `，展示前 ${details.records.length} 条` : ""}
            ；为综合课堂积分，不代表本学科知识掌握程度。
          </p>
          {filter !== "all" && (
            <p className="text-xs text-slate-500">
              当前显示{filterLabel}明细 · {visibleRecords.length} 条
            </p>
          )}
          {visibleRecords.length ? (
            <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="积分加减明细">
              {visibleRecords.map((record, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border bg-white px-3 py-2"
                >
                  <span className="min-w-0 break-words">{record.label || "课堂评价"}</span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <time className="text-xs text-slate-500">{scoreDate(record.createdAt)}</time>
                    <strong className={record.delta < 0 ? "text-rose-700" : "text-emerald-700"}>
                      {record.delta > 0 ? "+" : ""}
                      {record.delta}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">
              {filter === "all"
                ? "暂无可展示的积分明细。"
                : details.count > details.records.length
                  ? `已展示的前 ${details.records.length} 条记录中暂无${filterLabel}记录。`
                  : `本周期暂无${filterLabel}记录。`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
