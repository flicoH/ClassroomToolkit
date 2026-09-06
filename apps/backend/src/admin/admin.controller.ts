import { AdminQueryDto } from './admin.dto';
import { AdminQueryPipe } from './analytics/query.pipe';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminAccess } from './auth/admin-access';
import { AdminService } from './admin.service';
/** 管理端只读业务入口，统一要求管理员身份并校验查询参数。 */
@Controller('admin')
@AdminAccess()
export class AdminController {
  /** 注入管理业务服务，控制器仅负责接收参数并委托业务处理。 */
  constructor(private readonly service: AdminService) {}
  /** 获取平台师生班级总数、今日注册及活跃概览。 */
  @Get('dashboard/overview') overview() {
    return this.service.overview();
  }
  /** 按查询条件分页获取教师目录，不返回密码或会话字段。 */
  @Get('teachers') teachers(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.list('teachers', q);
  }
  /** 根据教师 ID 获取基本资料、规模统计和指定日期内的使用情况。 */
  @Get('teachers/:id') teacher(
    @Param('id') id: string,
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.service.teacher(id, q);
  }
  /** 按姓名、学号、教师和班级筛选学生档案，返回分页结果。 */
  @Get('students') students(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.list('students', q);
  }
  /** 按班级名称和所属教师筛选班级，返回学生数量与分页信息。 */
  @Get('classrooms') classrooms(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.list('classrooms', q);
  }
  /** 获取所选日期范围内的新增及累计教师注册趋势。 */
  @Get('analytics/registrations') registrations(
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.service.registrations(q);
  }
  /** 获取主动登录、自动登录、失败次数及去重教师趋势。 */
  @Get('analytics/logins') logins(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.logins(q);
  }
  /** 分页获取登录事件明细，支持教师与事件类型筛选。 */
  @Get('analytics/login-records') records(
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.service.loginRecords(q);
  }
  /** 获取热门功能排行，支持按使用教师数或有效操作次数排序。 */
  @Get('analytics/features/ranking') features(
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.service.features(q);
  }
  /** 获取指定功能在所选日期范围内的每日使用趋势。 */
  @Get('analytics/features/:key/trend') trend(
    @Param('key') key: string,
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.service.featureTrend(key, q);
  }
}
