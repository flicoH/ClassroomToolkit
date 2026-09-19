import { nextPetEnergy, petFormIndex, petLevel } from './pet-progression';

describe('pet progression', () => {
  it('starts as an egg and reaches the final form at 200 energy', () => {
    for (const maxLevel of [2, 4, 10]) {
      expect(petFormIndex(petLevel(0, maxLevel), maxLevel)).toBe(0);
      expect(petFormIndex(petLevel(200, maxLevel), maxLevel)).toBe(9);
      expect(petLevel(199, maxLevel)).toBeLessThan(maxLevel);
      expect(nextPetEnergy(maxLevel - 1, maxLevel)).toBe(200);
    }
  });

  it('uses the teacher-defined final ability for every threshold', () => {
    expect(petLevel(0, 4, 90)).toBe(1);
    expect(petLevel(30, 4, 90)).toBe(2);
    expect(petLevel(90, 4, 90)).toBe(4);
    expect(nextPetEnergy(3, 4, 90)).toBe(90);
  });

  it('selects forms evenly when the maximum level is below ten', () => {
    expect([1, 2, 3, 4].map((level) => petFormIndex(level, 4))).toEqual([
      0, 3, 6, 9,
    ]);
  });
});
