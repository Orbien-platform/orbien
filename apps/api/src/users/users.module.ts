import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService, TenantContextInterceptor],
})
export class UsersModule {}
