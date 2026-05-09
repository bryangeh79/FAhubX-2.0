import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VpnService } from './vpn.service';

@Controller('vpn-configs')
@UseGuards(JwtAuthGuard)
export class VpnController {
  constructor(private readonly vpnService: VpnService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.vpnService.findAll(user.id, +page, +limit);
  }

  @Get('default')
  async getDefault(@CurrentUser() user: any) {
    return this.vpnService.getDefault(user.id);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vpnService.findOne(user.id, id);
  }

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: any) {
    return this.vpnService.create(user.id, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.vpnService.update(user.id, id, dto);
  }

  @Post(':id/set-default')
  async setDefault(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vpnService.setDefault(user.id, id);
  }

  @Post(':id/connect')
  async connect(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vpnService.connect(user.id, id);
  }

  @Post(':id/disconnect')
  async disconnect(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vpnService.disconnect(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.vpnService.remove(user.id, id);
    return { message: '删除成功' };
  }
}
