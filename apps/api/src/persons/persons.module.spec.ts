import { Test } from '@nestjs/testing';
import { PersonsModule } from './persons.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PersonsService } from './persons.service';
import { ClassificationService } from './classification.service';
import { VisitsService } from './visits.service';
import { DemographicsService } from './demographics.service';

describe('PersonsModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, PersonsModule],
    }).compile();

    expect(moduleRef.get(PersonsService)).toBeInstanceOf(PersonsService);
    expect(moduleRef.get(ClassificationService)).toBeInstanceOf(ClassificationService);
    expect(moduleRef.get(VisitsService)).toBeInstanceOf(VisitsService);
    expect(moduleRef.get(DemographicsService)).toBeInstanceOf(DemographicsService);

    await moduleRef.close();
  });
});
