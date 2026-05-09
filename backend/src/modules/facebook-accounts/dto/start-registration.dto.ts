import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty, IsString, IsOptional, IsIn, IsDateString,
} from 'class-validator';

/**
 * DTO for starting a semi-automated Facebook account registration.
 * System opens Puppeteer + VPN, pre-fills these fields on facebook.com/r.php,
 * user manually completes CAPTCHA / email / phone verification.
 */
export class StartRegistrationDto {
  @ApiProperty({ description: '名（First name）', example: 'John' })
  @IsString()
  @IsNotEmpty({ message: '名不能为空' })
  firstName: string;

  @ApiProperty({ description: '姓（Last name）', example: 'Doe' })
  @IsString()
  @IsNotEmpty({ message: '姓不能为空' })
  lastName: string;

  @ApiProperty({ description: '注册邮箱或手机号', example: 'john.doe@example.com' })
  @IsString()
  @IsNotEmpty({ message: '邮箱/手机号不能为空' })
  email: string;

  @ApiProperty({ description: '计划使用的 FB 密码（会加密存入 DB，并在注册页预填）' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  facebookPassword: string;

  @ApiProperty({ description: 'VPN 配置 ID — 注册流程必须走代理，新账号首登 IP 即目标地区', example: 'uuid-xxx' })
  @IsString()
  @IsNotEmpty({ message: '注册必须选择 VPN（确保新账号首次登录即走目标地区 IP）' })
  vpnConfigId: string;

  @ApiProperty({ description: '账号显示名称（系统内部用；不填则用 firstName + lastName）', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '生日 YYYY-MM-DD', required: false, example: '1995-03-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ description: '性别', required: false, enum: ['male', 'female', 'custom'] })
  @IsOptional()
  @IsString()
  @IsIn(['male', 'female', 'custom'])
  gender?: 'male' | 'female' | 'custom';

  @ApiProperty({ description: '账号类型', required: false, enum: ['user', 'page', 'business'] })
  @IsOptional()
  @IsString()
  @IsIn(['user', 'page', 'business'])
  accountType?: 'user' | 'page' | 'business';

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
