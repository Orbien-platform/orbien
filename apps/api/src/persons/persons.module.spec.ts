import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PersonsModule } from './persons.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { PersonsService } from './persons.service';
import { ClassificationService } from './classification.service';
import { MemberCapService } from './member-cap.service';
import { VisitsService } from './visits.service';
import { DemographicsService } from './demographics.service';
import { PersonsRetentionScheduler } from './persons-retention.scheduler';
import { PersonsRetentionNotifier } from './persons-retention-notifier.service';

describe('PersonsModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        PrismaModule,
        StorageModule,
        PersonsModule,
      ],
    }).compile();

    expect(moduleRef.get(PersonsService)).toBeInstanceOf(PersonsService);
    expect(moduleRef.get(ClassificationService)).toBeInstanceOf(ClassificationService);
    expect(moduleRef.get(MemberCapService)).toBeInstanceOf(MemberCapService);
    expect(moduleRef.get(VisitsService)).toBeInstanceOf(VisitsService);
    expect(moduleRef.get(DemographicsService)).toBeInstanceOf(DemographicsService);
    expect(moduleRef.get(PersonsRetentionScheduler)).toBeInstanceOf(PersonsRetentionScheduler);
    expect(moduleRef.get(PersonsRetentionNotifier)).toBeInstanceOf(PersonsRetentionNotifier);

    await moduleRef.close();
  });
});
