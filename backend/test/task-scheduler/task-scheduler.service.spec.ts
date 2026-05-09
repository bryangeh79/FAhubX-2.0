import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskSchedulerService } from '../../src/modules/task-scheduler/task-scheduler.service';
import { Task, TaskType, TaskStatus, TaskPriority } from '../../src/modules/task-scheduler/entities/task.entity';
import { TaskExecutionLog } from '../../src/modules/task-scheduler/entities/task-execution-log.entity';
import { AccountManagerService } from '../../src/modules/account-manager/account-manager.service';
import { TaskQueueService } from '../../src/modules/task-queue/task-queue.service';

describe('TaskSchedulerService', () => {
  let service: TaskSchedulerService;
  let taskRepository: Repository<Task>;
  let logRepository: Repository<TaskExecutionLog>;
  let accountManagerService: AccountManagerService;
  let taskQueueService: TaskQueueService;

  const mockTaskRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    })),
  };

  const mockLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAccountManagerService = {
    acquireAccount: jest.fn(),
    releaseAccount: jest.fn(),
  };

  const mockTaskQueueService = {
    addTaskToQueue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskSchedulerService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
        {
          provide: getRepositoryToken(TaskExecutionLog),
          useValue: mockLogRepository,
        },
        {
          provide: AccountManagerService,
          useValue: mockAccountManagerService,
        },
        {
          provide: TaskQueueService,
          useValue: mockTaskQueueService,
        },
      ],
    }).compile();

    service = module.get<TaskSchedulerService>(TaskSchedulerService);
    taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
    logRepository = module.get<Repository<TaskExecutionLog>>(getRepositoryToken(TaskExecutionLog));
    accountManagerService = module.get<AccountManagerService>(AccountManagerService);
    taskQueueService = module.get<TaskQueueService>(TaskQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduleTask', () => {
    it('应该成功创建立即执行任务', async () => {
      const taskData = {
        name: '测试任务',
        type: TaskType.IMMEDIATE,
        executionData: {
          scriptId: 'test-script',
          scriptType: 'browser',
          targets: ['target1'],
          parameters: {},
        },
      };

      const mockTask = {
        id: 'task-123',
        ...taskData,
        status: TaskStatus.QUEUED,
        scheduledAt: new Date(),
      };

      mockTaskRepository.create.mockReturnValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(mockTask);
      mockTaskQueueService.addTaskToQueue.mockResolvedValue({});

      const result = await service.scheduleTask(taskData as any);

      expect(result).toEqual(mockTask);
      expect(mockTaskRepository.create).toHaveBeenCalledWith(taskData);
      expect(mockTaskRepository.save).toHaveBeenCalled();
      expect(mockTaskQueueService.addTaskToQueue).toHaveBeenCalledWith(mockTask);
    });

    it('应该成功创建定时任务', async () => {
      const scheduledAt = new Date(Date.now() + 3600000); // 1小时后
      const taskData = {
        name: '定时任务',
        type: TaskType.SCHEDULED,
        scheduleConfig: { scheduledAt },
        executionData: {
          scriptId: 'test-script',
          scriptType: 'browser',
          targets: ['target1'],
          parameters: {},
        },
      };

      const mockTask = {
        id: 'task-456',
        ...taskData,
        status: TaskStatus.PENDING,
        scheduledAt,
      };

      mockTaskRepository.create.mockReturnValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(mockTask);

      const result = await service.scheduleTask(taskData as any);

      expect(result).toEqual(mockTask);
      expect(result.status).toBe(TaskStatus.PENDING);
      expect(mockTaskQueueService.addTaskToQueue).not.toHaveBeenCalled();
    });
  });

  describe('executeImmediately', () => {
    it('应该成功立即执行任务', async () => {
      const taskId = 'task-123';
      const mockTask = {
        id: taskId,
        name: '测试任务',
        status: TaskStatus.PENDING,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({ ...mockTask, status: TaskStatus.QUEUED });
      mockTaskQueueService.addTaskToQueue.mockResolvedValue({});

      const result = await service.executeImmediately(taskId);

      expect(result).toBe(true);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.QUEUED })
      );
      expect(mockTaskQueueService.addTaskToQueue).toHaveBeenCalled();
    });

    it('任务不存在时应该抛出错误', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.executeImmediately('non-existent-task')).rejects.toThrow(
        'Task non-existent-task not found'
      );
    });

    it('任务已在运行时应该抛出错误', async () => {
      const taskId = 'task-123';
      const mockTask = {
        id: taskId,
        status: TaskStatus.RUNNING,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.executeImmediately(taskId)).rejects.toThrow(
        'Task task-123 is already running'
      );
    });
  });

  describe('cancelTask', () => {
    it('应该成功取消任务', async () => {
      const taskId = 'task-123';
      const mockTask = {
        id: taskId,
        name: '测试任务',
        status: TaskStatus.QUEUED,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.CANCELLED,
        completedAt: expect.any(Date),
      });

      const result = await service.cancelTask(taskId);

      expect(result).toBe(true);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.CANCELLED })
      );
    });

    it('已完成的任务不能取消', async () => {
      const taskId = 'task-123';
      const mockTask = {
        id: taskId,
        status: TaskStatus.COMPLETED,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.cancelTask(taskId)).rejects.toThrow(
        'Task task-123 is already finished'
      );
    });
  });

  describe('getPendingTasks', () => {
    it('应该返回待处理任务列表', async () => {
      const mockTasks = [
        { id: 'task-1', status: TaskStatus.PENDING },
        { id: 'task-2', status: TaskStatus.PENDING },
      ];

      mockTaskRepository.find.mockResolvedValue(mockTasks);

      const result = await service.getPendingTasks();

      expect(result).toEqual(mockTasks);
      expect(mockTaskRepository.find).toHaveBeenCalledWith({
        where: { status: TaskStatus.PENDING },
        order: { scheduledAt: 'ASC' },
      });
    });
  });

  describe('getRunningTasks', () => {
    it('应该返回运行中任务列表', async () => {
      const mockTasks = [
        { id: 'task-1', status: TaskStatus.RUNNING },
        { id: 'task-2', status: TaskStatus.RUNNING },
      ];

      mockTaskRepository.find.mockResolvedValue(mockTasks);

      const result = await service.getRunningTasks();

      expect(result).toEqual(mockTasks);
      expect(mockTaskRepository.find).toHaveBeenCalledWith({
        where: { status: TaskStatus.RUNNING },
        relations: ['account'],
      });
    });
  });

  describe('cleanupCompletedTasks', () => {
    it('应该清理已完成的任务', async () => {
      const mockDeleteResult = { affected: 5 };
      
      mockTaskRepository.createQueryBuilder.mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockDeleteResult),
      });

      const result = await service.cleanupCompletedTasks(30);

      expect(result).toBe(5);
    });
  });
});