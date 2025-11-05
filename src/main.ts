import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // <-- ADD THIS
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('Your API Title')
    .setDescription('Your API description')
    .setVersion('1.0')
    .addTag('API') // you can add tags if you want
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3003);
  console.log(
    `Application is running on: http://localhost:${process.env.PORT ?? 3003}`,
  );
  console.log(
    `Swagger is running on: http://localhost:${process.env.PORT ?? 3003}/docs`,
  );
}
bootstrap();
