export type EvaluationCategory =
  | '课堂表现'
  | '作业情况'
  | '品德修养'
  | '纪律常规';
export type PetStage = '初始形态' | '成长形态' | '进阶形态' | '终极形态';

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
  petId?: string;
  petName?: string;
  petProgress: number;
  petHatched: boolean;
  absent: boolean;
  completedPets: number;
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
