import { Test } from '@nestjs/testing';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

describe('StorageModule', () => {
  it('compila e registra o StorageService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    expect(moduleRef.get(StorageService)).toBeInstanceOf(StorageService);

    await moduleRef.close();
  });
});
