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

@Module({
  imports: [PrismaModule],
  // More-specific prefixes must come before less-specific ones so NestJS
  // doesn't let CelebrationsController's GET /:id swallow
  // /celebrations/instances, /celebrations/items or /celebrations/orders
  controllers: [
    CelebrationInstancesController,
    ServiceOrderItemsController,
    ServiceOrdersController,
    CelebrationsController,
  ],
  providers: [
    CelebrationsService,
    CelebrationInstancesService,
    ServiceOrdersService,
    ServiceOrderItemsService,
  ],
  exports: [CelebrationsService, CelebrationInstancesService, ServiceOrdersService, ServiceOrderItemsService],
})
export class CelebrationsModule {}
