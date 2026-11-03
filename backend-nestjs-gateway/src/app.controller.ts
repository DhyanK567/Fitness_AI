import { Controller, Get, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService, HealthCheckResult, VersionInfo } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Root health check' })
  @ApiResponse({ status: 200, description: 'Health check result' })
  async getRoot(): Promise<HealthCheckResult | { status: string }> {
    return this.appService.getHealth();
  }

  @Get('health/live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe (public)', description: 'Always returns 200. Used by k8s to determine if pod should be restarted. No dependency calls.' })
  @ApiResponse({ status: 200, description: 'Liveness check result', type: Object })
  async getLiveHealth(): Promise<HealthCheckResult> {
    return this.appService.getLiveHealth();
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe (public)', description: 'Returns 503 if DB or Redis unhealthy; ERP and LLM only mark degraded. LLM check cached for 60s.' })
  @ApiResponse({ status: 200, description: 'Ready - service can accept traffic', type: Object })
  @ApiResponse({ status: 503, description: 'Not ready - critical dependencies unavailable' })
  async getReadyHealth(): Promise<HealthCheckResult> {
    const result = await this.appService.getReadyHealth();
    if (result.status === 'unhealthy') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint (public, alias of /health/ready)', description: 'Checks database, Redis, ERP, and LLM connectivity. Returns overall status and per-component health. Returns 503 if DB or Redis unhealthy.' })
  @ApiResponse({ status: 200, description: 'Health check result', type: Object })
  @ApiResponse({ status: 503, description: 'Service unhealthy' })
  async getHealth(): Promise<HealthCheckResult> {
    const result = await this.appService.getHealth();
    if (result.status === 'unhealthy') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('version')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Version info endpoint (public)', description: 'Returns application version, build date, commit, and environment.' })
  @ApiResponse({ status: 200, description: 'Version information', type: Object })
  async getVersion(): Promise<VersionInfo> {
    return this.appService.getVersion();
  }
}