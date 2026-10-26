import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KidsRoomsController } from './rooms/kids-rooms.controller';
import { KidsRoomsService } from './rooms/kids-rooms.service';
import { KidsSessionsController } from './sessions/kids-sessions.controller';
import { KidsSessionsService } from './sessions/kids-sessions.service';

@Module({
  imports: [PrismaModule],
  controllers: [KidsRoomsController, KidsSessionsController],
  providers: [KidsRoomsService, KidsSessionsService],
  exports: [KidsRoomsService, KidsSessionsService],
})
export class KidsModule {}
