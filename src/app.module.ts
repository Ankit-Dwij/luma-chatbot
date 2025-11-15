import { Module } from '@nestjs/common';
// import { RedisService } from './redis.service';
// import { MongooseConfigService } from './database/mongoose-config.service';
// import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
// import databaseConfig from './database/config/database.config';
// import { EventsModule } from './events/events.module';
import { RagModule } from './rag/rag.module';
import appConfig from './config/app.config';

// const infrastructureDatabaseModule = MongooseModule.forRootAsync({
//   useClass: MongooseConfigService,
// });

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env'],
    }),
    RagModule,
    // infrastructureDatabaseModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
