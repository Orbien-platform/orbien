import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CelebrationsController } from './celebrations.controller';
import { CelebrationsService } from './celebrations.service';
import { CelebrationInstancesController } from './celebration-instances.controller';
import { CelebrationInstancesService } from './celebration-instances.service';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrderItemsController } from './service-order-items.controller';
import { ServiceOrderItemsService } from './service-order-items.service';
import { SetlistSongsController } from './setlist-songs.controller';
import { SetlistSongsService } from './setlist-songs.service';
import { SetlistsController } from './setlists.controller';
import { SetlistsService } from './setlists.service';
import { CelebrationSchedulerService } from './celebration-scheduler.service';
import { CelebrationSchedulerController } from './celebration-scheduler.controller';

@Module({
  imports: [PrismaModule],
  // More-specific prefixes must come before less-specific ones so NestJS
  // doesn't let CelebrationsController's GET /:id swallow child routes.
  // Ordering: /setlists/songs before /setlists before /celebrations
  controllers: [
    CelebrationInstancesController,
    ServiceOrderItemsController,
    ServiceOrdersController,
    SetlistSongsController,
    SetlistsController,
    CelebrationSchedulerController,
    CelebrationsController,
  ],
  providers: [
    CelebrationsService,
    CelebrationInstancesService,
    ServiceOrdersService,
    ServiceOrderItemsService,
    SetlistsService,
    SetlistSongsService,
    CelebrationSchedulerService,
  ],
  exports: [
    CelebrationsService,
    CelebrationInstancesService,
    ServiceOrdersService,
    ServiceOrderItemsService,
    SetlistsService,
    SetlistSongsService,
    CelebrationSchedulerService,
  ],
})
export class CelebrationsModule {}
