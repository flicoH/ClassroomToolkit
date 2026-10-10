import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, from, lastValueFrom, of } from 'rxjs';
import { AnalyticsInterceptor } from '../analytics/analytics.interceptor';
import { SemesterReportsController } from './semester-reports.controller';

const eventId = '11111111-1111-4111-8111-111111111111';
function setup(handler: unknown, authenticated = true) {
  const analytics = { record: jest.fn().mockResolvedValue(true) };
  const interceptor = new AnalyticsInterceptor(
    new Reflector(),
    analytics as never,
  );
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        teacher: authenticated ? { id: 'teacher' } : undefined,
        headers: { 'x-analytics-event-id': eventId },
      }),
    }),
  } as never;
  return { analytics, interceptor, context };
}
describe('Semester report analytics collection', () => {
  it.each([
    ['uploadDocument', 'upload-document'],
    ['retryDocument', 'retry-document'],
    ['confirmDocument', 'confirm-document'],
    ['generate', 'generate'],
    ['editDraft', 'save-draft'],
    ['publish', 'publish'],
    ['regenerate', 'regenerate'],
    ['retryReport', 'retry-report'],
    ['createShare', 'create-share'],
    ['unpublish', 'unpublish'],
    ['revokeShare', 'revoke-share'],
  ] as const)(
    'records one successful %s operation for the authenticated teacher',
    async (method, action) => {
      const { analytics, interceptor, context } = setup(
        SemesterReportsController.prototype[method],
      );
      await lastValueFrom(
        interceptor.intercept(context, {
          handle: () => of({ accepted: true }),
        }),
      );
      expect(analytics.record).toHaveBeenCalledTimes(1);
      expect(analytics.record).toHaveBeenCalledWith(
        'teacher',
        'use',
        'semester-reports',
        action,
        eventId,
      );
    },
  );
  it('counts a successful batch submission once, without treating the report count as uses', async () => {
    const result = { reports: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] };
    const service = { generate: jest.fn().mockResolvedValue(result) };
    const controller = new SemesterReportsController(service as never);
    const { analytics, interceptor, context } = setup(controller.generate);
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () =>
            defer(() =>
              from(
                controller.generate({ studentIds: ['one', 'two', 'three'] }),
              ),
            ),
        }),
      ),
    ).resolves.toBe(result);
    expect(analytics.record).toHaveBeenCalledTimes(1);
  });
  it('does not count a rejected ownership check as successful usage', async () => {
    const controller = new SemesterReportsController({
      publish: jest.fn().mockRejectedValue(new ForbiddenException()),
    } as never);
    const { analytics, interceptor, context } = setup(controller.publish);
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () =>
            defer(() => from(controller.publish('another-teacher-report'))),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(analytics.record).not.toHaveBeenCalled();
  });
  it.each([
    'listDocuments',
    'previewCourseScope',
    'preview',
    'listReports',
    'getReport',
    'getEvents',
    'publicReport',
  ] as const)(
    'does not count read-only %s calls, previews or parent visits',
    async (method) => {
      const { analytics, interceptor, context } = setup(
        SemesterReportsController.prototype[method],
      );
      await lastValueFrom(
        interceptor.intercept(context, { handle: () => of({}) }),
      );
      expect(analytics.record).not.toHaveBeenCalled();
    },
  );
  it('does not attribute an unauthenticated operation to a teacher', async () => {
    const { analytics, interceptor, context } = setup(
      SemesterReportsController.prototype.generate,
      false,
    );
    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({}) }),
    );
    expect(analytics.record).not.toHaveBeenCalled();
  });
});
