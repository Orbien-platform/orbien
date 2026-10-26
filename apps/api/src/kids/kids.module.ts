import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KidsChildrenController } from './children/kids-children.controller';
import { KidsGuardiansController } from './children/kids-guardians.controller';
import { KidsConsentController } from './consent/kids-consent.controller';
import { KidsChildAccessService } from './children/kids-child-access.service';
import { KidsGuardiansService } from './children/kids-guardians.service';
import { KidsChildrenService } from './children/kids-children.service';
import { KidsConsentService } from './consent/kids-consent.service';
import { KidsRoomsController } from './rooms/kids-rooms.controller';
import { KidsRoomsService } from './rooms/kids-rooms.service';
import { KidsSessionsController } from './sessions/kids-sessions.controller';
import { KidsSessionsService } from './sessions/kids-sessions.service';
import { KidsTemplateController } from './sessions/kids-template.controller';
import { KidsTemplateService } from './sessions/kids-template.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    KidsChildrenController,
    KidsGuardiansController,
    KidsConsentController,
    KidsRoomsController,
    KidsSessionsController,
    KidsTemplateController,
  ],
  providers: [
    KidsChildAccessService,
    KidsChildrenService,
    KidsGuardiansService,
    KidsConsentService,
    KidsRoomsService,
    KidsSessionsService,
    KidsTemplateService,
  ],
  exports: [
    KidsChildAccessService,
    KidsChildrenService,
    KidsGuardiansService,
    KidsConsentService,
    KidsRoomsService,
    KidsSessionsService,
    KidsTemplateService,
  ],
})
export class KidsModule {}
