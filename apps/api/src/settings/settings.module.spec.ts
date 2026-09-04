import { Test } from '@nestjs/testing';
import { SettingsModule } from './settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SettingsService } from './settings.service';

describe('SettingsModule', () => {
  it('compila e registra o SettingsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, StorageModule, SettingsModule],
    }).compile();

    expect(moduleRef.get(SettingsService)).toBeInstanceOf(SettingsService);

    await moduleRef.close();
  });
});
