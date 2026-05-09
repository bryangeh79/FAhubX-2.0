        total: vpnConfigs.length,
        active: vpnConfigs.filter(c => c.status === VPNStatus.ACTIVE).length,
        averageHealth: avgVPNHealth,
      },
      ipPools: {
        total: ipPools.length,
        available: ipPools.filter(ip => ip.status === IPStatus.AVAILABLE).length,
        averageHealth: avgIPHealth,
      },
      connections: {
        active: activeConnections.length,
        averageDuration: avgConnectionDuration,
      },
      performance: {
        averageLatency: performanceMetrics.latency,
        averagePacketLoss: performanceMetrics.packetLoss,
        averageBandwidth: performanceMetrics.bandwidth,
      },
    };

    // 保存到历史记录
    this.metricsHistory.push(summary);
    
    // 保持历史记录大小
    if (this.metricsHistory.length > 10080) { // 每周的记录（5分钟间隔）
      this.metricsHistory = this.metricsHistory.slice(-10080);
    }

    // 发出事件
    this.eventEmitter.emit('network.metrics.summary', summary);

    // 记录摘要日志
    await this.logMetric({
      metricType: MetricType.HEALTH_SCORE,
      metricValue: (avgVPNHealth + avgIPHealth) / 2,
      unit: 'score',
      status: ((avgVPNHealth + avgIPHealth) / 2) >= 70 ? MetricStatus.NORMAL : 
              ((avgVPNHealth + avgIPHealth) / 2) >= 50 ? MetricStatus.WARNING : MetricStatus.CRITICAL,
      details: summary,
    });
  }

  private async getAveragePerformanceMetrics(): Promise<{
    latency: number;
    packetLoss: number;
    bandwidth: number;
  }> {
    // 获取最近1小时的性能指标平均值
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const metrics = await this.networkMonitorLogRepository
      .createQueryBuilder('log')
      .select('log.metric_type', 'metricType')
      .addSelect('AVG(log.metric_value)', 'average')
      .where('log.created_at >= :oneHourAgo', { oneHourAgo })
      .andWhere('log.metric_type IN (:...types)', { 
        types: [MetricType.LATENCY, MetricType.PACKET_LOSS, MetricType.BANDWIDTH] 
      })
      .groupBy('log.metric_type')
      .getRawMany();

    const result = {
      latency: 0,
      packetLoss: 0,
      bandwidth: 0,
    };

    for (const metric of metrics) {
      switch (metric.metricType) {
        case MetricType.LATENCY:
          result.latency = parseFloat(metric.average) || 0;
          break;
        case MetricType.PACKET_LOSS:
          result.packetLoss = parseFloat(metric.average) || 0;
          break;
        case MetricType.BANDWIDTH:
          result.bandwidth = parseFloat(metric.average) || 0;
          break;
      }
    }

    return result;
  }

  private async checkAndSendAlerts(): Promise<void> {
    // 检查是否有需要发送的告警
    const alertsToSend = Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolved);

    if (alertsToSend.length === 0) {
      return;
    }

    // 按级别分组
    const criticalAlerts = alertsToSend.filter(a => a.level === 'critical');
    const warningAlerts = alertsToSend.filter(a => a.level === 'warning');
    const infoAlerts = alertsToSend.filter(a => a.level === 'info');

    // 发送告警通知
    if (criticalAlerts.length > 0) {
      await this.sendAlertNotification('critical', criticalAlerts);
    }

    if (warningAlerts.length > 0) {
      await this.sendAlertNotification('warning', warningAlerts);
    }

    if (infoAlerts.length > 0) {
      // 信息级别告警可能不需要立即通知
      await this.sendAlertNotification('info', infoAlerts);
    }
  }

  private async sendAlertNotification(
    level: 'critical' | 'warning' | 'info',
    alerts: NetworkAlert[],
  ): Promise<void> {
    // 这里可以实现发送邮件、Slack、Telegram等通知
    // 目前先记录到日志
    
    const alertSummary = alerts.map(alert => ({
      title: alert.title,
      message: alert.message,
      timestamp: alert.timestamp,
    }));

    this.logger[level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'log'](
      `${level.toUpperCase()} Alerts: ${JSON.stringify(alertSummary, null, 2)}`
    );

    // 发出事件供其他模块处理
    this.eventEmitter.emit(`network.alert.${level}`, {
      level,
      alerts: alertSummary,
      timestamp: new Date(),
    });
  }

  private async createAlert(alertData: Omit<NetworkAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alertId = `${alertData.type}-${alertData.entityId || 'system'}-${Date.now()}`;
    
    // 检查是否已存在相同的未解决告警
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      a => a.type === alertData.type && 
           a.entityId === alertData.entityId && 
           a.title === alertData.title && 
           !a.resolved
    );

    if (existingAlert) {
      // 更新现有告警的时间戳
      existingAlert.timestamp = new Date();
      this.activeAlerts.set(existingAlert.id, existingAlert);
      return;
    }

    const alert: NetworkAlert = {
      id: alertId,
      timestamp: new Date(),
      resolved: false,
      ...alertData,
    };

    this.activeAlerts.set(alertId, alert);

    // 记录告警日志
    await this.logMetric({
      metricType: MetricType.ERROR,
      metricValue: alertData.level === 'critical' ? 100 : alertData.level === 'warning' ? 50 : 10,
      unit: 'severity',
      status: alertData.level === 'critical' ? MetricStatus.CRITICAL : 
              alertData.level === 'warning' ? MetricStatus.WARNING : MetricStatus.NORMAL,
      details: {
        alertId,
        title: alertData.title,
        message: alertData.message,
        entityId: alertData.entityId,
        entityName: alertData.entityName,
      },
    });
  }

  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.activeAlerts.set(alertId, alert);

      // 记录解决日志
      await this.logMetric({
        metricType: MetricType.CONNECTION_STATUS,
        metricValue: 0,
        unit: 'alert',
        status: MetricStatus.NORMAL,
        details: {
          alertId,
          action: 'resolved',
          title: alert.title,
        },
      });
    }
  }

  async getActiveAlerts(): Promise<NetworkAlert[]> {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getAlertHistory(limit: number = 100): Promise<NetworkAlert[]> {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getMetricsHistory(
    timeRange: '1h' | '24h' | '7d' | '30d' = '24h',
  ): Promise<NetworkMetricsSummary[]> {
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

    return this.metricsHistory.filter(
      summary => summary.timestamp >= startTime
    );
  }

  private async performHealthChecks(): Promise<void> {
    this.logger.log('Performing comprehensive health checks...');

    // 检查所有VPN配置
    const vpnConfigs = await this.vpnConfigRepository.find();
    for (const config of vpnConfigs) {
      try {
        // 这里可以调用配置验证服务进行深度检查
        // 暂时只记录基本状态
        await this.logMetric({
          vpnConfigId: config.id,
          metricType: MetricType.HEALTH_SCORE,
          metricValue: config.healthScore,
          unit: 'score',
          status: config.healthScore >= 70 ? MetricStatus.NORMAL : 
                  config.healthScore >= 50 ? MetricStatus.WARNING : MetricStatus.CRITICAL,
        });
      } catch (error) {
        this.logger.error(`Health check failed for VPN config ${config.name}: ${error.message}`);
      }
    }

    // 检查所有IP地址
    const ipPools = await this.ipPoolRepository.find();
    for (const ip of ipPools) {
      try {
        // 执行基本的网络检查
        await this.performIPHealthCheck(ip);
      } catch (error) {
        this.logger.error(`Health check failed for IP ${ip.ipAddress}: ${error.message}`);
      }
    }

    this.logger.log('Health checks completed');
  }

  private async performIPHealthCheck(ip: IPPool): Promise<void> {
    try {
      // 测试IP的可达性
      const { stdout } = await execAsync(`ping -c 3 -W 2 ${ip.ipAddress}`);
      
      const lossMatch = stdout.match(/(\d+)% packet loss/);
      const latencyMatch = stdout.match(/min\/avg\/max\/mdev = [\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);

      const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : 100;
      const latency = latencyMatch ? parseFloat(latencyMatch[2]) : 999;

      // 更新IP健康分数
      let healthScore = 100;
      if (packetLoss > 50) healthScore -= 50;
      else if (packetLoss > 20) healthScore -= 30;
      else if (packetLoss > 5) healthScore -= 10;

      if (latency > 500) healthScore -= 30;
      else if (latency > 200) healthScore -= 15;
      else if (latency > 100) healthScore -= 5;

      healthScore = Math.max(0, healthScore);

      ip.healthScore = healthScore;
      ip.packetLoss = packetLoss;
      ip.averageLatency = latency;
      ip.lastHealthCheck = new Date();
      
      await this.ipPoolRepository.save(ip);

      // 记录检查结果
      await this.logMetric({
        ipPoolId: ip.id,
        metricType: MetricType.HEALTH_SCORE,
        metricValue: healthScore,
        unit: 'score',
        status: healthScore >= 70 ? MetricStatus.NORMAL : 
                healthScore >= 50 ? MetricStatus.WARNING : MetricStatus.CRITICAL,
        details: { latency, packetLoss },
      });

    } catch (error) {
      // Ping失败，IP不可达
      ip.healthScore = 0;
      ip.lastHealthCheck = new Date();
      await this.ipPoolRepository.save(ip);

      await this.logMetric({
        ipPoolId: ip.id,
        metricType: MetricType.ERROR,
        metricValue: 0,
        status: MetricStatus.CRITICAL,
        details: { error: 'IP unreachable' },
      });
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    try {
      const result = await this.networkMonitorLogRepository
        .createQueryBuilder()
        .delete()
        .where('created_at < :thirtyDaysAgo', { thirtyDaysAgo })
        .execute();

      this.logger.log(`Cleaned up ${result.affected} old log entries`);
    } catch (error) {
      this.logger.error(`Failed to cleanup old logs: ${error.message}`);
    }
  }

  private async generateDailyReport(): Promise<void> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();

    // 收集统计数据
    const vpnConfigs = await this.vpnConfigRepository.find();
    const ipPools = await this.ipPoolRepository.find();
    
    const newConnections = await this.accountIPMappingRepository
      .createQueryBuilder()
      .where('created_at BETWEEN :yesterday AND :today', { yesterday, today })
      .getCount();

    const alerts = await this.getAlertHistory();

    // 生成报告
    const report = {
      date: yesterday.toISOString().split('T')[0],
      summary: {
        vpnConfigs: vpnConfigs.length,
        activeVPNConfigs: vpnConfigs.filter(c => c.status === VPNStatus.ACTIVE).length,
        ipPools: ipPools.length,
        availableIPs: ipPools.filter(ip => ip.status === IPStatus.AVAILABLE).length,
        newConnections,
        activeAlerts: alerts.filter(a => !a.resolved).length,
        resolvedAlerts: alerts.filter(a => a.resolved).length,
      },
      performance: await this.getAveragePerformanceMetrics(),
      recommendations: this.generateDailyRecommendations(vpnConfigs, ipPools),
    };

    // 记录报告
    await this.logMetric({
      metricType: MetricType.HEALTH_SCORE,
      metricValue: 100, // 报告生成成功
      unit: 'report',
      status: MetricStatus.NORMAL,
      details: report,
    });

    this.logger.log(`Daily report generated for ${report.date}`);
  }

  private generateDailyRecommendations(vpnConfigs: VPNConfig[], ipPools: IPPool[]): string[] {
    const recommendations: string[] = [];

    // 检查低健康分数的配置
    const lowHealthVPNs = vpnConfigs.filter(c => c.healthScore < 50);
    if (lowHealthVPNs.length > 0) {
      recommendations.push(`有 ${lowHealthVPNs.length} 个VPN配置健康分数低于50，建议检查`);
    }

    // 检查长时间未使用的配置
    const unusedVPNs = vpnConfigs.filter(c => {
      if (!c.lastUsedAt) return true;
      const daysSinceUse = (Date.now() - c.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUse > 30;
    });
    
    if (unusedVPNs.length > 0) {
      recommendations.push(`有 ${unusedVPNs.length} 个VPN配置超过30天未使用，建议清理`);
    }

    // 检查IP地址池健康状态
    const unhealthyIPs = ipPools.filter(ip => ip.healthScore < 50);
    if (unhealthyIPs.length > 0) {
      recommendations.push(`有 ${unhealthyIPs.length} 个IP地址健康分数低于50，建议检查或替换`);
    }

    // 检查IP地址类型分布
    const residentialIPs = ipPools.filter(ip => ip.type === 'residential').length;
    const totalIPs = ipPools.length;
    const residentialRatio = totalIPs > 0 ? residentialIPs / totalIPs : 0;

    if (residentialRatio < 0.3) {
      recommendations.push('住宅IP比例较低，建议增加住宅IP以提高匿名性');
    }

    return recommendations;
  }

  private async logMetric(data: {
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
}