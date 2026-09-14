import { Test } from '@nestjs/testing';
import { SmallGroupsModule } from './small-groups.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmallGroupsService } from './small-groups.service';
import { MeetingsService } from './meetings.service';
import { PrayerRequestsService } from './prayer-requests.service';
import { GroupMessagesService } from './group-messages.service';

describe('SmallGroupsModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, SmallGroupsModule],
    }).compile();

    expect(moduleRef.get(SmallGroupsService)).toBeInstanceOf(SmallGroupsService);
    expect(moduleRef.get(MeetingsService)).toBeInstanceOf(MeetingsService);
    expect(moduleRef.get(PrayerRequestsService)).toBeInstanceOf(PrayerRequestsService);
    expect(moduleRef.get(GroupMessagesService)).toBeInstanceOf(GroupMessagesService);

    await moduleRef.close();
  });
});
