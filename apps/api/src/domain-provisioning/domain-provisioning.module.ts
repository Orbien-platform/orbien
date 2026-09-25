import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { DomainProvisioningController } from './domain-provisioning.controller';
import { PublicDomainController } from './public-domain.controller';
import { DomainProvisioningService } from './domain-provisioning.service';
import { SecretCipher } from '../common/crypto/secret-cipher';
import { SignedState } from '../common/crypto/signed-state';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [DomainProvisioningController, PublicDomainController],
  providers: [DomainProvisioningService, SecretCipher, SignedState],
})
export class DomainProvisioningModule {}
