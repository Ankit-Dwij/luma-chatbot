import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IngestCSVDto {
  @ApiProperty({
    description: 'Path to CSV file to ingest',
    example: './data/attendees.csv',
  })
  @IsString()
  @IsNotEmpty()
  filePath: string;
}
