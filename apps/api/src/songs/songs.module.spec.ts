import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { SongsModule } from './songs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SongsService } from './songs.service';

describe('SongsModule', () => {
  it('compila e registra os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        PrismaModule,
        SongsModule,
      ],
    }).compile();

    expect(moduleRef.get(SongsService)).toBeInstanceOf(SongsService);

    await moduleRef.close();
  });
});
