          const geoData = JSON.parse(geoOutput);
          metrics.geolocation = {
            country: geoData.country_name,
            city: geoData.city,
            isp: geoData.org,
          };
        } catch (geoError) {
          this.logger.warn(`Failed to get geolocation: ${geoError.message}`);
        }
      }

    } catch (error) {
      this.logger.warn(`Failed to collect some metrics: ${error.message}`);
    }

    return metrics;
  }

  async batchValidateConfigs(): Promise<{
    total: number;
    valid: number;
    invalid: number;
    results: Array<{
      configId: string;
      name: string;
      valid: boolean;
      errors: string[];
      warnings: string[];
    }>;
  }> {
    const configs = await this.vpnConfigRepository.find();
    const results = [];

    for (const config of configs) {
      try {
        const validation = await this.validateVPNConfig(config.id);
        
        results.push({
          configId: config.id,
          name: config.name,
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        });

        // 避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`Failed to validate config ${config.name}: ${error.message}`);
        
        results.push({
          configId: config.id,
          name: config.name,
          valid: false,
          errors: [`Validation failed: ${error.message}`],
          warnings: [],
        });
      }
    }

    return {
      total: configs.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      results,
    };
  }

  async getConfigHealthReport(): Promise<any> {
    const configs = await this.vpnConfigRepository.find({
      order: { healthScore: 'DESC' },
    });

    const report = {
      generatedAt: new Date(),
      summary: {
        totalConfigs: configs.length,
        activeConfigs: configs.filter(c => c.status === 'active').length,
        averageHealthScore: configs.reduce((sum, c) => sum + c.healthScore, 0) / configs.length,
        healthDistribution: {
          excellent: configs.filter(c => c.healthScore >= 90).length,
          good: configs.filter(c => c.healthScore >= 70 && c.healthScore < 90).length,
          fair: configs.filter(c => c.healthScore >= 50 && c.healthScore < 70).length,
          poor: configs.filter(c => c.healthScore < 50).length,
        },
      },
      configs: configs.map(config => ({
        id: config.id,
        name: config.name,
        type: config.type,
        status: config.status,
        healthScore: config.healthScore,
        successRate: config.successRate,
        averageLatency: config.averageLatency,
        totalConnections: config.totalConnections,
        lastUsed: config.lastUsedAt,
        recommendations: this.generateConfigRecommendations(config),
      })),
      recommendations: this.generateOverallRecommendations(configs),
    };

    return report;
  }

  private generateConfigRecommendations(config: VPNConfig): string[] {
    const recommendations: string[] = [];

    if (config.healthScore < 50) {
      recommendations.push('健康分数过低，建议检查配置或更换服务提供商');
    }

    if (config.successRate < 80) {
      recommendations.push('连接成功率较低，建议优化网络设置');
    }

    if (config.averageLatency > 300) {
      recommendations.push('平均延迟较高，建议选择更近的服务器');
    }

    if (!config.lastUsedAt || Date.now() - config.lastUsedAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
      recommendations.push('超过30天未使用，建议测试连接或考虑停用');
    }

    if (config.status === 'active' && config.healthScore < 70) {
      recommendations.push('活跃配置但健康分数较低，建议立即检查');
    }

    return recommendations;
  }

  private generateOverallRecommendations(configs: VPNConfig[]): string[] {
    const recommendations: string[] = [];

    const activeConfigs = configs.filter(c => c.status === 'active');
    if (activeConfigs.length === 0) {
      recommendations.push('没有活跃的VPN配置，建议至少启用一个配置');
    }

    const lowHealthConfigs = configs.filter(c => c.healthScore < 50);
    if (lowHealthConfigs.length > 0) {
      recommendations.push(`有${lowHealthConfigs.length}个配置健康分数低于50，建议检查或替换`);
    }

    const highLatencyConfigs = configs.filter(c => c.averageLatency > 500);
    if (highLatencyConfigs.length > 0) {
      recommendations.push(`有${highLatencyConfigs.length}个配置平均延迟超过500ms，建议优化`);
    }

    // 检查配置类型分布
    const typeCounts = configs.reduce((acc, config) => {
      acc[config.type] = (acc[config.type] || 0) + 1;
      return acc;
    }, {});

    if (!typeCounts['openvpn'] && !typeCounts['wireguard']) {
      recommendations.push('缺少主流VPN协议配置，建议添加OpenVPN或WireGuard配置');
    }

    // 检查地理位置分布
    const countries = new Set(configs.map(c => c.countryCode).filter(Boolean));
    if (countries.size < 3) {
      recommendations.push('可用地理位置较少，建议添加更多地区的VPN配置');
    }

    return recommendations;
  }
}