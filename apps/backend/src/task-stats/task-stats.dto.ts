import { StudentStatus, TaskStudent, TaskType } from './task-stats.types';

export class CreateTaskDto {
  title!: string;
  className!: string;
  type!: TaskType;
  statusCount?: number;
  students?: TaskStudent[];
}

export class UpdateTaskDto {
  title?: string;
  className?: string;
  type?: TaskType;
  statusCount?: number;
}

export class UpdateTaskStudentStatusDto {
  status!: StudentStatus;
  score?: number;
}
