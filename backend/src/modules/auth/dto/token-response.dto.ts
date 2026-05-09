import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({
    description: '访问令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: '刷新令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: '令牌过期时间（秒）',
    example: 3600,
  })
  expiresIn: number;

  @ApiProperty({
    description: '令牌类型',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: '用户信息',
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'user@example.com',
      username: 'john_doe',
      fullName: 'John Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  })
  user: {
    id: string;
    email: string;
    username: string;
    fullName?: string;
    avatarUrl?: string;
    role?: string;
  };
}