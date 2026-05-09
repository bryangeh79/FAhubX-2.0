import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: '重置令牌',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString({ message: '重置令牌必须是字符串' })
  @IsNotEmpty({ message: '重置令牌不能为空' })
  resetToken: string;

  @ApiProperty({
    description: '新密码',
    example: 'NewPassword123!',
  })
  @IsString({ message: '新密码必须是字符串' })
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(8, { message: '新密码长度不能少于8个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: '新密码必须包含至少一个大写字母、一个小写字母、一个数字和一个特殊字符',
  })
  newPassword: string;
}