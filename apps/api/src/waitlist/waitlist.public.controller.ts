import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

@Controller('public/waitlist')
@UseGuards(ThrottlerGuard)
export class WaitlistPublicController {
  constructor(private readonly service: WaitlistService) {}

  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  subscribe(@Body() dto: CreateWaitlistDto, @Req() req: Request) {
    const ip = req.ip ?? '';
    const userAgent = (req.headers['user-agent'] as string) ?? '';
    return this.service.subscribe(dto, ip, userAgent);
  }
}
