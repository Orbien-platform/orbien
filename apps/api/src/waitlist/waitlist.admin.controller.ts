import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WaitlistService } from './waitlist.service';
import { ListWaitlistQueryDto } from './dto/list-waitlist-query.dto';
import { UpdateWaitlistDto } from './dto/update-waitlist.dto';

@Controller('admin/waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('platform_support')
export class WaitlistAdminController {
  constructor(private readonly service: WaitlistService) {}

  @Get()
  findAll(@Query() query: ListWaitlistQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWaitlistDto) {
    return this.service.update(id, dto);
  }
}
