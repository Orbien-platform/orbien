import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { KidsModule } from './kids.module';
import { KidsCheckinService } from './checkin/kids-checkin.service';
import { KidsSessionAccessService } from './checkin/kids-session-access.service';
import { KidsAttendanceService } from './attendance/kids-attendance.service';
import { KidsRoomsService } from './rooms/kids-rooms.service';
import { KidsSessionsService } from './sessions/kids-sessions.service';
import { KidsTemplateService } from './sessions/kids-template.service';

describe('KidsModule', () => {
  it('compila e registra os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        PrismaModule,
        KidsModule,
      ],
    }).compile();

    expect(moduleRef.get(KidsAttendanceService)).toBeInstanceOf(KidsAttendanceService);
    expect(moduleRef.get(KidsRoomsService)).toBeInstanceOf(KidsRoomsService);
    expect(moduleRef.get(KidsSessionsService)).toBeInstanceOf(KidsSessionsService);
    expect(moduleRef.get(KidsTemplateService)).toBeInstanceOf(KidsTemplateService);
    expect(moduleRef.get(KidsCheckinService)).toBeInstanceOf(KidsCheckinService);
    expect(moduleRef.get(KidsSessionAccessService)).toBeInstanceOf(KidsSessionAccessService);

    await moduleRef.close();
  });
});
