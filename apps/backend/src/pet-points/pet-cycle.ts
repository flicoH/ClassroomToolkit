import { ConflictException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import { petLevel, petStage } from './pet-progression';
import type { CompletedPet, PetRules, StudentPet } from './pet-points.types';

/** Balance and experience are independent facts; rewards are never clawed back on deductions. */
export function applyPetScore(
  student: StudentPet,
  delta: number,
  rules: PetRules,
) {
  const before = {
    score: student.score,
    experience: student.petExperience,
    energy: student.petProgress,
  };
  student.score = Math.max(0, before.score + delta);
  student.petExperience = Math.max(0, before.experience + delta);
  student.petProgress = Math.min(
    rules.finalEnergy,
    before.energy + (student.petId ? Math.max(0, delta) : 0),
  );
  calibratePet(student, rules);
  student.revision++;
  return {
    scoreDelta: student.score - before.score,
    petExperienceDelta: student.petExperience - before.experience,
    petDelta: student.petProgress - before.energy,
  };
}

export function calibratePet(student: StudentPet, rules: PetRules) {
  student.level = petLevel(
    student.petExperience,
    rules.maxLevel,
    rules.finalEnergy,
  );
  student.stage = petStage(student.level, rules.maxLevel);
  student.petHatched = Boolean(student.petId && student.level > 1);
  student.completionPending = Boolean(
    student.petId && student.petExperience >= rules.finalEnergy,
  );
  student.cycleRulesVersion = rules.version;
}

/** Caller persists this snapshot and the new cycle in the same locked transaction. */
export function finishPetCycle(
  student: StudentPet,
  rules: PetRules,
  teacherId: string,
): CompletedPet {
  if (
    !student.petId ||
    !student.completionPending ||
    student.petExperience < rules.finalEnergy
  )
    throw new ConflictException('宠物尚未满级，请刷新后重试');
  // Completion and its badge grant are persisted together; replay uses the operation log.
  const amount = rules.completionBadges ?? 1;
  if (student.trophies + amount > 2147483647)
    throw new ConflictException('成长徽章余额超过上限，请先调整余额');
  student.rewardGrants.push({
    level: rules.maxLevel,
    amount,
    grantedAt: new Date().toISOString(),
    rulesVersion: rules.version,
  });
  student.trophies += amount;
  const snapshot: CompletedPet = {
    id: createEntityId('completed'),
    teacherId,
    studentId: student.id,
    cycleId: student.cycleId,
    petId: student.petId,
    petName: student.petName ?? student.petId,
    level: rules.maxLevel,
    stage: petStage(rules.maxLevel, rules.maxLevel),
    rules: { ...rules },
    rewardGrants: structuredClone(student.rewardGrants),
    earnedBadges: student.rewardGrants.reduce(
      (sum, grant) => sum + grant.amount,
      0,
    ),
    completedAt: new Date().toISOString(),
  };
  student.completedPets++;
  student.petExperience = Math.max(
    0,
    student.petExperience - rules.finalEnergy,
  );
  student.petId = null;
  student.petName = null;
  student.petProgress = 0;
  student.cycleId = createEntityId('cycle');
  student.rewardGrants = [];
  student.rewardProtection = [];
  student.revision++;
  calibratePet(student, rules);
  return snapshot;
}

export function resetPetCycle(student: StudentPet) {
  student.rewardProtection = [
    ...new Set([
      ...student.rewardProtection,
      ...student.rewardGrants.map((grant) => grant.level),
    ]),
  ];
  student.rewardGrants = [];
  student.cycleId = createEntityId('cycle');
  student.petId = null;
  student.petName = null;
  student.petExperience = 0;
  student.petProgress = 0;
  student.level = 1;
  student.stage = '初始形态';
  student.petHatched = false;
  student.completionPending = false;
  student.revision++;
}
