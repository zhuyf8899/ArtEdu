import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getApplicationHealth() {
    return {
      status: 'ok',
      service: 'ai-design-platform-api',
    };
  }

  @Get('database')
  async getDatabaseHealth() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'postgresql',
    };
  }
}
