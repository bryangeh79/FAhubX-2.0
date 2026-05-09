import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateTaskSchedulerTables20240413000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建任务表
    await queryRunner.createTable(
      new Table({
        name: 'tasks',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'schedule_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'integer',
            default: 3,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'pending'",
          },
          {
            name: 'account_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'execution_data',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'retry_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'max_retries',
            type: 'integer',
            default: 3,
          },
          {
            name: 'timeout_minutes',
            type: 'integer',
            default: 30,
          },
          {
            name: 'scheduled_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建任务执行日志表
    await queryRunner.createTable(
      new Table({
        name: 'task_execution_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'task_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'account_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'details',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'progress',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建账号状态表
    await queryRunner.createTable(
      new Table({
        name: 'account_status',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'account_id',
            type: 'uuid',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'idle'",
          },
          {
            name: 'current_task_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'last_heartbeat',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'health_score',
            type: 'integer',
            default: 100,
          },
          {
            name: 'health_details',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'total_tasks_completed',
            type: 'integer',
            default: 0,
          },
          {
            name: 'total_tasks_failed',
            type: 'integer',
            default: 0,
          },
          {
            name: 'average_execution_time',
            type: 'float',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建外键约束
    await queryRunner.createForeignKey(
      'tasks',
      new TableForeignKey({
        columnNames: ['account_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'facebook_accounts',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'task_execution_logs',
      new TableForeignKey({
        columnNames: ['task_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tasks',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'task_execution_logs',
      new TableForeignKey({
        columnNames: ['account_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'facebook_accounts',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'account_status',
      new TableForeignKey({
        columnNames: ['account_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'facebook_accounts',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'account_status',
      new TableForeignKey({
        columnNames: ['current_task_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tasks',
        onDelete: 'SET NULL',
      }),
    );

    // 创建索引
    await queryRunner.createIndex('tasks', {
      name: 'idx_tasks_status',
      columnNames: ['status'],
    });

    await queryRunner.createIndex('tasks', {
      name: 'idx_tasks_scheduled_at',
      columnNames: ['scheduled_at'],
    });

    await queryRunner.createIndex('tasks', {
      name: 'idx_tasks_account_id',
      columnNames: ['account_id'],
    });

    await queryRunner.createIndex('task_execution_logs', {
      name: 'idx_task_logs_task_id',
      columnNames: ['task_id'],
    });

    await queryRunner.createIndex('task_execution_logs', {
      name: 'idx_task_logs_created_at',
      columnNames: ['created_at'],
    });

    await queryRunner.createIndex('account_status', {
      name: 'idx_account_status_status',
      columnNames: ['status'],
    });

    await queryRunner.createIndex('account_status', {
      name: 'idx_account_status_health_score',
      columnNames: ['health_score'],
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键约束
    const taskTable = await queryRunner.getTable('tasks');
    const taskLogsTable = await queryRunner.getTable('task_execution_logs');
    const accountStatusTable = await queryRunner.getTable('account_status');

    if (taskTable) {
      const foreignKeys = taskTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('tasks', foreignKey);
      }
    }

    if (taskLogsTable) {
      const foreignKeys = taskLogsTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('task_execution_logs', foreignKey);
      }
    }

    if (accountStatusTable) {
      const foreignKeys = accountStatusTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('account_status', foreignKey);
      }
    }

    // 删除表
    await queryRunner.dropTable('account_status');
    await queryRunner.dropTable('task_execution_logs');
    await queryRunner.dropTable('tasks');
  }
}