import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PersonsModule } from './persons/persons.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { VisitorModule } from './visitor/visitor.module';
import { SmallGroupsModule } from './small-groups/small-groups.module';
import { GroupTypesModule } from './small-groups/group-types/group-types.module';
import { StudyMaterialsModule } from './study-materials/study-materials.module';
import { FinancialModule } from './financial/financial.module';
import { ContentModule } from './content/content.module';
import { VolunteersModule } from './volunteers/volunteers.module';
import { CelebrationsModule } from './celebrations/celebrations.module';
import { SettingsModule } from './settings/settings.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  controllers: [AppController],
  imports: [
    // ConfigModule must be first — loads .env before any module reads process.env
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.register({
      global: true,
      secret: process.env['JWT_SECRET'],
      signOptions: { expiresIn: Number(process.env['JWT_EXPIRES_IN'] ?? 900) },
    }),

    PrismaModule,
    AuthModule,
    PersonsModule,
    WaitlistModule,
    VisitorModule,
    ScheduleModule.forRoot(),
    SmallGroupsModule,
    GroupTypesModule,
    StudyMaterialsModule,
    FinancialModule,
    ContentModule,
    VolunteersModule,
    CelebrationsModule,
    SettingsModule,
  ],
})
export class AppModule {}
