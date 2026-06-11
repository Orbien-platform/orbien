import { Controller, Param, Post } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

// Public endpoint — no authentication required. Security relies on the
// unguessable UUID checkin_token (only visible to admins/leaders).
@Controller('volunteers/checkin')
export class CheckinController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post(':token')
  checkIn(@Param('token') token: string) {
    return this.schedulesService.checkIn(token);
  }
}
