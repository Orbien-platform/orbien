import { Test } from '@nestjs/testing';
import { GroupTypesModule } from './group-types.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GroupTypesService } from './group-types.service';

describe('GroupTypesModule', () => {
  it('compila e registra o provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, GroupTypesModule],
    }).compile();

    expect(moduleRef.get(GroupTypesService)).toBeInstanceOf(GroupTypesService);

    await moduleRef.close();
  });
});
