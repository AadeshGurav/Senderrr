import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WaAuthService } from './wa-auth.service';
import { LoginDto, ChangePasswordDto } from './dto/login.dto';
import { WaAuthGuard } from './wa-auth.guard';
import { WaPublic } from './wa-auth.decorators';
import { CurrentWaUser } from './wa-auth.decorators';

@ApiTags('wa-automation / auth')
@Controller('wa/auth')
export class WaAuthController {
  constructor(private readonly waAuthService: WaAuthService) {}

  @Post('login')
  @WaPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login to WA Automation dashboard' })
  @ApiResponse({ status: 200, description: 'JWT token returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.waAuthService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(WaAuthGuard)
  @ApiOperation({ summary: 'Get current user info' })
  async me(@CurrentWaUser('id') userId: number) {
    const user = await this.waAuthService.validateUser(userId);
    return { id: user!.id, username: user!.username, role: user!.role };
  }

  @Post('change-password')
  @UseGuards(WaAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password' })
  async changePassword(@CurrentWaUser('id') userId: number, @Body() dto: ChangePasswordDto) {
    await this.waAuthService.changePassword(userId, dto.currentPassword, dto.newPassword);
    return { success: true };
  }
}
