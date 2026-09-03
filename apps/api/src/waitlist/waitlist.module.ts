import { Module } from '@nestjs/common';
import { WaitlistPublicController } from './waitlist.public.controller';
import { WaitlistAdminController } from './waitlist.admin.controller';
import { WaitlistService } from './waitlist.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [WaitlistPublicController, WaitlistAdminController],
  providers: [WaitlistService, TenantContextInterceptor],
})
export class WaitlistModule {}
