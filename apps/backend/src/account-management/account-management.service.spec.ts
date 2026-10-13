import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountManagementService } from './account-management.service';
import { TeacherEntity } from '../teacher-auth/entities/teacher.entity';
import { TeacherSessionEntity } from '../teacher-auth/entities/teacher-session.entity';
import { pbkdf2Sync } from 'node:crypto';

function setup(count = 0) {
  const owner = { id: 'owner', parentAccountId: null, status: 'active' };
  const child = {
    id: 'child',
    parentAccountId: 'owner',
    status: 'active',
    name: '小李',
    username: 'child',
    createdAt: new Date(),
    deletedAt: null,
  };
  const manager = {
    findOne: jest.fn(async (_entity, options) =>
      options.where.id === 'owner'
        ? owner
        : options.where.parentAccountId === 'owner' &&
            options.where.id === 'child'
          ? child
          : null,
    ),
    count: jest.fn().mockResolvedValue(count),
    create: jest.fn((_entity, row) => row),
    save: jest.fn(async (row) => ({ ...row, createdAt: new Date() })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    query: jest.fn().mockResolvedValue([]),
    find: jest.fn().mockResolvedValue([child]),
  };
  const source = {
    manager,
    transaction: jest.fn(async (work) => work(manager)),
    query: jest.fn().mockResolvedValue([]),
  };
  return {
    service: new AccountManagementService(source as never),
    manager,
    source,
    owner,
    child,
  };
}
describe('main account management', () => {
  it('creates with an owner row lock, salted credentials and a safe response', async () => {
    const { service, manager } = setup(4);
    const result = await service.create('owner', {
      displayName: ' 李老师 ',
      account: ' login ',
      password: 'secret123',
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      TeacherEntity,
      expect.objectContaining({
        where: { id: 'owner' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(result).toMatchObject({
      displayName: '李老师',
      account: 'login',
      status: 'active',
    });
    expect(result).not.toHaveProperty('passwordHash');
    const row = manager.save.mock.calls[0][0];
    expect(row.parentAccountId).toBe('owner');
    expect(row.passwordHash).toBe(
      pbkdf2Sync('secret123', row.passwordSalt, 120000, 64, 'sha512').toString(
        'hex',
      ),
    );
    expect(manager.query.mock.calls[0][1]).not.toContain('secret123');
  });
  it('rejects the sixth child without inserting, including locked quota', async () => {
    const { service, manager } = setup(5);
    await expect(
      service.create('owner', {
        displayName: '李',
        account: 'six',
        password: 'secret123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.count).toHaveBeenCalledWith(TeacherEntity, {
      where: expect.objectContaining({
        parentAccountId: 'owner',
        status: expect.objectContaining({ _type: 'not', _value: 'deleted' }),
      }),
    });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it.each([
    { displayName: '', account: 'ok', password: 'secret123' },
    { displayName: '李', account: 'bad account', password: 'secret123' },
    { displayName: '李', account: 'x'.repeat(65), password: 'secret123' },
    { displayName: '李', account: 'ok', password: 'short' },
    { displayName: '李', account: 'ok', password: 'x'.repeat(257) },
  ])('rejects invalid creation %j', async (body) => {
    const { service, source } = setup();
    await expect(service.create('owner', body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(source.transaction).not.toHaveBeenCalled();
  });
  it('denies child owners and foreign targets', async () => {
    const { service, owner, manager } = setup();
    owner.parentAccountId = 'another' as never;
    await expect(service.list('owner')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    owner.parentAccountId = null;
    await expect(
      service.change('owner', 'foreign', 'delete'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.delete).not.toHaveBeenCalled();
  });
  it.each(['password', 'status', 'delete'] as const)(
    'revokes only target sessions and audits %s',
    async (action) => {
      const { service, manager, child } = setup();
      await service.change('owner', 'child', action, {
        password: 'changed123',
        status: 'locked',
      });
      expect(manager.delete).toHaveBeenCalledWith(TeacherSessionEntity, {
        teacherId: 'child',
      });
      expect(manager.query).toHaveBeenCalled();
      if (action === 'delete')
        expect(child).toMatchObject({
          status: 'deleted',
          deletedAt: expect.any(Date),
        });
      expect(
        manager.delete.mock.calls.every(
          ([entity]) => entity === TeacherSessionEntity,
        ),
      ).toBe(true);
    },
  );
  it('renames without discarding history or sessions, and never revives a deleted account', async () => {
    const { service, manager, child } = setup();
    await service.change('owner', 'child', 'name', { displayName: '新姓名' });
    expect(child.name).toBe('新姓名');
    expect(manager.delete).not.toHaveBeenCalled();
    child.status = 'deleted';
    await expect(
      service.change('owner', 'child', 'status', { status: 'active' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.change('owner', 'child', 'delete')).toEqual({
      deleted: true,
    });
  });
  it('does not report success if the security audit fails', async () => {
    const { service, manager } = setup();
    manager.query.mockRejectedValue(new Error('audit failed'));
    await expect(
      service.change('owner', 'child', 'status', { status: 'locked' }),
    ).rejects.toThrow('audit failed');
  });
  it('handles duplicate account constraint violations as a conflict', async () => {
    const { service, manager } = setup();
    manager.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    await expect(
      service.create('owner', {
        displayName: '李',
        account: 'taken',
        password: 'secret123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('scopes usage to actual child and rejects invalid date ranges before querying events', async () => {
    const { service, source } = setup();
    await service.usage('owner', 'child', {
      start: '2026-10-01',
      end: '2026-10-02',
    });
    expect(source.query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_id = ?'),
      ['child', '2026-09-30 16:00:00.000', '2026-10-02 16:00:00.000'],
    );
    source.query.mockClear();
    await expect(service.usage('owner', 'foreign', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.usage('owner', 'child', { start: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(source.query).not.toHaveBeenCalled();
  });
});
