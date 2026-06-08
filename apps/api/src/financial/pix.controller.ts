import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PixService } from './pix.service';
import { CreatePixDto } from './dto/create-pix.dto';

@Controller('financial/pix')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class PixController {
  constructor(private readonly pixService: PixService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  createManual(@Body() dto: CreatePixDto) {
    return this.pixService.createManual(dto);
  }

  @Post('public-donation')
  @HttpCode(HttpStatus.OK)
  createPublicDonation(@Body() dto: CreatePixDto) {
    return this.pixService.createPublicDonation(dto);
  }
}
