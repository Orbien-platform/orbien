import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { GroupMessagesController } from './group-messages.controller';
import { PrayerRequestsController } from './prayer-requests.controller';
import { SmallGroupsController } from './small-groups.controller';
import { PublicSmallGroupsController } from './public-small-groups.controller';
import { SmallGroupsService } from './small-groups.service';
import { PublicSmallGroupsService } from './public-small-groups.service';
import { MeetingsService } from './meetings.service';
import { PrayerRequestsService } from './prayer-requests.service';
import { GroupMessagesService } from './group-messages.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [
    MeetingsController,
    GroupMessagesController,
    PrayerRequestsController,
    PublicSmallGroupsController,
    SmallGroupsController,
  ],
  providers: [
    SmallGroupsService,
    PublicSmallGroupsService,
    MeetingsService,
    PrayerRequestsService,
    GroupMessagesService,
    TenantContextInterceptor,
  ],
  exports: [
    SmallGroupsService,
    PublicSmallGroupsService,
    MeetingsService,
    PrayerRequestsService,
    GroupMessagesService,
  ],
})
export class SmallGroupsModule {}
