import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() username: string;
  @ApiProperty() fullName: string;
  @ApiProperty() status: string;
  @ApiProperty() role?: string;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() twoFactorEnabled: boolean;
  @ApiProperty() avatarUrl: string;
  @ApiProperty() timezone: string;
  @ApiProperty() language: string;
  @ApiProperty() preferences: Record<string, any>;
  @ApiProperty() totalLogins: number;
  @ApiProperty() lastLoginAt: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
