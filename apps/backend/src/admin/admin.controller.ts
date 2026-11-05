import {
  AdminQueryDto,
  ResetTeacherPasswordDto,
  ToggleTeacherAiPermissionDto,
  ToggleTeacherLockDto,
  UpdateReportAiPermissionDto,
} from './admin.dto';
import { AdminQueryPipe } from './analytics/query.pipe';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminAccess } from './auth/admin-access';
import { AdminService } from './admin.service';
/** 管理端业务入口，统一要求管理员身份并校验查询参数。 */
@Controller('admin')
@AdminAccess()
export class AdminController {
  /** 注入管理业务服务，控制器仅负责接收参数并委托业务处理。 */
  constructor(private readonly service: AdminService) {}
  @Get('login-ip-blocks') blockedIps() {
    return this.service.blockedIps();
  }
  @Post('login-ip-blocks') blockIp(@Body() body: { ip?: unknown }) {
    return this.service.updateBlockedIp(body);
  }
  @Post('login-ip-blocks/remove') unblockIp(@Body() body: { ip?: unknown }) {
    return this.service.updateBlockedIp(body, true);
  }
  @Get('report-ai-settings') reportAiSettings() {
    return this.service.reportAiSettings();
  }
  @Post('report-ai-settings') saveReportAiSettings(
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.saveReportAiSettings(body);
  }
  @Post('report-ai-settings/remove') deleteReportAiSettings() {
    return this.service.deleteReportAiSettings();
  }
  @Get('report-ai-settings/balance') reportAiBalance() {
    return this.service.reportAiBalance();
  }
  @Get('report-ai-permissions') reportAiPermissions() {
    return this.service.reportAiPermissions();
  }
  @Post('report-ai-permissions') updateReportAiPermission(
    @Body() body: UpdateReportAiPermissionDto,
  ) {
    return this.service.updateReportAiPermission(body);
  }
  /** 查询报告 Token 用量统计与分页列表。 */
  @Get('report-token-usage')
  reportTokenUsage(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.reportTokenUsage(q);
  }
  /** 获取指定报告在筛选时间范围内的逐次模型调用明细。 */
  @Get('report-token-usage/:reportId/calls')
  reportTokenCalls(
    @Param('reportId') reportId: string,
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.service.reportTokenCalls(reportId, q);
  }
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
  /** 管理员重置教师密码，同时撤销该教师已有登录会话。 */
  @Post('teachers/:id/reset-password')
  resetTeacherPassword(
    @Param('id') id: string,
    @Body() body: ResetTeacherPasswordDto,
  ) {
    return this.service.resetTeacherPassword(id, body);
  }
  /** 管理员锁定或解锁教师账号。 */
  @Post('teachers/:id/toggle-lock')
  toggleTeacherLock(
    @Param('id') id: string,
    @Body() body: ToggleTeacherLockDto,
  ) {
    return this.service.toggleTeacherLock(id, body);
  }
  /** 管理员删除教师账号及全部关联数据。 */
  @Post('teachers/:id/delete')
  deleteTeacher(@Param('id') id: string) {
    return this.service.deleteTeacher(id);
  }
  /** 管理员配置指定教师的 AI 报告使用权限。 */
  @Post('teachers/:id/toggle-ai-permission')
  toggleTeacherAiPermission(
    @Param('id') id: string,
    @Body() body: ToggleTeacherAiPermissionDto,
  ) {
    return this.service.toggleTeacherAiPermission(id, body);
  }
  /** 按姓名、学号、教师和班级筛选学生档案，返回分页结果。 */
  @Get('students') students(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.list('students', q);
  }
  /** 按班级名称和所属教师筛选班级，返回学生数量与分页信息。 */
  @Get('classrooms') classrooms(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.list('classrooms', q);
  }
  /** 分页查看教师提交的意见，支持按教师或意见内容搜索。 */
  @Get('feedback') feedback(@Query(AdminQueryPipe) q: AdminQueryDto) {
    return this.service.feedback(q);
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
