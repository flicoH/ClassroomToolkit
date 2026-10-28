import type { ScoreDetails } from "./ScoreDetailsView";

/** Frozen per-item event counts cover the entire period, beyond the saved detail limit. */
export function PeriodScoreChart({ details }: { details?: ScoreDetails }) {
  const items = details?.positiveItems ?? (details?.count === 0 ? [] : undefined);
  if (!items) return <p className="text-sm text-slate-500">此报告未保存完整加分细项统计，可由老师重新生成报告。</p>;
  if (!items.length) return <p className="text-sm text-slate-500">本周期暂无加分记录。</p>;
  const maximum = Math.max(1, ...items.map(item => item.count));
  return (
    <div
      role="img"
      aria-label={`加分细项次数柱状图：${items.map(item => `${item.label} ${item.count} 次`).join("，")}`}
      className="space-y-3 sm:space-y-4"
    >
      {items.map(item => (
        <div key={item.label}>
          <div className="mb-1 flex items-start justify-between gap-2 text-xs sm:text-sm">
            <span className="min-w-0 flex-1 break-words text-slate-700">{item.label}</span>
            <strong className="shrink-0 whitespace-nowrap text-amber-900">{item.count} 次</strong>
          </div>
          <div className="h-4 rounded bg-amber-100">
            <div
              aria-label={`${item.label} ${item.count} 次`}
              className="h-full rounded bg-amber-500"
              style={{ width: `${(item.count / maximum) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
