import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { SmallGroupsController } from './small-groups.controller';
import { SmallGroupsService } from './small-groups.service';
import { MeetingsService } from './meetings.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [MeetingsController, SmallGroupsController],
  providers: [SmallGroupsService, MeetingsService, TenantContextInterceptor],
  exports: [SmallGroupsService, MeetingsService],
})
export class SmallGroupsModule {}
