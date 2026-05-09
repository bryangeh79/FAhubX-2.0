      ipPool.packetLoss = packetLoss;
      ipPool.bandwidth = bandwidth;
      ipPool.lastHealthCheck = new Date();
      await this.ipPoolRepository.save(ipPool);

      // 记录监控日志
      await this.logNetworkMetric({
        vpnConfigId: ipPool.vpnConfigId,
        ipPoolId: ipPool.id,
        metricType: MetricType.HEALTH_SCORE,
        metricValue: healthScore,
        unit: 'score',
        status: healthScore >= 80 ? MetricStatus.NORMAL : 
                healthScore >= 50 ? MetricStatus.WARNING : MetricStatus.CRITICAL,
        details: { latency, packetLoss, bandwidth },
      });

      return {
        ipAddress: ipPool.ipAddress,
        healthScore,
        latency,
        packetLoss,
        bandwidth,
        status,
        lastChecked: new Date(),
        details: {
          ipType: ipPool.type,
          countryCode: ipPool.countryCode,
          isp: ipPool.isp,
        },
      };
    } catch (error) {
      this.logger.error(`Health check failed for IP ${ipPool.ipAddress}: ${error.message}`);
      
      // 更新为不健康状态
      ipPool.healthScore = 0;
      ipPool.lastHealthCheck = new Date();
      await this.ipPoolRepository.save(ipPool);

      await this.logNetworkMetric({
        vpnConfigId: ipPool.vpnConfigId,
        ipPoolId: ipPool.id,
        metricType: MetricType.ERROR,
        metricValue: 0,
        status: MetricStatus.CRITICAL,
        details: { error: error.message },
      });

      throw error;
    }
  }

  private async testLatency(ipAddress: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`ping -c 4 ${ipAddress}`);
      const match = stdout.match(/min\/avg\/max\/mdev = [\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (match) {
        return parseFloat(match[2]); // 返回平均延迟
      }
      return 100; // 默认值
    } catch (error) {
      this.logger.warn(`Latency test failed for ${ipAddress}: ${error.message}`);
      return 999; // 测试失败返回高延迟
    }
  }

  private async testPacketLoss(ipAddress: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`ping -c 10 ${ipAddress}`);
      const match = stdout.match(/(\d+)% packet loss/);
      if (match) {
        return parseFloat(match[1]);
      }
      return 0; // 默认值
    } catch (error) {
      this.logger.warn(`Packet loss test failed for ${ipAddress}: ${error.message}`);
      return 100; // 测试失败返回100%丢包
    }
  }

  private async testBandwidth(ipAddress: string): Promise<number> {
    // 简化版带宽测试，实际应用中可能需要更复杂的测试
    try {
      // 使用curl测试下载速度
      const testUrl = 'http://speedtest.tele2.net/10MB.zip';
      const startTime = Date.now();
      
      await execAsync(`curl -o /dev/null -s -w "%{speed_download}" ${testUrl}`, {
        timeout: 10000,
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // 秒
      
      // 假设下载了10MB文件
      const fileSize = 10 * 1024 * 1024; // 10MB in bytes
      const bandwidth = (fileSize * 8) / (duration * 1000000); // Mbps
      
      return Math.min(bandwidth, 100); // 限制最大值为100Mbps
    } catch (error) {
      this.logger.warn(`Bandwidth test failed: ${error.message}`);
      return 1; // 默认低速
    }
  }

  private calculateHealthScore(
    latency: number,
    packetLoss: number,
    bandwidth: number,
  ): number {
    // 延迟评分 (0-40分)
    let latencyScore = 40;
    if (latency > 500) latencyScore = 0;
    else if (latency > 300) latencyScore = 10;
    else if (latency > 200) latencyScore = 20;
    else if (latency > 100) latencyScore = 30;
    else latencyScore = 40;

    // 丢包率评分 (0-30分)
    let packetLossScore = 30;
    if (packetLoss > 20) packetLossScore = 0;
    else if (packetLoss > 10) packetLossScore = 10;
    else if (packetLoss > 5) packetLossScore = 20;
    else packetLossScore = 30;

    // 带宽评分 (0-30分)
    let bandwidthScore = 30;
    if (bandwidth < 1) bandwidthScore = 0;
    else if (bandwidth < 5) bandwidthScore = 10;
    else if (bandwidth < 10) bandwidthScore = 20;
    else bandwidthScore = 30;

    return latencyScore + packetLossScore + bandwidthScore;
  }

  private async logNetworkMetric(data: {
    vpnConfigId?: string;
    ipPoolId?: string;
    accountId?: string;
    metricType: MetricType;
    metricValue?: number;
    unit?: string;
    status?: MetricStatus;
    details?: any;
  }): Promise<void> {
    const log = this.networkMonitorLogRepository.create(data);
    await this.networkMonitorLogRepository.save(log);
  }

  async getAccountNetworkStatus(accountId: string): Promise<any> {
    const mapping = await this.accountIPMappingRepository.findOne({
      where: { 
        accountId, 
        status: ConnectionStatus.ACTIVE 
      },
      relations: ['ipPool', 'vpnConfig'],
    });

    if (!mapping) {
      return {
        connected: false,
        status: 'no_active_connection',
      };
    }

    // 获取当前网络指标
    let currentMetrics: NetworkMetrics = {
      latency: mapping.currentLatency || 0,
      jitter: 0,
      packetLoss: mapping.currentPacketLoss || 0,
      bandwidth: {
        download: mapping.currentBandwidth || 0,
        upload: 0,
      },
      stability: 0,
    };

    // 如果IP池存在，尝试获取实时指标
    if (mapping.ipPool) {
      try {
        const healthResult = await this.checkIPHealth(mapping.ipPool.id);
        currentMetrics = {
          latency: healthResult.latency,
          jitter: 0, // 需要专门的抖动测试
          packetLoss: healthResult.packetLoss,
          bandwidth: {
            download: healthResult.bandwidth,
            upload: 0, // 需要专门的上传测试
          },
          stability: healthResult.healthScore,
        };

        // 更新映射中的当前指标
        mapping.currentLatency = healthResult.latency;
        mapping.currentPacketLoss = healthResult.packetLoss;
        mapping.currentBandwidth = healthResult.bandwidth;
        await this.accountIPMappingRepository.save(mapping);
      } catch (error) {
        this.logger.warn(`Failed to get real-time metrics: ${error.message}`);
      }
    }

    return {
      connected: true,
      status: mapping.status,
      ipAddress: mapping.ipPool?.ipAddress,
      vpnConfig: mapping.vpnConfig?.name,
      connectionType: mapping.connectionType,
      startTime: mapping.startTime,
      duration: Date.now() - mapping.startTime.getTime(),
      metrics: currentMetrics,
      healthScore: mapping.ipPool?.healthScore || 0,
    };
  }

  async getVPNConfigStatus(configId: string): Promise<any> {
    const config = await this.vpnConfigRepository.findOne({
      where: { id: configId },
      relations: ['ipPools'],
    });

    if (!config) {
      throw new Error('VPN config not found');
    }

    const client = this.vpnClients.get(configId);
    let connectionStatus: VPNConnectionStatus = {
      connected: false,
      status: 'unknown',
      bytesIn: 0,
      bytesOut: 0,
    };

    if (client) {
      try {
        connectionStatus = await client.getStatus();
      } catch (error) {
        this.logger.error(`Failed to get connection status: ${error.message}`);
      }
    }

    // 统计IP池状态
    const ipStats = {
      total: config.ipPools?.length || 0,
      available: config.ipPools?.filter(ip => ip.status === IPStatus.AVAILABLE).length || 0,
      assigned: config.ipPools?.filter(ip => ip.status === IPStatus.ASSIGNED).length || 0,
      blocked: config.ipPools?.filter(ip => ip.status === IPStatus.BLOCKED).length || 0,
      averageHealthScore: config.ipPools?.reduce((sum, ip) => sum + ip.healthScore, 0) / 
                         (config.ipPools?.length || 1) || 0,
    };

    return {
      config: {
        id: config.id,
        name: config.name,
        type: config.type,
        status: config.status,
        healthScore: config.healthScore,
        serverLocation: config.serverLocation,
        countryCode: config.countryCode,
        provider: config.provider,
      },
      connection: connectionStatus,
      ipPool: ipStats,
      performance: {
        averageLatency: config.averageLatency,
        successRate: config.successRate,
        totalConnections: config.totalConnections,
        totalDuration: config.totalDuration,
      },
      lastUsed: config.lastUsedAt,
    };
  }

  async connectVPN(configId: string): Promise<VPNConnectionStatus> {
    const config = await this.vpnConfigRepository.findOne({
      where: { id: configId },
    });

    if (!config) {
      throw new Error('VPN config not found');
    }

    let client = this.vpnClients.get(configId);
    if (!client) {
      client = await this.createVPNClient(config);
      this.vpnClients.set(configId, client);
    }

    try {
      const status = await client.connect(config.config);
      
      // 更新配置状态
      config.status = VPNStatus.ACTIVE;
      config.lastUsedAt = new Date();
      await this.vpnConfigRepository.save(config);

      await this.logNetworkMetric({
        vpnConfigId: configId,
        metricType: MetricType.CONNECTION_STATUS,
        metricValue: 1,
        status: MetricStatus.NORMAL,
        details: { action: 'connect', status: 'success' },
      });

      return status;
    } catch (error) {
      config.status = VPNStatus.ERROR;
      await this.vpnConfigRepository.save(config);

      await this.logNetworkMetric({
        vpnConfigId: configId,
        metricType: MetricType.ERROR,
        metricValue: 0,
        status: MetricStatus.CRITICAL,
        details: { action: 'connect', error: error.message },
      });

      throw error;
    }
  }

  async disconnectVPN(configId: string): Promise<void> {
    const config = await this.vpnConfigRepository.findOne({
      where: { id: configId },
    });

    if (!config) {
      throw new Error('VPN config not found');
    }

    const client = this.vpnClients.get(configId);
    if (client) {
      try {
        await client.disconnect();
        
        config.status = VPNStatus.INACTIVE;
        await this.vpnConfigRepository.save(config);

        await this.logNetworkMetric({
          vpnConfigId: configId,
          metricType: MetricType.CONNECTION_STATUS,
          metricValue: 0,
          status: MetricStatus.NORMAL,
          details: { action: 'disconnect', status: 'success' },
        });
      } catch (error) {
        await this.logNetworkMetric({
          vpnConfigId: configId,
          metricType: MetricType.ERROR,
          metricValue: 0,
          status: MetricStatus.WARNING,
          details: { action: 'disconnect', error: error.message },
        });
        throw error;
      }
    }
  }

  async runScheduledHealthChecks(): Promise<void> {
    this.logger.log('Running scheduled health checks...');

    // 检查所有活跃的VPN配置
    const activeConfigs = await this.vpnConfigRepository.find({
      where: { status: VPNStatus.ACTIVE },
    });

    for (const config of activeConfigs) {
      try {
        const client = this.vpnClients.get(config.id);
        if (client) {
          const status = await client.getStatus();
          
          if (!status.connected) {
            this.logger.warn(`VPN ${config.name} is disconnected, attempting to reconnect...`);
            await this.connectVPN(config.id);
          }
        }
      } catch (error) {
        this.logger.error(`Health check failed for VPN ${config.name}: ${error.message}`);
      }
    }

    // 检查所有已分配的IP
    const assignedIPs = await this.ipPoolRepository.find({
      where: { status: IPStatus.ASSIGNED },
    });

    for (const ip of assignedIPs) {
      try {
        await this.checkIPHealth(ip.id);
      } catch (error) {
        this.logger.error(`Health check failed for IP ${ip.ipAddress}: ${error.message}`);
      }
    }

    this.logger.log('Scheduled health checks completed');
  }

  async getNetworkMetrics(timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<any> {
    const now = new Date();
    let startTime = new Date();

    switch (timeRange) {
      case '1h':
        startTime.setHours(now.getHours() - 1);
        break;
      case '24h':
        startTime.setDate(now.getDate() - 1);
        break;
      case '7d':
        startTime.setDate(now.getDate() - 7);
        break;
      case '30d':
        startTime.setDate(now.getDate() - 30);
        break;
    }

    const metrics = await this.networkMonitorLogRepository
      .createQueryBuilder('log')
      .select('log.metric_type', 'metricType')
      .addSelect('AVG(log.metric_value)', 'averageValue')
      .addSelect('MIN(log.metric_value)', 'minValue')
      .addSelect('MAX(log.metric_value)', 'maxValue')
      .addSelect('COUNT(*)', 'count')
      .where('log.created_at >= :startTime', { startTime })
      .andWhere('log.metric_value IS NOT NULL')
      .groupBy('log.metric_type')
      .getRawMany();

    const alerts = await this.networkMonitorLogRepository
      .createQueryBuilder('log')
      .where('log.created_at >= :startTime', { startTime })
      .andWhere('log.status IN (:...statuses)', { 
        statuses: [MetricStatus.WARNING, MetricStatus.CRITICAL] 
      })
      .orderBy('log.created_at', 'DESC')
      .limit(50)
      .getMany();

    return {
      timeRange,
      startTime,
      endTime: now,
      metrics,
      alerts,
      summary: {
        totalMetrics: metrics.reduce((sum, m) => sum + parseInt(m.count), 0),
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.status === MetricStatus.CRITICAL).length,
        warningAlerts: alerts.filter(a => a.status === MetricStatus.WARNING).length,
      },
    };
  }
}