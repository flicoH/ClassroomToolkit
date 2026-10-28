export type EvaluationCategory =
  | '课堂表现'
  | '作业情况'
  | '品德修养'
  | '纪律常规';
export type PetStage = string;

export interface StudentPet {
  id: string;
  name: string;
  studentNo: string;
  classId: string;
  className: string;
  group: string;
  score: number;
  maxScore: number;
  trophies: number;
  level: number;
  stage: PetStage;
  petId?: string | null;
  petName?: string | null;
  petProgress: number;
  petHatched: boolean;
  absent: boolean;
  completedPets: number;
  petExperience: number;
  cycleId: string;
  revision: number;
  completionPending: boolean;
  cycleRulesVersion: number;
  rewardGrants: PetGrant[];
  rewardProtection: number[];
}

export interface RubricItem {
  id: string;
  category: EvaluationCategory;
  label: string;
  score: number;
  enabled: boolean;
}

export interface RewardItem {
  id: string;
  name: string;
  cost: number;
  stock: number;
  enabled: boolean;
}

export interface EvaluationRecord {
  id: string;
  studentId: string;
  category: EvaluationCategory | '手动调整';
  label: string;
  delta: number;
  petDelta?: number;
  scoreDelta?: number;
  petExperienceDelta?: number;
  cycleId?: string;
  beforeValues?: { score: number; experience: number; energy: number };
  afterValues?: { score: number; experience: number; energy: number };
  note: string;
  createdAt: string;
}

export interface RedemptionRecord {
  id: string;
  studentId: string;
  rewardName: string;
  cost: number;
  createdAt: string;
}

export interface PetRules {
  completionBadges?: number;
  maxLevel: number;
  finalEnergy: number;
  version: number;
}
export interface PetGrant {
  level: number;
  amount: number;
  grantedAt: string;
  rulesVersion: number;
}
export interface CompletedPet {
  id: string;
  teacherId: string;
  studentId: string;
  cycleId: string;
  petId: string;
  petName: string;
  level: number;
  stage: string;
  rules: PetRules;
  rewardGrants: PetGrant[];
  earnedBadges: number;
  completedAt: string;
}
