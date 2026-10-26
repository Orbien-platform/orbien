import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KidsRoomsController } from './rooms/kids-rooms.controller';
import { KidsRoomsService } from './rooms/kids-rooms.service';

@Module({
  imports: [PrismaModule],
  controllers: [KidsRoomsController],
  providers: [KidsRoomsService],
  exports: [KidsRoomsService],
})
export class KidsModule {}
