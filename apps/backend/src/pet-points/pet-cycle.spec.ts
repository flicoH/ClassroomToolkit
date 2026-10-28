import { applyPetScore, finishPetCycle, resetPetCycle } from './pet-cycle';
import { petLevel, petThresholds, petRewards } from './pet-progression';
import type { StudentPet } from './pet-points.types';

const rules = { maxLevel: 10, finalEnergy: 100, version: 1 };
function student(): StudentPet {
  return {
    id: 'one',
    name: '测试甲',
    studentNo: '1',
    classId: 'class',
    className: '测试班',
    group: '一组',
    score: 0,
    maxScore: 30,
    trophies: 0,
    level: 1,
    stage: '初始形态',
    petId: 'sprout-puff',
    petProgress: 0,
    petExperience: 0,
    petHatched: false,
    absent: false,
    completedPets: 0,
    cycleId: 'cycle-a',
    revision: 0,
    completionPending: false,
    rewardGrants: [],
    rewardProtection: [],
    cycleRulesVersion: 1,
  };
}
describe('养成轮次业务不变量', () => {
  it('uses rounded thresholds and a completion-only preview for every supported level count', () => {
    expect(petThresholds(10, 100)).toEqual([
      0, 11, 22, 33, 44, 56, 67, 78, 89, 100,
    ]);
    expect(petRewards(10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    for (let levels = 2; levels <= 10; levels++) {
      expect(petRewards(levels).reduce((a, b) => a + b, 0)).toBe(1);
      const thresholds = petThresholds(levels, levels - 1);
      thresholds.forEach((threshold, i) =>
        expect(petLevel(threshold, levels, levels - 1)).toBe(i + 1),
      );
    }
  });
  it('does not reclaim or repeat rewards on deduction, reupgrade or switching templates', () => {
    const s = student();
    applyPetScore(s, 22, rules);
    expect(s).toMatchObject({
      petExperience: 22,
      score: 22,
      level: 3,
      trophies: 0,
    });
    applyPetScore(s, -2, rules);
    expect(s.level).toBe(2);
    s.petId = 'cloud-bear';
    applyPetScore(s, 2, rules);
    expect(s.trophies).toBe(0);
  });
  it('archives A once, retains balances and overflow, and grows B independently', () => {
    const s = student();
    applyPetScore(s, 102, rules);
    const snapshot = finishPetCycle(s, rules, 'teacher');
    expect(snapshot).toMatchObject({
      petId: 'sprout-puff',
      level: 10,
      earnedBadges: 1,
      cycleId: 'cycle-a',
    });
    expect(s).toMatchObject({
      petExperience: 2,
      score: 102,
      trophies: 1,
      completedPets: 1,
      petId: null,
    });
    expect(() => finishPetCycle(s, rules, 'teacher')).toThrow();
    s.petId = 'cloud-bear';
    applyPetScore(s, 20, rules);
    expect(s).toMatchObject({
      petExperience: 22,
      trophies: 1,
      completedPets: 1,
    });
    expect(snapshot.petId).toBe('sprout-puff');
    expect(snapshot.earnedBadges).toBe(1);
  });
  it('records independent clipped deltas and protects rewards after an intermediate reset', () => {
    const s = student();
    s.score = 1;
    expect(applyPetScore(s, -2, rules)).toMatchObject({
      scoreDelta: -1,
      petExperienceDelta: 0,
    });
    applyPetScore(s, 22, rules);
    resetPetCycle(s);
    s.petId = 'sprout-puff';
    applyPetScore(s, 22, rules);
    expect(s.trophies).toBe(0);
    expect(s.completedPets).toBe(0);
  });
  it('does not complete unbound pets and cancels pending completion on deduction', () => {
    const s = student();
    s.petId = null;
    applyPetScore(s, 200, rules);
    expect(s.completionPending).toBe(false);
    expect(s.trophies).toBe(0);
    expect(() => finishPetCycle(s, rules, 'teacher')).toThrow();
    s.petId = 'sprout-puff';
    applyPetScore(s, 1, rules);
    applyPetScore(s, -102, rules);
    expect(s.completionPending).toBe(false);
  });
  it('can raise the same species twice without overwriting the first cycle or duplicating its rewards', () => {
    const s = student();
    applyPetScore(s, 100, rules);
    const a = finishPetCycle(s, rules, 'teacher');
    s.petId = a.petId;
    s.petName = a.petName;
    applyPetScore(s, 100, rules);
    const b = finishPetCycle(s, rules, 'teacher');
    expect(a.petId).toBe(b.petId);
    expect(a.cycleId).not.toBe(b.cycleId);
    expect(a.id).not.toBe(b.id);
    expect(s).toMatchObject({
      completedPets: 2,
      trophies: 2,
      score: 200,
      petExperience: 0,
    });
    expect(a.earnedBadges).toBe(1);
    expect(b.earnedBadges).toBe(1);
  });
  it('uses strictly increasing and consistent threshold boundaries at every supported scale', () => {
    for (let levels = 2; levels <= 10; levels++)
      for (const final of [levels - 1, 100, 200, 100000]) {
        const thresholds = petThresholds(levels, final);
        expect(thresholds.at(-1)).toBe(final);
        thresholds.forEach((threshold, index) => {
          expect(petLevel(threshold, levels, final)).toBe(index + 1);
          if (index > 0)
            expect(petLevel(threshold - 1, levels, final)).toBe(index);
        });
      }
  });
  it('uses the current configured completion reward and preserves manual and legacy badges', () => {
    const s = student();
    s.trophies = 7;
    s.rewardGrants = [
      { level: 2, amount: 3, grantedAt: 'legacy', rulesVersion: 1 },
    ];
    applyPetScore(s, 100, rules);
    expect(s.trophies).toBe(7);
    const snapshot = finishPetCycle(
      s,
      { ...rules, completionBadges: 4 },
      'teacher',
    );
    expect(s.trophies).toBe(11);
    expect(snapshot.earnedBadges).toBe(7);
    s.petId = 'sprout-puff';
    applyPetScore(s, 100, rules);
    finishPetCycle(s, { ...rules, completionBadges: 0 }, 'teacher');
    expect(s.trophies).toBe(11);
  });
});
