import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { SemesterReportsService } from './semester-reports.service';
import { SemesterReportWorker } from './semester-report.worker';
import { ReportAiTeacherPermissionEntity } from '../admin/entities/report-ai-teacher-permission.entity';
import { SemesterReportEntity } from './semester-report.entity';

describe('Semester reports AI report permission checks', () => {
  function createService(teacherId: string) {
    const reports = {
      manager: {
        existsBy: jest.fn().mockImplementation((entity, where) => {
          return (
            entity === ReportAiTeacherPermissionEntity &&
            where?.teacherId === 't-authorized'
          );
        }),
      },
    };
    const teacher = { teacherId };
    const service = new SemesterReportsService(
      {} as never,
      {} as never,
      {} as never,
      reports as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      teacher as never,
      {} as never,
    );
    return { service, reports };
  }

  describe('SemesterReportsService permission assertions', () => {
    it('returns true when teacher has permission in database', async () => {
      const { service, reports } = createService('t-authorized');
      const hasPerm = await service.hasAiReportPermission('t-authorized');
      expect(hasPerm).toBe(true);
      expect(reports.manager.existsBy).toHaveBeenCalledWith(
        ReportAiTeacherPermissionEntity,
        { teacherId: 't-authorized' },
      );
    });

    it('returns false when teacher does not have permission in database', async () => {
      const { service } = createService('t-unauthorized');
      const hasPerm = await service.hasAiReportPermission('t-unauthorized');
      expect(hasPerm).toBe(false);
    });

    it('assertAiReportPermission throws 403 Forbidden with specific code when unauthorized', async () => {
      const { service } = createService('t-unauthorized');

      await expect(
        service.assertAiReportPermission('t-unauthorized'),
      ).rejects.toThrow(ForbiddenException);
      try {
        await service.assertAiReportPermission('t-unauthorized');
      } catch (err) {
        const response = (err as ForbiddenException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('AI_REPORT_PERMISSION_DENIED');
        expect(response.message).toContain('您暂无 AI 汇总报告使用权限');
      }
    });

    it('createScheduledTask blocks unauthorized teachers before creating tasks', async () => {
      const { service } = createService('t-unauthorized');

      await expect(
        service.createScheduledTask({
          name: '阶段总结',
          executeAt: new Date(Date.now() + 60000).toISOString(),
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('executeScheduledTask blocks unauthorized teachers before executing tasks', async () => {
      const { service } = createService('t-unauthorized');

      await expect(service.executeScheduledTask('task-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('generate blocks unauthorized teachers when requested mode is AI or stage report', async () => {
      const { service } = createService('t-unauthorized');

      await expect(
        service.generate({
          reportKind: 'stage',
          generationMode: 'ai',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SemesterReportWorker stage report permission verification', () => {
    it('marks report as failed if teacher permission has been revoked before processing', async () => {
      const report = {
        id: 'report-stage-1',
        teacherId: 't-revoked',
        generationStatus: 'pending',
        snapshot: {
          reportKind: 'stage',
          student: { name: '学生A' },
        },
      } as unknown as SemesterReportEntity;

      const save = jest.fn().mockImplementation(async (entity) => entity);
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      const findOne = jest.fn().mockResolvedValue(null); // No permission record
      const deleteMock = jest.fn().mockResolvedValue({ affected: 0 });
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      const managerUpdate = jest.fn().mockResolvedValue({ affected: 1 });
      const fakeDataSource = {
        manager: {
          existsBy: jest.fn().mockResolvedValue(false),
          update: managerUpdate,
        },
        getRepository: (target: unknown) => {
          if (target === SemesterReportEntity) {
            return {
              findOne: jest.fn().mockResolvedValue(report),
              save,
              update,
              createQueryBuilder: () => qb,
              delete: deleteMock,
            };
          }
          if (target === ReportAiTeacherPermissionEntity) {
            return {
              findOne,
              createQueryBuilder: () => qb,
              delete: deleteMock,
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
            createQueryBuilder: () => qb,
            delete: deleteMock,
            create: jest.fn().mockImplementation((val) => val),
            save: jest.fn().mockImplementation(async (val) => val),
          };
        },
      } as unknown as DataSource;

      const worker = new SemesterReportWorker(fakeDataSource);
      await worker.run();
      expect(managerUpdate).toHaveBeenCalledWith(
        SemesterReportEntity,
        { id: 'report-stage-1' },
        expect.objectContaining({
          status: 'failed',
          errorMessage:
            expect.stringContaining('该教师暂无 AI 汇总报告使用权限'),
        }),
      );
    });
  });
});
