import { UnauthorizedException } from '@nestjs/common';
import { pbkdf2Sync } from 'node:crypto';
import { TeacherAuthService } from './teacher-auth.service';
function setup() {
  const child = {
    id: 'child',
    parentAccountId: 'owner',
    status: 'active',
    username: 'login',
    name: '李老师',
    passwordSalt: 'salt',
    passwordHash: pbkdf2Sync(
      'secret123',
      'salt',
      120000,
      64,
      'sha512',
    ).toString('hex'),
  };
  const owner = { id: 'owner', parentAccountId: null, status: 'active' };
  const db = {
    findTeacherByUsername: jest.fn().mockResolvedValue(child),
    findTeacherById: jest.fn(async (id) => (id === 'child' ? child : owner)),
    saveSession: jest.fn(),
    findSessionByToken: jest.fn().mockResolvedValue({
      teacherId: 'child',
      expiresAt: '2099-01-01T00:00:00Z',
    }),
  };
  return { service: new TeacherAuthService(db as never), db, child, owner };
}
describe('subaccount authentication', () => {
  it('returns actual actor, shared owner and restricted capabilities', async () => {
    const { service, db } = setup();
    const result = await service.login({
      username: 'login',
      password: 'secret123',
    });
    expect(result).toMatchObject({
      id: 'child',
      ownerAccountId: 'owner',
      accountType: 'sub',
      capabilities: { accountManagement: false, reportConfiguration: false },
    });
    expect(db.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: 'child' }),
      expect.objectContaining({ sessionVersion: 0 }),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });
  it.each(['locked', 'deleted'])(
    'denies %s child login and every existing session',
    async (status) => {
      const { service, child, db } = setup();
      child.status = status;
      await expect(
        service.login({ username: 'login', password: 'secret123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.authenticate('old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.saveSession).not.toHaveBeenCalled();
    },
  );
  it('denies a session if its owner is locked, deleted, missing or itself a child', async () => {
    const { service, owner, db } = setup();
    owner.status = 'locked';
    await expect(service.authenticate('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    owner.status = 'deleted';
    await expect(service.authenticate('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    owner.status = 'active';
    owner.parentAccountId = 'foreign' as never;
    await expect(service.authenticate('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    db.findTeacherById.mockImplementation(async (id) =>
      id === 'child' ? setup().child : (null as never),
    );
    await expect(service.authenticate('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
