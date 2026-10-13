"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import request from "@/lib/request";
import { createUuid } from "@/lib/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CartoonAccountManagementIcon } from "@/components/icons/CartoonAppIcons";

type Account = {
  id: string;
  displayName: string;
  account: string;
  status: "active" | "locked" | "deleted";
  createdAt: string;
  lastLoginAt: string | null;
};
type List = { items: Account[]; used: number; limit: number };
type Usage = {
  totals: Record<string, number>;
  features: Array<{ name: string; reportVersion: string | null; uses: number; opens: number }>;
  hours: Array<{ hour: number; uses: number }>;
  days: Array<{ date: string; uses: number }>;
  reportActions: Array<{ action: string; count: number }>;
};
type Activity = {
  items: Array<{ id: string; displayName: string; action: string; createdAt: string }>;
  total: number;
  page: number;
  pageSize: number;
};
const base = "/api/account-management/subaccounts";
const day = (n = 0) => new Date(Date.now() + 8 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "暂无记录";
const statusLabels = { active: "正常", locked: "已锁定", deleted: "已删除" };
const actionLabels: Record<string, string> = {
  "report-queued": "新增报告",
  "draft-edited": "编辑草稿",
  "draft-subjects-added": "选用学科",
  "draft-subject-removed": "移除报告学科",
  "report-published": "发布报告",
  "share-created": "创建分享",
  "share-revoked": "撤销分享",
  "report-unpublished": "撤销发布",
  "report-deleted": "删除报告",
  "report-restored": "恢复报告",
  "report-retried": "重试生成",
  "classroom-photo-uploaded": "上传课堂照片",
  "classroom-photo-removed": "移除课堂照片"
};
function errorText(error: unknown) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (error instanceof Error ? error.message : "操作失败，请重试")
  );
}

export function AccountManagement() {
  const user = useAuthStore(s => s.user);
  const allowed = user?.accountType === "main" && user.capabilities?.accountManagement === true;
  const [list, setList] = useState<List | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ mode: "create" | "name" | "password"; account?: Account } | null>(null);
  const [name, setName] = useState(""),
    [login, setLogin] = useState(""),
    [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState<{ account: Account; action: "delete" | "lock" | "unlock" } | null>(null);
  const [selected, setSelected] = useState<Account | null>(null),
    [usage, setUsage] = useState<Usage | null>(null),
    [activity, setActivity] = useState<Activity | null>(null);
  const [start, setStart] = useState(day(29)),
    [end, setEnd] = useState(day()),
    [page, setPage] = useState(1);
  const epoch = useRef(0),
    pending = useRef(false);
  const load = useCallback(async () => {
    if (!allowed) return;
    const id = ++epoch.current;
    setError("");
    try {
      const result = await request.get<List, List>(base, { params: { refresh: createUuid() } });
      if (epoch.current === id) setList(result);
    } catch (error) {
      if (epoch.current === id) setError(errorText(error));
    }
  }, [allowed]);
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!selected || !allowed) return;
    let active = true;
    setUsage(null);
    setActivity(null);
    setError("");
    const params = { start, end, page, refresh: createUuid() };
    void Promise.all([
      request.get<Usage, Usage>(selected.id === user?.id ? `${base}/usage-summary` : `${base}/${selected.id}/usage`, {
        params
      }),
      request.get<Activity, Activity>(
        selected.id === user?.id ? `${base}/activity-summary` : `${base}/${selected.id}/activity`,
        { params }
      )
    ])
      .then(([u, a]) => {
        if (active) {
          setUsage(u);
          setActivity(a);
        }
      })
      .catch(error => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [selected, allowed, start, end, page, user?.id]);
  function closeForm() {
    setForm(null);
    setPassword("");
    setName("");
    setLogin("");
  }
  function openForm(mode: "create" | "name" | "password", account?: Account) {
    closeForm();
    setForm({ mode, account });
    setName(account?.displayName || "");
    setError("");
    setMessage("");
  }
  async function mutate(operation: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      closeForm();
      setConfirm(null);
      setMessage("操作成功");
      await load();
    } catch (error) {
      setError(errorText(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (!form) return;
    await mutate(() =>
      form.mode === "create"
        ? request.post(base, { displayName: name, account: login, password })
        : form.mode === "name"
          ? request.patch(`${base}/${form.account!.id}`, { displayName: name })
          : request.post(`${base}/${form.account!.id}/reset-password`, { password })
    );
  }
  function confirmAction() {
    if (!confirm) return;
    const { account, action } = confirm;
    void mutate(() =>
      action === "delete"
        ? request.delete(`${base}/${account.id}`)
        : request.patch(`${base}/${account.id}/status`, { status: action === "lock" ? "locked" : "active" })
    );
  }
  if (!allowed)
    return (
      <div className="p-6" role="alert">
        账号管理仅限主账号使用，请关闭此窗口返回。
      </div>
    );
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 sm:p-6">
      <header className="flex items-center gap-3">
        <CartoonAccountManagementIcon className="h-9 w-9 shrink-0" />
        <h1 className="text-xl font-semibold">账号管理</h1>
      </header>
      <p>
        子账号共享您的业务数据。已创建 {list?.used ?? "…"}/{list?.limit ?? 5} 个；锁定仍占名额，删除保留数据和历史。
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !list || list.used >= list.limit} onClick={() => openForm("create")}>
          创建子账号
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          刷新列表
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setSelected({
              id: user!.id,
              displayName: "主账号与全部子账号",
              account: "",
              status: "active",
              createdAt: "",
              lastLoginAt: null
            });
            setPage(1);
          }}
        >
          账号使用汇总
        </Button>
      </div>
      {form && (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <h2>
            {form.mode === "create" ? "创建子账号" : form.mode === "name" ? "修改用户名" : "重置密码（原会话将失效）"}
          </h2>
          {form.mode !== "password" && (
            <label className="block">
              用户名
              <Input required maxLength={64} value={name} onChange={e => setName(e.target.value)} disabled={busy} />
            </label>
          )}
          {form.mode === "create" && (
            <label className="block">
              账号
              <Input
                required
                maxLength={64}
                autoComplete="off"
                value={login}
                onChange={e => setLogin(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          {form.mode !== "name" && (
            <label className="block">
              密码
              <Input
                required
                type="password"
                minLength={6}
                maxLength={256}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <div className="flex gap-2">
            <Button disabled={busy} type="submit">
              保存
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={closeForm}>
              取消
            </Button>
          </div>
        </form>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {list?.items.map(account => (
          <section key={account.id} className="min-w-0 rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold break-words">
              {account.displayName} · {statusLabels[account.status]}
            </h2>
            <p className="break-all">账号：{account.account}</p>
            <p className="text-sm">
              创建：{time(account.createdAt)}
              <br />
              最近登录：{time(account.lastLoginAt)}
            </p>
            <div className="flex flex-wrap gap-2">
              {account.status !== "deleted" && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => openForm("name", account)}>
                    修改用户名
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => openForm("password", account)}>
                    重置密码
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirm({ account, action: account.status === "locked" ? "unlock" : "lock" })}
                  >
                    {account.status === "locked" ? "解锁" : "锁定"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirm({ account, action: "delete" })}
                  >
                    删除
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelected(account);
                  setPage(1);
                }}
              >
                使用情况
              </Button>
            </div>
          </section>
        ))}
      </div>
      {list && !list.items.length && <p>暂无子账号。</p>}
      {selected && (
        <section className="space-y-3 rounded-lg border p-4" aria-label="子账号使用情况">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-semibold">{selected.displayName} 的使用情况</h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              关闭使用情况
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <Button
              variant="outline"
              onClick={() => {
                setStart(day(6));
                setEnd(day());
                setPage(1);
              }}
            >
              近 7 天
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStart(day(29));
                setEnd(day());
                setPage(1);
              }}
            >
              近 30 天
            </Button>
            <label>
              开始日期
              <Input
                type="date"
                value={start}
                onChange={e => {
                  setStart(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              结束日期
              <Input
                type="date"
                max={day()}
                value={end}
                onChange={e => {
                  setEnd(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
          {usage ? (
            <>
              <p>
                主动登录 {usage.totals.logins} 次 · 自动登录 {usage.totals.autoLogins} 次 · 登录失败{" "}
                {usage.totals.failures} 次 · 活跃 {usage.totals.activeDays} 天 · 成功使用 {usage.totals.uses} 次
              </p>
              <h3>常用功能</h3>
              <ul>
                {usage.features.map((f, i) => (
                  <li key={i}>
                    {f.name}
                    {f.name === "学期报告" ? `（${f.reportVersion || "历史版本未知"}）` : ""}：使用 {f.uses} 次 / 打开{" "}
                    {f.opens} 次
                  </li>
                ))}
              </ul>
              {!usage.features.length && <p>暂无功能使用记录</p>}
              <h3>常用时段（北京时间）</h3>
              <p>{usage.hours.map(h => `${h.hour}时：${h.uses}次`).join("；") || "暂无记录"}</p>
              <h3>每日使用</h3>
              <p className="break-words">{usage.days.map(d => `${d.date}：${d.uses}次`).join("；") || "暂无记录"}</p>
              <h3>报告操作量</h3>
              <ul>
                {usage.reportActions.map(a => (
                  <li key={a.action}>
                    {actionLabels[a.action] || "报告操作"}：{a.count}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !error && <p role="status">加载中…</p>
          )}
          <h3>最近报告操作</h3>
          <ul className="space-y-2">
            {activity?.items.map(a => (
              <li key={a.id}>
                {a.displayName} · {actionLabels[a.action] || "报告操作"} · {time(a.createdAt)}
              </li>
            ))}
          </ul>
          {activity?.total === 0 && <p>暂无报告操作记录</p>}
          {activity && (
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span>
                第 {page} 页，共 {activity.total} 条
              </span>
              <Button
                variant="outline"
                disabled={page * activity.pageSize >= activity.total}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </section>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === "delete" ? "删除子账号" : confirm?.action === "lock" ? "锁定子账号" : "解锁子账号"}
        description={`${confirm?.account.displayName || ""}：${confirm?.action === "delete" ? "删除后不能登录，已有数据和操作历史保留，名额释放。" : "此操作会撤销已有会话，之后需重新登录。"}`}
        confirmText={busy ? "处理中…" : "确认"}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
        onConfirm={confirmAction}
      />
    </div>
  );
}
