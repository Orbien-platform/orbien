import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CelebrationSchedulerService } from './celebration-scheduler.service';

@Controller('internal/celebrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('platform_support')
export class CelebrationSchedulerController {
  constructor(private readonly schedulerService: CelebrationSchedulerService) {}

  @Post('generate-instances')
  generateInstances() {
    return this.schedulerService.generateInstances();
  }

  @Post('send-host-reminders')
  sendHostReminders() {
    return this.schedulerService.sendHostReminders();
  }
}
