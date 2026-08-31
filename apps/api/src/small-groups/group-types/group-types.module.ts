import { Module } from '@nestjs/common';
import { GroupTypesController } from './group-types.controller';
import { GroupTypesService } from './group-types.service';

@Module({
  controllers: [GroupTypesController],
  providers: [GroupTypesService],
  exports: [GroupTypesService],
})
export class GroupTypesModule {}
