import { Module } from '@nestjs/common';
import { RAGServiceWithLangChain } from './rag.service';
import { RagController } from './rag.controller';

@Module({
  providers: [RAGServiceWithLangChain],
  controllers: [RagController],
})
export class RagModule {}
