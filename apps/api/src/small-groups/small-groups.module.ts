import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { PrayerRequestsController } from './prayer-requests.controller';
import { SmallGroupsController } from './small-groups.controller';
import { SmallGroupsService } from './small-groups.service';
import { MeetingsService } from './meetings.service';
import { PrayerRequestsService } from './prayer-requests.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [MeetingsController, PrayerRequestsController, SmallGroupsController],
  providers: [SmallGroupsService, MeetingsService, PrayerRequestsService, TenantContextInterceptor],
  exports: [SmallGroupsService, MeetingsService, PrayerRequestsService],
})
export class SmallGroupsModule {}
