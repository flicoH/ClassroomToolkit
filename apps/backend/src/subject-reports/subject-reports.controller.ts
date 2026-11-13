import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/public.decorator';
import { SubjectReportsService } from './subject-reports.service';
import { TrackFeature } from '../analytics/track-feature';

@Controller('subject-reports')
export class SubjectReportsController {
  constructor(private readonly reports: SubjectReportsService) {}

  @Get('report-terms')
  listTerms() {
    return this.reports.listTerms();
  }

  /** 停用当前教师的共享学期，不级联删除历史报告与资料。 */
  @Delete('report-terms/:id')
  deleteTerm(@Param('id') id: string) {
    return this.reports.deleteTerm(id);
  }
  @Post('report-terms')
  createTerm(@Body() body: Record<string, string>) {
    return this.reports.createTerm(body);
  }

  @Get('report-subjects')
  listSubjects(@Query('termId') termId?: string) {
    return this.reports.listSubjects({ termId });
  }

  @Post('report-subjects')
  createSubject(@Body() body: Record<string, string>) {
    return this.reports.createSubject(body);
  }

  /** 仅停用本工作台所属的学科；另一工作台的独立学科不受影响。 */
  @Delete('report-subjects/:id')
  deleteSubject(@Param('id') id: string) {
    return this.reports.deleteSubject(id);
  }

  @Patch('report-subjects/:id/performance-config')
  updateSubjectPerformance(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.updateSubjectPerformance(id, body);
  }

  /** 按教师归属保存标题列表；正文快照不随配置变更。 */
  @Patch('report-subjects/:id/course-content-titles')
  updateCourseContentTitles(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.updateCourseContentTitles(id, body);
  }

  @Get('course-documents')
  listDocuments() {
    return this.reports.listDocuments();
  }

  @Post('course-documents/preview-scope')
  previewCourseScope(@Body() body: Record<string, unknown>) {
    return this.reports.previewCourseScope(body);
  }

  @Post('reports/:id/course-documents/preview-scope')
  previewDraftCourseScope(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.previewDraftCourseScope(id, body);
  }

  @Post('course-documents')
  @TrackFeature('subject-reports', 'upload-document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 30 * 1024 * 1024,
        files: 1,
        fields: 3,
        fieldSize: 4096,
      },
    }),
  )
  uploadDocument(
    @UploadedFile()
    file:
      | { originalname: string; mimetype: string; buffer: Buffer; size: number }
      | undefined,
    @Body() body: Record<string, string>,
  ) {
    return this.reports.uploadDocument(file, body);
  }

  @Post('course-documents/:id/retry')
  retryDocument(@Param('id') id: string) {
    return this.reports.retryDocument(id);
  }

  @Patch('course-documents/:id/confirm')
  confirmDocument(@Param('id') id: string, @Body() body: { units?: string[] }) {
    return this.reports.confirmDocument(id, body.units);
  }

  @Delete('course-documents/:id')
  deleteDocument(@Param('id') id: string) {
    return this.reports.deleteDocument(id);
  }

  @Post('reports/preview-input')
  preview(@Body() body: Record<string, unknown>) {
    return this.reports.preview(body);
  }

  @Post('reports/generate')
  @TrackFeature('subject-reports', 'generate')
  generate(@Body() body: Record<string, unknown>) {
    return this.reports.generate(body);
  }

  @Get('reports')
  listReports(@Query() filters: Record<string, unknown>) {
    return this.reports.listReports(filters);
  }

  @Get('reports/:id')
  getReport(@Param('id') id: string) {
    return this.reports.getReport(id);
  }

  @Get('reports/:id/events')
  getEvents(@Param('id') id: string) {
    return this.reports.getEvents(id);
  }

  @Patch('reports/:id/draft')
  @TrackFeature('subject-reports', 'save-draft')
  editDraft(
    @Param('id') id: string,
    @Body() body: { content: Record<string, unknown> },
  ) {
    return this.reports.editDraft(id, body.content);
  }

  @Post('reports/:id/classroom-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 },
    }),
  )
  uploadClassroomPhoto(
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; size: number; mimetype: string },
    @Query('slot') slot?: string,
  ) {
    if (!file) throw new BadRequestException('请选择课堂照片');
    return slot === undefined
      ? this.reports.setClassroomPhoto(id, file)
      : this.reports.setClassroomPhoto(id, file, slot);
  }

  @Delete('reports/:id/classroom-photo')
  removeClassroomPhoto(@Param('id') id: string, @Query('slot') slot?: string) {
    return slot === undefined
      ? this.reports.setClassroomPhoto(id)
      : this.reports.setClassroomPhoto(id, undefined, slot);
  }

  @Post('reports/:id/publish')
  @TrackFeature('subject-reports', 'publish')
  publish(@Param('id') id: string) {
    return this.reports.publish(id);
  }

  @Post('reports/:id/unpublish')
  @TrackFeature('subject-reports', 'unpublish')
  unpublish(@Param('id') id: string) {
    return this.reports.unpublish(id);
  }

  @Post('reports/:id/retry')
  @TrackFeature('subject-reports', 'retry-report')
  retryReport(@Param('id') id: string) {
    return this.reports.retryReport(id);
  }

  @Post('reports/:id/shares')
  @TrackFeature('subject-reports', 'create-share')
  createShare(@Param('id') id: string) {
    return this.reports.createShare(id);
  }

  @Delete('reports/:id/shares/:shareId')
  @TrackFeature('subject-reports', 'revoke-share')
  revokeShare(@Param('id') id: string, @Param('shareId') shareId: string) {
    return this.reports.revokeShare(id, shareId);
  }

  @Delete('reports/:id')
  deleteReport(@Param('id') id: string) {
    return this.reports.deleteReport(id);
  }

  @Public()
  @Get('public/reports/:token')
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  publicReport(@Param('token') token: string) {
    return this.reports.publicReport(token);
  }
}
