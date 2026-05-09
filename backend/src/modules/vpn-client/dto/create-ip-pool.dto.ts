import { IsEnum, IsString, IsOptional, IsNumber, Min, Max, IsIP, IsObject } from 'class-validator';
import { IPType } from '../entities/ip-pool.entity';

export class CreateIPPoolDto {
  @IsString()
  vpnConfigId: string;

  @IsIP()
  ipAddress: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsEnum(IPType)
  type?: IPType;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  isp?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  healthScore?: number;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class UpdateIPPoolDto {
  @IsOptional()
  @IsEnum(IPType)
  type?: IPType;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  isp?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  healthScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageLatency?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  packetLoss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bandwidth?: number;

  @IsOptional()
  @IsObject()
  metadata?: any;
}