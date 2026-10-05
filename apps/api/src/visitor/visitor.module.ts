import { Module } from '@nestjs/common';
import { VisitorPublicController } from './visitor.public.controller';
import { VisitorAdminController } from './visitor.admin.controller';
import { VisitorLeaderController } from './visitor.leader.controller';
import { VisitorService } from './visitor.service';
import { PersonsModule } from '../persons/persons.module';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  imports: [PersonsModule],
  controllers: [VisitorPublicController, VisitorAdminController, VisitorLeaderController],
  providers: [VisitorService, TenantContextInterceptor],
})
export class VisitorModule {}
