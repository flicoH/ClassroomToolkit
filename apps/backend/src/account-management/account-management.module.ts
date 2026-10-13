import { Module } from '@nestjs/common';
import { AccountManagementService } from './account-management.service';
import { AccountManagementController } from './account-management.controller';
@Module({
  providers: [AccountManagementService],
  controllers: [AccountManagementController],
  exports: [AccountManagementService],
})
export class AccountManagementModule {}
