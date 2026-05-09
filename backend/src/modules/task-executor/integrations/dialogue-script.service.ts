import { Injectable, Logger } from '@nestjs/common';

// 对话剧本接口
export interface DialogueScript {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: DialogueStep[];
  variables: Record<string, any>;
  conditions: DialogueCondition[];
}

export interface DialogueStep {
  id: string;
  type: 'message' | 'question' | 'action' | 'delay' | 'condition';
  content: string;
  target: string;
  delay?: number; // 毫秒
  conditions?: string[];
  actions?: string[];
  nextStep?: string;
}

export interface DialogueCondition {
  id: string;
  type: 'response_contains' | 'response_matches' | 'time_elapsed' | 'external_event';
  condition: string;
  value: any;
  trueStep: string;
  falseStep: string;
}

export interface DialogueExecutionResult {
  scriptId: string;
  accountId: string;
  startTime: Date;
  endTime: Date;
  stepsExecuted: number;
  success: boolean;
  results: StepResult[];
  errors: string[];
}

export interface StepResult {
  stepId: string;
  type: string;
  target: string;
  success: boolean;
  message?: string;
  data?: any;
  timestamp: Date;
}

@Injectable()
export class DialogueScriptService {
  private readonly logger = new Logger(DialogueScriptService.name);
  private scripts: Map<string, DialogueScript> = new Map();
  private executions: Map<string, DialogueExecutionResult> = new Map();

  constructor() {
    this.initializeSampleScripts();
  }

  /**
   * 初始化示例剧本
   */
  private initializeSampleScripts(): void {
    // 示例：好友验证对话剧本
    const friendVerificationScript: DialogueScript = {
      id: 'friend-verification-v1',
      name: '好友验证对话剧本',
      description: '用于通过好友验证的自动对话剧本',
      version: '1.0.0',
      variables: {
        greeting: '你好！',
        verificationQuestion: '请问我们是怎么认识的？',
        fallbackResponse: '不好意思，可能我记错了。',
        maxAttempts: 3,
      },
      steps: [
        {
          id: 'step-1',
          type: 'message',
          content: '{{greeting}}',
          target: 'recipient',
          delay: 2000,
          nextStep: 'step-2',
        },
        {
          id: 'step-2',
          type: 'question',
          content: '{{verificationQuestion}}',
          target: 'recipient',
          delay: 3000,
          nextStep: 'step-3',
        },
        {
          id: 'step-3',
          type: 'condition',
          content: '等待回复',
          target: 'system',
          conditions: ['response_contains:朋友', 'response_contains:认识'],
          nextStep: 'step-4',
        },
        {
          id: 'step-4',
          type: 'message',
          content: '太好了！很高兴认识你。',
          target: 'recipient',
          delay: 2000,
          nextStep: 'step-end',
        },
        {
          id: 'step-5',
          type: 'message',
          content: '{{fallbackResponse}}',
          target: 'recipient',
          delay: 2000,
          nextStep: 'step-end',
        },
        {
          id: 'step-end',
          type: 'action',
          content: '对话结束',
          target: 'system',
          actions: ['log_result', 'update_friend_status'],
        },
      ],
      conditions: [
        {
          id: 'response_contains:朋友',
          type: 'response_contains',
          condition: 'response_contains',
          value: '朋友',
          trueStep: 'step-4',
          falseStep: 'step-5',
        },
        {
          id: 'response_contains:认识',
          type: 'response_contains',
          condition: 'response_contains',
          value: '认识',
          trueStep: 'step-4',
          falseStep: 'step-5',
        },
      ],
    };

    // 示例：群组欢迎剧本
    const groupWelcomeScript: DialogueScript = {
      id: 'group-welcome-v1',
      name: '群组欢迎剧本',
      description: '新成员加入群组时的自动欢迎剧本',
      version: '1.0.0',
      variables: {
        welcomeMessage: '欢迎新朋友加入群组！',
        introductionRequest: '请简单介绍一下自己吧~',
        rulesReminder: '请遵守群规，友好交流。',
      },
      steps: [
        {
          id: 'welcome-step',
          type: 'message',
          content: '{{welcomeMessage}}',
          target: 'group',
          delay: 1000,
          nextStep: 'intro-step',
        },
        {
          id: 'intro-step',
          type: 'message',
          content: '{{introductionRequest}}',
          target: 'new_member',
          delay: 2000,
          nextStep: 'rules-step',
        },
        {
          id: 'rules-step',
          type: 'message',
          content: '{{rulesReminder}}',
          target: 'group',
          delay: 1000,
          nextStep: 'end-step',
        },
        {
          id: 'end-step',
          type: 'action',
          content: '欢迎流程完成',
          target: 'system',
          actions: ['log_welcome', 'update_member_status'],
        },
      ],
      conditions: [],
    };

    this.scripts.set(friendVerificationScript.id, friendVerificationScript);
    this.scripts.set(groupWelcomeScript.id, groupWelcomeScript);

    this.logger.log(`Initialized ${this.scripts.size} dialogue scripts`);
  }

  /**
   * 加载对话剧本
   */
  async loadScript(scriptId: string): Promise<DialogueScript | null> {
    const script = this.scripts.get(scriptId);
    
    if (!script) {
      this.logger.warn(`Dialogue script ${scriptId} not found`);
      return null;
    }

    this.logger.log(`Loaded dialogue script: ${scriptId} - ${script.name}`);
    return script;
  }

  /**
   * 执行对话剧本
   */
  async executeScript(
    script: DialogueScript,
    accountId: string,
    targets: string[],
    parameters: Record<string, any>
  ): Promise<DialogueExecutionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    
    this.logger.log(`Starting dialogue script execution: ${script.id} for account ${accountId}`);

    const executionResult: DialogueExecutionResult = {
      scriptId: script.id,
      accountId,
      startTime,
      endTime: startTime,
      stepsExecuted: 0,
      success: false,
      results: [],
      errors: [],
    };

    try {
      // 合并变量
      const variables = {
        ...script.variables,
        ...parameters,
        targets,
        accountId,
        startTime: startTime.toISOString(),
      };

      // 执行剧本步骤
      let currentStep = script.steps[0];
      let stepCount = 0;
      const maxSteps = script.steps.length * 3; // 防止无限循环

      while (currentStep && stepCount < maxSteps) {
        const stepResult = await this.executeStep(currentStep, variables, targets);
        
        executionResult.results.push(stepResult);
        stepCount++;
        executionResult.stepsExecuted++;

        if (!stepResult.success) {
          executionResult.errors.push(`Step ${currentStep.id} failed: ${stepResult.message}`);
          
          // 如果步骤失败，尝试继续或终止
          if (this.shouldAbortOnFailure(currentStep, stepResult)) {
            break;
          }
        }

        // 确定下一步
        currentStep = this.determineNextStep(currentStep, stepResult, script);
        
        if (!currentStep) {
          break;
        }
      }

      executionResult.endTime = new Date();
      executionResult.success = executionResult.errors.length === 0;

      this.executions.set(executionId, executionResult);
      
      this.logger.log(`Dialogue script execution completed: ${script.id}, success: ${executionResult.success}, steps: ${executionResult.stepsExecuted}`);

      return executionResult;

    } catch (error) {
      executionResult.endTime = new Date();
      executionResult.errors.push(`Execution failed: ${error.message}`);
      executionResult.success = false;

      this.logger.error(`Dialogue script execution failed: ${script.id}`, error);
      
      this.executions.set(executionId, executionResult);
      return executionResult;
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: DialogueStep,
    variables: Record<string, any>,
    targets: string[]
  ): Promise<StepResult> {
    const startTime = new Date();
    
    try {
      // 替换变量
      const processedContent = this.replaceVariables(step.content, variables);
      
      this.logger.log(`Executing step ${step.id}: ${step.type} - ${processedContent.substring(0, 50)}...`);

      let result: any;
      let success = true;
      let message = 'Step executed successfully';

      switch (step.type) {
        case 'message':
          result = await this.executeMessageStep(processedContent, step.target, targets, variables);
          break;
        
        case 'question':
          result = await this.executeQuestionStep(processedContent, step.target, targets, variables);
          break;
        
        case 'action':
          result = await this.executeActionStep(step.actions || [], variables);
          break;
        
        case 'delay':
          await this.delay(step.delay || 1000);
          result = { delayed: step.delay };
          break;
        
        case 'condition':
          result = await this.executeConditionStep(step, variables);
          break;
        
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      // 应用延迟
      if (step.delay && step.type !== 'delay') {
        await this.delay(step.delay);
      }

      return {
        stepId: step.id,
        type: step.type,
        target: step.target,
        success,
        message,
        data: result,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Step ${step.id} execution failed:`, error);
      
      return {
        stepId: step.id,
        type: step.type,
        target: step.target,
        success: false,
        message: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 执行消息步骤
   */
  private async executeMessageStep(
    content: string,
    target: string,
    targets: string[],
    variables: Record<string, any>
  ): Promise<any> {
    // 模拟发送消息
    await this.delay(1000);
    
    const actualTargets = target === 'group' ? targets : [target];
    
    return {
      action: 'message_sent',
      content,
      targets: actualTargets,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 执行问题步骤
   */
  private async executeQuestionStep(
    content: string,
    target: string,
    targets: string[],
    variables: Record<string, any>
  ): Promise<any> {
    // 模拟发送问题并等待响应
    await this.delay(2000);
    
    // 模拟响应（实际应该监听消息）
    const simulatedResponse = this.simulateResponse(content);
    
    return {
      action: 'question_asked',
      content,
      target,
      simulatedResponse,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 执行动作步骤
   */
  private async executeActionStep(
    actions: string[],
    variables: Record<string, any>
  ): Promise<any> {
    const results = [];
    
    for (const action of actions) {
      await this.delay(500);
      
      let result: any;
      
      switch (action) {
        case 'log_result':
          result = { action: 'logged', data: variables };
          break;
        
        case 'update_friend_status':
          result = { action: 'status_updated', status: 'verified' };
          break;
        
        case 'log_welcome':
          result = { action: 'welcome_logged', memberCount: variables.targets?.length || 1 };
          break;
        
        case 'update_member_status':
          result = { action: 'member_status_updated', status: 'welcomed' };
          break;
        
        default:
          result = { action: 'unknown_action', name: action };
      }
      
      results.push(result);
    }
    
    return {
      action: 'actions_executed',
      results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 执行条件步骤
   */
  private async executeConditionStep(
    step: DialogueStep,
    variables: Record<string, any>
  ): Promise<any> {
    // 模拟条件评估
    await this.delay(500);
    
    // 这里应该根据实际条件进行评估
    // 简化处理：随机返回true或false
    const conditionMet = Math.random() > 0.5;
    
    return {
      action: 'condition_evaluated',
      conditionMet,
      conditions: step.conditions,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 确定下一步
   */
  private determineNextStep(
    currentStep: DialogueStep,
    stepResult: StepResult,
    script: DialogueScript
  ): DialogueStep | null {
    if (!currentStep.nextStep || currentStep.nextStep === 'step-end') {
      return null;
    }

    // 查找下一步
    const nextStep = script.steps.find(step => step.id === currentStep.nextStep);
    
    if (!nextStep) {
      this.logger.warn(`Next step ${currentStep.nextStep} not found for step ${currentStep.id}`);
      return null;
    }

    return nextStep;
  }

  /**
   * 判断是否应该在失败时中止
   */
  private shouldAbortOnFailure(step: DialogueStep, stepResult: StepResult): boolean {
    // 关键步骤失败时中止
    const criticalSteps = ['action', 'condition'];
    return criticalSteps.includes(step.type) && !stepResult.success;
  }

  /**
   * 替换变量
   */
  private replaceVariables(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      return variables[variableName] !== undefined ? String(variables[variableName]) : match;
    });
  }

  /**
   * 模拟响应
   */
  private simulateResponse(question: string): string {
    const responses = [
      '我们是朋友介绍的',
      '在某个活动中认识的',
      '通过共同好友添加的',
      '不太记得了',
      '你好！很高兴认识你',
      '谢谢你的问候',
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * 获取执行结果
   */
  getExecutionResult(executionId: string): DialogueExecutionResult | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * 获取所有剧本
   */
  getAllScripts(): DialogueScript[] {
    return Array.from(this.scripts.values());
  }

  /**
   * 创建新剧本
   */
  createScript(script: DialogueScript): boolean {
    if (this.scripts.has(script.id)) {
      this.logger.warn(`Script ${script.id} already exists`);
      return false;
    }

    this.scripts.set(script.id, script);
    this.logger.log(`Created new dialogue script: ${script.id} - ${script.name}`);
    return true;
  }

  /**
   * 更新剧本
   */
  updateScript(scriptId: string, updates: Partial<DialogueScript>): boolean {
    const script = this.scripts.get(scriptId);
    
    if (!script) {
      this.logger.warn(`Script ${scriptId} not found for update`);
      return false;
    }

    const updatedScript = { ...script, ...updates };
    this.scripts.set(scriptId, updatedScript);
    
    this.logger.log(`Updated dialogue script: ${scriptId}`);
    return true;
  }

  /**
   * 删除剧本
   */
  deleteScript(scriptId: string): boolean {
    const deleted = this.scripts.delete(scriptId);
    
    if (deleted) {
      this.logger.log(`Deleted dialogue script: ${scriptId}`);
    } else {
      this.logger.warn(`Script ${scriptId} not found for deletion`);
    }
    
    return deleted;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}