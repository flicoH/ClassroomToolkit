"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gift, History, Pencil, Plus, RefreshCw, Settings, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

type GachaRarity = "普通" | "稀有" | "史诗" | "传说";

interface GachaReward {
  id: string;
  name: string;
  description: string;
  rarity: GachaRarity;
  weight: number;
  stock: number;
  enabled: boolean;
  createdAt: string;
}

interface GachaDrawRecord {
  id: string;
  rewardId: string;
  rewardName: string;
  rarity: GachaRarity;
  createdAt: string;
}

interface GachaOverview {
  rewards: GachaReward[];
  records: GachaDrawRecord[];
}

const rarities: GachaRarity[] = ["普通", "稀有", "史诗", "传说"];
const capsuleColors = [
  ["#38bdf8", "#d9f3ff"],
  ["#34d399", "#d6faec"],
  ["#facc15", "#fff4b8"],
  ["#fb7185", "#ffe0e5"],
  ["#a78bfa", "#eee8ff"],
  ["#f472b6", "#ffe1f0"],
  ["#fb923c", "#ffead7"]
];
const wheelColors = ["#ef476f", "#ffd166", "#06d6a0", "#4cc9f0", "#8b5cf6", "#f97316", "#ec4899", "#14b8a6"];
const rarityStyles: Record<GachaRarity, string> = {
  普通: "bg-slate-100 text-slate-600",
  稀有: "bg-sky-100 text-sky-600",
  史诗: "bg-violet-100 text-violet-600",
  传说: "bg-amber-100 text-amber-700"
};

const emptyRewardForm = {
  name: "",
  description: "",
  rarity: "普通" as GachaRarity,
  weight: 10,
  stock: 1,
  enabled: true
};

const drawAnimationDuration = 1280;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function capsuleRows(count: number) {
  const rowCount = count <= 34 ? 4 : count <= 44 ? 5 : 6;
  const patterns: Record<number, number[]> = {
    4: [2, 1, 0, -1],
    5: [2, 1, 0, 0, -1],
    6: [2, 1, 0, 0, -1, -2]
  };
  const base = Math.floor(count / rowCount);
  const rows = patterns[rowCount]!.map(offset => base + offset);
  let difference = count - rows.reduce((sum, length) => sum + length, 0);
  let cursor = difference >= 0 ? 0 : rows.length - 1;
  while (difference !== 0) {
    rows[cursor] = rows[cursor]! + (difference > 0 ? 1 : -1);
    difference += difference > 0 ? -1 : 1;
    cursor = difference >= 0 ? (cursor + 1) % rows.length : (cursor - 1 + rows.length) % rows.length;
  }
  return rows;
}

function capsulePosition(index: number, count: number) {
  const rows = capsuleRows(count);
  let row = 0;
  let rowStart = 0;
  while (index >= rowStart + rows[row]!) {
    rowStart += rows[row]!;
    row += 1;
  }
  const slot = index - rowStart;
  const rowLength = rows[row]!;
  const size = 23 + Math.round(seededRandom(index * 7 + 1) * 9);
  const spacing = 22.5;
  const rowWidth = (rowLength - 1) * spacing + size;
  const jitterX = (seededRandom(index * 7 + 2) * 2 - 1) * 7;
  const jitterY = (seededRandom(index * 7 + 3) * 2 - 1) * (row === 0 ? 2 : 7);
  const left = (268 - rowWidth) / 2 + slot * spacing + jitterX;
  const bottom = 8 + row * 20 + jitterY;
  return {
    left: `${left}px`,
    bottom: `${bottom}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: Math.round(160 - bottom + seededRandom(index * 7 + 5) * 8)
  };
}

function capsuleRotation(index: number) {
  return -24 + seededRandom(index * 7 + 4) * 48;
}

export function GachaMachine() {
  const [mode, setMode] = useState<"gacha" | "wheel">("gacha");
  const [rewards, setRewards] = useState<GachaReward[]>([]);
  const [records, setRecords] = useState<GachaDrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [form, setForm] = useState(emptyRewardForm);
  const [lastReward, setLastReward] = useState<GachaReward | null>(null);
  const ballBedRef = useRef<HTMLDivElement>(null);

  const enabledRewards = useMemo(
    () => rewards.filter(reward => reward.enabled && reward.stock > 0 && reward.weight > 0),
    [rewards]
  );
  const wheelRewards = enabledRewards.slice(0, 8);
  const wheelSegments = wheelRewards.length || 6;
  const wheelGradient = Array.from({ length: wheelSegments })
    .map((_, index) => {
      const start = (index / wheelSegments) * 100;
      const end = ((index + 1) / wheelSegments) * 100;
      const gap = wheelSegments === 1 ? 0 : 0.28;
      return `#fff ${start}% ${start + gap}%, ${wheelColors[index % wheelColors.length]} ${start + gap}% ${end - gap}%, #fff ${end - gap}% ${end}%`;
    })
    .join(", ");
  const totalWeight = enabledRewards.reduce((sum, reward) => sum + reward.weight, 0);
  const capsuleCount = Math.max(
    30,
    Math.min(54, rewards.reduce((sum, reward) => sum + Math.min(reward.stock, 5), 0) || 42)
  );
  const deleteRewardName = rewards.find(reward => reward.id === deleteId)?.name ?? "未命名奖励";

  const loadOverview = async () => {
    const overview = await request<GachaOverview, GachaOverview>("/api/gacha-machine");
    setRewards(overview.rewards);
    setRecords(overview.records);
  };

  useEffect(() => {
    let mounted = true;
    loadOverview()
      .catch(() => {
        if (mounted) setNotice("扭蛋机数据加载失败，请检查后端服务");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (
      !drawing ||
      mode !== "gacha" ||
      !ballBedRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const animations = Array.from(ballBedRef.current.querySelectorAll<HTMLElement>("[data-gacha-ball]")).map(
      (ball, index) => {
        const direction = seededRandom(index * 11 + 1) > 0.5 ? 1 : -1;
        const lift = 24 + seededRandom(index * 11 + 2) * 42;
        const drift = 8 + seededRandom(index * 11 + 3) * 20;
        const spin = 45 + seededRandom(index * 11 + 4) * 95;
        const delay = seededRandom(index * 11 + 5) * 280;

        return ball.animate(
          [
            { transform: "translate3d(0, 0, 0) rotate(0deg)", offset: 0 },
            { transform: `translate3d(${-direction * 2}px, 3px, 0) rotate(${-direction * 5}deg)`, offset: 0.08 },
            {
              transform: `translate3d(${direction * drift}px, ${-lift}px, 0) rotate(${direction * spin}deg)`,
              offset: 0.3
            },
            {
              transform: `translate3d(${direction * drift * 0.72}px, 1px, 0) rotate(${direction * spin * 1.35}deg)`,
              offset: 0.5
            },
            {
              transform: `translate3d(${-direction * drift * 0.52}px, ${-lift * 0.5}px, 0) rotate(${-direction * spin * 0.7}deg)`,
              offset: 0.67
            },
            {
              transform: `translate3d(${-direction * drift * 0.28}px, 1px, 0) rotate(${-direction * spin}deg)`,
              offset: 0.82
            },
            {
              transform: `translate3d(${direction * drift * 0.12}px, ${-lift * 0.14}px, 0) rotate(${direction * spin * 0.25}deg)`,
              offset: 0.92
            },
            { transform: "translate3d(0, 0, 0) rotate(0deg)", offset: 1 }
          ],
          {
            duration: 960,
            delay,
            easing: "linear",
            fill: "none"
          }
        );
      }
    );

    return () => animations.forEach(animation => animation.cancel());
  }, [drawing, capsuleCount, mode]);

  const resetForm = () => {
    setForm(emptyRewardForm);
    setEditingId(null);
  };

  const submitReward = async () => {
    const payload = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      weight: Math.max(1, Math.round(Number(form.weight) || 1)),
      stock: Math.max(0, Math.round(Number(form.stock) || 0))
    };
    if (!payload.name) {
      setNotice("请填写奖励名称");
      return;
    }
    if (editingId) {
      const updated = await request<GachaReward, GachaReward>({
        url: `/api/gacha-machine/rewards/${editingId}`,
        method: "PATCH",
        data: payload
      });
      setRewards(current => current.map(reward => (reward.id === updated.id ? updated : reward)));
      setNotice("奖励已更新");
    } else {
      const created = await request<GachaReward, GachaReward>({
        url: "/api/gacha-machine/rewards",
        method: "POST",
        data: payload
      });
      setRewards(current => [created, ...current]);
      setNotice("奖励已加入奖池");
    }
    resetForm();
  };

  const editReward = (reward: GachaReward) => {
    setSettingsOpen(true);
    setEditingId(reward.id);
    setForm({
      name: reward.name,
      description: reward.description,
      rarity: reward.rarity,
      weight: reward.weight,
      stock: reward.stock,
      enabled: reward.enabled
    });
  };

  const toggleReward = async (reward: GachaReward) => {
    const updated = await request<GachaReward, GachaReward>({
      url: `/api/gacha-machine/rewards/${reward.id}`,
      method: "PATCH",
      data: { enabled: !reward.enabled }
    });
    setRewards(current => current.map(item => (item.id === updated.id ? updated : item)));
  };

  const confirmDeleteReward = async () => {
    if (!deleteId) return;
    await request<{ deleted: boolean }, { deleted: boolean }>({
      url: `/api/gacha-machine/rewards/${deleteId}`,
      method: "DELETE"
    });
    setRewards(current => current.filter(reward => reward.id !== deleteId));
    if (editingId === deleteId) resetForm();
    setDeleteId(null);
    setNotice("奖励已删除");
  };

  const drawReward = async () => {
    if (drawing) return;
    setResultOpen(false);
    setDrawing(true);
    if (!enabledRewards.length) {
      await new Promise(resolve => window.setTimeout(resolve, drawAnimationDuration));
      setNotice("奖池暂无可抽取奖励");
      setDrawing(false);
      return;
    }
    try {
      let result: { reward: GachaReward; record: GachaDrawRecord };
      if (mode === "wheel") {
        result = await request<
          { reward: GachaReward; record: GachaDrawRecord },
          { reward: GachaReward; record: GachaDrawRecord }
        >({
          url: "/api/gacha-machine/draw",
          method: "POST"
        });
        const rewardIndex = Math.max(
          0,
          wheelRewards.findIndex(reward => reward.id === result.reward.id)
        );
        const segmentAngle = wheelSegments === 1 ? 0 : (rewardIndex + 0.5) * (360 / wheelSegments);
        setWheelRotation(current => {
          const normalized = ((current % 360) + 360) % 360;
          const target = (360 - segmentAngle) % 360;
          const alignment = (target - normalized + 360) % 360;
          return current + 1440 + alignment;
        });
        await new Promise(resolve => window.setTimeout(resolve, drawAnimationDuration));
      } else {
        await new Promise(resolve => window.setTimeout(resolve, drawAnimationDuration));
        result = await request<
          { reward: GachaReward; record: GachaDrawRecord },
          { reward: GachaReward; record: GachaDrawRecord }
        >({
          url: "/api/gacha-machine/draw",
          method: "POST"
        });
      }
      setRewards(current => current.map(reward => (reward.id === result.reward.id ? result.reward : reward)));
      setRecords(current => [result.record, ...current].slice(0, 30));
      setLastReward(result.reward);
      setNotice(`抽中了 ${result.reward.name}`);
      setResultOpen(true);
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[#f7fbff] text-slate-900">
      <div
        className={cn(
          "absolute inset-0",
          mode === "gacha"
            ? "bg-[radial-gradient(circle_at_14%_12%,rgba(255,216,225,0.74),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(221,239,255,0.88),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbff_50%,#f4fbf8_100%)]"
            : "bg-[radial-gradient(circle_at_18%_28%,rgba(255,239,157,0.72),transparent_38%),radial-gradient(circle_at_82%_12%,rgba(221,239,255,0.9),transparent_36%),linear-gradient(180deg,#fffef8_0%,#f8fbff_100%)]"
        )}
      />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
        <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-8 py-8">
          <div className="flex min-w-72 items-center gap-4 rounded-[28px] bg-white/92 px-6 py-5 shadow-[0_18px_50px_rgba(148,163,184,0.24)] backdrop-blur">
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-2xl text-white",
                mode === "gacha"
                  ? "bg-[#ec3f66] shadow-[0_14px_30px_rgba(236,63,102,0.32)]"
                  : "bg-gradient-to-br from-[#ffb235] to-[#f06b32] shadow-[0_14px_30px_rgba(245,132,45,0.34)]"
              )}
            >
              {mode === "gacha" ? <Gift className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-normal">{mode === "gacha" ? "抽奖扭蛋机" : "抽奖大转盘"}</h1>
              <p className="mt-1 text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">
                {mode === "gacha" ? "Lucky Gashapon Machine" : "Lucky Lottery Wheel"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex rounded-2xl bg-white/90 p-1 shadow-[0_14px_34px_rgba(148,163,184,0.22)] backdrop-blur">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-12 w-12 rounded-2xl text-slate-500",
                  mode === "gacha" && "bg-[#ec3f66] text-white hover:bg-[#d9365a] hover:text-white"
                )}
                title="扭蛋机"
                aria-label="切换到扭蛋机"
                disabled={drawing}
                onClick={() => setMode("gacha")}
              >
                <Gift className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-12 w-12 rounded-2xl text-slate-500",
                  mode === "wheel" &&
                    "bg-gradient-to-br from-[#ffb235] to-[#f06b32] text-white shadow-[0_8px_18px_rgba(245,132,45,0.28)] hover:text-white"
                )}
                title="抽奖大转盘"
                aria-label="切换到抽奖大转盘"
                disabled={drawing}
                onClick={() => setMode("wheel")}
              >
                <Sparkles className="h-5 w-5" />
              </Button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-14 w-14 rounded-2xl bg-white/90 text-slate-700 shadow-[0_14px_34px_rgba(148,163,184,0.22)] backdrop-blur"
              title="奖池设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-6 w-6" />
            </Button>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden px-8 pb-2 pt-4">
          {mode === "gacha" ? (
            <section className="relative h-[638px] w-[520px] max-w-[calc(100vw-64px)] translate-y-[300px] [zoom:0.65] md:[zoom:0.85] xl:[zoom:0.94] 2xl:[zoom:1.02]">
              <div className="absolute left-1/2 top-0 h-[332px] w-[332px] -translate-x-1/2 rounded-full border-[8px] border-white/90 bg-white/35 shadow-[inset_18px_18px_35px_rgba(255,255,255,0.72),inset_-20px_-24px_42px_rgba(148,163,184,0.16),0_32px_70px_rgba(148,163,184,0.22)]">
                <div className="absolute inset-x-8 bottom-4 h-48 overflow-hidden rounded-b-full [transform:translateZ(0)]">
                  <div ref={ballBedRef} className="absolute inset-0" aria-hidden="true">
                    {Array.from({ length: capsuleCount }).map((_, index) => {
                      const [baseColor, lightColor] = capsuleColors[index % capsuleColors.length] ?? capsuleColors[0]!;
                      return (
                        <span
                          key={index}
                          data-gacha-ball
                          className="absolute overflow-hidden rounded-full border border-white/80 shadow-[inset_-2px_-3px_5px_rgba(15,23,42,0.16),inset_2px_2px_4px_rgba(255,255,255,0.65),0_1px_3px_rgba(15,23,42,0.12)] [backface-visibility:hidden]"
                          style={{
                            ...capsulePosition(index, capsuleCount),
                            background: `linear-gradient(155deg, ${lightColor} 0 44%, ${baseColor} 45% 100%)`
                          }}
                        >
                          <span
                            className="absolute inset-0"
                            style={{ transform: `rotate(${capsuleRotation(index)}deg)` }}
                          >
                            <span className="absolute inset-x-0 top-[44%] h-px bg-white/70" />
                            <span className="absolute left-[22%] top-[16%] h-[20%] w-[28%] rounded-full bg-white/60" />
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="absolute left-12 top-10 h-20 w-28 rounded-full bg-white/25" />
              </div>

              <div className="absolute left-1/2 top-[292px] h-16 w-[318px] -translate-x-1/2 rounded-t-[30px] bg-gradient-to-b from-[#f86e76] to-[#c9272e] shadow-[0_18px_28px_rgba(198,39,46,0.24)]">
                <p className="mt-4 text-center text-[13px] font-black uppercase tracking-[0.42em] text-white">Gacha</p>
              </div>

              <div className="absolute left-1/2 top-[352px] h-[260px] w-[380px] -translate-x-1/2 rounded-[48px] bg-gradient-to-b from-[#f56b6f] via-[#df3d42] to-[#c62025] shadow-[0_34px_75px_rgba(198,39,46,0.34),inset_0_12px_18px_rgba(255,255,255,0.18)]">
                <div className="absolute left-1/2 top-8 h-8 w-72 -translate-x-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
                <div className="absolute left-1/2 top-10 flex -translate-x-1/2 gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#ffd447]" />
                  <span className="h-2 w-2 rounded-full bg-[#ffd447]" />
                  <span className="h-2 w-2 rounded-full bg-[#ffd447]" />
                </div>
                <div className="absolute left-1/2 top-16 h-8 w-20 -translate-x-1/2 rounded-lg border-4 border-slate-800 bg-gradient-to-b from-slate-500 to-slate-800 shadow-inner" />
                <p className="absolute left-1/2 top-[106px] -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.34em] text-white/66">
                  Coin
                </p>

                <div className="absolute left-1/2 top-[126px] z-20 h-32 w-32 -translate-x-1/2">
                  <button
                    type="button"
                    onClick={() => void drawReward()}
                    disabled={drawing}
                    className={cn(
                      "flex h-full w-full cursor-pointer items-center justify-center rounded-full border-[12px] border-white/70 bg-gradient-to-br from-white to-slate-100 text-[11px] font-black uppercase tracking-[0.22em] text-slate-300 shadow-[0_18px_38px_rgba(15,23,42,0.18),inset_0_0_18px_rgba(148,163,184,0.18)] transition-transform",
                      enabledRewards.length && "hover:scale-105",
                      drawing && "gacha-knob--drawing"
                    )}
                    aria-label="开始扭蛋"
                  >
                    {drawing ? "Lucky" : enabledRewards.length ? "Start" : "Empty"}
                  </button>
                </div>

                <div className="absolute right-24 top-[126px] z-30 h-11 w-11">
                  <button
                    type="button"
                    onClick={() => void drawReward()}
                    disabled={drawing}
                    className={cn(
                      "relative flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-200 text-white shadow-sm transition-transform hover:scale-105",
                      drawing && "gacha-handle--drawing"
                    )}
                    aria-label="扭动手柄"
                  >
                    <span className="absolute left-1/2 top-1/2 h-1.5 w-6 -translate-y-1/2 rounded-full bg-white/85" />
                    <span className="absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              </div>

              <div className="pointer-events-none absolute left-1/2 top-[520px] h-[118px] w-[246px] -translate-x-1/2 rounded-t-[34px] bg-gradient-to-b from-[#27334f] to-[#151d31] shadow-[0_24px_50px_rgba(15,23,42,0.28)]">
                <div className="mx-auto mt-8 h-1 w-24 rounded-full bg-white/15" />
                <p className="mt-5 text-center text-[11px] font-black uppercase tracking-[0.42em] text-white/14">
                  Lucky
                </p>
                <p className="mt-7 text-center text-[8px] font-black uppercase tracking-[0.34em] text-white/22">
                  Made in China
                </p>
              </div>

              <div className="pointer-events-none absolute right-0 top-[430px] rounded-2xl bg-white/82 px-4 py-3 text-center shadow-[0_16px_35px_rgba(148,163,184,0.28)] backdrop-blur">
                <p className="text-xs font-black text-slate-400">可抽</p>
                <p className="text-2xl font-black text-[#ec3f66]">{enabledRewards.length}</p>
              </div>
            </section>
          ) : (
            <section className="relative flex h-[520px] w-[520px] max-w-[calc(100vw-64px)] self-center items-center justify-center [zoom:0.9] 2xl:[zoom:1]">
              <div className="absolute h-[500px] w-[500px] rounded-full bg-gradient-to-br from-[#ffe585] via-[#a85819] to-[#f5b83e] p-[5px] shadow-[0_34px_80px_rgba(121,72,18,0.3)]">
                <div className="relative h-full w-full rounded-full bg-[#fffdf3] shadow-[inset_0_0_0_3px_rgba(242,184,57,0.5),inset_0_8px_18px_rgba(255,255,255,0.9)]">
                  <div
                    data-prize-wheel
                    className={cn(
                      "absolute inset-[29px] overflow-hidden rounded-full border-[3px] border-[#f6d36b] shadow-[inset_0_0_22px_rgba(92,45,11,0.18)] [backface-visibility:hidden]",
                      drawing && "gacha-wheel--drawing"
                    )}
                    style={{ background: `conic-gradient(${wheelGradient})`, transform: `rotate(${wheelRotation}deg)` }}
                    aria-hidden="true"
                  >
                    {Array.from({ length: wheelSegments }).map((_, index) => {
                      const reward = wheelRewards[index];
                      const angle = wheelSegments === 1 ? 0 : (index + 0.5) * (360 / wheelSegments);
                      return (
                        <span
                          key={reward?.id ?? index}
                          className="absolute left-1/2 top-1/2 flex min-h-16 w-32 flex-col items-center justify-center text-center text-[14px] font-black leading-5 text-white [text-shadow:0_2px_4px_rgba(60,25,12,0.45)]"
                          style={{
                            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-150px) rotate(${-angle}deg)`
                          }}
                        >
                          <Sparkles className="mx-auto mb-1 h-4 w-4" />
                          <span className="line-clamp-2">{reward?.name ?? "幸运奖"}</span>
                        </span>
                      );
                    })}
                  </div>

                  {Array.from({ length: 20 }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "absolute left-1/2 top-1/2 z-10 h-4 w-4 rounded-full border-2 shadow-[0_2px_5px_rgba(92,45,11,0.24)]",
                        index % 2 === 0 ? "border-[#f1c84d] bg-[#fff8d8]" : "border-slate-300 bg-slate-300"
                      )}
                      style={{ transform: `translate(-50%, -50%) rotate(${index * 18}deg) translateY(-231px)` }}
                    />
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute left-1/2 top-0 z-30 h-[62px] w-[60px] -translate-x-1/2 drop-shadow-[0_6px_6px_rgba(92,45,11,0.32)]">
                <div className="absolute inset-0 bg-[#a8571d] [clip-path:polygon(0_0,100%_0,50%_100%)]" />
                <div className="absolute left-[5px] top-[4px] h-[49px] w-[50px] bg-white [clip-path:polygon(0_0,100%_0,50%_100%)]" />
                <div className="absolute left-[10px] top-[7px] h-[38px] w-10 bg-[#ef476f] [clip-path:polygon(0_0,100%_0,50%_100%)]" />
                <div className="absolute left-1/2 top-2 h-4 w-4 -translate-x-1/2 rounded-full bg-white/35" />
              </div>

              <div className="absolute left-1/2 top-1/2 z-20 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#ffe873] via-[#c06a1f] to-[#7f3519] p-[6px] shadow-[0_16px_34px_rgba(92,45,11,0.38)]">
                <div className="h-full w-full rounded-full bg-white p-[5px]">
                  <button
                    type="button"
                    onClick={() => void drawReward()}
                    disabled={drawing}
                    className="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#ffc52f] via-[#f28b27] to-[#c34828] text-white shadow-[inset_0_7px_12px_rgba(255,255,255,0.28)] transition-transform hover:scale-[1.03] disabled:cursor-wait"
                    aria-label="开始转盘抽奖"
                  >
                    <Sparkles className="mb-1 h-7 w-7" />
                    <span className="text-2xl font-black leading-none">
                      {drawing ? "抽取中" : enabledRewards.length ? "开始" : "空奖池"}
                    </span>
                    <span className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/82">
                      Go Spin
                    </span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {(lastReward || notice || loading) && (
            <aside className="absolute bottom-7 left-8 max-w-md rounded-3xl bg-white/82 px-5 py-4 shadow-[0_16px_42px_rgba(148,163,184,0.2)] backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">RESULT</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">
                {lastReward?.name ?? (notice || "正在同步奖池数据...")}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {lastReward
                  ? `${lastReward.rarity} · 库存剩余 ${lastReward.stock}`
                  : `奖池 ${rewards.length} 项，权重 ${totalWeight}`}
              </p>
            </aside>
          )}
        </main>
      </div>

      {resultOpen && lastReward && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/28 p-6 backdrop-blur-[2px]">
          <section className="relative w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-[28px] border border-white/90 bg-white px-8 pb-8 pt-10 text-center shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-4 top-4 h-10 w-10 rounded-full text-slate-400"
              aria-label="关闭中奖结果"
              onClick={() => setResultOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>

            <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#fff4b8] via-white to-[#ffd4df] shadow-[0_18px_42px_rgba(236,63,102,0.2)]">
              <div className="absolute inset-3 rounded-full border-2 border-dashed border-[#ec3f66]/25" />
              <Gift className="relative h-14 w-14 text-[#ec3f66]" />
              <Sparkles className="absolute right-3 top-3 h-7 w-7 text-amber-400" />
            </div>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#ec3f66]">恭喜抽中</p>
            <h2 className="mt-3 break-words text-3xl font-black text-slate-900">{lastReward.name}</h2>
            <span
              className={cn(
                "mt-4 inline-flex rounded-full px-3 py-1.5 text-sm font-black",
                rarityStyles[lastReward.rarity]
              )}
            >
              {lastReward.rarity}
            </span>
            <p className="mx-auto mt-4 max-w-sm text-sm font-semibold leading-6 text-slate-500">
              {lastReward.description || "奖励已放入本次抽取记录"}
            </p>
            <p className="mt-3 text-xs font-bold text-slate-400">剩余库存 {lastReward.stock}</p>

            <div className="mt-7 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl font-bold"
                onClick={() => setResultOpen(false)}
              >
                收下奖励
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 rounded-xl bg-[#ec3f66] font-bold hover:bg-[#d9365a]"
                onClick={() => void drawReward()}
              >
                再扭一次
              </Button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/18 p-8 backdrop-blur-sm">
          <section className="grid h-[min(680px,calc(100vh-96px))] w-[min(980px,calc(100vw-96px))] grid-rows-[auto_1fr] overflow-hidden rounded-[34px] bg-white/92 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100/80 px-7 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ec3f66] text-white shadow-[0_12px_26px_rgba(236,63,102,0.28)]">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black">奖池设置</h2>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Reward Pool</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  title="刷新"
                  className="h-11 w-11 rounded-2xl bg-slate-100 text-slate-600"
                  onClick={() => void loadOverview()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="关闭设置"
                  className="h-11 w-11 rounded-2xl bg-slate-100 text-slate-600"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid min-h-0 gap-5 p-5 lg:grid-cols-[330px_1fr]">
              <div className="grid min-h-0 grid-rows-[auto_1fr] rounded-[26px] bg-slate-50/80 p-5">
                <h3 className="mb-4 font-black">{editingId ? "编辑奖励" : "新增奖励"}</h3>
                <div className="grid content-start gap-3">
                  <Input
                    value={form.name}
                    onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                    placeholder="奖励名称"
                  />
                  <textarea
                    value={form.description}
                    onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                    placeholder="奖励说明"
                    className="min-h-24 resize-none rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <label className="grid gap-1 text-sm font-bold text-slate-500">
                    稀有度
                    <select
                      value={form.rarity}
                      onChange={event =>
                        setForm(current => ({ ...current, rarity: event.target.value as GachaRarity }))
                      }
                      className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                      aria-label="奖励稀有度"
                    >
                      {rarities.map(rarity => (
                        <option key={rarity}>{rarity}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm font-bold text-slate-500">
                      权重
                      <Input
                        type="number"
                        min={1}
                        value={form.weight}
                        onChange={event => setForm(current => ({ ...current, weight: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-bold text-slate-500">
                      库存
                      <Input
                        type="number"
                        min={0}
                        value={form.stock}
                        onChange={event => setForm(current => ({ ...current, stock: Number(event.target.value) }))}
                      />
                    </label>
                  </div>
                  <label className="flex items-center justify-between rounded-xl bg-white px-3 py-3 text-sm font-bold text-slate-600">
                    启用奖励
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={event => setForm(current => ({ ...current, enabled: event.target.checked }))}
                    />
                  </label>
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="h-11 flex-1 rounded-xl bg-[#ec3f66] font-bold hover:bg-[#d9365a]"
                      onClick={() => void submitReward()}
                    >
                      <Plus className="h-4 w-4" />
                      {editingId ? "保存" : "新增"}
                    </Button>
                    {editingId && (
                      <Button variant="outline" className="h-11 rounded-xl" onClick={resetForm}>
                        取消
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_210px] gap-5">
                <div className="grid min-h-0 grid-rows-[auto_1fr] rounded-[26px] bg-white p-5 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-black">奖池管理</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-400">
                      {rewards.length} 项奖励
                    </span>
                  </div>
                  <div className="grid min-h-0 content-start gap-3 overflow-auto pr-1">
                    {rewards.map(reward => (
                      <article key={reward.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-black">{reward.name}</h4>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-xs font-black",
                                  rarityStyles[reward.rarity]
                                )}
                              >
                                {reward.rarity}
                              </span>
                              {!reward.enabled && (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
                                  停用
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                              {reward.description || "暂无说明"}
                            </p>
                            <p className="mt-2 text-xs font-bold text-slate-400">
                              权重 {reward.weight} · 库存 {reward.stock}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="编辑奖励"
                              onClick={() => editReward(reward)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={reward.enabled ? "停用奖励" : "启用奖励"}
                              onClick={() => void toggleReward(reward)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="删除奖励"
                              className="text-rose-500"
                              onClick={() => setDeleteId(reward.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </article>
                    ))}
                    {!rewards.length && (
                      <p className="py-14 text-center text-sm font-bold text-slate-400">暂无奖励，请先新增</p>
                    )}
                  </div>
                </div>

                <div className="grid min-h-0 grid-rows-[auto_1fr] rounded-[26px] bg-white p-5 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
                  <div className="mb-4 flex items-center gap-2">
                    <History className="h-5 w-5 text-[#ec3f66]" />
                    <h3 className="font-black">最近抽取</h3>
                  </div>
                  <div className="grid min-h-0 content-start gap-2 overflow-auto">
                    {records.slice(0, 8).map(record => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"
                      >
                        <span className="font-bold">{record.rewardName}</span>
                        <span className="text-xs font-semibold text-slate-400">{formatDate(record.createdAt)}</span>
                      </div>
                    ))}
                    {!records.length && (
                      <p className="py-8 text-center text-sm font-bold text-slate-400">暂无抽取记录</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="删除奖励"
        description={`确定删除奖励「${deleteRewardName}」吗？删除后不会影响历史抽取记录。`}
        confirmText="删除"
        onConfirm={() => void confirmDeleteReward()}
        onCancel={() => setDeleteId(null)}
      />
      <style jsx global>{`
        @keyframes gacha-knob-turn {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes gacha-handle-turn {
          0% {
            transform: rotate(0deg);
          }
          48% {
            transform: rotate(150deg);
          }
          72% {
            transform: rotate(120deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }

        .gacha-knob--drawing {
          animation: gacha-knob-turn 1280ms cubic-bezier(0.45, 0, 0.55, 1) both;
          will-change: transform;
        }

        .gacha-handle--drawing {
          animation: gacha-handle-turn 1280ms cubic-bezier(0.22, 0.72, 0.32, 1) both;
          transform-origin: 50% 50%;
          will-change: transform;
        }

        .gacha-wheel--drawing {
          transition: transform 1280ms cubic-bezier(0.12, 0.72, 0.18, 1);
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .gacha-knob--drawing,
          .gacha-handle--drawing,
          .gacha-wheel--drawing {
            animation: none;
          }

          .gacha-wheel--drawing {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
