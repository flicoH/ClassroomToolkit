import type { QueryRunner } from 'typeorm';
import { AddPetStateHistory20261010000000 } from './20261010000000-add-pet-state-history';

describe('pet history migration', () => {
  it('establishes the observation at migration time without backdating or overwriting existing histories', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const before = Date.now();
    await new AddPetStateHistory20261010000000().up({
      query,
    } as unknown as QueryRunner);
    const [sql, parameters] = query.mock.calls[1];
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain(
      'h.teacher_id = s.teacher_id AND h.student_id = s.id',
    );
    expect(sql).toContain("CAST('false' AS JSON)");
    expect(parameters[0].getTime()).toBeGreaterThanOrEqual(before);
    expect(parameters[0].getTime()).toBeLessThanOrEqual(Date.now());
    expect(
      query.mock.calls.map(([statement]) => statement).join(' '),
    ).not.toMatch(/DELETE|UPDATE|DROP/i);
  });
  it('does not erase immutable history when rolling the application back', async () => {
    await expect(new AddPetStateHistory20261010000000().down()).rejects.toThrow(
      '保留历史表',
    );
  });
});
