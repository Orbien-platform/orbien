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
import { VisitorService } from './visitor.service';
import { RegisterVisitorDto } from './dto/register-visitor.dto';

@Controller('public/visitor')
@UseGuards(ThrottlerGuard)
export class VisitorPublicController {
  constructor(private readonly visitorService: VisitorService) {}

  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterVisitorDto, @Req() req: Request) {
    return this.visitorService.registerViaQr(dto, req.ip, req.headers['user-agent']);
  }
}
