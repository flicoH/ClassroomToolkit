"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { LearningReportView, type LearningReportData } from "@/components/semester-reports/LearningReportView";

type PublicReport = LearningReportData;

export default function ParentReportPage({ params }: { params: Promise<{ token: string }> }) {
  const [data, setData] = useState<PublicReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void params
      .then(({ token }) => fetch(`/api/public-reports/${encodeURIComponent(token)}`, { cache: "no-store" }))
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.message || "报告链接无效或已失效");
        return value as PublicReport;
      })
      .then(value => {
        if (live) setData(value);
      })
      .catch((reason: Error) => {
        if (live) setError(reason.message);
      });
    return () => {
      live = false;
    };
  }, [params]);
  if (!data)
    return (
      <main className="fixed inset-0 z-[100] overflow-x-hidden overflow-y-auto bg-gradient-to-b from-indigo-50 to-white px-4 py-12 text-slate-800">
        <div className="mx-auto mt-20 max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          {error ? (
            <>
              <h1 className="text-xl font-semibold">暂时无法查看报告</h1>
              <p className="mt-3 text-sm text-slate-600">{error}</p>
            </>
          ) : (
            <>
              <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-3">正在打开报告…</p>
            </>
          )}
        </div>
      </main>
    );
  return (
    <main className="fixed inset-0 z-[100] overflow-x-hidden overflow-y-auto bg-gradient-to-b from-indigo-50 via-white to-violet-50 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-10">
      <LearningReportView report={data} />
    </main>
  );
}
