import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAccountEntity } from './entities/admin-account.entity';
import { AdminSessionEntity } from './entities/admin-session.entity';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthDatabase } from './admin-auth.database';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
@Module({
  imports: [TypeOrmModule.forFeature([AdminAccountEntity, AdminSessionEntity])],
  controllers: [AdminAuthController],
  providers: [
    AdminAuthDatabase,
    AdminAuthService,
    { provide: APP_GUARD, useClass: AdminAuthGuard },
  ],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
