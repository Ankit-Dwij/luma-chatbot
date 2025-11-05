import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { AppConfigService } from './config.service';
import appConfig from './app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig],
    }),
  ],
  providers: [],
  exports: [],
})
export class AppConfigModule {}
