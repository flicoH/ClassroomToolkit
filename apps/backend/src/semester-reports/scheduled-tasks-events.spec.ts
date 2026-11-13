import { UnauthorizedException } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import { ScheduledTasksEventsService } from './scheduled-tasks-events.service';
import { SemesterReportsService } from './semester-reports.service';

describe('ScheduledTasksEventsService and SSE task stream', () => {
  it('filters task events by teacherId strictly', async () => {
    const service = new ScheduledTasksEventsService();
    const teacher1Events: unknown[] = [];
    const teacher2Events: unknown[] = [];

    const sub1 = service
      .onTeacherEvents('t-1')
      .subscribe((e) => teacher1Events.push(e));
    const sub2 = service
      .onTeacherEvents('t-2')
      .subscribe((e) => teacher2Events.push(e));

    service.emitTasksChanged('t-1', 'tasks_changed', { taskId: 'task-1' });
    service.emitTasksChanged('t-2', 'task_progress', { taskId: 'task-2' });
    service.emitTasksChanged('t-1', 'task_completed', { taskId: 'task-1' });

    expect(teacher1Events).toHaveLength(2);
    expect(teacher1Events[0]).toMatchObject({
      teacherId: 't-1',
      type: 'tasks_changed',
      taskId: 'task-1',
    });
    expect(teacher1Events[1]).toMatchObject({
      teacherId: 't-1',
      type: 'task_completed',
      taskId: 'task-1',
    });

    expect(teacher2Events).toHaveLength(1);
    expect(teacher2Events[0]).toMatchObject({
      teacherId: 't-2',
      type: 'task_progress',
      taskId: 'task-2',
    });

    sub1.unsubscribe();
    sub2.unsubscribe();
  });

  describe('SemesterReportsService.streamScheduledTasks', () => {
    it('throws UnauthorizedException when teacherId is missing', () => {
      const service = new SemesterReportsService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { teacherId: '' } as never,
        {} as never,
      );

      expect(() => service.streamScheduledTasks('')).toThrow(
        UnauthorizedException,
      );
    });

    it('emits initial snapshot as first event and pushes updates on task change', async () => {
      const eventsService = new ScheduledTasksEventsService();
      let callCount = 0;
      const reports = {
        manager: { existsBy: jest.fn().mockResolvedValue(true) },
      };
      const service = new SemesterReportsService(
        {} as never,
        {} as never,
        {} as never,
        reports as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { teacherId: 't-1' } as never,
        {} as never,
        eventsService,
      );

      jest.spyOn(service, 'listScheduledTasks').mockImplementation(async () => {
        callCount++;
        return [
          {
            id: 'task-1',
            name: '阶段总结',
            status: callCount === 1 ? 'pending' : 'running',
            progressPercent: callCount === 1 ? 0 : 50,
          } as never,
        ];
      });

      const stream$ = service.streamScheduledTasks('t-1');

      // 订阅并抓取前 2 个事件 (1: 初始快照, 2: 任务变动推送)
      const eventsPromise = firstValueFrom(stream$.pipe(take(2), toArray()));

      // 延迟一小段时间触发任务变动
      setTimeout(() => {
        eventsService.emitTasksChanged('t-1', 'task_progress', {
          taskId: 'task-1',
        });
      }, 100);

      const events = await eventsPromise;
      expect(events).toHaveLength(2);

      const initialEvent = events[0] as {
        data: { type: string; tasks: Array<{ status: string }> };
      };
      expect(initialEvent.data.type).toBe('tasks_sync');
      expect(initialEvent.data.tasks[0]?.status).toBe('pending');

      const updatedEvent = events[1] as {
        data: {
          type: string;
          tasks: Array<{ status: string; progressPercent: number }>;
        };
      };
      expect(updatedEvent.data.type).toBe('tasks_sync');
      expect(updatedEvent.data.tasks[0]?.status).toBe('running');
      expect(updatedEvent.data.tasks[0]?.progressPercent).toBe(50);
    });

    it('propagates an initial read failure instead of emitting an empty queue', async () => {
      const service = new SemesterReportsService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { teacherId: 't-1' } as never,
        {} as never,
      );
      const databaseError = new Error('database unavailable');
      jest
        .spyOn(service, 'listScheduledTasks')
        .mockRejectedValue(databaseError);

      await expect(
        firstValueFrom(service.streamScheduledTasks('t-1')),
      ).rejects.toBe(databaseError);
    });
  });
});
