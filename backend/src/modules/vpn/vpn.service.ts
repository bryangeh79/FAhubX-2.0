import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { VpnConfig } from '../vpn-integration/entities/vpn-config.entity';

@Injectable()
export class VpnService {
  constructor(
    @InjectRepository(VpnConfig)
    private readonly vpnRepo: Repository<VpnConfig>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string, page = 1, limit = 20) {
    const [vpns, total] = await this.vpnRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { vpns, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(userId: string, id: string) {
    const config = await this.vpnRepo.findOne({ where: { id, userId } });
    if (!config) throw new NotFoundException('VPN配置不存在');
    return config;
  }

  async create(userId: string, dto: any) {
    const rawType = (dto.type || dto.protocol || 'openvpn').toLowerCase();
    const typeMap: Record<string, string> = {
      socks5: 'socks5',
      http: 'http',
      openvpn: 'openvpn',
      wireguard: 'wireguard',
      shadowsocks: 'socks5',  // shadowsocks 底层是 socks5
      other: 'http',           // 其他默认当 HTTP proxy
    };
    const resolvedType = typeMap[rawType] || 'http';
    if (dto.isDefault) {
      await this.vpnRepo.update({ userId }, { isDefault: false });
    }
    const server = dto.serverAddress || dto.server || '';
    // 配置填完整（有 server）就直接标记 active — 静态住宅代理配置好了就能用，不等实际连接
    const status = server ? 'active' : 'inactive';
    const lastConnectedAt = server ? new Date() : null;
    const ipAddress = dto.ipAddress || server || null;
    // Use raw query to handle the extra 'type' enum column not in entity
    const result = await this.dataSource.query(
      `INSERT INTO vpn_configs ("userId", name, protocol, "type", server, port, username, password, country, city, "isDefault", status, "lastConnectedAt", "ipAddress", config, parameters, "healthScore", "totalConnections", "totalDuration", "averageLatency", "successRate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'{}','{}',100,0,'0','0','0') RETURNING *`,
      [userId, dto.name, resolvedType, resolvedType,
       server, dto.port || 1194,
       dto.username || '', dto.password || '',
       dto.country || '', dto.city || '',
       dto.isDefault || false,
       status, lastConnectedAt, ipAddress]
    );
    return result[0];
  }

  async update(userId: string, id: string, dto: any) {
    const config = await this.findOne(userId, id);
    if (dto.isDefault === true) {
      await this.vpnRepo.update({ userId }, { isDefault: false });
    }
    if (dto.name !== undefined) config.name = dto.name;
    if (dto.type || dto.protocol) config.protocol = ((dto.type || dto.protocol) as string).toLowerCase() as any;
    if (dto.serverAddress || dto.server) config.server = dto.serverAddress || dto.server;
    if (dto.port !== undefined) config.port = dto.port;
    if (dto.username !== undefined) config.username = dto.username;
    if (dto.password !== undefined) config.password = dto.password;
    if (dto.country !== undefined) config.country = dto.country;
    if (dto.city !== undefined) config.city = dto.city;
    if (dto.isDefault !== undefined) config.isDefault = dto.isDefault;
    if (dto.ipAddress !== undefined) config.ipAddress = dto.ipAddress;
    // 编辑后只要 server 非空就保持 active 并刷新 lastConnectedAt
    if (config.server) {
      config.status = 'active';
      config.lastConnectedAt = new Date();
      if (!config.ipAddress) config.ipAddress = config.server;
    }
    return this.vpnRepo.save(config);
  }

  async setDefault(userId: string, id: string) {
    await this.vpnRepo.update({ userId }, { isDefault: false });
    const config = await this.findOne(userId, id);
    config.isDefault = true;
    return this.vpnRepo.save(config);
  }

  async remove(userId: string, id: string) {
    const config = await this.findOne(userId, id);
    await this.vpnRepo.remove(config);
  }

  async getDefault(userId: string) {
    return this.vpnRepo.findOne({ where: { userId, isDefault: true } });
  }

  async connect(userId: string, id: string) {
    const config = await this.findOne(userId, id);
    const now = new Date();
    await this.dataSource.query(
      `UPDATE vpn_configs SET status = 'active', "lastConnectedAt" = $3 WHERE id = $1 AND "userId" = $2`,
      [id, userId, now],
    );
    return { ...config, status: 'active', lastConnectedAt: now };
  }

  async disconnect(userId: string, id: string) {
    const config = await this.findOne(userId, id);
    await this.dataSource.query(
      `UPDATE vpn_configs SET status = 'inactive' WHERE id = $1 AND "userId" = $2`,
      [id, userId],
    );
    return { ...config, status: 'inactive' };
  }
}
