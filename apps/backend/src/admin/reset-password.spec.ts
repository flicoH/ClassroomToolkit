import { BadRequestException, NotFoundException } from '@nestjs/common';
import { pbkdf2Sync } from 'node:crypto';
import { AdminService } from './admin.service';
import { AdminDatabase } from './admin.database';
import { TeacherEntity } from '../teacher-auth/entities/teacher.entity';
import { TeacherSessionEntity } from '../teacher-auth/entities/teacher-session.entity';

describe('Admin teacher password reset', () => {
  it.each([undefined, null, 123456, 'short', 'x'.repeat(257)])(
    'rejects invalid password %p without writing',
    async (password) => {
      const database = { resetTeacherPassword: jest.fn() };
      const service = new AdminService(database as never);
      await expect(
        service.resetTeacherPassword('teacher', { password } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(database.resetTeacherPassword).not.toHaveBeenCalled();
    },
  );

  it('uses teacher-compatible hashing with a fresh salt and never returns credentials', async () => {
    const database = {
      resetTeacherPassword: jest.fn().mockResolvedValue(true),
    };
    const service = new AdminService(database as never);
    const password = 'new-teacher-password';
    expect(await service.resetTeacherPassword('teacher', { password })).toEqual(
      { reset: true },
    );
    await service.resetTeacherPassword('teacher', { password });
    const [id, hash, salt] = database.resetTeacherPassword.mock.calls[0];
    expect(id).toBe('teacher');
    expect(hash).toBe(
      pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex'),
    );
    expect(database.resetTeacherPassword.mock.calls[1][2]).not.toBe(salt);
  });

  it('reports a missing teacher', async () => {
    const service = new AdminService({
      resetTeacherPassword: jest.fn().mockResolvedValue(false),
    } as never);
    await expect(
      service.resetTeacherPassword('missing', { password: 'secret123' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /** 使用事务管理器替身，验证密码更新与指定教师会话撤销属于同一事务。 */
  function persistence(affected: number) {
    const manager = {
      update: jest.fn().mockResolvedValue({ affected }),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const transaction = jest.fn(
      async (work: (value: typeof manager) => Promise<boolean>) =>
        work(manager),
    );
    const database = new AdminDatabase(
      { manager: { transaction } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { database, manager, transaction };
  }

  it('updates only the target password and revokes only its sessions within the transaction', async () => {
    const { database, manager, transaction } = persistence(1);
    expect(await database.resetTeacherPassword('teacher', 'hash', 'salt')).toBe(
      true,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      TeacherEntity,
      { id: 'teacher' },
      { passwordHash: 'hash', passwordSalt: 'salt' },
    );
    expect(manager.delete).toHaveBeenCalledWith(TeacherSessionEntity, {
      teacherId: 'teacher',
    });
  });

  it('does not revoke sessions for a missing teacher', async () => {
    const { database, manager } = persistence(0);
    expect(await database.resetTeacherPassword('missing', 'hash', 'salt')).toBe(
      false,
    );
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('propagates session deletion failures so the transaction rolls back', async () => {
    const { database, manager } = persistence(1);
    manager.delete.mockRejectedValue(new Error('database failure'));
    await expect(
      database.resetTeacherPassword('teacher', 'hash', 'salt'),
    ).rejects.toThrow('database failure');
  });
});
