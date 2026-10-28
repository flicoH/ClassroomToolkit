export const DEFAULT_MAX_PET_LEVEL = 10;
export const DEFAULT_FINAL_PET_ENERGY = 200;

export function petLevel(
  progress: number,
  maxLevel = DEFAULT_MAX_PET_LEVEL,
  finalEnergy = DEFAULT_FINAL_PET_ENERGY,
) {
  const thresholds = petThresholds(maxLevel, finalEnergy);
  return thresholds.filter((threshold) => threshold <= Math.max(0, progress))
    .length;
}

export function petFormIndex(level: number, maxLevel = DEFAULT_MAX_PET_LEVEL) {
  return Math.round(((level - 1) * 9) / (maxLevel - 1));
}

export function petStage(level: number, maxLevel = DEFAULT_MAX_PET_LEVEL) {
  if (level === 1) return '初始形态';
  if (level === maxLevel) return '终极形态';
  return `第${petFormIndex(level, maxLevel) + 1}形态`;
}

export function nextPetEnergy(
  level: number,
  maxLevel = DEFAULT_MAX_PET_LEVEL,
  finalEnergy = DEFAULT_FINAL_PET_ENERGY,
) {
  return level >= maxLevel ? null : petThresholds(maxLevel, finalEnergy)[level];
}

/** Integer rounding is shared by level, progress and migration compatibility. */
export function petThresholds(maxLevel: number, finalEnergy: number) {
  return Array.from({ length: maxLevel }, (_, i) =>
    Math.floor((2 * i * finalEnergy + maxLevel - 1) / (2 * (maxLevel - 1))),
  );
}

/** Preview only: badges are paid when completing a cycle, never on level changes. */
export function petRewards(maxLevel: number, completionBadges = 1) {
  return Array.from({ length: maxLevel }, (_, i) =>
    i === maxLevel - 1 ? completionBadges : 0,
  );
}
