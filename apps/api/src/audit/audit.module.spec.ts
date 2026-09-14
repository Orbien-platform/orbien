import { Test } from '@nestjs/testing';
import { AuditModule } from './audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantAuditLogsService } from './tenant-audit-logs.service';

process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/db';
process.env['DIRECT_URL'] ??= process.env['DATABASE_URL'];

describe('AuditModule', () => {
  it('compila e registra o TenantAuditLogsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule],
    }).compile();

    expect(moduleRef.get(TenantAuditLogsService)).toBeInstanceOf(TenantAuditLogsService);

    await moduleRef.close();
  });
});
