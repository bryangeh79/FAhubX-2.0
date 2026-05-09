import { IsEnum, IsString, IsOptional, IsUUID } from 'class-validator';
import { ConnectionType } from '../entities/account-ip-mapping.entity';

export class AssignIPDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsUUID()
  ipPoolId?: string;

  @IsOptional()
  @IsUUID()
  vpnConfigId?: string;

  @IsOptional()
  @IsEnum(ConnectionType)
  connectionType?: ConnectionType;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  ipType?: string;

  @IsOptional()
  @IsString()
  taskType?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;
}

export class ReleaseIPDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsUUID()
  mappingId?: string;
}

export class RotateIPDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}