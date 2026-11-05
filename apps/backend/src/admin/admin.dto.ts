/** 管理端查询 DTO；HTTP 查询值保持字符串，由 Service 校验日期、分页和业务枚举。 */
export class AdminQueryDto {
  start?: string;
  end?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  student?: string;
  teacherId?: string;
  teacherSearch?: string;
  classroomId?: string;
  classroomSearch?: string;
  kind?: string;
  sort?: string;
  model?: string;
  status?: string;
}

/** 管理员为指定教师设置的新密码，由 Service 校验类型和长度。 */
export class ResetTeacherPasswordDto {
  password!: string;
}

/** 管理员锁定或解锁教师账号的请求参数。 */
export class ToggleTeacherLockDto {
  locked!: boolean;
}

/** 管理员设置教师 AI 报告使用权限的请求参数。 */
export class ToggleTeacherAiPermissionDto {
  enabled!: boolean;
}

/** 管理端配置 AI 报告权限的请求参数。 */
export class UpdateReportAiPermissionDto {
  teacherId!: string;
  enabled!: boolean;
}
