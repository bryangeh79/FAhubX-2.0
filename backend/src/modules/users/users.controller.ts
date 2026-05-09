import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from './entities/user.entity';

@ApiTags('用户')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 3600 } }) // 每小时最多5次
  @ApiOperation({ summary: '创建用户', description: '注册新用户' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '用户创建成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '邮箱或用户名已存在',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '请求参数错误',
  })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取用户列表', description: '管理员获取所有用户列表' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码',
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量',
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: '用户状态过滤',
    enum: ['active', 'suspended', 'deleted'],
  })
  @ApiQuery({
    name: 'emailVerified',
    required: false,
    description: '邮箱验证状态过滤',
    type: Boolean,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: '搜索关键词（邮箱、用户名、全名）',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取用户列表成功',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '权限不足',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('emailVerified') emailVerified?: boolean,
    @Query('search') search?: string,
  ) {
    const filters: any = {};
    if (status) filters.status = status;
    if (emailVerified !== undefined) {
      filters.emailVerified = (emailVerified as any) === true || (emailVerified as any) === 'true';
    }
    if (search) filters.search = search;

    return this.usersService.findAll(page, limit, filters);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取当前用户信息', description: '获取当前登录用户的信息' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取用户信息成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  async getCurrentUser(@CurrentUser() user: User): Promise<UserResponseDto> {
    return this.usersService.findOne(user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取用户信息', description: '根据ID获取用户信息' })
  @ApiParam({
    name: 'id',
    description: '用户ID',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取用户信息成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '用户不存在',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新当前用户信息', description: '更新当前登录用户的信息' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '更新成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '邮箱或用户名已存在',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  async updateCurrentUser(
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(user.id, updateUserDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新用户信息', description: '管理员更新用户信息' })
  @ApiParam({
    name: 'id',
    description: '用户ID',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '更新成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '用户不存在',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '邮箱或用户名已存在',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '权限不足',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, updateUserDto);
  }

  @Put('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新用户偏好设置', description: '更新当前用户的偏好设置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '更新成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() preferencesDto: UpdatePreferencesDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updatePreferences(user.id, preferencesDto);
  }

  /**
   * 直接更新当前用户的 UI 语言偏好（前端 Header 切换语言时调用）
   * 比 /me/preferences 更轻量，只改 language 字段
   */
  @Patch('me/language')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新当前用户的 UI 语言偏好' })
  async updateLanguage(
    @CurrentUser() user: User,
    @Body() body: { language: string },
  ): Promise<{ language: string }> {
    if (!body?.language || !['zh', 'en', 'vi'].includes(body.language)) {
      throw new BadRequestException('language 必须是 zh / en / vi 之一');
    }
    await this.usersService.updateLanguage(user.id, body.language);
    return { language: body.language };
  }

  /**
   * v1.2.0 Phase 1 — 暖化分组设置
   * 读取/修改每个租户的分组数（2-6）
   */
  @Get('me/warmup-settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取暖化分组设置' })
  async getWarmupSettings(@CurrentUser() user: User): Promise<{ groupCount: number }> {
    return this.usersService.getWarmupSettings(user.id);
  }

  @Patch('me/warmup-settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新暖化分组设置（组数 2-6）' })
  async updateWarmupSettings(
    @CurrentUser() user: User,
    @Body() body: { groupCount: number },
  ): Promise<{ groupCount: number }> {
    const n = parseInt(String(body?.groupCount), 10);
    if (!Number.isFinite(n) || n < 2 || n > 9) {
      throw new BadRequestException('groupCount 必须是 2-9 之间的整数');
    }
    return this.usersService.updateWarmupSettings(user.id, { groupCount: n });
  }

  /**
   * v1.2.0 Phase 4 —— 加群设置
   */
  @Get('me/group-join-settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取加群设置（关键词、上限、策略、AI 回答）' })
  async getGroupJoinSettings(@CurrentUser() user: User) {
    return this.usersService.getGroupJoinSettings(user.id);
  }

  @Patch('me/group-join-settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '更新加群设置' })
  async updateGroupJoinSettings(
    @CurrentUser() user: User,
    @Body() body: any,
  ) {
    return this.usersService.updateGroupJoinSettings(user.id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '删除用户', description: '管理员删除用户（软删除）' })
  @ApiParam({
    name: 'id',
    description: '用户ID',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '删除成功',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '用户不存在',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '权限不足',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.remove(id);
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '获取用户统计信息', description: '获取当前用户的统计信息' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取统计信息成功',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  async getStats(@CurrentUser() user: User) {
    return this.usersService.getStats(user.id);
  }

  @Post(':id/verify-email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '验证用户邮箱', description: '管理员验证用户邮箱' })
  @ApiParam({
    name: 'id',
    description: '用户ID',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '邮箱验证成功',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '用户不存在',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '未授权',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '权限不足',
  })
  async verifyEmail(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.verifyEmail(id);
  }
}