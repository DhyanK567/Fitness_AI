import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterStudioDto } from './dto/register-studio.dto';
import { PlatformRateLimitGuard } from './platform-rate-limit.guard';

@Controller('auth')
export class AuthRegistrationController {
  constructor(private readonly auth: AuthService) {}

  @Post('check-availability')
  @HttpCode(200)
  async checkAvailability(@Body() body: { studio_name?: string; email?: string }) {
    return this.auth.checkStudioAvailability(body);
  }

  @Post('register/studio')
  @HttpCode(201)
  @UseGuards(PlatformRateLimitGuard)
  async registerStudio(@Body() body: RegisterStudioDto) {
    return this.auth.registerStudio(body);
  }
}