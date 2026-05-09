import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TaskSchedulerService } from '../task-scheduler/task-scheduler.service';
import { TaskQueueService } from '../task-queue/task-queue.service';
import { AccountManagerService } from '../account-manager/account-manager.service';
import { Task, TaskStatus } from '../task-scheduler/entities/task.entity';
import { TaskExecutionLog } from '../task-scheduler/entities/task-execution-log.entity';
import { AccountStatusEntity } from '../account-manager/entities/account-status.entity';

export interface ClientSubscription {
  taskIds: string[];
  accountIds: string[];
  eventTypes: string[];
}

export interface TaskUpdateEvent {
  type: 'task_created' | 'task_updated' | 'task_completed' | 'task_failed';
  taskId: string;
  data: Partial<Task>;
  timestamp: Date;
}

export interface AccountUpdateEvent {
  type: 'account_status_changed' | 'account_health_updated';
  accountId: string;
  data: Partial<AccountStatusEntity>;
  timestamp: Date;
}

export interface LogEvent {
  type: 'log_created';
  taskId: string;
  accountId?: string;
  log: Partial<TaskExecutionLog>;
  timestamp: Date;
}

export interface QueueUpdateEvent {
  type: 'queue_status_updated';
  data: any;
  timestamp: Date;
}

@WebSocketGateway({
  namespace: '/task-monitor',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class TaskMonitorGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TaskMonitorGateway.name);
  private clientSubscriptions: Map<string, ClientSubscription> = new Map();

  constructor(
    private taskSchedulerService: TaskSchedulerService,
    private taskQueueService: TaskQueueService,
    private accountManagerService: AccountManagerService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Task monitor WebSocket gateway initialized');
    
    // 启动定期状态推送
    this.startPeriodicUpdates();
  }

  handleConnection(client: Socket) {
    const clientId = client.id;
    this.logger.log(`Client connected: ${clientId}`);
    
    // 初始化客户端订阅
    this.clientSubscriptions.set(clientId, {
      taskIds: [],
      accountIds: [],
      eventTypes: ['task_updated', 'account_status_changed', 'log_created'],
    });

    // 发送欢迎消息
    client.emit('connected', {
      message: 'Connected to task monitor',
      clientId,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    this.clientSubscriptions.delete(clientId);
    this.logger.log(`Client disconnected: ${clientId}`);
  }

  /**
   * 订阅任务更新
   */
  @SubscribeMessage('subscribe_tasks')
  handleSubscribeTasks(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskIds: string[] },
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);
    
    if (subscription) {
      subscription.taskIds = [...new Set([...subscription.taskIds, ...data.taskIds])];
      this.clientSubscriptions.set(clientId, subscription);
      
      this.logger.log(`Client ${clientId} subscribed to tasks: ${data.taskIds.join(', ')}`);
      
      client.emit('subscription_updated', {
        message: 'Task subscription updated',
        taskIds: subscription.taskIds,
      });
    }
  }

  /**
   * 订阅账号更新
   */
  @SubscribeMessage('subscribe_accounts')
  handleSubscribeAccounts(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { accountIds: string[] },
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);
    
    if (subscription) {
      subscription.accountIds = [...new Set([...subscription.accountIds, ...data.accountIds])];
      this.clientSubscriptions.set(clientId, subscription);
      
      this.logger.log(`Client ${clientId} subscribed to accounts: ${data.accountIds.join(', ')}`);
      
      client.emit('subscription_updated', {
        message: 'Account subscription updated',
        accountIds: subscription.accountIds,
      });
    }
  }

  /**
   * 订阅事件类型
   */
  @SubscribeMessage('subscribe_events')
  handleSubscribeEvents(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { eventTypes: string[] },
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);
    
    if (subscription) {
      subscription.eventTypes = [...new Set([...subscription.eventTypes, ...data.eventTypes])];
      this.clientSubscriptions.set(clientId, subscription);
      
      this.logger.log(`Client ${clientId} subscribed to events: ${data.eventTypes.join(', ')}`);
      
      client.emit('subscription_updated', {
        message: 'Event subscription updated',
        eventTypes: subscription.eventTypes,
      });
    }
  }

  /**
   * 取消订阅
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskIds?: string[]; accountIds?: string[]; eventTypes?: string[] },
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);
    
    if (subscription) {
      if (data.taskIds) {
        subscription.taskIds = subscription.taskIds.filter(id => !data.taskIds.includes(id));
      }
      
      if (data.accountIds) {
        subscription.accountIds = subscription.accountIds.filter(id => !data.accountIds.includes(id));
      }
      
      if (data.eventTypes) {
        subscription.eventTypes = subscription.eventTypes.filter(type => !data.eventTypes.includes(type));
      }
      
      this.clientSubscriptions.set(clientId, subscription);
      
      client.emit('subscription_updated', {
        message: 'Unsubscribed successfully',
        taskIds: subscription.taskIds,
        accountIds: subscription.accountIds,
        eventTypes: subscription.eventTypes,
      });
    }
  }

  /**
   * 获取当前状态
   */
  @SubscribeMessage('get_status')
  async handleGetStatus(@ConnectedSocket() client: Socket) {
    try {
      const [runningTasks, queueStats, accountStats] = await Promise.all([
        this.taskSchedulerService.getRunningTasks(),
        this.taskQueueService.getQueueStats(),
        this.accountManagerService.getAccountStatistics(),
      ]);

      client.emit('status_update', {
        type: 'full_status',
        data: {
          runningTasks,
          queueStats,
          accountStats,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      this.logger.error('Failed to get status:', error);
      client.emit('error', {
        message: 'Failed to get status',
        error: error.message,
      });
    }
  }

  /**
   * 广播任务更新
   */
  broadcastTaskUpdate(event: TaskUpdateEvent): void {
    this.server.emit('task_update', event);
    
    // 针对订阅了特定任务的客户端发送
    for (const [clientId, subscription] of this.clientSubscriptions) {
      if (subscription.taskIds.includes(event.taskId) && subscription.eventTypes.includes(event.type)) {
        const client = this.server.sockets.sockets.get(clientId);
        if (client) {
          client.emit('task_update', event);
        }
      }
    }
  }

  /**
   * 广播账号更新
   */
  broadcastAccountUpdate(event: AccountUpdateEvent): void {
    this.server.emit('account_update', event);
    
    // 针对订阅了特定账号的客户端发送
    for (const [clientId, subscription] of this.clientSubscriptions) {
      if (subscription.accountIds.includes(event.accountId) && subscription.eventTypes.includes(event.type)) {
        const client = this.server.sockets.sockets.get(clientId);
        if (client) {
          client.emit('account_update', event);
        }
      }
    }
  }

  /**
   * 广播日志更新
   */
  broadcastLogUpdate(event: LogEvent): void {
    this.server.emit('log_update', event);
    
    // 针对订阅了特定任务的客户端发送
    for (const [clientId, subscription] of this.clientSubscriptions) {
      if (subscription.taskIds.includes(event.taskId) && subscription.eventTypes.includes('log_created')) {
        const client = this.server.sockets.sockets.get(clientId);
        if (client) {
          client.emit('log_update', event);
        }
      }
    }
  }

  /**
   * 广播队列更新
   */
  broadcastQueueUpdate(event: QueueUpdateEvent): void {
    this.server.emit('queue_update', event);
    
    // 针对订阅了队列事件的客户端发送
    for (const [clientId, subscription] of this.clientSubscriptions) {
      if (subscription.eventTypes.includes('queue_status_updated')) {
        const client = this.server.sockets.sockets.get(clientId);
        if (client) {
          client.emit('queue_update', event);
        }
      }
    }
  }

  /**
   * 启动定期状态更新
   */
  private startPeriodicUpdates(): void {
    // 每10秒推送一次队列状态
    setInterval(async () => {
      try {
        const queueStats = await this.taskQueueService.getQueueStats();
        
        this.broadcastQueueUpdate({
          type: 'queue_status_updated',
          data: queueStats,
          timestamp: new Date(),
        });
      } catch (error) {
        this.logger.error('Failed to update queue stats:', error);
      }
    }, 10000);

    // 每30秒推送一次账号状态
    setInterval(async () => {
      try {
        const accountStatuses = await this.accountManagerService.getAllAccountStatus();
        
        for (const status of accountStatuses) {
          this.broadcastAccountUpdate({
            type: 'account_status_changed',
            accountId: status.accountId,
            data: {
              status: status.status,
              healthScore: status.healthScore,
              currentTaskId: status.currentTaskId,
            },
            timestamp: new Date(),
          });
        }
      } catch (error) {
        this.logger.error('Failed to update account stats:', error);
      }
    }, 30000);

    // 每60秒推送一次系统统计
    setInterval(async () => {
      try {
        const [queueStats, accountStats] = await Promise.all([
          this.taskQueueService.getQueueStats(),
          this.accountManagerService.getAccountStatistics(),
        ]);

        this.server.emit('system_stats', {
          queue: queueStats,
          accounts: accountStats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error('Failed to update system stats:', error);
      }
    }, 60000);
  }

  /**
   * 发送任务创建事件
   */
  sendTaskCreated(task: Task): void {
    this.broadcastTaskUpdate({
      type: 'task_created',
      taskId: task.id,
      data: {
        id: task.id,
        name: task.name,
        type: task.type,
        status: task.status,
        priority: task.priority,
        scheduledAt: task.scheduledAt,
      },
      timestamp: new Date(),
    });
  }

  /**
   * 发送任务更新事件
   */
  sendTaskUpdated(task: Task): void {
    this.broadcastTaskUpdate({
      type: 'task_updated',
      taskId: task.id,
      data: {
        id: task.id,
        name: task.name,
        status: task.status,
        accountId: task.accountId,
        startedAt: task.startedAt,
        progress: task.result?.progress,
      },
      timestamp: new Date(),
    });
  }

  /**
   * 发送任务完成事件
   */
  sendTaskCompleted(task: Task): void {
    this.broadcastTaskUpdate({
      type: 'task_completed',
      taskId: task.id,
      data: {
        id: task.id,
        name: task.name,
        status: task.status,
        result: task.result,
        completedAt: task.completedAt,
      },
      timestamp: new Date(),
    });
  }

  /**
   * 发送任务失败事件
   */
  sendTaskFailed(task: Task): void {
    this.broadcastTaskUpdate({
      type: 'task_failed',
      taskId: task.id,
      data: {
        id: task.id,
        name: task.name,
        status: task.status,
        result: task.result,
        completedAt: task.completedAt,
      },
      timestamp: new Date(),
    });
  }

  /**
   * 发送日志事件
   */
  sendLogCreated(log: TaskExecutionLog): void {
    this.broadcastLogUpdate({
      type: 'log_created',
      taskId: log.taskId,
      accountId: log.accountId,
      log: {
        id: log.id,
        status: log.status,
        message: log.message,
        progress: log.progress,
        createdAt: log.createdAt,
      },
      timestamp: new Date(),
    });
  }

  /**
   * 获取连接客户端数量
   */
  getConnectedClientCount(): number {
    return this.server.sockets.sockets.size;
  }

  /**
   * 获取订阅统计
   */
  getSubscriptionStats(): {
    totalClients: number;
    clientsWithTaskSubscriptions: number;
    clientsWithAccountSubscriptions: number;
    averageSubscriptionsPerClient: number;
  } {
    const totalClients = this.clientSubscriptions.size;
    let clientsWithTaskSubscriptions = 0;
    let clientsWithAccountSubscriptions = 0;
    let totalSubscriptions = 0;

    for (const subscription of this.clientSubscriptions.values()) {
      if (subscription.taskIds.length > 0) {
        clientsWithTaskSubscriptions++;
      }
      if (subscription.accountIds.length > 0) {
        clientsWithAccountSubscriptions++;
      }
      totalSubscriptions += subscription.taskIds.length + subscription.accountIds.length;
    }

    const averageSubscriptionsPerClient = totalClients > 0 ? totalSubscriptions / totalClients : 0;

    return {
      totalClients,
      clientsWithTaskSubscriptions,
      clientsWithAccountSubscriptions,
      averageSubscriptionsPerClient,
    };
  }
}