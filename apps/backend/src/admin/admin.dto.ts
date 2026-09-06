/** 管理端查询 DTO；HTTP 查询值保持字符串，由 Service 校验日期、分页和业务枚举。 */
export class AdminQueryDto {
  start?: string;
  end?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  teacherId?: string;
  teacherSearch?: string;
  classroomId?: string;
  classroomSearch?: string;
  kind?: string;
  sort?: string;
}
