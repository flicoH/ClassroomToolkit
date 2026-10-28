/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
"use client";
import { petOptions, PetSprite, formStages } from "@/components/semester-reports/ReportPetView";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createUuid } from "@/lib/id";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PetCertificate } from "./pet-points/PetCertificate";
import { usePetDialog } from "./pet-points/use-pet-dialog";
import { createPortal } from "react-dom";
import {
  ArrowDownUp,
  BarChart3,
  BookOpen,
  Check,
  CheckSquare,
  ClipboardList,
  Clock3,
  Droplets,
  Flame,
  Gift,
  Grid2X2,
  Grid3X3,
  History,
  Leaf,
  Medal,
  Minus,
  PawPrint,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Users,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import request from "@/lib/request";
import { cn } from "@/lib/utils";

type PetFamily = "图鉴" | "萌芽系" | "焰岩系" | "潮汐系" | "星辉系";
type PetStage = string;
type ClassName = string;

interface PetOption {
  id: string;
  name: string;
  family: Exclude<PetFamily, "图鉴">;
  description: string;
  tone: string;
  badge: string;
  evolutions: readonly [string, string, string, string];
}

interface StudentPet {
  id: string;
  name: string;
  studentNo: string;
  classId: string;
  className: ClassName;
  group: string;
  score: number;
  maxScore: number;
  trophies: number;
  level: number;
  stage: PetStage;
  petId?: string;
  petName?: string;
  petProgress: number;
  petHatched: boolean;
  absent: boolean;
  completedPets: number;
  petExperience: number;
  cycleId: string;
  revision: number;
  completionPending: boolean;
}

type EvaluationCategory = "课堂表现" | "作业情况" | "品德修养" | "纪律常规";

interface RubricItem {
  id: string;
  category: EvaluationCategory;
  label: string;
  score: number;
  enabled: boolean;
}

interface EvaluationRecord {
  id: string;
  studentId: string;
  category: EvaluationCategory | "手动调整";
  label: string;
  delta: number;
  petDelta?: number;
  scoreDelta?: number;
  cycleId?: string;
  note: string;
  createdAt: string;
}

interface RewardItem {
  id: string;
  name: string;
  cost: number;
  stock: number;
  enabled: boolean;
}

interface RedemptionRecord {
  id: string;
  studentId: string;
  rewardName: string;
  cost: number;
  createdAt: string;
}

type SortMode = "分数降序" | "分数升序" | "姓名排序" | "学号排序";
type DisplayMode = "normal" | "compact";
type SettingsPanel = "指标配置" | "奖品配置" | "等级规则" | "宠物统计" | "最近评分" | "积分统计";
type ScoreAdjustMode = "add" | "subtract";

interface PetPointStudentFilters {
  classId: string;
  groupFilter: string;
  query: string;
  sortMode: SortMode;
}

interface ClassroomStudent {
  id: string;
  name: string;
  studentNo: string;
  group?: string;
}

interface Classroom {
  id: string;
  name: string;
  students: ClassroomStudent[];
  groups: string[];
}

export interface CompletedPetView {
  id: string;
  studentId: string;
  cycleId: string;
  petId: string;
  petName: string;
  level: number;
  stage: string;
  rules: { maxLevel: number; finalEnergy: number; version: number };
  earnedBadges: number;
  completedAt: string;
}
interface PetPointsOverview {
  students: StudentPet[];
  rubrics: RubricItem[];
  rewards: RewardItem[];
  records: EvaluationRecord[];
  redemptions: RedemptionRecord[];
  settings: { maxLevel: number; finalEnergy: number; version: number; completionBadges?: number };
  completed: CompletedPetView[];
}

const fallbackClassrooms: Classroom[] = [
  { id: "grade-1", name: "一年级", groups: ["一组", "二组", "三组"], students: [] },
  { id: "grade-2", name: "二年级", groups: ["一组", "二组"], students: [] },
  { id: "grade-3", name: "三年级", groups: ["一组"], students: [] }
];
const evaluationCategories: EvaluationCategory[] = ["课堂表现", "作业情况", "品德修养", "纪律常规"];

const families: PetFamily[] = ["图鉴", "萌芽系", "焰岩系", "潮汐系", "星辉系"];
const evolutionThresholds = [0, 8, 16, 24] as const;
const eggStages = ["沉睡蛋", "裂纹蛋", "共鸣蛋", "待孵化"] as const;
const defaultFinalEnergy = 200;
const maxScoreAdjustment = 200;
const defaultMaxLevel = 10;

function getPetLevel(progress: number, maxLevel: number, finalEnergy = defaultFinalEnergy) {
  return Array.from({ length: maxLevel }, (_, i) => Math.round((i * finalEnergy) / (maxLevel - 1))).filter(
    value => value <= Math.max(0, progress)
  ).length;
}

function getFormIndex(level: number, maxLevel: number) {
  return Math.round(((level - 1) * 9) / (maxLevel - 1));
}

function getNextPetThreshold(level: number, maxLevel: number, finalEnergy = defaultFinalEnergy) {
  return level >= maxLevel ? null : Math.round((level * finalEnergy) / (maxLevel - 1));
}

function getPetFormName(pet: PetOption, index: number) {
  if (index === 0) return `${pet.name}蛋`;
  if (index === 9) return pet.evolutions[3];
  const assetIndex = Math.min(3, Math.floor((index - 1) / 2));
  return `${pet.evolutions[assetIndex]}·${formStages[index]}`;
}

/** 根据通用积分计算未绑定宠物蛋时的蛋阶段。 */
function getEvolutionIndex(score: number) {
  if (score >= evolutionThresholds[3]) return 3;
  if (score >= evolutionThresholds[2]) return 2;
  if (score >= evolutionThresholds[1]) return 1;
  return 0;
}

const initialStudents: StudentPet[] = [];

/** 未孵化蛋也会响应积分，确保每次加分都有能量和动效反馈。 */
function IncubatingEgg({ score, className }: { score: number; className?: string }) {
  const stageIndex = getEvolutionIndex(score);
  const energy = Math.min(score, evolutionThresholds[3]);
  const energyRatio = energy / evolutionThresholds[3];
  return (
    <div
      className={cn("relative aspect-square", className)}
      aria-label={`${eggStages[stageIndex]}，孵化能量${energy}/${evolutionThresholds[3]}`}
    >
      <span
        className="pointer-events-none absolute inset-[16%] rounded-full bg-amber-300 blur-2xl transition-all duration-500"
        style={{ opacity: 0.08 + energyRatio * 0.42, transform: `scale(${0.8 + energyRatio * 0.35})` }}
      />
      <img
        key={score}
        src="/pets/stone-monkey.png"
        alt={eggStages[stageIndex]}
        draggable={false}
        className="pointer-events-none relative z-[1] h-full w-full select-none object-contain animate-in fade-in zoom-in-95 duration-300"
        style={{
          filter: `saturate(${0.72 + energyRatio * 0.75}) brightness(${0.9 + energyRatio * 0.16}) drop-shadow(0 10px ${8 + energyRatio * 14}px rgba(245, 158, 11, ${0.08 + energyRatio * 0.32}))`,
          transform: `scale(${0.92 + energyRatio * 0.08})`
        }}
      />
      {stageIndex >= 2 && (
        <Sparkles className="absolute right-[12%] top-[16%] z-[2] h-6 w-6 animate-pulse text-amber-400" />
      )}
      {stageIndex >= 3 && (
        <Sparkles className="absolute bottom-[22%] left-[10%] z-[2] h-5 w-5 animate-pulse text-orange-500" />
      )}
      <div className="absolute bottom-0 left-1/2 z-[3] min-w-32 -translate-x-1/2 rounded-full border border-amber-200 bg-white/95 px-3 py-1.5 text-center shadow-sm">
        <p className="text-[11px] font-black text-amber-700">{eggStages[stageIndex]}</p>
        <p className="text-[10px] font-bold text-slate-400">
          能量 {energy}/{evolutionThresholds[3]}
        </p>
      </div>
    </div>
  );
}

/** 通过色相和系列标识区分每一枚已绑定的宠物蛋，避免额外露出被裁切的宠物预览。 */
function PetEgg({
  pet,
  progress,
  hatchThreshold,
  className
}: {
  pet: PetOption;
  progress: number;
  hatchThreshold: number;
  className?: string;
}) {
  const hue = Array.from(pet.id).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 280;
  const energyRatio = Math.min(1, progress / hatchThreshold);
  return (
    <div
      className={cn("relative aspect-square", className)}
      aria-label={`${pet.name}宠物蛋，孵化进度${progress}/${hatchThreshold}`}
    >
      <span
        className="absolute inset-[15%] rounded-full bg-amber-300 blur-2xl transition-opacity duration-500"
        style={{ opacity: 0.12 + energyRatio * 0.42 }}
      />
      <img
        src="/pets/stone-monkey.png"
        alt={`${pet.name}宠物蛋`}
        draggable={false}
        className="pet-egg-idle pointer-events-none relative z-[1] h-full w-full select-none object-contain"
        style={{
          filter: `hue-rotate(${hue}deg) saturate(${1.05 + energyRatio * 0.7}) brightness(${0.94 + energyRatio * 0.12}) drop-shadow(0 10px 14px rgba(15, 23, 42, 0.18))`
        }}
      />
      <span
        className={cn(
          "absolute right-[13%] top-[18%] z-[2] rounded-full px-2 py-1 text-[10px] font-black shadow-sm",
          pet.badge
        )}
      >
        {pet.family}
      </span>
      <div className="absolute bottom-0 left-1/2 z-[3] min-w-36 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-center shadow-sm">
        <p className="text-[11px] font-black text-slate-700">{pet.name}蛋</p>
        <p className="text-[10px] font-bold text-slate-400">
          孵化 {progress}/{hatchThreshold}
        </p>
      </div>
    </div>
  );
}

/** 根据宠物系列展示对应图标。 */
function FamilyIcon({ family }: { family: PetFamily }) {
  if (family === "图鉴") return <BookOpen className="h-4 w-4" />;
  if (family === "萌芽系") return <Leaf className="h-4 w-4" />;
  if (family === "焰岩系") return <Flame className="h-4 w-4" />;
  if (family === "潮汐系") return <Droplets className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

/** 成就徽章图标，未解锁时显示灰色状态。 */
function AwardIcon({ unlocked }: { unlocked: boolean }) {
  return <Medal className={cn("h-6 w-6", unlocked ? "text-orange-500" : "text-slate-300")} />;
}

/** 设置面板里复用的小统计卡片。 */
function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <strong className="block text-2xl">{value}</strong>
      <span className="text-sm font-bold text-slate-500">{label}</span>
    </div>
  );
}

/** 兜底规范化班级名称，兼容旧数据缺字段的情况。 */
function normalizeClassName(value: unknown): ClassName {
  return typeof value === "string" && value.trim() ? value.trim() : "一年级";
}

/** 兜底规范化班级 ID，旧数据没有 ID 时用班级名称代替。 */
function normalizeClassId(value: unknown, className: ClassName): string {
  return typeof value === "string" && value.trim() ? value.trim() : className;
}

/** 规范化学生宠物字段，并根据成长值重新推导等级和阶段。 */
function normalizeStudent(
  student: StudentPet,
  maxLevel = defaultMaxLevel,
  finalEnergy = defaultFinalEnergy
): StudentPet {
  const petProgress = student.petProgress ?? (student.petId ? student.score : 0);
  const level = getPetLevel(student.petExperience, maxLevel, finalEnergy);
  const petHatched = Boolean(student.petId && level > 1);
  const formIndex = getFormIndex(level, maxLevel);
  return {
    ...student,
    className: normalizeClassName(student.className),
    classId: normalizeClassId(student.classId, normalizeClassName(student.className)),
    petProgress,
    petHatched,
    level,
    stage: formIndex === 0 ? "初始形态" : (formStages[formIndex] ?? "终极形态"),
    absent: Boolean(student.absent),
    completedPets: student.completedPets ?? 0
  };
}

/** 将学生管理模块的学生转换为宠物积分模块的初始学生。 */
function toPetPointStudent(classroom: Classroom, student: ClassroomStudent): StudentPet {
  return {
    id: student.id,
    name: student.name,
    studentNo: student.studentNo,
    classId: classroom.id,
    className: classroom.name,
    group: student.group || "未分组",
    score: 0,
    maxScore: 30,
    trophies: 0,
    level: 1,
    stage: "初始形态",
    petProgress: 0,
    petHatched: false,
    absent: false,
    completedPets: 0,
    petExperience: 0,
    cycleId: "",
    revision: 0,
    completionPending: false
  };
}

/** 用班级学生名单替换当前班级数据，同时保留已有积分和宠物进度。 */
function replaceClassStudents(currentStudents: StudentPet[], classroom: Classroom) {
  const currentById = new Map(currentStudents.map(student => [student.id, student]));
  const nextClassStudents = classroom.students.map(student => {
    const apiStudent = toPetPointStudent(classroom, student);
    const currentStudent = currentById.get(apiStudent.id);
    return currentStudent
      ? {
          ...currentStudent,
          name: apiStudent.name,
          studentNo: apiStudent.studentNo,
          classId: apiStudent.classId,
          className: apiStudent.className,
          group: apiStudent.group
        }
      : apiStudent;
  });
  return [...currentStudents.filter(student => student.classId !== classroom.id), ...nextClassStudents];
}

function CompletedPetPortrait({ petId }: { petId: string }) {
  const pet = petOptions.find(item => item.id === petId);
  return pet ? <PetSprite pet={pet} stageIndex={9} className="mb-2 w-20" /> : null;
}

const emptySubscribe = () => () => {};

/** 宠物积分主界面，串联学生筛选、批量评分、宠物选择、兑换和报表弹窗。 */
export function PetPoints() {
  const [completed, setCompleted] = useState<CompletedPetView[]>([]);
  const [rulesVersion, setRulesVersion] = useState(1);
  const [certificate, setCertificate] = useState<{
    snapshot: CompletedPetView;
    name: string;
    kind: "certificate" | "memory";
  } | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const pendingWrites = useRef(new Map<string, Record<string, unknown>>());
  const overviewRequest = useRef(0);
  const needsRefresh = useRef(false);
  const [refreshError, setRefreshError] = useState("");
  const [students, setStudents] = useState<StudentPet[]>(initialStudents);
  const [maxPetLevel, setMaxPetLevel] = useState(defaultMaxLevel);
  const [maxPetLevelDraft, setMaxPetLevelDraft] = useState(defaultMaxLevel);
  const [maxPetEnergy, setMaxPetEnergy] = useState(defaultFinalEnergy);
  const [maxPetEnergyDraft, setMaxPetEnergyDraft] = useState(defaultFinalEnergy);
  const [completionBadges, setCompletionBadges] = useState(1);
  const [completionBadgesDraft, setCompletionBadgesDraft] = useState("1");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [rubrics, setRubrics] = useState<RubricItem[]>([]);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("全部分组");
  const [sortMode, setSortMode] = useState<SortMode>("分数降序");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("normal");
  const [studentDataLoading, setStudentDataLoading] = useState(false);
  const [studentDataError, setStudentDataError] = useState("");
  const studentRequestIdRef = useRef(0);
  const [activeFamily, setActiveFamily] = useState<PetFamily>("图鉴");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petNickname, setPetNickname] = useState("");
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [recordStudentId, setRecordStudentId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [evaluationMode, setEvaluationMode] = useState<"batch" | "advanced" | null>(null);
  const [activeCategory, setActiveCategory] = useState<EvaluationCategory>("课堂表现");
  const [selectedRubricIds, setSelectedRubricIds] = useState<string[]>([]);
  const [evaluationNote, setEvaluationNote] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel | null>(null);
  const settingsPanelRef = useRef(settingsPanel);
  const [rewardStoreOpen, setRewardStoreOpen] = useState(false);
  const [rewardStoreTab, setRewardStoreTab] = useState<"商品列表" | "兑换记录">("商品列表");
  const [rewardStudentId, setRewardStudentId] = useState(initialStudents[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [petEffects, setPetEffects] = useState<Record<string, "hatch" | "evolve">>({});
  const [scoreAdjustStudentId, setScoreAdjustStudentId] = useState<string | null>(null);
  const [scoreAdjustMode, setScoreAdjustMode] = useState<ScoreAdjustMode>("add");
  const [scoreAdjustValue, setScoreAdjustValue] = useState("1");
  const [scoreAdjustReason, setScoreAdjustReason] = useState("");
  const [scoreAdjustNote, setScoreAdjustNote] = useState("");
  const [newRubricLabel, setNewRubricLabel] = useState("");
  const [newRubricCategory, setNewRubricCategory] = useState<EvaluationCategory>("课堂表现");
  const [newRubricScore, setNewRubricScore] = useState(1);
  const [editingRubricId, setEditingRubricId] = useState<string | null>(null);
  const [editingRubricLabel, setEditingRubricLabel] = useState("");
  const [editingRubricCategory, setEditingRubricCategory] = useState<EvaluationCategory>("课堂表现");
  const [editingRubricScore, setEditingRubricScore] = useState(1);
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardCost, setNewRewardCost] = useState(5);
  const [newRewardStock, setNewRewardStock] = useState(1);
  const [restockDrafts, setRestockDrafts] = useState<Record<string, string>>({});
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<boolean>;
  } | null>(null);

  useEffect(() => {
    settingsPanelRef.current = settingsPanel;
  }, [settingsPanel]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 10000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!Object.keys(petEffects).length) return;
    const timer = window.setTimeout(() => setPetEffects({}), 1800);
    return () => window.clearTimeout(timer);
  }, [petEffects]);

  const activeClass = useMemo(
    () => classrooms.find(classroom => classroom.id === activeClassId) ?? classrooms[0] ?? fallbackClassrooms[0]!,
    [activeClassId, classrooms]
  );
  const hasBackendClassrooms = classrooms.length > 0;

  /** 从后端加载宠物积分总览，包括学生、规则、奖品、记录和兑换数据。 */
  const loadPetPointsOverview = useCallback(async () => {
    const requestId = ++overviewRequest.current;
    // Bypass the shared 600ms GET reuse so a just-committed revision cannot be replaced by stale data.
    const overview = await request<PetPointsOverview, PetPointsOverview>("/api/pet-points", {
      params: { readRevision: requestId }
    });
    if (requestId !== overviewRequest.current) return;
    needsRefresh.current = false;
    setRefreshError("");
    const nextMaxLevel = overview.settings?.maxLevel ?? defaultMaxLevel;
    const nextFinalEnergy = overview.settings?.finalEnergy ?? defaultFinalEnergy;
    setCompleted(overview.completed ?? []);
    setRulesVersion(overview.settings.version);
    setMaxPetLevel(nextMaxLevel);
    if (settingsPanelRef.current !== "等级规则") setMaxPetLevelDraft(nextMaxLevel);
    setCompletionBadges(overview.settings.completionBadges ?? 1);
    if (settingsPanelRef.current !== "等级规则")
      setCompletionBadgesDraft(String(overview.settings.completionBadges ?? 1));
    setMaxPetEnergy(nextFinalEnergy);
    if (settingsPanelRef.current !== "等级规则") setMaxPetEnergyDraft(nextFinalEnergy);
    setStudents(overview.students.map(student => normalizeStudent(student, nextMaxLevel, nextFinalEnergy)));
    setRubrics(overview.rubrics);
    setRewards(overview.rewards);
    setRecords(overview.records);
    setRedemptions(overview.redemptions);
  }, []);

  /** Retain the exact operation and revisions after an uncertain response; refresh failures never resubmit writes. */
  const perform = async (
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    data: Record<string, unknown>,
    studentIds: string[] = [],
    onSaved?: (result: unknown) => void
  ) => {
    if (busyRef.current) return false;
    if (needsRefresh.current) {
      setNotice("请先刷新数据，确认最新保存结果");
      return false;
    }
    overviewRequest.current++;
    busyRef.current = true;
    setBusy(true);
    let key: string | undefined;
    try {
      key = JSON.stringify({ url, method, data });
      // 编号生成等准备阶段也必须释放操作锁，避免异常后所有写入永久禁用。
      let payload = pendingWrites.current.get(key);
      if (!payload) {
        payload = {
          ...data,
          // 局域网 HTTP 不提供 randomUUID，复用兼容生成器并保留重试时的操作编号。
          operationId: createUuid(),
          revisions: Object.fromEntries(
            studentIds.map(id => [id, students.find(student => student.id === id)?.revision])
          )
        };
        pendingWrites.current.set(key, payload);
      }
      const result = await request({ url, method, data: payload });
      onSaved?.(result);
      pendingWrites.current.delete(key);
      await loadPetPointsOverview().catch(() => {
        needsRefresh.current = true;
        setRefreshError("已保存，刷新失败；请点击刷新数据，不要再次提交");
      });
      return true;
    } catch (error) {
      const failure = error as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (failure.response?.status && failure.response.status < 500) {
        if (key) pendingWrites.current.delete(key);
        if (failure.response.status === 409) await loadPetPointsOverview().catch(() => undefined);
      }
      setNotice(failure.response?.data?.message ?? failure.message ?? "操作失败，保留原输入，请重试");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const savePetSettings = async () => {
    if (
      !completionBadgesDraft.trim() ||
      !Number.isInteger(Number(completionBadgesDraft) * 2) ||
      Number(completionBadgesDraft) < 0 ||
      Number(completionBadgesDraft) > 10000
    )
      return;
    if (
      await perform("/api/pet-points/settings", "PATCH", {
        maxLevel: maxPetLevelDraft,
        finalEnergy: maxPetEnergyDraft,
        completionBadges: Number(completionBadgesDraft),
        expectedVersion: rulesVersion
      })
    )
      setNotice("宠物等级经验设置已更新");
  };

  /** 按当前筛选条件加载班级学生，并同步到宠物积分学生表。 */
  const requestClassroomStudents = useCallback(
    async (filters: PetPointStudentFilters) => {
      const requestId = studentRequestIdRef.current + 1;
      studentRequestIdRef.current = requestId;
      setStudentDataLoading(true);
      setStudentDataError("");
      try {
        const classroom = await request<Classroom, Classroom>(`/api/classes/${filters.classId}`);
        if (studentRequestIdRef.current !== requestId) return;
        await request<StudentPet[], StudentPet[]>({
          url: "/api/pet-points/students/sync",
          method: "POST",
          data: { classId: classroom.id }
        });
        if (studentRequestIdRef.current !== requestId) return;
        await loadPetPointsOverview();
        if (studentRequestIdRef.current !== requestId) return;
        setClassrooms(current =>
          current.some(item => item.id === classroom.id)
            ? current.map(item => (item.id === classroom.id ? classroom : item))
            : [...current, classroom]
        );
      } catch {
        if (studentRequestIdRef.current === requestId) {
          setStudentDataError("学生同步失败，请检查后端服务");
        }
      } finally {
        if (studentRequestIdRef.current === requestId) setStudentDataLoading(false);
      }
    },
    [loadPetPointsOverview]
  );

  /** 初始化班级列表，并优先同步第一个班级的宠物积分数据。 */
  const requestClassrooms = useCallback(async () => {
    setStudentDataLoading(true);
    setStudentDataError("");
    try {
      const data = await request<Classroom[], Classroom[]>("/api/classes");
      const nextClassrooms = data;
      const nextActiveClass = nextClassrooms[0];
      setClassrooms(nextClassrooms);
      setActiveClassId(nextActiveClass?.id ?? "");
      setStudents(current =>
        nextClassrooms.reduce((nextStudents, classroom) => replaceClassStudents(nextStudents, classroom), current)
      );
      if (nextActiveClass) {
        await requestClassroomStudents({
          classId: nextActiveClass.id,
          groupFilter: "全部分组",
          query: "",
          sortMode: "分数降序"
        });
      } else {
        await loadPetPointsOverview();
      }
    } catch {
      await loadPetPointsOverview().catch(() => undefined);
      setStudentDataError("班级数据接口获取失败，已显示现有宠物积分数据");
    } finally {
      setStudentDataLoading(false);
    }
  }, [loadPetPointsOverview, requestClassroomStudents]);

  useEffect(() => {
    if (!hydrated) return;
    // The first client render initializes remote classroom state; later changes use explicit handlers.
    let ignore = false;
    void Promise.resolve().then(() => {
      if (!ignore) {
        requestClassrooms();
      }
    });
    return () => {
      ignore = true;
    };
  }, [hydrated, requestClassrooms]);

  const classStudents = useMemo(
    () => students.filter(student => student.classId === activeClass.id),
    [activeClass.id, students]
  );

  const groupOptions = useMemo(
    () => [
      "全部分组",
      ...Array.from(new Set([...(activeClass.groups ?? []), ...classStudents.map(student => student.group)]))
    ],
    [activeClass.groups, classStudents]
  );

  const classStudentIds = useMemo(() => new Set(classStudents.map(student => student.id)), [classStudents]);
  const classRecords = useMemo(
    () => records.filter(record => classStudentIds.has(record.studentId)),
    [classStudentIds, records]
  );

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = classStudents.filter(student => {
      const matchesQuery =
        !normalized || student.name.toLowerCase().includes(normalized) || student.studentNo.includes(normalized);
      const matchesGroup = groupFilter === "全部分组" || student.group === groupFilter;
      return matchesQuery && matchesGroup;
    });
    return result.sort((a, b) => {
      if (sortMode === "分数升序") return a.score - b.score;
      if (sortMode === "姓名排序") return a.name.localeCompare(b.name, "zh-CN");
      if (sortMode === "学号排序") return a.studentNo.localeCompare(b.studentNo);
      return b.score - a.score;
    });
  }, [classStudents, groupFilter, query, sortMode]);

  const selectedStudent = students.find(student => student.id === selectedStudentId);
  const historyStudent = students.find(student => student.id === historyStudentId);
  const recordStudent = students.find(student => student.id === recordStudentId);
  const scoreAdjustStudent = students.find(student => student.id === scoreAdjustStudentId);
  const rewardStudent = classStudents.find(student => student.id === rewardStudentId) ?? classStudents[0];
  const filteredPets = petOptions.filter(pet => activeFamily === "图鉴" || pet.family === activeFamily);
  const selectedPet = petOptions.find(pet => pet.id === selectedPetId);
  const enabledCategoryRubrics = rubrics.filter(item => item.enabled && item.category === activeCategory);
  const selectedRubrics = rubrics.filter(item => selectedRubricIds.includes(item.id));
  const commonScoreRubrics = rubrics.filter(
    item => item.enabled && (scoreAdjustMode === "add" ? item.score > 0 : item.score < 0)
  );
  const availableRewards = rewards.filter(item => item.enabled);
  const evaluationAbsentCount = selectedStudentIds.filter(
    id => students.find(student => student.id === id)?.absent
  ).length;
  const evaluationTotal = selectedRubrics.reduce((sum, item) => sum + item.score, 0);
  const evaluatedScore = classRecords.reduce((sum, record) => sum + (record.scoreDelta ?? record.delta), 0);
  const incompleteHistory = classRecords.some(record => record.scoreDelta === undefined);
  const totalScore = classStudents.reduce((sum, student) => sum + student.score, 0);
  const averageScore = classStudents.length ? Math.round((totalScore / classStudents.length) * 10) / 10 : 0;
  const hatchedCount = classStudents.filter(student => student.petId && student.petHatched).length;

  /** 切换班级时清空搜索、分组和批量选择状态。 */
  const switchClass = (classId: string) => {
    if (!hasBackendClassrooms) return;
    const nextClass = classrooms.find(classroom => classroom.id === classId);
    if (!nextClass) return;
    setActiveClassId(classId);
    setQuery("");
    setGroupFilter("全部分组");
    setSelectedStudentIds([]);
    setBatchMode(false);
    setEvaluationMode(null);
    setRewardStudentId("");
    requestClassroomStudents({
      classId: nextClass.id,
      groupFilter: "全部分组",
      query: "",
      sortMode
    });
  };

  /** 切换分组筛选，并清空当前批量选择。 */
  const switchGroup = (nextGroup: string) => {
    setGroupFilter(nextGroup);
    setSelectedStudentIds([]);
  };

  /** 切换排序方式并刷新后端排序结果。 */
  const switchSortMode = (nextSortMode: SortMode) => {
    setSortMode(nextSortMode);
  };

  /** 更新搜索关键词，并按关键词重新同步当前班级学生。 */
  const switchQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setSelectedStudentIds([]);
  };

  /** 调整单个学生积分，同时由后端同步宠物成长能量和评价记录。 */
  const updateStudentScore = async (
    studentId: string,
    delta: number,
    label = delta > 0 ? "手动加分" : "手动扣分",
    note = ""
  ) => {
    const student = students.find(item => item.id === studentId);
    if (!student) return;
    return perform(
      "/api/pet-points/scores/adjust",
      "POST",
      { studentIds: [studentId], delta, label, category: "手动调整", note },
      [studentId]
    );
  };

  /** 打开手动加分/扣分弹窗，并按模式初始化表单。 */
  const openScoreAdjust = (studentId: string, mode: ScoreAdjustMode) => {
    setScoreAdjustStudentId(studentId);
    setScoreAdjustMode(mode);
    setScoreAdjustValue("1");
    setScoreAdjustReason(mode === "add" ? "手动加分" : "手动扣分");
    setScoreAdjustNote("");
  };

  /** 关闭积分调整弹窗，并清空调整草稿。 */
  const closeScoreAdjust = () => {
    setScoreAdjustStudentId(null);
    setScoreAdjustValue("1");
    setScoreAdjustReason("");
    setScoreAdjustNote("");
  };

  /** 提交手动积分调整，限制单次调整值在允许范围内。 */
  const applyScoreAdjust = async (value: string | number = scoreAdjustValue, reason = scoreAdjustReason) => {
    if (!scoreAdjustStudent) return;
    const normalizedValue = Number(value);
    if (!Number.isInteger(normalizedValue) || normalizedValue < 1 || normalizedValue > maxScoreAdjustment) {
      setNotice(`请输入 1 到 ${maxScoreAdjustment} 的整数分值`);
      return;
    }
    const delta = scoreAdjustMode === "add" ? normalizedValue : -normalizedValue;
    const saved = await updateStudentScore(
      scoreAdjustStudent.id,
      delta,
      reason.trim() || (delta > 0 ? "手动加分" : "手动扣分"),
      scoreAdjustNote.trim()
    );
    if (saved) closeScoreAdjust();
  };

  /** 新增评价指标，分值限制在 -10 到 10 之间。 */
  const addRubric = async () => {
    const label = newRubricLabel.trim();
    if (!label) return;
    if (
      !(await perform("/api/pet-points/rubrics", "POST", { category: newRubricCategory, label, score: newRubricScore }))
    )
      return;
    setNewRubricLabel("");
    setNewRubricScore(1);
  };

  /** 将指标修改保存到服务端，并用返回值更新当前列表。 */
  const updateRubric = async (rubricId: string, patch: Partial<Omit<RubricItem, "id">>) => {
    return perform(`/api/pet-points/rubrics/${rubricId}`, "PATCH", patch);
  };

  /** 打开指标编辑状态并复制当前服务端数据作为草稿。 */
  const editRubric = (rubric: RubricItem) => {
    setEditingRubricId(rubric.id);
    setEditingRubricLabel(rubric.label);
    setEditingRubricCategory(rubric.category);
    setEditingRubricScore(rubric.score);
  };

  /** 保存指标名称、分类和分值。 */
  const saveRubric = async () => {
    if (!editingRubricId || !editingRubricLabel.trim()) return;
    const saved = await updateRubric(editingRubricId, {
      label: editingRubricLabel.trim(),
      category: editingRubricCategory,
      score: Math.max(-10, Math.min(10, Math.round(editingRubricScore)))
    });
    if (saved) setEditingRubricId(null);
  };

  /** 新增兑换奖品，并规范化消耗积分和库存数值。 */
  const addReward = async () => {
    const name = newRewardName.trim();
    if (!name) return;
    if (!(await perform("/api/pet-points/rewards", "POST", { name, cost: newRewardCost, stock: newRewardStock })))
      return;
    setNewRewardName("");
    setNewRewardCost(5);
    setNewRewardStock(1);
  };

  /** 为当前兑换学生兑换奖品，积分或库存不足时直接忽略。 */
  const redeemReward = async (reward: RewardItem) => {
    if (!rewardStudent || reward.stock <= 0 || rewardStudent.score < reward.cost) return;
    if (
      !(await perform("/api/pet-points/rewards/redeem", "POST", { studentId: rewardStudent.id, rewardId: reward.id }, [
        rewardStudent.id
      ]))
    )
      return;
    setNotice(`${rewardStudent.name} 已兑换 ${reward.name}`);
  };

  /** 批量应用选中的评价指标，完成后退出评分模式。 */
  const applyEvaluation = async () => {
    if (!selectedStudentIds.length || !selectedRubrics.length) return;
    const studentIds = selectedStudentIds.filter(
      id => evaluationMode === "advanced" || !students.find(student => student.id === id)?.absent
    );
    if (!studentIds.length) {
      setNotice("没有可评分学生，普通批量排除请假学生");
      return;
    }
    let processed = studentIds.length;
    let skipped = 0;
    if (
      !(await perform(
        `/api/pet-points/scores/${evaluationMode === "advanced" ? "evaluate" : "batch-evaluate"}`,
        "POST",
        { studentIds, rubricIds: selectedRubricIds, note: evaluationNote.trim() },
        studentIds,
        result => {
          const outcome = result as { processedIds?: string[]; skippedIds?: string[] };
          processed = outcome.processedIds?.length ?? studentIds.length;
          skipped = outcome.skippedIds?.length ?? 0;
        }
      ))
    )
      return;
    setNotice(`已为 ${processed} 名学生完成评分${skipped ? `，跳过 ${skipped} 名请假学生` : ""}`);
    setEvaluationMode(null);
    setSelectedRubricIds([]);
    setEvaluationNote("");
    setSelectedStudentIds([]);
    setBatchMode(false);
  };

  /** 删除评价记录，并让后端回退对应积分和成长能量。 */
  const removeRecord = async (record: EvaluationRecord) => {
    const saved = await perform(`/api/pet-points/records/${record.id}`, "DELETE", {}, [record.studentId]);
    if (saved) setNotice("评价已回退；旧轮次仅回退积分余额，成长徽章不回收");
    return saved;
  };

  /** 切换单个学生的批量选择状态。 */
  const toggleStudentSelection = (studentId: string) => {
    if (evaluationMode !== "advanced" && students.find(student => student.id === studentId)?.absent) return;
    setSelectedStudentIds(current =>
      current.includes(studentId) ? current.filter(id => id !== studentId) : [...current, studentId]
    );
  };

  /** 全选或取消全选当前筛选后的可见学生。 */
  const toggleAllVisible = () => {
    const visibleIds = filteredStudents.filter(student => !student.absent).map(student => student.id);
    const allSelected = visibleIds.every(id => selectedStudentIds.includes(id));
    setSelectedStudentIds(current =>
      allSelected ? current.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds]))
    );
  };

  /** 反选当前可见学生，保留不可见学生原有选择状态。 */
  const invertVisible = () => {
    const visibleIds = filteredStudents.filter(student => !student.absent).map(student => student.id);
    setSelectedStudentIds(current => {
      const outside = current.filter(id => !visibleIds.includes(id));
      const inverted = visibleIds.filter(id => !current.includes(id));
      return [...outside, ...inverted];
    });
  };

  /** 打开宠物选择器，并重置系列筛选和昵称草稿。 */
  const openPetPicker = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSelectedPetId(null);
    setPetNickname("");
    setActiveFamily("图鉴");
  };

  /** 选择宠物时默认把宠物名填入昵称输入框。 */
  const selectPet = (pet: PetOption) => {
    setSelectedPetId(pet.id);
    setPetNickname(pet.name);
  };

  /** 关闭宠物选择器并清空选择状态。 */
  const closePetPicker = () => {
    setSelectedStudentId(null);
    setSelectedPetId(null);
    setPetNickname("");
  };

  /** 确认绑定宠物蛋，昵称为空时使用宠物默认名称。 */
  const confirmPet = async () => {
    if (!selectedStudent || !selectedPet) return;
    const nickname = petNickname.trim() || selectedPet.name;
    if (
      !(await perform(
        `/api/pet-points/students/${selectedStudent.id}/pet`,
        "PATCH",
        { petId: selectedPet.id, petName: nickname },
        [selectedStudent.id]
      ))
    )
      return;
    closePetPicker();
  };

  /** 打开指定设置面板，并收起设置菜单。 */
  const openSettingsPanel = (panel: SettingsPanel) => {
    setSettingsPanel(panel);
    setSettingsOpen(false);
  };

  const resetPet = async (student: StudentPet) => {
    const complete = student.completionPending;
    const saved = await perform(
      `/api/pet-points/students/${student.id}/pet/${complete ? "complete" : "reset"}`,
      "POST",
      {},
      [student.id]
    );
    if (saved) {
      setNotice(complete ? "满级宠物已进入养成成就与成长徽章" : "养成已重置，积分和徽章保留");
      if (complete) {
        setHistoryStudentId(null);
        openPetPicker(student.id);
      }
    }
    return saved;
  };

  const updateStudentFlag = (student: StudentPet, flag: "absence" | "trophies", value: boolean | number) =>
    perform(
      `/api/pet-points/students/${student.id}/${flag}`,
      "PATCH",
      flag === "absence" ? { absent: value } : { delta: value },
      [student.id]
    );

  /** 将评价记录时间格式化为列表里使用的短时间。 */
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));

  usePetDialog(
    {
      selectedStudentId,
      historyStudentId,
      recordStudentId,
      scoreAdjustStudentId,
      evaluationMode,
      reportOpen,
      settingsPanel,
      rewardStoreOpen,
      certificateOpen: Boolean(certificate),
      confirmOpen: Boolean(confirmAction)
    },
    () => {
      if (certificate) setCertificate(null);
      else if (selectedStudentId) closePetPicker();
      else if (scoreAdjustStudentId) closeScoreAdjust();
      else if (historyStudentId) setHistoryStudentId(null);
      else if (recordStudentId) setRecordStudentId(null);
      else if (evaluationMode) setEvaluationMode(null);
      else if (rewardStoreOpen) setRewardStoreOpen(false);
      else if (settingsPanel) setSettingsPanel(null);
      else setReportOpen(false);
    }
  );

  const metricPicker = (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {evaluationCategories.map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "h-10 rounded-lg bg-slate-100 text-sm font-black text-slate-500 transition",
              activeCategory === category && "bg-slate-950 text-white"
            )}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {enabledCategoryRubrics.map(item => {
          const selected = selectedRubricIds.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() =>
                setSelectedRubricIds(current =>
                  selected ? current.filter(id => id !== item.id) : [...current, item.id]
                )
              }
              className={cn(
                "flex min-h-20 items-center justify-between rounded-xl border-2 border-slate-100 bg-white p-4 text-left transition hover:border-slate-200",
                selected && "border-orange-400 bg-orange-50"
              )}
            >
              <span className="flex items-center gap-2 font-black">
                {selected ? (
                  <CheckSquare className="h-5 w-5 text-orange-500" />
                ) : (
                  <Square className="h-5 w-5 text-slate-300" />
                )}
                {item.label}
              </span>
              <span className={cn("text-xl font-black", item.score > 0 ? "text-emerald-600" : "text-rose-500")}>
                {item.score > 0 ? `+${item.score}` : item.score}
              </span>
            </button>
          );
        })}
      </div>
      {!enabledCategoryRubrics.length && (
        <div className="mt-4 rounded-xl bg-slate-50 p-8 text-center font-bold text-slate-400">该分类暂无启用指标</div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f7f9fc] text-slate-950">
      {(notice || refreshError) && (
        <div
          role="status"
          className="fixed left-1/2 top-5 z-[10010] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl"
        >
          {refreshError || notice}
        </div>
      )}
      <header className="flex shrink-0 flex-col items-stretch gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:flex-wrap lg:items-center lg:px-5">
        <div className="flex items-center gap-3 pr-2">
          <PawPrint className="h-5 w-5 text-pink-500" />
          <h2 className="text-lg font-black">宠物积分</h2>
        </div>
        <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 text-lg font-black hover:bg-slate-100 lg:text-xl">
          <span className="h-8 w-1.5 rounded-full bg-orange-500" />
          <select
            value={activeClass.id}
            onChange={event => switchClass(event.target.value)}
            disabled={!hasBackendClassrooms || studentDataLoading}
            className="min-w-0 flex-1 appearance-none bg-transparent pr-5 outline-none"
            aria-label="切换班级"
          >
            {classrooms.map(classroom => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative h-11 min-w-0 flex-1 xl:max-w-[340px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={event => switchQuery(event.target.value)}
            disabled={!hasBackendClassrooms}
            placeholder="姓名、拼音、学号"
            className="h-11 rounded-xl border-0 bg-slate-100 pl-12 text-base font-semibold shadow-none"
          />
        </div>
        {studentDataLoading && (
          <Badge className="border border-sky-100 bg-sky-50 px-3 py-2 text-sky-600 shadow-none">接口加载中</Badge>
        )}
        {studentDataError && (
          <Badge className="border border-rose-100 bg-rose-50 px-3 py-2 text-rose-600 shadow-none">
            {studentDataError}
          </Badge>
        )}
        {batchMode ? (
          <div className="flex w-full gap-2 overflow-x-auto pb-1 [&>*]:shrink-0 lg:w-auto lg:flex-wrap lg:overflow-visible lg:pb-0">
            <span className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-black text-orange-600">
              已选 {selectedStudentIds.length} / {filteredStudents.length}
            </span>
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={invertVisible}>
              反选
            </Button>
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={toggleAllVisible}>
              {filteredStudents.every(student => selectedStudentIds.includes(student.id)) ? "取消全选" : "全选"}
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl font-bold"
              onClick={() => {
                setBatchMode(false);
                setSelectedStudentIds([]);
              }}
            >
              取消
            </Button>
            <Button
              className="h-11 rounded-xl bg-orange-500 font-black text-white hover:bg-orange-600"
              disabled={!selectedStudentIds.length}
              onClick={() => {
                setEvaluationMode("batch");
                setSelectedRubricIds([]);
              }}
            >
              确定评分
            </Button>
          </div>
        ) : (
          <div className="flex w-full gap-2 overflow-x-auto pb-1 [&>*]:shrink-0 lg:w-auto lg:flex-wrap lg:overflow-visible lg:pb-0">
            <label className="relative flex h-11 items-center rounded-xl border border-slate-200 bg-white pl-11 pr-3 font-bold">
              <Users className="absolute left-4 h-5 w-5 text-slate-500" />
              <select
                value={groupFilter}
                onChange={event => switchGroup(event.target.value)}
                disabled={!hasBackendClassrooms}
                className="appearance-none bg-transparent pr-5 outline-none"
                aria-label="筛选分组"
              >
                {groupOptions.map(group => (
                  <option key={group}>{group}</option>
                ))}
              </select>
            </label>
            <label className="relative flex h-11 items-center rounded-xl border border-slate-200 bg-white pl-11 pr-3 font-bold">
              <ArrowDownUp className="absolute left-4 h-5 w-5 text-slate-500" />
              <select
                value={sortMode}
                onChange={event => switchSortMode(event.target.value as SortMode)}
                disabled={!hasBackendClassrooms}
                className="appearance-none bg-transparent pr-5 outline-none"
                aria-label="排序方式"
              >
                {["分数降序", "分数升序", "姓名排序", "学号排序"].map(mode => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </label>
            <Button
              className="relative h-11 rounded-xl bg-gradient-to-r from-violet-500 to-sky-400 px-5 font-black text-white"
              disabled={!hasBackendClassrooms}
              onClick={() => setReportOpen(true)}
            >
              <ClipboardList className="h-5 w-5" />
              积分报告
              {/* <Badge className="absolute -right-2 -top-2 bg-red-500 text-white">限时</Badge> */}
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl bg-amber-100 px-4 font-bold text-amber-700 hover:bg-amber-200"
              disabled={!hasBackendClassrooms}
              onClick={() => {
                setRewardStoreTab("商品列表");
                setRewardStoreOpen(true);
                setRewardStudentId(classStudents[0]?.id ?? "");
              }}
            >
              <Gift className="h-5 w-5" />
              兑换站
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl bg-slate-100 px-4 font-bold"
              disabled={!hasBackendClassrooms}
              onClick={() => {
                setBatchMode(true);
                setSelectedStudentIds([]);
              }}
            >
              <BookOpen className="h-5 w-5" />
              批量
            </Button>
            <Button
              variant="ghost"
              className="h-11 rounded-xl bg-slate-100 px-4 font-bold"
              disabled={!hasBackendClassrooms}
              onClick={() => {
                setEvaluationMode("advanced");
                setSelectedStudentIds([]);
                setSelectedRubricIds([]);
              }}
            >
              <SlidersHorizontal className="h-5 w-5" />
              高级
            </Button>
            <div className="flex h-11 items-center rounded-xl bg-slate-100 p-1" aria-label="卡片显示模式">
              {(
                [
                  ["normal", "普通模式", Grid2X2],
                  ["compact", "紧凑模式", Grid3X3]
                ] as const
              ).map(([mode, label, ModeIcon]) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={label}
                  aria-pressed={displayMode === mode}
                  title={label}
                  onClick={() => setDisplayMode(mode)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition",
                    displayMode === mode ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  <ModeIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-xl bg-slate-100"
                aria-label="设置"
                disabled={!hasBackendClassrooms}
                onClick={() => setSettingsOpen(current => !current)}
              >
                <Settings className="h-5 w-5" />
              </Button>
              {settingsOpen && (
                <div className="absolute right-0 top-12 z-20 grid w-44 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {(["指标配置", "奖品配置", "等级规则", "宠物统计", "最近评分", "积分统计"] as SettingsPanel[]).map(
                    panel => (
                      <button
                        key={panel}
                        onClick={() => openSettingsPanel(panel)}
                        className="rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100"
                      >
                        {panel}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => {
                      setSettingsOpen(false);
                      setConfirmAction({
                        title: "刷新宠物积分数据",
                        description: "将重新从后端读取学生积分、宠物、评价记录、奖品和指标配置。",
                        confirmLabel: "确认刷新",
                        onConfirm: async () => {
                          try {
                            await loadPetPointsOverview();
                            setNotice("后端数据已刷新");
                            return true;
                          } catch {
                            setNotice("刷新失败，请重试");
                            return false;
                          }
                        }
                      });
                    }}
                    className="rounded-lg px-3 py-2 text-left text-sm font-bold text-sky-600 hover:bg-sky-50"
                  >
                    刷新后端数据
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <main
        aria-label="宠物积分学生列表"
        data-display-mode={displayMode}
        className={cn(
          "grid min-h-0 flex-1 content-start overflow-y-auto",
          displayMode === "compact"
            ? "grid-cols-2 gap-1.5 p-1.5 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-2 sm:p-2"
            : "grid-cols-1 gap-4 p-3 sm:grid-cols-2 sm:p-4 lg:gap-5 lg:p-5"
        )}
      >
        {filteredStudents.map(student => {
          const pet = petOptions.find(item => item.id === student.petId);
          const genericEvolutionIndex = getEvolutionIndex(student.petExperience);
          const petEvolutionIndex = getFormIndex(student.level, maxPetLevel);
          const currentFormName = pet ? getPetFormName(pet, petEvolutionIndex) : "";
          const nextPetThreshold = getNextPetThreshold(student.level, maxPetLevel, maxPetEnergy);
          const growthValue = student.petExperience;
          const percent = Math.min(100, Math.round((growthValue / (nextPetThreshold ?? maxPetEnergy)) * 100));
          const petEffect = petEffects[student.id];
          return (
            <section
              data-pet-dialog
              data-student-card
              key={student.id}
              className={cn(
                "border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                displayMode === "compact" ? "rounded-xl p-2" : "rounded-2xl p-4",
                selectedStudentIds.includes(student.id) && "border-orange-400 ring-2 ring-orange-200"
              )}
            >
              <div
                data-pet-preview
                className={cn(
                  "relative flex items-center justify-center overflow-hidden border border-slate-100 bg-[radial-gradient(circle_at_center,#ffffff_0%,#f8fafc_72%)]",
                  displayMode === "compact" ? "h-28 rounded-xl" : "h-48 rounded-2xl"
                )}
              >
                {batchMode && (
                  <span
                    className={cn(
                      "absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white",
                      selectedStudentIds.includes(student.id)
                        ? "border-orange-500 text-orange-500"
                        : "border-slate-200 text-slate-300"
                    )}
                  >
                    {selectedStudentIds.includes(student.id) ? <Check className="h-4 w-4" /> : null}
                  </span>
                )}
                {student.trophies > 0 && (
                  <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-1.5">
                    {Math.floor(student.trophies / 2) > 0 && (
                      <Badge
                        aria-label={`奖杯 ${Math.floor(student.trophies / 2)}`}
                        className={cn(
                          "gap-1 border border-yellow-200 bg-white text-yellow-700 shadow-none",
                          displayMode === "compact" ? "px-1 py-0.5 text-[10px]" : "px-2 py-1"
                        )}
                      >
                        <Trophy className="h-4 w-4" aria-hidden="true" />×{Math.floor(student.trophies / 2)}
                      </Badge>
                    )}
                    <Badge
                      aria-label={`成长徽章 ${student.trophies}`}
                      className={cn(
                        "gap-1 border border-orange-200 bg-white text-orange-500 shadow-none",
                        displayMode === "compact" ? "px-1 py-0.5 text-[10px]" : "px-2 py-1"
                      )}
                    >
                      <Medal className="h-4 w-4" aria-hidden="true" />×{student.trophies}
                    </Badge>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (batchMode) toggleStudentSelection(student.id);
                    else if (!student.petId) openPetPicker(student.id);
                    else if (student.completionPending) setHistoryStudentId(student.id);
                    else openScoreAdjust(student.id, "add");
                  }}
                  className="group flex h-full w-full items-center justify-center"
                  aria-label={student.petId ? `为${student.name}评分` : `为${student.name}选择宠物`}
                >
                  {pet && student.petHatched ? (
                    <div className="text-center">
                      <PetSprite
                        key={`${pet.id}-${petEvolutionIndex}-${petEffect ?? "idle"}`}
                        pet={pet}
                        stageIndex={petEvolutionIndex}
                        className={cn(
                          "mx-auto animate-in fade-in zoom-in-75 duration-500 group-hover:scale-105",
                          displayMode === "compact" ? "w-20" : "w-36",
                          petEffect && "pet-evolution-pop"
                        )}
                      />
                      <div className="flex items-center justify-center gap-1.5">
                        {displayMode === "normal" && (
                          <span className={cn("rounded-full px-2 py-1 text-[11px] font-black", pet.badge)}>
                            {pet.family}
                          </span>
                        )}
                        <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-black text-slate-600 shadow-sm">
                          {currentFormName}
                        </span>
                      </div>
                    </div>
                  ) : pet ? (
                    <PetEgg
                      key={`${pet.id}-egg-${student.petProgress}`}
                      pet={pet}
                      progress={student.petExperience}
                      hatchThreshold={getNextPetThreshold(1, maxPetLevel, maxPetEnergy)!}
                      className={cn(
                        "transition duration-300 group-hover:scale-105",
                        displayMode === "compact" ? "w-24" : "w-40"
                      )}
                    />
                  ) : (
                    <IncubatingEgg
                      key={`egg-${student.petExperience}`}
                      score={student.petExperience}
                      className={cn(
                        "transition duration-300 group-hover:scale-105",
                        displayMode === "compact" ? "w-24" : "w-40"
                      )}
                    />
                  )}
                </button>
                {petEffect && pet && (
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 z-[8] flex items-center justify-center overflow-hidden rounded-2xl",
                      petEffect === "hatch" ? "pet-hatch-effect" : "pet-evolve-effect"
                    )}
                  >
                    <span className="pet-effect-ring absolute h-28 w-28 rounded-full border-4 border-white/80" />
                    <span className="pet-effect-ring pet-effect-ring-delay absolute h-40 w-40 rounded-full border-2 border-amber-300/70" />
                    <div className="relative flex flex-col items-center rounded-xl bg-white/90 px-5 py-3 text-center shadow-xl">
                      <Sparkles className="h-7 w-7 animate-pulse text-amber-500" />
                      <strong className="mt-1 text-lg font-black text-slate-950">
                        {petEffect === "hatch" ? "孵化成功" : "进化成功"}
                      </strong>
                      <span className="text-xs font-bold text-slate-500">{currentFormName}</span>
                    </div>
                  </div>
                )}
                {!batchMode && (
                  <div
                    className={cn(
                      "absolute top-1/2 z-10 flex -translate-y-1/2 flex-col",
                      displayMode === "compact" ? "right-1.5 gap-1" : "right-3 gap-3"
                    )}
                  >
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "bg-white/90",
                        displayMode === "compact" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl"
                      )}
                      onClick={() => setRecordStudentId(student.id)}
                      aria-label="评价记录"
                    >
                      <ClipboardList className="h-5 w-5 text-slate-500" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "bg-white/90",
                        displayMode === "compact" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl"
                      )}
                      onClick={() => setHistoryStudentId(student.id)}
                      aria-label="养成记录"
                    >
                      <History className="h-5 w-5 text-slate-500" />
                    </Button>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  displayMode === "compact" ? "mt-2 grid gap-1.5" : "mt-3 flex items-end justify-between gap-3"
                )}
              >
                <div className="min-w-0">
                  <h3
                    className={cn(
                      "font-black",
                      displayMode === "compact" ? "truncate text-sm leading-4 sm:text-base" : "text-lg leading-5"
                    )}
                  >
                    {student.name}
                  </h3>
                  <p className={cn("font-black tracking-wide text-black", displayMode === "compact" && "text-xs")}>
                    #{student.studentNo}
                  </p>
                </div>
                <div
                  className={cn(
                    "items-center gap-1.5",
                    displayMode === "compact" ? "grid grid-cols-[28px_minmax(0,1fr)_28px]" : "flex"
                  )}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "rounded-lg bg-rose-50 text-rose-500",
                      displayMode === "compact" ? "h-7 w-7" : "h-8 w-8"
                    )}
                    onClick={() => openScoreAdjust(student.id, "subtract")}
                    disabled={batchMode || busy}
                    aria-label={`为${student.name}扣分`}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className={cn("min-w-0", displayMode === "compact" ? "text-center" : "text-right")}>
                    <span className="block text-[11px] font-bold text-slate-400">本轮经验</span>
                    <div
                      className={cn(
                        "truncate font-black text-slate-950",
                        displayMode === "compact" ? "text-lg sm:text-xl" : "text-3xl"
                      )}
                    >
                      {student.petExperience}
                      <span className="text-sm text-slate-400">/{nextPetThreshold ?? maxPetEnergy}</span>
                    </div>
                    <span className="text-xs text-slate-500">可用积分 {student.score}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "rounded-lg bg-emerald-50 text-emerald-600",
                      displayMode === "compact" ? "h-7 w-7" : "h-8 w-8"
                    )}
                    onClick={() => openScoreAdjust(student.id, "add")}
                    disabled={batchMode || busy}
                    aria-label={`为${student.name}加分`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {student.completionPending && (
                <Button className="mt-3 w-full" onClick={() => setHistoryStudentId(student.id)}>
                  领取满级纪念，开始下一轮
                </Button>
              )}
              <div
                className={cn(
                  "overflow-hidden rounded-full bg-slate-100",
                  displayMode === "compact" ? "mt-2 h-1.5" : "mt-3 h-2.5"
                )}
                aria-label={`${pet ? "宠物等级经验" : "孵化"}进度${percent}%`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {pet && displayMode === "normal" && (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs font-bold text-slate-500">
                  <span>
                    本轮经验 {student.petExperience}/{nextPetThreshold ?? maxPetEnergy}
                  </span>
                  <span>
                    {nextPetThreshold === null
                      ? "已达最终形态"
                      : `下一级 Lv.${student.level + 1}：${nextPetThreshold} 经验`}
                  </span>
                </div>
              )}
              <div className={cn("flex items-center", displayMode === "compact" ? "mt-1.5 gap-2" : "mt-2 gap-3")}>
                <Badge className="bg-orange-100 text-orange-600 hover:bg-orange-100">
                  {pet ? `Lv.${student.level}` : "未绑定"}
                </Badge>
                <span className="min-w-0 truncate text-sm font-black text-slate-500">
                  {pet ? currentFormName : eggStages[genericEvolutionIndex]}
                </span>
                <span
                  className={cn(
                    "ml-auto text-xs font-bold",
                    displayMode === "compact" && "hidden",
                    pet ? "text-emerald-600" : "text-amber-600"
                  )}
                >
                  {pet
                    ? nextPetThreshold !== null
                      ? `还需 ${Math.max(0, nextPetThreshold - student.petExperience)} 经验进化`
                      : "已达终极形态"
                    : student.petExperience >= evolutionThresholds[3]
                      ? "能量已满，点击选择宠物蛋"
                      : `再得 ${evolutionThresholds[genericEvolutionIndex + 1]! - student.petExperience} 分进入下一阶段`}
                </span>
              </div>
            </section>
          );
        })}
        {!filteredStudents.length && (
          <div className="col-span-full flex min-h-72 flex-col items-center justify-center text-slate-300">
            <Search className="h-10 w-10" />
            <p className="mt-3 font-black">没有匹配的学生</p>
          </div>
        )}
      </main>

      {evaluationMode === "batch" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <section data-pet-dialog className="w-full max-w-[760px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">批量评分</h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  已选择 {selectedStudentIds.length} 名学生，可同时选择多个评价指标
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEvaluationMode(null)} aria-label="关闭批量评分">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-5">{metricPicker}</div>
            <Input
              value={evaluationNote}
              onChange={event => setEvaluationNote(event.target.value)}
              maxLength={60}
              placeholder="添加评价备注（可选）"
              className="mt-5 h-11 rounded-xl bg-slate-50"
            />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="font-bold text-slate-500">
                已选 {selectedRubrics.length} 项，每人合计{" "}
                <span className={cn("text-xl font-black", evaluationTotal >= 0 ? "text-emerald-600" : "text-rose-500")}>
                  {evaluationTotal > 0 ? `+${evaluationTotal}` : evaluationTotal}
                </span>
              </p>
              <Button
                onClick={() => void applyEvaluation()}
                disabled={!selectedRubrics.length}
                className="h-11 rounded-xl bg-orange-500 px-6 font-black text-white hover:bg-orange-600"
              >
                <Save className="h-5 w-5" />
                确认评分
              </Button>
            </div>
          </section>
        </div>
      )}

      {evaluationMode === "advanced" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 sm:p-6">
          <section
            data-pet-dialog
            className="flex h-[min(680px,80dvh)] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h3 className="text-xl font-black">高级评分</h3>
                <p className="text-sm font-semibold text-slate-400">批量选择学生和多个评价指标</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-black text-orange-600">
                  学生 {selectedStudentIds.length}
                </span>
                <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-600">
                  指标 {selectedRubrics.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEvaluationMode(null);
                    setSelectedStudentIds([]);
                    setSelectedRubricIds([]);
                  }}
                  aria-label="关闭高级评分"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[300px_1fr] lg:overflow-hidden">
              <aside className="max-h-48 shrink-0 overflow-y-auto border-b border-slate-100 bg-slate-50 p-4 lg:max-h-none lg:border-b-0 lg:border-r lg:p-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-black">选择学生</h4>
                  <button
                    onClick={() =>
                      setSelectedStudentIds(
                        selectedStudentIds.length === classStudents.length
                          ? []
                          : classStudents.map(student => student.id)
                      )
                    }
                    className="text-sm font-black text-orange-600"
                  >
                    {selectedStudentIds.length === classStudents.length ? "取消全选" : "全选"}
                  </button>
                </div>
                {evaluationAbsentCount > 0 && (
                  <p role="status" className="mt-3 text-sm text-orange-700">
                    本次包含 {evaluationAbsentCount} 名请假学生，提交后也将评分。
                  </p>
                )}
                <div className="mt-4 grid gap-2">
                  {classStudents.map(student => {
                    const selected = selectedStudentIds.includes(student.id);
                    return (
                      <button
                        key={student.id}
                        onClick={() => toggleStudentSelection(student.id)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border-2 border-transparent bg-white p-3 text-left",
                          selected && "border-orange-400 bg-orange-50"
                        )}
                      >
                        <span>
                          <strong className="block text-sm">{student.name}</strong>
                          <span className="text-xs font-semibold text-slate-400">
                            {student.group} · #{student.studentNo}
                          </span>
                        </span>
                        {selected ? (
                          <CheckSquare className="h-5 w-5 text-orange-500" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </aside>
              <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                <h4 className="mb-4 font-black">选择评价指标</h4>
                {metricPicker}
                <Input
                  value={evaluationNote}
                  onChange={event => setEvaluationNote(event.target.value)}
                  maxLength={60}
                  placeholder="添加评价备注（可选）"
                  className="mt-5 h-11 rounded-xl bg-slate-50"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <p className="font-bold text-slate-500">
                每人合计{" "}
                <span className={cn("text-xl font-black", evaluationTotal >= 0 ? "text-emerald-600" : "text-rose-500")}>
                  {evaluationTotal > 0 ? `+${evaluationTotal}` : evaluationTotal}
                </span>
              </p>
              <Button
                onClick={() => void applyEvaluation()}
                disabled={busy || !selectedStudentIds.length || !selectedRubrics.length}
                className="h-11 rounded-xl bg-slate-950 px-7 font-black text-white hover:bg-slate-800"
              >
                <Save className="h-5 w-5" />
                确认评分
              </Button>
            </div>
          </section>
        </div>
      )}

      {recordStudent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section
            data-pet-dialog
            className="flex max-h-[82vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-xl font-black">{recordStudent.name} 的评价记录</h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  可用积分 {recordStudent.score} 分 ·{" "}
                  {records.filter(record => record.studentId === recordStudent.id).length} 次评价
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setRecordStudentId(null)} aria-label="关闭评价记录">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center justify-between bg-amber-50 px-6 py-3">
              <span className="font-black text-amber-800">请假标记</span>
              <button
                onClick={() => void updateStudentFlag(recordStudent, "absence", !recordStudent.absent)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition",
                  recordStudent.absent ? "bg-orange-500" : "bg-slate-300"
                )}
                aria-label={`设置${recordStudent.name}请假标记`}
                aria-pressed={recordStudent.absent}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                    recordStudent.absent ? "left-6" : "left-1"
                  )}
                />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {records.filter(record => record.studentId === recordStudent.id).length ? (
                <div className="grid gap-3">
                  {records
                    .filter(record => record.studentId === recordStudent.id)
                    .map(record => (
                      <article
                        key={record.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <span
                          className={cn(
                            "flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-base font-black",
                            (record.delta || record.petDelta || 0) > 0
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-600"
                          )}
                        >
                          {record.delta
                            ? record.delta > 0
                              ? `+${record.delta}`
                              : record.delta
                            : `${(record.petDelta ?? 0) > 0 ? "+" : ""}${record.petDelta ?? 0}能量`}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>{record.label}</strong>
                            <Badge variant="outline">{record.category}</Badge>
                          </div>
                          {record.note && <p className="mt-1 text-sm font-semibold text-slate-500">{record.note}</p>}
                          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDate(record.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-500 hover:bg-rose-100 hover:text-rose-600"
                          onClick={() =>
                            setConfirmAction({
                              title: "删除评价记录",
                              description: `删除“${record.label}”后，按实际变化回退积分余额${students.find(student => student.id === record.studentId)?.cycleId === record.cycleId ? "与本轮经验/能量" : "；旧轮次不改变当前经验或完成档案"}。升级徽章不回收，缺少证据的旧记录不能回退。`,
                              confirmLabel: "确认删除",
                              onConfirm: () => removeRecord(record)
                            })
                          }
                          aria-label="删除评价记录"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </article>
                    ))}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center text-center text-slate-300">
                  <Sparkles className="h-10 w-10" />
                  <p className="mt-4 text-lg font-black">静候佳音</p>
                  <p className="mt-1 text-sm font-semibold">还没有评价记录</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {hydrated &&
        selectedStudent &&
        createPortal(
          <div
            className="fixed bg-black/50"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9990
            }}
          >
            <section
              data-pet-dialog
              className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              style={{
                position: "fixed",
                left: "50dvw",
                top: "50dvh",
                width: "min(1120px, calc(100dvw - 40px))",
                height: "min(84dvh, calc(100dvh - 40px))",
                transform: "translate(-50%, -50%)"
              }}
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-500">
                  <PawPrint className="h-6 w-6" />
                </div>
                <div className="mr-2">
                  <h3 className="text-xl font-black">为 {selectedStudent.name} 选择孵化星灵</h3>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Class Starling System</p>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 sm:flex-nowrap">
                  {families.map(family => (
                    <button
                      key={family}
                      onClick={() => setActiveFamily(family)}
                      className={cn(
                        "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-black text-slate-400 transition",
                        activeFamily === family && "bg-white text-orange-600 shadow-sm"
                      )}
                    >
                      <FamilyIcon family={family} />
                      {family}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={closePetPicker}
                  aria-label="关闭宠物选择"
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[1.75fr_1fr] lg:overflow-hidden">
                <div className="grid auto-rows-[180px] grid-cols-2 gap-4 bg-[#f7f9fc] p-5 sm:grid-cols-3 lg:overflow-y-auto">
                  {filteredPets.map(pet => (
                    <button
                      key={pet.id}
                      onClick={() => selectPet(pet)}
                      className={cn(
                        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-transparent bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                        selectedPetId === pet.id && "border-orange-400 shadow-md"
                      )}
                    >
                      {selectedPetId === pet.id && (
                        <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      <span
                        className={cn(
                          "absolute left-3 top-3 z-10 rounded-full px-2 py-1 text-[11px] font-black",
                          pet.badge
                        )}
                      >
                        {pet.family}
                      </span>
                      <div
                        className={cn(
                          "flex h-28 w-full items-center justify-center rounded-xl bg-gradient-to-br",
                          pet.tone
                        )}
                      >
                        <PetSprite pet={pet} className="w-24" />
                      </div>
                      <div className="mt-2 w-full border-t border-dashed border-slate-200 pt-2 text-left text-base font-black">
                        {pet.name}
                      </div>
                    </button>
                  ))}
                </div>

                <aside className="flex min-h-0 flex-col border-t border-slate-100 bg-white p-6 lg:overflow-y-auto lg:border-l lg:border-t-0">
                  {selectedPet ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div
                        className={cn(
                          "flex min-h-[220px] items-center justify-center rounded-2xl bg-gradient-to-br",
                          selectedPet.tone
                        )}
                      >
                        <PetEgg
                          pet={selectedPet}
                          progress={0}
                          hatchThreshold={getNextPetThreshold(1, maxPetLevel, maxPetEnergy)!}
                          className="w-[220px] max-w-full"
                        />
                      </div>
                      <div className="mt-5 flex items-center gap-2">
                        <h4 className="text-2xl font-black">{selectedPet.name}</h4>
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", selectedPet.badge)}>
                          {selectedPet.family}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{selectedPet.description}</p>
                      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-50 p-2 sm:grid-cols-5">
                        {Array.from({ length: maxPetLevel }, (_, index) => {
                          const formIndex = getFormIndex(index + 1, maxPetLevel);
                          const formName = getPetFormName(selectedPet, formIndex);
                          return (
                            <div key={formName} className="min-w-0 px-1 py-2 text-center">
                              <div
                                className={cn(
                                  "mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black",
                                  index === 0 ? selectedPet.badge : "bg-white text-slate-400"
                                )}
                              >
                                {index + 1}
                              </div>
                              <p className="truncate text-[11px] font-black text-slate-600" title={formName}>
                                {formName}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                                {index === 0 ? 0 : Math.round((index * maxPetEnergy) / (maxPetLevel - 1))} 经验
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <Input
                        value={petNickname}
                        onChange={event => setPetNickname(event.target.value)}
                        maxLength={12}
                        placeholder="输入它独一无二的名字..."
                        className="mt-5 h-11 rounded-xl border-0 bg-slate-100 px-4 font-semibold shadow-none"
                      />
                      <Button
                        disabled={busy}
                        onClick={() => void confirmPet()}
                        className="mt-4 h-12 rounded-xl bg-slate-950 text-base font-black text-white hover:bg-slate-800"
                      >
                        确认选择宠物蛋
                        <Check className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-200">
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-dashed border-slate-100">
                        <Sparkles className="h-10 w-10" />
                      </div>
                      <p className="mt-6 text-xl font-black">Waiting for selection</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-[0.18em]">Scanner active...</p>
                    </div>
                  )}
                </aside>
              </div>
            </section>
          </div>,
          document.body
        )}

      {historyStudent && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <section
            data-pet-dialog
            className="flex max-h-[84dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
              <div>
                <h3 className="text-xl font-black">{historyStudent.name} 的成长历程</h3>
                <p className="text-sm font-semibold text-slate-400">#{historyStudent.studentNo}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setHistoryStudentId(null)} aria-label="关闭记录">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div
              className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6"
              data-pet-history-content
              tabIndex={0}
              role="region"
              aria-label="成长历程内容"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-orange-50 p-4">
                  <PawPrint className="h-5 w-5 text-orange-500" />
                  <strong className="mt-3 block text-2xl">{historyStudent.completedPets}</strong>
                  <span className="text-sm font-bold text-orange-700">累计完成宠物</span>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <Medal className="h-5 w-5 text-amber-500" />
                  <strong className="mt-3 block text-2xl">{historyStudent.trophies}</strong>
                  <span className="text-sm font-bold text-amber-700">当前徽章</span>
                </div>
                <div className="rounded-xl bg-yellow-50 p-4">
                  <Trophy className="h-5 w-5 text-yellow-600" aria-hidden="true" />
                  <strong className="mt-3 block text-2xl">{Math.floor(historyStudent.trophies / 2)}</strong>
                  <span className="text-sm font-bold text-yellow-800">当前奖杯</span>
                </div>
                <div className="rounded-xl bg-sky-50 p-4">
                  <Sparkles className="h-5 w-5 text-sky-500" />
                  <strong className="mt-3 block text-2xl">{`Lv.${historyStudent.level}`}</strong>
                  <span className="text-sm font-bold text-sky-700">
                    {historyStudent.petId ? `${historyStudent.petProgress}/${maxPetEnergy} 能量` : "未绑定宠物蛋"}
                  </span>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-slate-100 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-black">当前养成</h4>
                    <p className="text-sm font-semibold text-slate-400">{historyStudent.petName ?? "尚未选择宠物"}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-lg font-bold text-rose-500"
                    disabled={busy || !historyStudent.petId}
                    onClick={() =>
                      setConfirmAction({
                        title: historyStudent.completionPending ? "完成本轮养成" : "重置当前宠物",
                        description: historyStudent.completionPending
                          ? "满级宠物将留存到养成成就和成长徽章，可选择新宠物开始下一轮。积分及徽章余额保留，溢出经验结转。领取后按当前等级设置赠送成长徽章。"
                          : "清除当前宠物、经验和能量；保留积分、徽章和已有完成档案。",
                        confirmLabel: historyStudent.completionPending ? "完成并选新宠物" : "确认重置",
                        onConfirm: () => resetPet(historyStudent)
                      })
                    }
                  >
                    <RotateCcw className="h-4 w-4" />
                    {historyStudent.completionPending ? "完成本轮" : "重置"}
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {Array.from({ length: maxPetLevel }, (_, index) => {
                    const stage = formStages[getFormIndex(index + 1, maxPetLevel)];
                    return (
                      <div
                        key={stage}
                        className={cn(
                          "rounded-lg p-3 text-center",
                          historyStudent.level > index ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-300"
                        )}
                      >
                        <div className="font-black">{index + 1}</div>
                        <div className="mt-1 text-xs font-bold">{stage}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-slate-100 p-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-black">成长徽章 · 当前持有</h4>
                  <span className="text-xs font-bold text-slate-400">教师每次调整0.5枚</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-lg"
                    aria-label="减少成长徽章"
                    title="减少0.5枚成长徽章"
                    disabled={busy || !historyStudent.trophies}
                    onClick={() => void updateStudentFlag(historyStudent, "trophies", -0.5)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex min-w-28 items-center justify-center gap-2 rounded-xl bg-amber-50 px-5 py-3 text-xl font-black text-amber-600">
                    <Medal className="h-5 w-5" aria-hidden="true" />
                    {historyStudent.trophies}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-lg"
                    aria-label="增加成长徽章"
                    title="增加0.5枚成长徽章"
                    disabled={busy}
                    onClick={() => void updateStudentFlag(historyStudent, "trophies", 0.5)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {completed
                  .filter(item => item.studentId === historyStudent.id)
                  .map(snapshot => (
                    <button
                      key={snapshot.id}
                      className="block w-full rounded-lg bg-amber-50 p-3 text-left text-sm"
                      onClick={() => setCertificate({ snapshot, name: historyStudent.name, kind: "memory" })}
                    >
                      {snapshot.petName} · 满级成长纪念 · 本轮已获得 {snapshot.earnedBadges} 枚
                    </button>
                  ))}
              </div>
              <div className="mt-5">
                <h4 className="font-black">能量成就</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {[
                    { score: getNextPetThreshold(1, maxPetLevel, maxPetEnergy)!, label: "破壳新星" },
                    { score: Math.ceil(maxPetEnergy / 2), label: "成长伙伴" },
                    { score: maxPetEnergy, label: "终极羁绊" }
                  ].map(achievement => (
                    <div
                      key={achievement.label}
                      className={cn(
                        "rounded-xl border p-4",
                        historyStudent.petProgress >= achievement.score
                          ? "border-orange-200 bg-orange-50"
                          : "border-slate-100 bg-slate-50 text-slate-300"
                      )}
                    >
                      <AwardIcon unlocked={historyStudent.petProgress >= achievement.score} />
                      <strong className="mt-2 block">{achievement.label}</strong>
                      <span className="text-xs font-bold">达到 {achievement.score} 成长能量</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <h4 className="font-black">养成成就</h4>
                {completed
                  .filter(item => item.studentId === historyStudent.id)
                  .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                  .map(snapshot => (
                    <div key={snapshot.id} className="break-words rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <CompletedPetPortrait petId={snapshot.petId} />
                      <strong>
                        {snapshot.petName} · Lv.{snapshot.level}
                      </strong>
                      <p className="text-sm">
                        {formatDate(snapshot.completedAt)} · 满级纪念 · 本轮已获得 {snapshot.earnedBadges} 枚成长徽章
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setCertificate({ snapshot, name: historyStudent.name, kind: "certificate" })}
                        >
                          奖状
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setCertificate({ snapshot, name: historyStudent.name, kind: "memory" })}
                        >
                          合影纪念
                        </Button>
                      </div>
                    </div>
                  ))}
                {!completed.some(item => item.studentId === historyStudent.id) && (
                  <p className="text-sm text-slate-500">
                    暂无可追溯完成档案{historyStudent.completedPets > 0 ? "；历史详情不可追溯" : ""}
                  </p>
                )}
                {!historyStudent.petId && (
                  <Button
                    onClick={() => {
                      setHistoryStudentId(null);
                      openPetPicker(historyStudent.id);
                    }}
                  >
                    选择新宠物，开始下一轮
                  </Button>
                )}
                {historyStudent.petId && !historyStudent.completionPending && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setHistoryStudentId(null);
                      openPetPicker(historyStudent.id);
                    }}
                  >
                    更换当前宠物（保留进度）
                  </Button>
                )}
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 p-5">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-slate-400" />
                  <h4 className="font-black">兑换记录</h4>
                </div>
                {redemptions
                  .filter(item => item.studentId === historyStudent.id)
                  .map(item => (
                    <p key={item.id} className="mt-3 text-sm">
                      {formatDate(item.createdAt)} · {item.rewardName} · {item.cost} 积分
                    </p>
                  ))}
                {!redemptions.some(item => item.studentId === historyStudent.id) && (
                  <p className="mt-4 text-center text-sm text-slate-400">暂时没有奖品兑换记录</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {rewardStoreOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section
            data-pet-dialog
            className="flex max-h-[80dvh] w-full max-w-[880px] flex-col overflow-hidden rounded-3xl border border-orange-100 bg-[#fffdf9] shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-orange-100 bg-orange-50/70 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-xl bg-white p-2 text-amber-500 shadow-sm">
                  <Gift className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-black text-slate-900">积分兑换站</h3>
                  <p className="text-xs text-amber-700">商品 {availableRewards.length} · 用积分兑换一份小奖励</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full bg-white"
                aria-label="关闭兑换站"
                onClick={() => setRewardStoreOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="shrink-0 border-b border-orange-100 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="兑换站导航">
                  {(["商品列表", "兑换记录"] as const).map(tab => (
                    <button
                      key={tab}
                      aria-pressed={rewardStoreTab === tab}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-bold text-slate-500",
                        rewardStoreTab === tab && "bg-white text-amber-700 shadow-sm"
                      )}
                      onClick={() => setRewardStoreTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="text-slate-500"
                  onClick={() => {
                    setRewardStoreOpen(false);
                    openSettingsPanel("奖品配置");
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  商店管理
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-600">
                  兑换学生
                  <select
                    aria-label="兑换学生"
                    className="min-w-0 flex-1 rounded-xl border border-orange-100 bg-white p-2 sm:max-w-72"
                    value={rewardStudent?.id ?? ""}
                    onChange={event => setRewardStudentId(event.target.value)}
                  >
                    {classStudents.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.name} · 可用积分 {student.score}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
                  可用积分 {rewardStudent?.score ?? 0}
                </span>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
              <p className="mb-4 text-xs text-slate-500">兑换仅扣可用积分，不影响宠物经验、等级或徽章。</p>
              {rewardStoreTab === "商品列表" ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {availableRewards.map(reward => {
                    const unavailable = reward.stock < 1;
                    const insufficient = !rewardStudent || rewardStudent.score < reward.cost;
                    return (
                      <article key={reward.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
                          <span
                            className={cn(
                              "absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-xs font-bold",
                              unavailable ? "text-slate-400" : "text-emerald-700"
                            )}
                          >
                            {unavailable ? "已兑完" : `库存 ${reward.stock}`}
                          </span>
                          <Gift className={cn("h-12 w-12 text-amber-500", unavailable && "opacity-30")} />
                        </div>
                        <div className="p-4">
                          <h4 className="break-words font-black text-slate-900">{reward.name}</h4>
                          <p className="mt-1 text-xs text-slate-400">班级积分好礼</p>
                          <div className="mt-5 flex items-center justify-between gap-2">
                            <span className="font-black text-amber-600">
                              {reward.cost} <span className="text-xs">积分</span>
                            </span>
                            <Button
                              className="rounded-xl bg-amber-500 hover:bg-amber-600"
                              disabled={busy || unavailable || insufficient}
                              aria-label={`兑换${reward.name}`}
                              onClick={() => void redeemReward(reward)}
                            >
                              {unavailable ? "已兑完" : insufficient ? "积分不足" : "兑换"}
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!availableRewards.length && (
                    <p className="col-span-full py-10 text-center text-sm text-slate-400">
                      暂无可兑换奖品，请在商店管理中添加。
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {redemptions
                    .filter(item => item.studentId === rewardStudent?.id)
                    .map(item => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-bold">{item.rewardName}</p>
                          <p className="mt-1 text-xs text-slate-400">{formatDate(item.createdAt)}</p>
                        </div>
                        <span className="shrink-0 font-bold text-amber-700">−{item.cost} 积分</span>
                      </div>
                    ))}
                  {!redemptions.some(item => item.studentId === rewardStudent?.id) && (
                    <p className="py-10 text-center text-sm text-slate-400">该学生暂无兑换记录</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section
            data-pet-dialog
            className="max-h-[84vh] w-full max-w-[900px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{activeClass.name}学期成长报告</h3>
                <p className="text-sm font-semibold text-slate-400">积分、评价与宠物养成概览</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setReportOpen(false)} aria-label="关闭学期报告">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "班级可用积分", value: totalScore, icon: BarChart3 },
                { label: "人均可用积分", value: averageScore, icon: Sparkles },
                { label: "评价次数", value: classRecords.length, icon: ClipboardList },
                { label: "已孵化宠物", value: hatchedCount, icon: PawPrint }
              ].map(item => (
                <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                  <item.icon className="h-5 w-5 text-orange-500" />
                  <strong className="mt-3 block text-2xl">{item.value}</strong>
                  <span className="text-sm font-bold text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div>
                <h4 className="font-black">积分排行</h4>
                <div className="mt-3 grid gap-2">
                  {[...classStudents]
                    .sort((a, b) => b.score - a.score)
                    .map((student, index) => (
                      <div key={student.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg font-black",
                            index === 0 ? "bg-amber-100 text-amber-700" : "bg-white text-slate-400"
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="flex-1 font-bold">
                          {student.name}
                          <small className="ml-2 text-slate-400">{student.group}</small>
                        </span>
                        <strong>{student.score} 分</strong>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h4 className="font-black">评价分类统计</h4>
                <div className="mt-3 grid gap-3">
                  {evaluationCategories.map(category => {
                    const categoryRecords = classRecords.filter(record => record.category === category);
                    const categoryScore = categoryRecords.reduce((sum, record) => sum + record.delta, 0);
                    return (
                      <div key={category} className="rounded-xl border border-slate-100 p-4">
                        <div className="flex justify-between font-bold">
                          <span>{category}</span>
                          <span>{categoryScore > 0 ? `+${categoryScore}` : categoryScore} 分</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-orange-400"
                            style={{
                              width: `${classRecords.length ? Math.max(8, (categoryRecords.length / classRecords.length) * 100) : 0}%`
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-400">{categoryRecords.length} 条记录</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {settingsPanel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <section
            data-pet-dialog
            className="max-h-[84vh] w-full max-w-[760px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{settingsPanel}</h3>
                <p className="text-sm font-semibold text-slate-400">宠物积分云端配置与数据概览</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSettingsPanel(null)} aria-label="关闭设置">
                <X className="h-5 w-5" />
              </Button>
            </div>
            {settingsPanel === "指标配置" && (
              <div className="mt-5 grid gap-3">
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_150px_100px_auto] sm:items-end">
                  <label className="grid gap-1 text-sm font-bold text-slate-600">
                    指标名称
                    <Input
                      value={newRubricLabel}
                      onChange={event => setNewRubricLabel(event.target.value)}
                      placeholder="例如：主动整理课桌"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-600">
                    所属类型
                    <select
                      value={newRubricCategory}
                      onChange={event => setNewRubricCategory(event.target.value as EvaluationCategory)}
                      className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                    >
                      {evaluationCategories.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-600">
                    分值
                    <Input
                      type="number"
                      min={-10}
                      max={10}
                      value={newRubricScore}
                      onChange={event => setNewRubricScore(Number(event.target.value))}
                    />
                  </label>
                  <Button
                    className="bg-orange-500 font-bold hover:bg-orange-600"
                    disabled={busy || !newRubricLabel.trim()}
                    onClick={() => void addRubric()}
                  >
                    <Plus className="h-4 w-4" />
                    新增指标
                  </Button>
                </div>
                {rubrics.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-4"
                  >
                    {editingRubricId === item.id ? (
                      <>
                        <Input
                          value={editingRubricLabel}
                          onChange={event => setEditingRubricLabel(event.target.value)}
                          className="min-w-40 flex-1"
                          aria-label="指标名称"
                        />
                        <select
                          value={editingRubricCategory}
                          onChange={event => setEditingRubricCategory(event.target.value as EvaluationCategory)}
                          className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                          aria-label="指标所属类型"
                        >
                          {evaluationCategories.map(category => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min={-10}
                          max={10}
                          value={editingRubricScore}
                          onChange={event => setEditingRubricScore(Number(event.target.value))}
                          className="w-24"
                          aria-label="指标分值"
                        />
                        <Button
                          size="sm"
                          disabled={busy || !editingRubricLabel.trim()}
                          onClick={() => void saveRubric()}
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingRubricId(null)}>
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => void updateRubric(item.id, { enabled: !item.enabled })}
                          className={cn(
                            "relative h-7 w-12 rounded-full transition",
                            item.enabled ? "bg-emerald-500" : "bg-slate-300"
                          )}
                          aria-label={`${item.enabled ? "停用" : "启用"}${item.label}`}
                        >
                          <span
                            className={cn(
                              "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                              item.enabled ? "left-6" : "left-1"
                            )}
                          />
                        </button>
                        <div className="min-w-32 flex-1">
                          <strong className="block">{item.label}</strong>
                          <span className="text-xs font-semibold text-slate-400">{item.category}</span>
                        </div>
                        <strong
                          className={cn("w-10 text-center", item.score >= 0 ? "text-emerald-600" : "text-rose-500")}
                        >
                          {item.score > 0 ? `+${item.score}` : item.score}
                        </strong>
                        <Button variant="outline" size="sm" onClick={() => editRubric(item)}>
                          <Pencil className="h-4 w-4" />
                          编辑
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {settingsPanel === "奖品配置" && (
              <div className="mt-5 space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="font-black">新增奖品</h4>
                  <p className="mt-1 text-sm text-slate-500">设置兑换所需积分和初始库存。</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-2 text-sm font-bold">
                      奖品名称
                      <Input
                        aria-label="奖品名称"
                        placeholder="例如：星星贴纸"
                        maxLength={64}
                        value={newRewardName}
                        onChange={event => setNewRewardName(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold">
                      兑换积分
                      <Input
                        aria-label="兑换积分"
                        type="number"
                        min={1}
                        max={2147483647}
                        value={newRewardCost}
                        onChange={event => setNewRewardCost(Number(event.target.value))}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold">
                      初始库存
                      <Input
                        aria-label="初始库存"
                        type="number"
                        min={0}
                        max={2147483647}
                        value={newRewardStock}
                        onChange={event => setNewRewardStock(Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <Button
                    className="mt-4 w-full sm:w-auto"
                    disabled={
                      busy ||
                      !newRewardName.trim() ||
                      !Number.isInteger(newRewardCost) ||
                      newRewardCost < 1 ||
                      newRewardCost > 2147483647 ||
                      !Number.isInteger(newRewardStock) ||
                      newRewardStock < 0 ||
                      newRewardStock > 2147483647
                    }
                    onClick={() => void addReward()}
                  >
                    创建奖品
                  </Button>
                </div>
                <div>
                  <h4 className="font-black">已有奖品 · {rewards.length} 项</h4>
                  <p className="mt-1 text-sm text-slate-500">补充数量会累加到当前库存，兑换记录保持不变。</p>
                  <div className="mt-3 grid gap-3">
                    {rewards.map(reward => {
                      const quantity = Number(restockDrafts[reward.id] ?? "1");
                      return (
                        <div
                          key={reward.id}
                          className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <h5 className="break-words font-bold">{reward.name}</h5>
                            <p className="mt-1 text-sm text-slate-500">
                              {reward.cost} 积分 / 件 ·{" "}
                              <span className={reward.stock ? "text-emerald-700" : "text-rose-600"}>
                                剩余库存 {reward.stock}
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-end gap-2">
                            <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-slate-500">
                              补充数量
                              <Input
                                className="w-full sm:w-28"
                                aria-label={`为${reward.name}补充库存数量`}
                                type="number"
                                min={1}
                                max={2147483647 - reward.stock}
                                value={restockDrafts[reward.id] ?? "1"}
                                onChange={event =>
                                  setRestockDrafts(current => ({ ...current, [reward.id]: event.target.value }))
                                }
                              />
                            </label>
                            <Button
                              disabled={
                                busy ||
                                !Number.isInteger(quantity) ||
                                quantity < 1 ||
                                quantity + reward.stock > 2147483647
                              }
                              onClick={async () => {
                                if (await perform(`/api/pet-points/rewards/${reward.id}/stock`, "POST", { quantity })) {
                                  setRestockDrafts(current => ({ ...current, [reward.id]: "1" }));
                                  setNotice(`已为${reward.name}补充 ${quantity} 件库存`);
                                }
                              }}
                            >
                              补充库存
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="shrink-0 text-rose-600"
                              disabled={busy}
                              title={`删除奖品${reward.name}`}
                              aria-label={`删除奖品${reward.name}`}
                              onClick={() =>
                                setConfirmAction({
                                  title: "删除奖品",
                                  description: `确定删除“${reward.name}”吗？删除后不可再兑换，已有兑换记录会保留。`,
                                  confirmLabel: "确认删除",
                                  onConfirm: async () => {
                                    const saved = await perform(`/api/pet-points/rewards/${reward.id}`, "DELETE", {});
                                    if (saved) setNotice(`已删除奖品：${reward.name}`);
                                    return saved;
                                  }
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {!rewards.length && (
                      <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                        暂无奖品，请先创建。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {settingsPanel === "等级规则" && (
              <div className="mt-5 space-y-4">
                <p className="rounded-xl bg-orange-50 p-4 text-sm font-bold leading-6 text-orange-800">
                  宠物等级与形态根据本轮经验计算，达到 {maxPetEnergy} 分时为最终形态；宠物成长能量继续独立累计。默认 10
                  级；设置较少等级时，会从 10 个形态中均匀选取，始终保留蛋和最终形态。
                </p>
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 p-4">
                  <label className="text-sm font-bold text-slate-600">
                    最大等级（2–10）
                    <Input
                      className="mt-2 w-32"
                      type="number"
                      min={2}
                      max={10}
                      value={maxPetLevelDraft}
                      onChange={event => {
                        const nextLevel = Math.max(2, Math.min(10, Number(event.target.value) || 2));
                        setMaxPetLevelDraft(nextLevel);
                        setMaxPetEnergyDraft(current => Math.max(current, nextLevel - 1));
                      }}
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-600">
                    最终积分（至少 {maxPetLevelDraft - 1}）
                    <Input
                      className="mt-2 w-36"
                      type="number"
                      min={maxPetLevelDraft - 1}
                      max={100000}
                      value={maxPetEnergyDraft}
                      onChange={event =>
                        setMaxPetEnergyDraft(
                          Math.max(
                            maxPetLevelDraft - 1,
                            Math.min(100000, Number(event.target.value) || maxPetLevelDraft - 1)
                          )
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-bold">
                    满级奖励成长徽章
                    <Input
                      aria-label="满级奖励成长徽章"
                      step={0.5}
                      type="number"
                      min={0}
                      max={10000}
                      value={completionBadgesDraft}
                      onChange={event => setCompletionBadgesDraft(event.target.value)}
                    />
                  </label>
                  <Button
                    onClick={() => void savePetSettings()}
                    disabled={
                      busy ||
                      !completionBadgesDraft.trim() ||
                      !Number.isInteger(Number(completionBadgesDraft) * 2) ||
                      Number(completionBadgesDraft) < 0 ||
                      Number(completionBadgesDraft) > 10000 ||
                      (maxPetLevelDraft === maxPetLevel &&
                        maxPetEnergyDraft === maxPetEnergy &&
                        Number(completionBadgesDraft) === completionBadges)
                    }
                  >
                    保存设置
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {Array.from({ length: maxPetLevel }, (_, index) => {
                    const formIndex = getFormIndex(index + 1, maxPetLevel);
                    return (
                      <div key={index} className="rounded-xl border border-slate-100 p-4 text-center">
                        <strong className="text-2xl text-orange-500">
                          {index === 0 ? 0 : Math.round((index * maxPetEnergy) / (maxPetLevel - 1))}
                        </strong>
                        <span className="mt-2 block text-sm font-black">
                          Lv.{index + 1} · {formStages[formIndex]}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">本轮经验</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {settingsPanel === "宠物统计" && (
              <div className="mt-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="已孵化" value={hatchedCount} />
                  <StatTile label="待孵化" value={classStudents.length - hatchedCount} />
                  <StatTile
                    label="终极形态"
                    value={classStudents.filter(student => student.petHatched && student.level === maxPetLevel).length}
                  />
                </div>
                <div className="mt-5 grid gap-2">
                  {families
                    .filter(family => family !== "图鉴")
                    .map(family => (
                      <div key={family} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                        <span className="flex items-center gap-2 font-black">
                          <FamilyIcon family={family} />
                          {family}
                        </span>
                        <strong>
                          {
                            classStudents.filter(
                              student => petOptions.find(pet => pet.id === student.petId)?.family === family
                            ).length
                          }{" "}
                          只
                        </strong>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {settingsPanel === "最近评分" && (
              <div className="mt-5 grid gap-3">
                {classRecords.slice(0, 10).map(record => {
                  const student = students.find(item => item.id === record.studentId);
                  const displayDelta = record.delta || record.petDelta || 0;
                  return (
                    <div key={record.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                      <span className={cn("font-black", displayDelta > 0 ? "text-emerald-600" : "text-rose-500")}>
                        {displayDelta > 0 ? `+${displayDelta}` : displayDelta}
                        {!record.delta && record.petDelta ? "能量" : ""}
                      </span>
                      <span className="flex-1 font-bold">
                        {student?.name} · {record.label}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">{formatDate(record.createdAt)}</span>
                    </div>
                  );
                })}
                {!classRecords.length && <p className="py-16 text-center font-bold text-slate-400">暂无评分记录</p>}
              </div>
            )}
            {settingsPanel === "积分统计" && (
              <div className="mt-5">
                {incompleteHistory && (
                  <p className="text-sm text-amber-700">历史记录缺少实际变化，统计不完整；旧记录按原请求值展示。</p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="可用积分合计" value={totalScore} />
                  <StatTile label="记录累计评价（净值）" value={evaluatedScore} />
                  <StatTile label="平均分" value={averageScore} />
                  <StatTile label="最高分" value={Math.max(0, ...classStudents.map(student => student.score))} />
                </div>
                <div className="mt-5 grid gap-3">
                  {classStudents.map(student => (
                    <div key={student.id}>
                      <div className="flex justify-between text-sm font-bold">
                        <span>{student.name}</span>
                        <span>{student.score} 可用积分</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400"
                          style={{
                            width: `${(student.score / Math.max(1, ...classStudents.map(item => item.score))) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {scoreAdjustStudent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <section
            data-pet-dialog
            className="max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">
                  {scoreAdjustMode === "add" ? "加分" : "扣分"} · {scoreAdjustStudent.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  可用积分 {scoreAdjustStudent.score} 分，本轮经验 {scoreAdjustStudent.petExperience}，宠物能量{" "}
                  {scoreAdjustStudent.petProgress}/{maxPetEnergy}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeScoreAdjust} aria-label="关闭积分调整">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {[
                { mode: "add" as ScoreAdjustMode, label: "加分", icon: Plus },
                { mode: "subtract" as ScoreAdjustMode, label: "扣分", icon: Minus }
              ].map(item => (
                <button
                  key={item.mode}
                  onClick={() => {
                    setScoreAdjustMode(item.mode);
                    setScoreAdjustReason(item.mode === "add" ? "手动加分" : "手动扣分");
                    setScoreAdjustValue("1");
                  }}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-black text-slate-500 transition",
                    scoreAdjustMode === item.mode &&
                      (item.mode === "add" ? "bg-emerald-500 text-white shadow-sm" : "bg-rose-500 text-white shadow-sm")
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-black text-slate-500">常用项目</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {commonScoreRubrics.map(item => (
                  <button
                    key={item.id}
                    onClick={() => applyScoreAdjust(Math.abs(item.score), item.label)}
                    className="flex min-h-16 items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-orange-200 hover:bg-orange-50"
                  >
                    <span>
                      <strong className="block">{item.label}</strong>
                      <span className="text-xs font-semibold text-slate-400">{item.category}</span>
                    </span>
                    <span className={cn("text-xl font-black", item.score > 0 ? "text-emerald-600" : "text-rose-500")}>
                      {item.score > 0 ? `+${item.score}` : item.score}
                    </span>
                  </button>
                ))}
              </div>
              {!commonScoreRubrics.length && (
                <p className="mt-3 rounded-xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">
                  暂无启用的{scoreAdjustMode === "add" ? "加分" : "扣分"}项目
                </p>
              )}
            </div>

            <div className="mt-5 grid gap-3 rounded-xl border border-slate-100 p-4">
              <label className="text-sm font-black text-slate-500" htmlFor="score-adjust-value">
                自定义分值
              </label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={() =>
                    setScoreAdjustValue(value =>
                      String(Math.max(1, Math.min(maxScoreAdjustment, Number(value) || 1) - 1))
                    )
                  }
                  aria-label="减少调整分值"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="score-adjust-value"
                  type="number"
                  min={1}
                  max={maxScoreAdjustment}
                  value={scoreAdjustValue}
                  onChange={event => setScoreAdjustValue(event.target.value)}
                  aria-invalid={
                    !Number.isInteger(Number(scoreAdjustValue)) ||
                    Number(scoreAdjustValue) < 1 ||
                    Number(scoreAdjustValue) > maxScoreAdjustment
                  }
                  aria-describedby="score-adjust-hint"
                  className="h-11 flex-1 rounded-xl bg-slate-50 text-center text-xl font-black"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={() =>
                    setScoreAdjustValue(value =>
                      String(Math.min(maxScoreAdjustment, Math.max(0, Number(value) || 0) + 1))
                    )
                  }
                  aria-label="增加调整分值"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={scoreAdjustReason}
                onChange={event => setScoreAdjustReason(event.target.value)}
                maxLength={20}
                placeholder="调整原因"
                className="h-11 rounded-xl bg-slate-50"
              />
              <Input
                value={scoreAdjustNote}
                onChange={event => setScoreAdjustNote(event.target.value)}
                maxLength={60}
                placeholder="备注（可选）"
                className="h-11 rounded-xl bg-slate-50"
              />
              <p id="score-adjust-hint" className="text-xs text-slate-500">
                请输入 1 到 {maxScoreAdjustment} 的整数，可清空后重新输入。
              </p>
              <Button
                disabled={
                  busy ||
                  !Number.isInteger(Number(scoreAdjustValue)) ||
                  Number(scoreAdjustValue) < 1 ||
                  Number(scoreAdjustValue) > maxScoreAdjustment
                }
                onClick={() => applyScoreAdjust()}
                className={cn(
                  "h-12 rounded-xl text-base font-black text-white",
                  scoreAdjustMode === "add" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
                )}
              >
                确认{scoreAdjustMode === "add" ? "加" : "扣"} {scoreAdjustValue} 分
                <Check className="h-5 w-5" />
              </Button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description ?? ""}
        confirmText={confirmAction?.confirmLabel}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction || busyRef.current) return;
          void confirmAction.onConfirm().then(saved => {
            if (saved) setConfirmAction(null);
          });
        }}
      />
      {certificate && <PetCertificate {...certificate} onClose={() => setCertificate(null)} onError={setNotice} />}
    </div>
  );
}
