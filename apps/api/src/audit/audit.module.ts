import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { TenantAuditLogsService } from './tenant-audit-logs.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [TenantAuditLogsService],
})
export class AuditModule {}
