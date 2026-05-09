import { IsEnum, IsString, IsObject, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { VPNType } from '../entities/vpn-config.entity';

export class CreateVPNConfigDto {
  @IsString()
  name: string;

  @IsEnum(VPNType)
  type: VPNType;

  @IsObject()
  config: any;

  @IsOptional()
  @IsString()
  serverLocation?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class UpdateVPNConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(VPNType)
  type?: VPNType;

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsString()
  serverLocation?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  healthScore?: number;

  @IsOptional()
  @IsObject()
  metadata?: any;
}