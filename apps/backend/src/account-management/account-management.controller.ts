import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TeacherContext } from '../auth/teacher-context';
import { AccountManagementService } from './account-management.service';
import { AdminQueryPipe } from '../admin/analytics/query.pipe';
import { AdminQueryDto } from '../admin/admin.dto';

@Controller('account-management/subaccounts')
export class AccountManagementController {
  constructor(
    private readonly accounts: AccountManagementService,
    private readonly context: TeacherContext,
  ) {}
  private owner() {
    this.context.requireMainAccount();
    return this.context.teacherId;
  }
  @Get() list() {
    return this.accounts.list(this.owner());
  }
  @Post() create(@Body() body: Record<string, unknown>) {
    return this.accounts.create(this.owner(), body);
  }
  @Patch(':id') name(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.accounts.change(this.owner(), id, 'name', body);
  }
  @Post(':id/reset-password') password(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.accounts.change(this.owner(), id, 'password', body);
  }
  @Patch(':id/status') status(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.accounts.change(this.owner(), id, 'status', body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.accounts.change(this.owner(), id, 'delete');
  }
  @Get('usage-summary') usageSummary(@Query(AdminQueryPipe) q: AdminQueryDto) {
    const owner = this.owner();
    return this.accounts.usage(owner, owner, q, false, true);
  }
  @Get('activity-summary') activitySummary(
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    const owner = this.owner();
    return this.accounts.activity(owner, owner, q, true);
  }
  @Get(':id/usage') usage(
    @Param('id') id: string,
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.accounts.usage(this.owner(), id, q);
  }
  @Get(':id/activity') activity(
    @Param('id') id: string,
    @Query(AdminQueryPipe) q: AdminQueryDto,
  ) {
    return this.accounts.activity(this.owner(), id, q);
  }
}
