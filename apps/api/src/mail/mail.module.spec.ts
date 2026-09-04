import { Test } from '@nestjs/testing';
import { MailModule } from './mail.module';
import { MailService } from './mail.service';

describe('MailModule', () => {
  it('compila e registra o MailService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MailModule],
    }).compile();

    expect(moduleRef.get(MailService)).toBeInstanceOf(MailService);

    await moduleRef.close();
  });
});
