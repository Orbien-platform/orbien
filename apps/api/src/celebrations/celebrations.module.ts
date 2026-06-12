import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CelebrationsController } from './celebrations.controller';
import { CelebrationsService } from './celebrations.service';
import { CelebrationInstancesController } from './celebration-instances.controller';
import { CelebrationInstancesService } from './celebration-instances.service';

@Module({
  imports: [PrismaModule],
  // CelebrationInstancesController must be registered before CelebrationsController
  // to prevent /celebrations/instances being matched by /celebrations/:id
  controllers: [CelebrationInstancesController, CelebrationsController],
  providers: [CelebrationsService, CelebrationInstancesService],
  exports: [CelebrationsService, CelebrationInstancesService],
})
export class CelebrationsModule {}
