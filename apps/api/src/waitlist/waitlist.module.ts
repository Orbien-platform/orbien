import { Module } from '@nestjs/common';
import { WaitlistPublicController } from './waitlist.public.controller';
import { WaitlistAdminController } from './waitlist.admin.controller';
import { WaitlistService } from './waitlist.service';

@Module({
  controllers: [WaitlistPublicController, WaitlistAdminController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
