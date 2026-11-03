import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface TaskEventPayload {
  teacherId: string;
  type:
    | 'tasks_changed'
    | 'task_progress'
    | 'task_queued'
    | 'task_failed'
    | 'task_completed';
  taskId?: string;
  reportId?: string;
  details?: Record<string, unknown>;
}

/**
 * AI 汇总报告定时任务事件广播服务（Singleton），
 * 负责在任务创建/执行/删除及后台 Worker 生成进度变动时向对应的教师客户端推送实时事件。
 */
@Injectable()
export class ScheduledTasksEventsService {
  private readonly events$ = new Subject<TaskEventPayload>();

  /**
   * 触发教师定时任务变动或进度更新事件
   */
  emitTasksChanged(
    teacherId: string,
    type: TaskEventPayload['type'] = 'tasks_changed',
    extra?: {
      taskId?: string;
      reportId?: string;
      details?: Record<string, unknown>;
    },
  ) {
    if (!teacherId) return;
    this.events$.next({
      teacherId,
      type,
      ...extra,
    });
  }

  /**
   * 监听指定教师相关的任务队列变动与进度事件
   */
  onTeacherEvents(teacherId: string): Observable<TaskEventPayload> {
    return this.events$.pipe(filter((event) => event.teacherId === teacherId));
  }
}
