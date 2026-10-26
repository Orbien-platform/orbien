import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { KidsModule } from './kids.module';
import { KidsRoomsService } from './rooms/kids-rooms.service';
import { KidsSessionsService } from './sessions/kids-sessions.service';

describe('KidsModule', () => {
  it('compila e registra os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: 'segredo-de-teste' }), PrismaModule, KidsModule],
    }).compile();

    expect(moduleRef.get(KidsRoomsService)).toBeInstanceOf(KidsRoomsService);
    expect(moduleRef.get(KidsSessionsService)).toBeInstanceOf(KidsSessionsService);

    await moduleRef.close();
  });
});
