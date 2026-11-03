import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminDatabase } from './admin.database';
import { TeacherEntity } from '../teacher-auth/entities/teacher.entity';
import { TeacherSessionEntity } from '../teacher-auth/entities/teacher-session.entity';

describe('Admin teacher account lock and delete', () => {
  describe('toggleTeacherLock', () => {
    it.each([undefined, null, 'true', 1, {}])(
      'rejects invalid locked parameter %p',
      async (locked) => {
        const database = { updateTeacherLock: jest.fn() };
        const service = new AdminService(database as never);
        await expect(
          service.toggleTeacherLock('t-1', { locked } as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(database.updateTeacherLock).not.toHaveBeenCalled();
      },
    );

    it('reports missing teacher when locking or unlocking', async () => {
      const database = {
        updateTeacherLock: jest.fn().mockResolvedValue(false),
      };
      const service = new AdminService(database as never);
      await expect(
        service.toggleTeacherLock('missing', { locked: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('successfully locks teacher and returns updated status', async () => {
      const database = { updateTeacherLock: jest.fn().mockResolvedValue(true) };
      const service = new AdminService(database as never);
      const res = await service.toggleTeacherLock('t-1', { locked: true });
      expect(res).toEqual({ id: 't-1', locked: true, status: 'locked' });
      expect(database.updateTeacherLock).toHaveBeenCalledWith('t-1', true);
    });

    it('successfully unlocks teacher and returns updated status', async () => {
      const database = { updateTeacherLock: jest.fn().mockResolvedValue(true) };
      const service = new AdminService(database as never);
      const res = await service.toggleTeacherLock('t-1', { locked: false });
      expect(res).toEqual({ id: 't-1', locked: false, status: 'active' });
      expect(database.updateTeacherLock).toHaveBeenCalledWith('t-1', false);
    });
  });

  describe('deleteTeacher', () => {
    it('reports missing teacher when deleting', async () => {
      const database = { deleteTeacher: jest.fn().mockResolvedValue(false) };
      const service = new AdminService(database as never);
      await expect(service.deleteTeacher('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('successfully deletes teacher and cascades business data', async () => {
      const database = { deleteTeacher: jest.fn().mockResolvedValue(true) };
      const service = new AdminService(database as never);
      const res = await service.deleteTeacher('t-1');
      expect(res).toEqual({ deleted: true });
      expect(database.deleteTeacher).toHaveBeenCalledWith('t-1');
    });
  });

  describe('toggleTeacherAiPermission', () => {
    it.each([undefined, null, 'true', 1, {}])(
      'rejects invalid enabled parameter %p',
      async (enabled) => {
        const database = { setReportAiTeacherPermission: jest.fn() };
        const service = new AdminService(database as never);
        await expect(
          service.toggleTeacherAiPermission('t-1', { enabled } as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(database.setReportAiTeacherPermission).not.toHaveBeenCalled();
      },
    );

    it('reports missing teacher when toggling permission', async () => {
      const database = {
        setReportAiTeacherPermission: jest.fn().mockResolvedValue(false),
      };
      const service = new AdminService(database as never);
      await expect(
        service.toggleTeacherAiPermission('missing', { enabled: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('successfully enables AI report permission', async () => {
      const database = {
        setReportAiTeacherPermission: jest.fn().mockResolvedValue(true),
      };
      const service = new AdminService(database as never);
      const res = await service.toggleTeacherAiPermission('t-1', {
        enabled: true,
      });
      expect(res).toEqual({
        id: 't-1',
        teacherId: 't-1',
        hasAiReportPermission: true,
      });
      expect(database.setReportAiTeacherPermission).toHaveBeenCalledWith(
        't-1',
        true,
      );
    });

    it('successfully disables AI report permission', async () => {
      const database = {
        setReportAiTeacherPermission: jest.fn().mockResolvedValue(true),
      };
      const service = new AdminService(database as never);
      const res = await service.toggleTeacherAiPermission('t-1', {
        enabled: false,
      });
      expect(res).toEqual({
        id: 't-1',
        teacherId: 't-1',
        hasAiReportPermission: false,
      });
      expect(database.setReportAiTeacherPermission).toHaveBeenCalledWith(
        't-1',
        false,
      );
    });
  });

  describe('reportAiPermissions and updateReportAiPermission', () => {
    it('returns authorized teachers and active teachers for selection', async () => {
      const database = {
        listReportAiTeacherPermissions: jest.fn().mockResolvedValue([
          {
            teacherId: 't-1',
            createdAt: '2026-11-03T00:00:00.000Z',
            name: '张老师',
            username: 'zhang',
          },
        ]),
        listActiveTeachers: jest.fn().mockResolvedValue([
          { id: 't-1', name: '张老师', username: 'zhang' },
          { id: 't-2', name: '李老师', username: 'li' },
        ]),
      };
      const service = new AdminService(database as never);
      const res = await service.reportAiPermissions();
      expect(res.authorizedTeachers).toHaveLength(1);
      expect(res.authorizedTeachers[0].teacherId).toBe('t-1');
      expect(res.allTeachers).toHaveLength(2);
    });

    it('adds permission via updateReportAiPermission', async () => {
      const database = {
        setReportAiTeacherPermission: jest.fn().mockResolvedValue(true),
      };
      const service = new AdminService(database as never);
      const res = await service.updateReportAiPermission({
        teacherId: 't-2',
        enabled: true,
      });
      expect(res).toEqual({ teacherId: 't-2', hasAiReportPermission: true });
      expect(database.setReportAiTeacherPermission).toHaveBeenCalledWith(
        't-2',
        true,
      );
    });

    it('rejects invalid teacherId in updateReportAiPermission', async () => {
      const database = { setReportAiTeacherPermission: jest.fn() };
      const service = new AdminService(database as never);
      await expect(
        service.updateReportAiPermission({
          teacherId: '',
          enabled: true,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('database transactions', () => {
    function setupDatabase(affected: number, foundTeacher = true) {
      const manager = {
        update: jest.fn().mockResolvedValue({ affected }),
        delete: jest.fn().mockResolvedValue({ affected }),
        findOne: jest
          .fn()
          .mockResolvedValue(foundTeacher ? { id: 'teacher' } : null),
        query: jest.fn().mockResolvedValue([]),
      };
      const transaction = jest.fn(
        async (work: (m: typeof manager) => Promise<boolean>) => work(manager),
      );
      const database = new AdminDatabase(
        { manager: { transaction } } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      return { database, manager, transaction };
    }

    it('locks teacher and revokes all active sessions within the transaction', async () => {
      const { database, manager, transaction } = setupDatabase(1);
      const result = await database.updateTeacherLock('teacher', true);
      expect(result).toBe(true);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledWith(
        TeacherEntity,
        { id: 'teacher' },
        expect.objectContaining({
          status: 'locked',
          lockedAt: expect.any(Date),
        }),
      );
      expect(manager.delete).toHaveBeenCalledWith(TeacherSessionEntity, {
        teacherId: 'teacher',
      });
    });

    it('unlocks teacher with null lockedAt and preserves sessions without deletion', async () => {
      const { database, manager } = setupDatabase(1);
      const result = await database.updateTeacherLock('teacher', false);
      expect(result).toBe(true);
      expect(manager.update).toHaveBeenCalledWith(
        TeacherEntity,
        { id: 'teacher' },
        { status: 'active', lockedAt: null },
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('does not revoke sessions when teacher to lock does not exist', async () => {
      const { database, manager } = setupDatabase(0);
      const result = await database.updateTeacherLock('missing', true);
      expect(result).toBe(false);
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('deletes all business tables and teacher entity in transaction', async () => {
      const { database, manager, transaction } = setupDatabase(1, true);
      const result = await database.deleteTeacher('teacher');
      expect(result).toBe(true);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(TeacherEntity, {
        where: { id: 'teacher' },
      });
      expect(manager.query).toHaveBeenCalled();
      // Verifies deleting student_classrooms and teacher_auth_sessions
      const queries = manager.query.mock.calls.map((call) => call[0]);
      expect(queries.some((q) => q.includes('student_classrooms'))).toBe(true);
      expect(queries.some((q) => q.includes('student_students'))).toBe(true);
      expect(queries.some((q) => q.includes('teacher_auth_sessions'))).toBe(
        true,
      );
      expect(manager.delete).toHaveBeenCalledWith(TeacherEntity, {
        id: 'teacher',
      });
    });

    it('returns false when teacher to delete is not found', async () => {
      const { database, manager } = setupDatabase(0, false);
      const result = await database.deleteTeacher('missing');
      expect(result).toBe(false);
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });
});
