import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KidsConsentService } from './consent/kids-consent.service';
import { KidsRoomsController } from './rooms/kids-rooms.controller';
import { KidsRoomsService } from './rooms/kids-rooms.service';
import { KidsSessionsController } from './sessions/kids-sessions.controller';
import { KidsSessionsService } from './sessions/kids-sessions.service';
import { KidsTemplateController } from './sessions/kids-template.controller';
import { KidsTemplateService } from './sessions/kids-template.service';

@Module({
  imports: [PrismaModule],
  controllers: [KidsRoomsController, KidsSessionsController, KidsTemplateController],
  providers: [KidsConsentService, KidsRoomsService, KidsSessionsService, KidsTemplateService],
  exports: [KidsConsentService, KidsRoomsService, KidsSessionsService, KidsTemplateService],
})
export class KidsModule {}
