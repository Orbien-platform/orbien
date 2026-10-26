import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { KidsAttendanceController } from './attendance/kids-attendance.controller';
import { KidsAttendanceService } from './attendance/kids-attendance.service';
import { KidsChildrenController } from './children/kids-children.controller';
import { KidsGuardiansController } from './children/kids-guardians.controller';
import { KidsConsentController } from './consent/kids-consent.controller';
import { KidsCheckinController } from './checkin/kids-checkin.controller';
import { KidsLabelsService } from './checkin/kids-labels.service';
import { KidsRosterService } from './checkin/kids-roster.service';
import { KidsCheckinService } from './checkin/kids-checkin.service';
import { KidsLeaderAlertService } from './checkin/kids-leader-alert.service';
import { KidsSessionAccessService } from './checkin/kids-session-access.service';
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
  imports: [PrismaModule, ContentModule],
  controllers: [
    KidsAttendanceController,
    KidsCheckinController,
    KidsChildrenController,
    KidsGuardiansController,
    KidsConsentController,
    KidsRoomsController,
    KidsSessionsController,
    KidsTemplateController,
  ],
  providers: [
    KidsAttendanceService,
    KidsLabelsService,
    KidsRosterService,
    KidsLeaderAlertService,
    KidsSessionAccessService,
    KidsCheckinService,
    KidsChildAccessService,
    KidsChildrenService,
    KidsGuardiansService,
    KidsConsentService,
    KidsRoomsService,
    KidsSessionsService,
    KidsTemplateService,
  ],
  exports: [
    KidsAttendanceService,
    KidsLabelsService,
    KidsRosterService,
    KidsSessionAccessService,
    KidsCheckinService,
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
