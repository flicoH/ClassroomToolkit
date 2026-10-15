import { ConflictException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import { petLevel, petRewards, petStage } from './pet-progression';
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
  const oldLevel = petLevel(
    before.experience,
    rules.maxLevel,
    rules.finalEnergy,
  );
  student.score = Math.max(0, before.score + delta);
  student.petExperience = Math.max(0, before.experience + delta);
  student.petProgress = Math.min(
    rules.finalEnergy,
    before.energy + (student.petId ? Math.max(0, delta) : 0),
  );
  calibratePet(student, rules);
  const rewards = petRewards(rules.maxLevel);
  if (student.petId && delta > 0) {
    for (let level = oldLevel + 1; level <= student.level; level++) {
      if (
        student.rewardGrants.some((grant) => grant.level === level) ||
        student.rewardProtection.includes(level)
      )
        continue;
      // Mixed rule versions may assign different amounts to the same tiers; keep the cycle budget at 50.
      const alreadyGranted = student.rewardGrants.reduce(
        (sum, grant) => sum + grant.amount,
        0,
      );
      const amount = Math.min(
        rewards[level - 1]!,
        Math.max(0, 50 - alreadyGranted),
      );
      student.rewardGrants.push({
        level,
        amount,
        grantedAt: new Date().toISOString(),
        rulesVersion: rules.version,
      });
      student.trophies += amount;
    }
  }
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
