import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { GroupMessagesController } from './group-messages.controller';
import { PrayerRequestsController } from './prayer-requests.controller';
import { SmallGroupsController } from './small-groups.controller';
import { PublicSmallGroupsController } from './public-small-groups.controller';
import { NetworksController } from './networks.controller';
import { SmallGroupsService } from './small-groups.service';
import { PublicSmallGroupsService } from './public-small-groups.service';
import { NetworksService } from './networks.service';
import { MeetingsService } from './meetings.service';
import { PrayerRequestsService } from './prayer-requests.service';
import { GroupMessagesService } from './group-messages.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

// Network vive dentro deste módulo, não num NetworksModule próprio — é
// conceitualmente parte do domínio de células e reusa classifyHealth de
// SmallGroupsService (design.md, "Decisões de abordagem").
@Module({
  controllers: [
    MeetingsController,
    GroupMessagesController,
    PrayerRequestsController,
    PublicSmallGroupsController,
    SmallGroupsController,
    NetworksController,
  ],
  providers: [
    SmallGroupsService,
    PublicSmallGroupsService,
    NetworksService,
    MeetingsService,
    PrayerRequestsService,
    GroupMessagesService,
    TenantContextInterceptor,
  ],
  exports: [
    SmallGroupsService,
    PublicSmallGroupsService,
    NetworksService,
    MeetingsService,
    PrayerRequestsService,
    GroupMessagesService,
  ],
})
export class SmallGroupsModule {}
