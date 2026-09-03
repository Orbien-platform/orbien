process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/db';
process.env['DIRECT_URL'] ??= process.env['DATABASE_URL'];

import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaModule', () => {
  it('compila e exporta PrismaService', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const service = moduleRef.get(PrismaService);
    expect(service).toBeDefined();
    expect(typeof service.withTx).toBe('function');
    expect(typeof service.runInTx).toBe('function');
  });
});
