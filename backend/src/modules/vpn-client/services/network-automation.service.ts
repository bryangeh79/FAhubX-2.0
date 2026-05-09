      distinct: ['accountId'],
    });

    const results = [];
    let optimizedCount = 0;

    for (const connection of activeConnections) {
      try {
        const result = await this.optimizeNetworkConnection(connection.accountId);
        results.push({
          accountId: connection.accountId,
          ...result,
        });

        if (result.optimized) {
          optimizedCount++;
        }

        // 避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`Failed to optimize connection for account ${connection.accountId}: ${error.message}`);
        results.push({
          accountId: connection.accountId,
          optimized: false,
          changes: [`优化失败: ${error.message}`],
        });
      }
    }

    return {
      total: activeConnections.length,
      optimized: optimizedCount,
      results,
    };
  }

  // 智能故障切换
  async handleVPNFailure(failedConfigId: string): Promise<{
    switched: boolean;
    newConfigId?: string;
    reason: string;
  }> {
    try {
      // 查找最佳备用配置
      const alternativeConfigs = await this.vpnConfigRepository.find({
        where: { 
          id: { $ne: failedConfigId },
          status: VPNStatus.INACTIVE,
          healthScore: { $gte: 70 },
        },
        order: { healthScore: 'DESC' },
        take: 3,
      });

      if (alternativeConfigs.length === 0) {
        return {
          switched: false,
          reason: '没有可用的备用VPN配置',
        };
      }

      // 尝试连接每个备用配置，直到成功
      for (const config of alternativeConfigs) {
        try {
          await this.vpnClientService.connectVPN(config.id);
          
          // 迁移使用失败配置的账号到新配置
          await this.migrateAccountsToNewConfig(failedConfigId, config.id);

          this.logger.log(`Successfully switched from failed config to ${config.name}`);
          
          return {
            switched: true,
            newConfigId: config.id,
            reason: `自动切换到备用配置: ${config.name}`,
          };
        } catch (error) {
          this.logger.warn(`Failed to switch to alternative config ${config.name}: ${error.message}`);
          continue;
        }
      }

      return {
        switched: false,
        reason: '所有备用配置连接失败',
      };

    } catch (error) {
      this.logger.error(`Failed to handle VPN failure: ${error.message}`);
      return {
        switched: false,
        reason: `故障切换失败: ${error.message}`,
      };
    }
  }

  private async migrateAccountsToNewConfig(
    oldConfigId: string,
    newConfigId: string,
  ): Promise<void> {
    // 查找使用旧配置的活跃连接
    const oldConnections = await this.accountIPMappingRepository.find({
      where: { 
        vpnConfigId: oldConfigId,
        status: ConnectionStatus.ACTIVE,
      },
    });

    for (const connection of oldConnections) {
      try {
        // 释放旧IP
        await this.vpnClientService.releaseIP(connection.accountId, connection.id);
        
        // 使用新配置重新分配IP
        const criteria: IPAllocationCriteria = {
          accountId: connection.accountId,
          vpnConfigId: newConfigId,
          connectionType: connection.connectionType,
        };

        await this.vpnClientService.allocateIP(criteria);
        
        this.logger.log(`Migrated account ${connection.accountId} to new VPN config`);
      } catch (error) {
        this.logger.error(`Failed to migrate account ${connection.accountId}: ${error.message}`);
      }
    }
  }

  // 负载均衡
  async balanceVPNLoad(): Promise<{
    balanced: boolean;
    movements: Array<{
      fromConfig: string;
      toConfig: string;
      accountCount: number;
    }>;
  }> {
    const movements = [];
    
    try {
      // 获取所有活跃VPN配置
      const activeConfigs = await this.vpnConfigRepository.find({
        where: { status: VPNStatus.ACTIVE },
      });

      if (activeConfigs.length < 2) {
        return {
          balanced: false,
          movements: [],
        };
      }

      // 计算每个配置的连接数
      const configStats = await Promise.all(
        activeConfigs.map(async (config) => {
          const connectionCount = await this.accountIPMappingRepository.count({
            where: { 
              vpnConfigId: config.id,
              status: ConnectionStatus.ACTIVE,
            },
          });

          return {
            configId: config.id,
            configName: config.name,
            connectionCount,
            healthScore: config.healthScore,
          };
        })
      );

      // 计算平均连接数
      const totalConnections = configStats.reduce((sum, stat) => sum + stat.connectionCount, 0);
      const averageConnections = totalConnections / configStats.length;

      // 识别过载和空闲配置
      const overloadedConfigs = configStats.filter(stat => stat.connectionCount > averageConnections * 1.5);
      const underloadedConfigs = configStats.filter(stat => stat.connectionCount < averageConnections * 0.5);

      if (overloadedConfigs.length === 0 || underloadedConfigs.length === 0) {
        return {
          balanced: true,
          movements: [],
        };
      }

      // 执行负载均衡
      for (const overloaded of overloadedConfigs) {
        for (const underloaded of underloadedConfigs) {
          if (underloaded.healthScore < 60) {
            continue; // 跳过健康度低的配置
          }

          // 计算需要迁移的连接数
          const targetMove = Math.min(
            Math.floor((overloaded.connectionCount - averageConnections) / 2),
            Math.floor((averageConnections - underloaded.connectionCount) / 2)
          );

          if (targetMove <= 0) {
            continue;
          }

          // 迁移连接
          const movedCount = await this.moveConnections(
            overloaded.configId,
            underloaded.configId,
            targetMove
          );

          if (movedCount > 0) {
            movements.push({
              fromConfig: overloaded.configName,
              toConfig: underloaded.configName,
              accountCount: movedCount,
            });
          }
        }
      }

      return {
        balanced: movements.length > 0,
        movements,
      };

    } catch (error) {
      this.logger.error(`Failed to balance VPN load: ${error.message}`);
      return {
        balanced: false,
        movements: [],
      };
    }
  }

  private async moveConnections(
    fromConfigId: string,
    toConfigId: string,
    maxCount: number,
  ): Promise<number> {
    let movedCount = 0;

    // 获取源配置的连接
    const connections = await this.accountIPMappingRepository.find({
      where: { 
        vpnConfigId: fromConfigId,
        status: ConnectionStatus.ACTIVE,
      },
      take: maxCount,
    });

    for (const connection of connections) {
      try {
        // 释放当前IP
        await this.vpnClientService.releaseIP(connection.accountId, connection.id);
        
        // 使用目标配置重新分配IP
        const criteria: IPAllocationCriteria = {
          accountId: connection.accountId,
          vpnConfigId: toConfigId,
          connectionType: connection.connectionType,
        };

        await this.vpnClientService.allocateIP(criteria);
        movedCount++;

        this.logger.log(`Moved account ${connection.accountId} from config ${fromConfigId} to ${toConfigId}`);
      } catch (error) {
        this.logger.error(`Failed to move account ${connection.accountId}: ${error.message}`);
      }
    }

    return movedCount;
  }

  // 获取自动化规则
  getAutomationRules(): AutomationRule[] {
    return [...this.automationRules].sort((a, b) => b.priority - a.priority);
  }

  // 添加自定义规则
  addAutomationRule(rule: Omit<AutomationRule, 'id'>): string {
    const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newRule: AutomationRule = {
      id: ruleId,
      ...rule,
    };

    this.automationRules.push(newRule);
    return ruleId;
  }

  // 更新规则
  updateAutomationRule(ruleId: string, updates: Partial<AutomationRule>): boolean {
    const index = this.automationRules.findIndex(rule => rule.id === ruleId);
    if (index === -1) {
      return false;
    }

    this.automationRules[index] = {
      ...this.automationRules[index],
      ...updates,
    };

    return true;
  }

  // 删除规则
  deleteAutomationRule(ruleId: string): boolean {
    const initialLength = this.automationRules.length;
    this.automationRules = this.automationRules.filter(rule => rule.id !== ruleId);
    return this.automationRules.length < initialLength;
  }

  // 手动触发规则
  async triggerRule(ruleId: string): Promise<{
    triggered: boolean;
    message: string;
    actionsExecuted: number;
  }> {
    const rule = this.automationRules.find(r => r.id === ruleId);
    if (!rule) {
      return {
        triggered: false,
        message: `Rule not found: ${ruleId}`,
        actionsExecuted: 0,
      };
    }

    if (!rule.enabled) {
      return {
        triggered: false,
        message: `Rule is disabled: ${rule.name}`,
        actionsExecuted: 0,
      };
    }

    try {
      let actionsExecuted = 0;
      
      // 直接执行动作，跳过条件检查
      for (const action of rule.actions) {
        try {
          await this.executeAction(action, rule);
          actionsExecuted++;
        } catch (error) {
          this.logger.error(`Failed to execute action in manual trigger: ${error.message}`);
        }
      }

      return {
        triggered: true,
        message: `Rule "${rule.name}" manually triggered`,
        actionsExecuted,
      };
    } catch (error) {
      return {
        triggered: false,
        message: `Failed to trigger rule: ${error.message}`,
        actionsExecuted: 0,
      };
    }
  }
}