import { UnauthorizedException } from '@nestjs/common';
import { TeacherAuthDatabase } from './teacher-auth.database';
import { TeacherEntity } from './entities/teacher.entity';
import { TeacherSessionEntity } from './entities/teacher-session.entity';
function setup() {
  const owner = { id: 'owner', status: 'active', parentAccountId: null };
  const actor = {
    id: 'child',
    parentAccountId: 'owner',
    status: 'active',
    sessionVersion: 2,
    passwordHash: 'current',
  };
  const manager = {
    findOne: jest.fn(async (_entity, options) =>
      options.where.id === 'owner' ? owner : actor,
    ),
    save: jest.fn(),
  };
  const teachers = {
    manager: { transaction: jest.fn(async (work) => work(manager)) },
  };
  const sessions = { create: jest.fn((row) => row) };
  const database = new TeacherAuthDatabase(
    teachers as never,
    sessions as never,
  );
  const session = {
    id: 'session',
    teacherId: 'child',
    token: 'hashed-token',
    createdAt: '2026-10-12T00:00:00Z',
    expiresAt: '2026-10-19T00:00:00Z',
  };
  return { owner, actor, manager, database, session };
}
describe('atomic session creation', () => {
  it('locks owner before actor and persists the session inside that transaction', async () => {
    const { database, session, manager } = setup();
    await database.saveSession(session, {
      passwordHash: 'current',
      sessionVersion: 2,
    });
    expect(manager.findOne.mock.calls[1]).toEqual([
      TeacherEntity,
      { where: { id: 'owner' }, lock: { mode: 'pessimistic_write' } },
    ]);
    expect(manager.findOne.mock.calls[2]).toEqual([
      TeacherEntity,
      { where: { id: 'child' }, lock: { mode: 'pessimistic_write' } },
    ]);
    expect(manager.save).toHaveBeenCalledWith(
      TeacherSessionEntity,
      expect.objectContaining({
        teacherId: 'child',
        tokenHash: 'hashed-token',
      }),
    );
  });
  it.each([
    { passwordHash: 'old', sessionVersion: 2 },
    { passwordHash: 'current', sessionVersion: 0 },
  ])(
    'rejects a password check captured before reset or lock/unlock: %j',
    async (expected) => {
      const { database, session, manager } = setup();
      await expect(
        database.saveSession(session, expected),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('rejects a locked actor or unavailable parent inside the transaction', async () => {
    const { database, session, actor, owner, manager } = setup();
    actor.status = 'locked';
    await expect(database.saveSession(session)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    actor.status = 'active';
    owner.status = 'deleted';
    await expect(database.saveSession(session)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
});
