import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { GroupMessagesController } from './group-messages.controller';
import { PrayerRequestsController } from './prayer-requests.controller';
import { SmallGroupsController } from './small-groups.controller';
import { SmallGroupsService } from './small-groups.service';
import { MeetingsService } from './meetings.service';
import { PrayerRequestsService } from './prayer-requests.service';
import { GroupMessagesService } from './group-messages.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [
    MeetingsController,
    GroupMessagesController,
    PrayerRequestsController,
    SmallGroupsController,
  ],
  providers: [
    SmallGroupsService,
    MeetingsService,
    PrayerRequestsService,
    GroupMessagesService,
    TenantContextInterceptor,
  ],
  exports: [SmallGroupsService, MeetingsService, PrayerRequestsService, GroupMessagesService],
})
export class SmallGroupsModule {}
