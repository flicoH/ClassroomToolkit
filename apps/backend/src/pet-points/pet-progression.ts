export const DEFAULT_MAX_PET_LEVEL = 10;
export const DEFAULT_FINAL_PET_ENERGY = 200;

export function petLevel(
  progress: number,
  maxLevel = DEFAULT_MAX_PET_LEVEL,
  finalEnergy = DEFAULT_FINAL_PET_ENERGY,
) {
  return Math.min(
    maxLevel,
    Math.floor((Math.max(0, progress) * (maxLevel - 1)) / finalEnergy) + 1,
  );
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
  return level >= maxLevel
    ? null
    : Math.ceil((level * finalEnergy) / (maxLevel - 1));
}
