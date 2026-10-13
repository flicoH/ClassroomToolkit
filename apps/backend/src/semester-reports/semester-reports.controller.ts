import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Header,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/public.decorator';
import { SemesterReportsService } from './semester-reports.service';
import { TrackFeature } from '../analytics/track-feature';

@Controller('semester-reports')
export class SemesterReportsController {
  constructor(private readonly reports: SemesterReportsService) {}

  @Get('report-terms') listTerms() {
    return this.reports.listTerms();
  }
  @Post('report-terms') createTerm(@Body() body: Record<string, string>) {
    return this.reports.createTerm(body);
  }
  @Get('report-subjects') listSubjects() {
    return this.reports.listSubjects();
  }
  @Post('report-subjects') createSubject(@Body() body: Record<string, string>) {
    return this.reports.createSubject(body);
  }
  @Patch('report-subjects/:id/performance-config') updateSubjectPerformance(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.updateSubjectPerformance(id, body);
  }
  @Get('course-documents') listDocuments() {
    return this.reports.listDocuments();
  }

  @Post('course-documents/preview-scope') previewCourseScope(
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.previewCourseScope(body);
  }

  @Post('course-documents')
  @TrackFeature('semester-reports', 'upload-document')
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
  @TrackFeature('semester-reports', 'retry-document')
  retryDocument(@Param('id') id: string) {
    return this.reports.retryDocument(id);
  }
  @Patch('course-documents/:id/confirm')
  @TrackFeature('semester-reports', 'confirm-document')
  confirmDocument(@Param('id') id: string, @Body() body: { units?: string[] }) {
    return this.reports.confirmDocument(id, body.units);
  }
  @Delete('course-documents/:id') deleteDocument(@Param('id') id: string) {
    return this.reports.deleteDocument(id);
  }

  @Post('reports/preview-input') preview(
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.preview(body);
  }
  // A batch accepted into the queue is one teacher operation, not one use per report or worker attempt.
  @Post('reports/generate')
  @TrackFeature('semester-reports', 'generate')
  generate(@Body() body: Record<string, unknown>) {
    return this.reports.generate(body);
  }
  @Get('reports') listReports() {
    return this.reports.listReports();
  }
  @Get('reports/:id') getReport(@Param('id') id: string) {
    return this.reports.getReport(id);
  }
  @Get('reports/:id/events') getEvents(@Param('id') id: string) {
    return this.reports.getEvents(id);
  }
  @Get('reports/:id/events/:eventId')
  getEvent(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.reports.getEvent(id, eventId);
  }
  @Post('reports/:id/events/:eventId/restore')
  restoreEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() body: { side?: unknown; expectedVersion?: unknown },
  ) {
    return this.reports.restoreEvent(id, eventId, body);
  }
  @Patch('reports/:id/draft')
  @TrackFeature('semester-reports', 'save-draft')
  editDraft(
    @Param('id') id: string,
    @Body()
    body: { content: Record<string, unknown>; expectedVersion?: unknown },
  ) {
    if (typeof body?.expectedVersion !== 'string' || !body.expectedVersion)
      throw new BadRequestException('请重新加载报告后保存，缺少报告版本');
    return this.reports.editDraft(id, body.content, body.expectedVersion);
  }
  @Post('reports/:id/course-subjects')
  addDraftSubjects(
    @Param('id') id: string,
    @Body() body: { courseSelections: unknown },
  ) {
    return this.reports.addDraftSubjects(id, body.courseSelections);
  }
  @Delete('reports/:id/course-subjects/:subjectId')
  removeDraftSubject(
    @Param('id') id: string,
    @Param('subjectId') subjectId: string,
  ) {
    return this.reports.removeDraftSubject(id, subjectId);
  }
  @Post('reports/:id/classroom-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      // Multer rejects at the threshold; allow exactly 5MB and let the service
      // enforce the inclusive business limit before persisting anything.
      limits: { fileSize: 5 * 1024 * 1024 + 1, files: 1, fields: 0 },
    }),
  )
  uploadClassroomPhoto(
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; size: number; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('请选择课堂照片');
    return this.reports.setClassroomPhoto(id, file);
  }
  @Delete('reports/:id/classroom-photo')
  removeClassroomPhoto(@Param('id') id: string) {
    return this.reports.setClassroomPhoto(id);
  }

  @Post('reports/:id/publish')
  @TrackFeature('semester-reports', 'publish')
  publish(@Param('id') id: string) {
    return this.reports.publish(id);
  }
  @Post('reports/:id/regenerate')
  @TrackFeature('semester-reports', 'regenerate')
  regenerate(@Param('id') id: string) {
    return this.reports.regenerate(id);
  }
  @Post('reports/:id/retry')
  @TrackFeature('semester-reports', 'retry-report')
  retryReport(@Param('id') id: string) {
    return this.reports.retryReport(id);
  }
  @Post('reports/:id/shares')
  @TrackFeature('semester-reports', 'create-share')
  createShare(@Param('id') id: string) {
    return this.reports.createShare(id);
  }
  @Post('reports/:id/unpublish')
  @TrackFeature('semester-reports', 'unpublish')
  unpublish(@Param('id') id: string) {
    return this.reports.unpublish(id);
  }
  @Delete('reports/:id/shares/:shareId')
  @TrackFeature('semester-reports', 'revoke-share')
  revokeShare(@Param('id') id: string, @Param('shareId') shareId: string) {
    return this.reports.revokeShare(id, shareId);
  }
  @Delete('reports/:id') deleteReport(@Param('id') id: string) {
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
