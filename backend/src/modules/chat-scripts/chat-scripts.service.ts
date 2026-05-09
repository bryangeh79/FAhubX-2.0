import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatScript } from './entities/chat-script.entity';
import { UpdateChatScriptDto } from './dto/update-chat-script.dto';
import { ImportScriptPackDto } from './dto/import-script-pack.dto';

const CATEGORIES = ['推广', '问候', '活动', '售后', '邀请'] as const;
type Category = typeof CATEGORIES[number];

@Injectable()
export class ChatScriptsService {
  constructor(
    @InjectRepository(ChatScript)
    private readonly repo: Repository<ChatScript>,
  ) {}

  /**
   * Get scripts for user. 默认语言 = 中文，自动 seed 到 50 个；
   * 其他语言不 auto-seed，只返回已导入的（按需下载剧本包）。
   */
  async findAllByUser(userId: string, language: string = 'zh'): Promise<ChatScript[]> {
    const existing = await this.repo.find({
      where: { userId, language },
      order: { scriptNumber: 'ASC' },
    });

    // 只对中文做 auto-seed，其他语言靠用户上传剧本包
    if (language === 'zh' && existing.length < 50) {
      await this.seedScripts(userId, existing.map(s => s.scriptNumber));
      return this.repo.find({ where: { userId, language: 'zh' }, order: { scriptNumber: 'ASC' } });
    }

    return existing;
  }

  /**
   * 按语言统计剧本数量（前端语言 tab 显示：中文(50) | English(2) | Tiếng Việt(0)）
   */
  async getLanguageStats(userId: string): Promise<{ zh: number; en: number; vi: number }> {
    const rows: Array<{ language: string; count: string }> = await this.repo
      .createQueryBuilder('s')
      .select('s.language', 'language')
      .addSelect('COUNT(*)', 'count')
      .where('s.userId = :userId', { userId })
      .groupBy('s.language')
      .getRawMany();
    const stats = { zh: 0, en: 0, vi: 0 } as Record<string, number>;
    for (const r of rows) {
      stats[r.language] = parseInt(r.count, 10);
    }
    return stats as { zh: number; en: number; vi: number };
  }

  async findOne(userId: string, id: string): Promise<ChatScript> {
    return this.repo.findOne({ where: { id, userId } });
  }

  async findByNumber(userId: string, scriptNumber: number): Promise<ChatScript> {
    await this.findAllByUser(userId);
    return this.repo.findOne({ where: { userId, scriptNumber } });
  }

  async update(userId: string, id: string, dto: UpdateChatScriptDto): Promise<ChatScript> {
    const existing = await this.repo.findOne({ where: { id, userId } });
    if (!existing) return null;
    Object.assign(existing, dto, { updatedAt: new Date() });
    return this.repo.save(existing);
  }

  /**
   * 重置指定用户的所有**中文**剧本为最新模板（用于剧本更新发版）
   * 英文/越南语剧本包不受影响。
   */
  async resetToDefault(userId: string): Promise<number> {
    await this.repo.delete({ userId, language: 'zh' });
    await this.seedScripts(userId, []);
    return 50;
  }

  /**
   * 导入剧本包（英文/越南语剧本包 JSON 解析入库）
   * 冲突（同 userId + language + scriptNumber 已存在）处理策略：
   *   - overwrite: 覆盖旧剧本内容
   *   - skip（默认）: 跳过已存在的
   */
  async importPack(userId: string, dto: ImportScriptPackDto): Promise<{
    imported: number; skipped: number; overwritten: number; total: number;
  }> {
    if (!dto.scripts || dto.scripts.length === 0) {
      throw new BadRequestException('剧本包为空');
    }
    if (dto.scripts.length > 50) {
      throw new BadRequestException('剧本包最多 50 个剧本');
    }

    const conflictMode = dto.conflictMode || 'skip';
    const language = dto.language;

    // 预先查出该用户该语言已有的剧本 scriptNumber 集合
    const existing = await this.repo.find({
      where: { userId, language },
      select: ['id', 'scriptNumber'],
    });
    const existingByNumber = new Map<number, string>();
    existing.forEach(e => existingByNumber.set(e.scriptNumber, e.id));

    let imported = 0, skipped = 0, overwritten = 0;

    for (const item of dto.scripts) {
      if (!item.scriptNumber || item.scriptNumber < 1 || item.scriptNumber > 50) {
        throw new BadRequestException(`剧本编号必须在 1-50 之间，收到 ${item.scriptNumber}`);
      }

      const conflictId = existingByNumber.get(item.scriptNumber);

      if (conflictId && conflictMode === 'skip') {
        skipped++;
        continue;
      }

      if (conflictId && conflictMode === 'overwrite') {
        await this.repo.update(conflictId, {
          title: item.title,
          goal: item.goal ?? null,
          systemPrompt: item.systemPrompt ?? null,
          category: item.category || '推广',
          phases: item.phases,
        });
        overwritten++;
      } else {
        await this.repo.save(this.repo.create({
          userId,
          language,
          scriptNumber: item.scriptNumber,
          title: item.title,
          goal: item.goal ?? null,
          systemPrompt: item.systemPrompt ?? null,
          category: item.category || '推广',
          phases: item.phases,
        }));
        imported++;
      }
    }

    return {
      imported,
      skipped,
      overwritten,
      total: imported + overwritten + skipped,
    };
  }

  /**
   * 按语言删除该用户的剧本（误导入回滚用）
   * 禁止删除 zh（防止误操作把默认剧本清空，要重置请用 resetToDefault）
   */
  async deleteByLanguage(userId: string, language: string): Promise<{ deleted: number }> {
    if (language === 'zh') {
      throw new BadRequestException('不允许直接删除中文剧本。如需重置，请使用「重置为默认模板」功能');
    }
    const result = await this.repo.delete({ userId, language });
    return { deleted: result.affected || 0 };
  }

  private async seedScripts(userId: string, existingNumbers: number[]): Promise<void> {
    const toCreate: Partial<ChatScript>[] = [];
    for (let i = 1; i <= 50; i++) {
      if (existingNumbers.includes(i)) continue;
      const category = CATEGORIES[(i - 1) % 5];
      const variant = Math.floor((i - 1) / 5); // 0..9 = 10 variants per category
      toCreate.push({
        userId,
        scriptNumber: i,
        title: `${category}对话 ${variant + 1}（${i}号剧本）`,
        goal: this.goalForCategory(category, variant),
        systemPrompt: this.systemPromptForCategory(category),
        phases: this.buildPhases(category, variant),
        category,
      });
    }

    if (toCreate.length > 0) {
      await this.repo.save(toCreate as ChatScript[]);
    }
  }

  private goalForCategory(cat: Category, variant: number): string {
    const goals: Record<Category, string[]> = {
      推广: [
        '向潜在客户介绍新产品并引导关注主页',
        '推广限时优惠，吸引用户点击链接',
        '软性植入品牌，建立初步信任',
        '介绍会员专享福利，促进转化',
        '分享成功案例，引起兴趣',
        '推广新功能上线，引导试用',
        '推介合作机会，达成商务对接',
        '宣传品牌故事，增强品牌认同',
        '推广内容订阅，获取长期关注',
        '引流到特定落地页或活动页面',
      ],
      问候: [
        '日常寒暄维持关系，定期触达',
        '节假日祝福，保持温度',
        '生日问候，加深个人连接',
        '久违关心，重新激活对话',
        '周末闲聊，建立朋友感',
        '天气/新闻切入，自然开场',
        '分享近况，拉近距离',
        '关心对方近况，表达在意',
        '早晚安问候，维持每日接触',
        '节气/季节话题切入，文化共鸣',
      ],
      活动: [
        '邀请参加线上分享会',
        '宣传线下活动报名',
        '推广抽奖/有奖互动活动',
        '邀请参加直播带货',
        '推广新品发布会',
        '邀请成为内测用户',
        '推介VIP专属活动',
        '宣传限时闪购活动',
        '邀请参加用户调研',
        '邀请参加会员专场活动',
      ],
      售后: [
        '跟进购买后使用感受',
        '解答常见疑问，提升满意度',
        '提供使用技巧和建议',
        '主动关怀老客户，触发复购',
        '收集反馈，改进服务',
        '推荐搭配使用的产品',
        '提醒续费/续订',
        '提供故障排查帮助',
        '回访老客户，邀请评价',
        '提醒补货/回购时机',
      ],
      邀请: [
        '邀请加入专属群组',
        '邀请关注品牌主页',
        '邀请试用新产品样品',
        '邀请成为品牌大使',
        '邀请参与内容共创',
        '邀请填写问卷获取奖励',
        '邀请朋友推荐得优惠',
        '邀请参加抽奖活动',
        '邀请预约咨询',
        '邀请加入会员计划',
      ],
    };
    return goals[cat][variant] || goals[cat][0];
  }

  private systemPromptForCategory(cat: Category): string {
    const prompts: Record<Category, string> = {
      推广:
        '你是一位专业的社群营销顾问，擅长通过真诚对话建立信任。对话保持自然、友善，不要显得急于推销。每次回复 1-2 句话，像朋友聊天一样。适当使用 emoji 增强亲和力。不要透露自己是 AI。',
      问候:
        '你是一位热情友好的朋友，通过日常问候维系关系。对话口吻轻松、真诚，关心对方近况。回复简短自然，1-2 句话即可。不要显得刻意或推销，重点是建立情感连接。',
      活动:
        '你是一位活动运营，善于激发用户参与热情。介绍活动时突出亮点和利益，语气热情但不夸张。每次回复简短有吸引力，引导对方报名参与。不要透露自己是 AI。',
      售后:
        '你是一位专业客服，耐心细致解答问题。语气温暖、专业，关心用户实际体验。优先解决问题，再适当推荐相关服务。回复简短明了，必要时拆成多条发送。',
      邀请:
        '你是一位社群运营，擅长个性化邀请。对话中找到对方兴趣点，再自然引入邀请。语气友好，强调被邀请者的独特价值。不要群发感，每个邀请要像专门为对方准备的。',
    };
    return prompts[cat];
  }

  /**
   * 每个剧本 15-20 轮对话（phases），A/B 交替。
   * 每个 phase 可以有多条 messages 变体，发送时随机选一条。
   */
  private buildPhases(cat: Category, variant: number): Array<{ label: string; sender?: 'A' | 'B'; messages: string[] }> {
    const templates: Record<Category, Array<{ label: string; sender?: 'A' | 'B'; messages: string[] }>> = {
      推广: [
        { label: '开场寒暄', sender: 'A', messages: ['嗨！最近怎么样呀 😊', '嘿，好久不见，最近忙吗？', '你好，今天过得如何？'] },
        { label: '回应寒暄', sender: 'B', messages: ['还可以，你呢？', '都挺好的，你最近怎么样？', '还行，就是有点忙，你呢？'] },
        { label: '分享近况', sender: 'A', messages: ['我最近在做一些有意思的事情，想跟你分享一下', '最近我接触到一个蛮不错的东西', '我最近发现了一个挺实用的资源'] },
        { label: '引发好奇', sender: 'B', messages: ['哦？是什么？', '真的吗？说来听听', '什么好东西？'] },
        { label: '介绍产品', sender: 'A', messages: ['是关于[产品/服务]的，之前一直有朋友问，我就想顺便告诉你', '就是[产品/服务]，蛮多朋友反馈都不错', '我刚好在用[产品/服务]，觉得挺好用的'] },
        { label: '询问细节', sender: 'B', messages: ['具体是做什么的？', '有什么特别的地方吗？', '和其他的有什么不同？'] },
        { label: '讲解价值', sender: 'A', messages: ['它主要解决[痛点]，我用了之后觉得省了很多时间', '最大的好处是[核心价值]，效果挺明显的', '关键是[独特卖点]，这一点我觉得挺难得的'] },
        { label: '展示信任', sender: 'B', messages: ['听起来不错', '感觉还蛮有意思的', '嗯，好像确实有用'] },
        { label: '分享案例', sender: 'A', messages: ['我一个朋友用了大概两周，反馈特别好', '之前有个客户试了之后回来找我们续购', '好多人用了都说有效果'] },
        { label: '拉近距离', sender: 'B', messages: ['那看来挺靠谱', '这样呀', '有机会可以试试'] },
        { label: '提供优惠', sender: 'A', messages: ['刚好现在有优惠活动，比平时划算一些 🎁', '最近做活动，早鸟价还蛮划算的', '最近有专属福利，老客户介绍的可以享受折扣'] },
        { label: '关心反馈', sender: 'B', messages: ['什么优惠呀？', '大概多少钱？', '可以详细说说吗？'] },
        { label: '详细说明', sender: 'A', messages: ['我稍后把详情发给你看看 📎', '你可以看看我们的主页，详细信息都在上面', '我整理一份资料发你，方便你慢慢看'] },
        { label: '引导行动', sender: 'A', messages: ['如果感兴趣，可以点这个链接了解更多', '有兴趣的话我可以拉你进我们的群', '需要的话我帮你预约咨询'] },
        { label: '给予选择', sender: 'B', messages: ['好啊，先看看资料', '我研究一下再说', '嗯，有需要再联系你'] },
        { label: '强调价值', sender: 'A', messages: ['好的，慢慢看，有问题随时问我', '没问题，你要多了解的话我都可以帮忙', '好，任何时候想聊都可以找我'] },
        { label: '软性促进', sender: 'A', messages: ['这个活动是限时的，截止到月底', '早点决定比较好，名额不多', '活动价格比较好，过了就恢复原价了'] },
        { label: '用户考虑', sender: 'B', messages: ['明白，我考虑一下', '嗯，我想想', '知道了，谢谢提醒'] },
        { label: '暖心收尾', sender: 'A', messages: ['不急不急，最重要是适合你 😊', '完全理解，你慢慢考虑', '没压力，就是想着有好东西跟你分享下'] },
        { label: '结束对话', sender: 'B', messages: ['谢谢你呀', '感谢分享，保持联系', '好的，有缘再聊'] },
      ],
      问候: [
        { label: '开场问候', sender: 'A', messages: ['早安~今天天气挺好的 ☀️', '嗨，好久没聊啦', '嘿，最近忙不忙？'] },
        { label: '回应问候', sender: 'B', messages: ['早呀！今天天气确实不错', '是呀，都好一段时间没联系了', '还行，你最近怎么样？'] },
        { label: '分享天气', sender: 'A', messages: ['这边下了一整天雨，窝家了一天', '今天阳光特别好，想出去走走', '天气突然转凉，记得多穿点 🧥'] },
        { label: '话题互动', sender: 'B', messages: ['这边也是有点冷了', '真好，我这里还是闷热', '谢谢关心，你也是'] },
        { label: '问工作', sender: 'A', messages: ['最近工作忙吗？感觉你很久没发朋友圈', '工作怎么样呀？有没有休息', '还在忙之前那个项目？'] },
        { label: '聊工作', sender: 'B', messages: ['还是老样子', '挺忙的，最近一直加班', '终于告一段落了'] },
        { label: '关心健康', sender: 'A', messages: ['辛苦啦，要注意休息啊', '忙归忙，身体还是最重要的', '记得多喝水，别熬夜'] },
        { label: '感谢关心', sender: 'B', messages: ['谢谢你呀', '嗯嗯，知道啦', '放心放心，会照顾自己'] },
        { label: '分享日常', sender: 'A', messages: ['我最近也在忙一些事情，感觉每天都过得好快', '最近生活还算充实，但有点累', '我在尝试新的习惯，早起运动'] },
        { label: '互动回应', sender: 'B', messages: ['充实就好', '日子过得快说明有意义', '你真自律'] },
        { label: '聊兴趣', sender: 'A', messages: ['最近在看一本书/一部剧，挺不错的', '在研究一些新东西，挺有意思', '最近迷上了一个新爱好'] },
        { label: '问推荐', sender: 'B', messages: ['什么书/剧？推荐一下', '哇，说来听听', '是什么呀？'] },
        { label: '推荐分享', sender: 'A', messages: ['叫《xxx》，你肯定喜欢', '改天详细跟你聊', '有空我发你看看'] },
        { label: '表达兴趣', sender: 'B', messages: ['好期待！', '记得哦', '好呀好呀'] },
        { label: '约下次聊', sender: 'A', messages: ['哪天有空一起聊聊？', '约个时间好好聊一下', '等哪天都不忙的时候约一次'] },
        { label: '回应约聊', sender: 'B', messages: ['好啊！', '可以呀，定个时间', '哈哈好，到时候联系'] },
        { label: '确认时间', sender: 'A', messages: ['周末怎么样？', '这周五晚上？', '找个合适的时间吧'] },
        { label: '灵活应答', sender: 'B', messages: ['周末可以', '晚上看情况', '你定吧'] },
        { label: '温馨收尾', sender: 'A', messages: ['那就这样啦，保重身体 💪', '好的不打扰你了，有事情随时联系', '先聊到这，祝你今天愉快'] },
        { label: '道别', sender: 'B', messages: ['好的，你也是', '谢谢，拜拜', '嗯，回头聊'] },
      ],
      活动: [
        { label: '打招呼', sender: 'A', messages: ['嗨，在忙吗？', '你好呀！', '嘿，打扰一下 😄'] },
        { label: '回应', sender: 'B', messages: ['在的，怎么啦？', '还好，什么事？', '不忙，说吧'] },
        { label: '分享活动', sender: 'A', messages: ['我们最近有一个[活动名称]，想第一时间告诉你', '我们筹备了一个活动，觉得你可能会喜欢', '公司最近有个活动，特意想跟你说一声'] },
        { label: '表示兴趣', sender: 'B', messages: ['是什么活动？', '哦？说说看', '什么活动呀'] },
        { label: '介绍主题', sender: 'A', messages: ['主题是[活动主题]，时间在[日期]', '是一场[形式]，聚焦[主题]', '[日期]举办，主要是[内容概述]'] },
        { label: '询问价值', sender: 'B', messages: ['具体内容是什么？', '参加有什么收获？', '主要讲些什么？'] },
        { label: '讲解亮点', sender: 'A', messages: ['会请到[嘉宾]来分享[主题]', '亮点是[独特环节]，其他地方很少见', '核心内容包括 [Point1]、[Point2]、[Point3]'] },
        { label: '互动问题', sender: 'B', messages: ['哇，听起来不错', '感觉挺专业的', '是免费的吗？'] },
        { label: '参与方式', sender: 'A', messages: ['是免费的，需要提前报名预约名额', '老朋友专属免费名额，我给你留一个', '有免费场和VIP场，可以看看哪个适合'] },
        { label: '考虑时间', sender: 'B', messages: ['那天我看看时间', '我想想能不能来', '我查查日程'] },
        { label: '强调价值', sender: 'A', messages: ['参加可以免费拿到[资料/礼品]', '现场还有专属福利', '限定 [N] 人，先到先得'] },
        { label: '问细节', sender: 'B', messages: ['在哪里举办？', '线上还是线下？', '需要准备什么？'] },
        { label: '详细信息', sender: 'A', messages: ['线上直播，不用出门 💻', '[城市][地点]，交通方便', '完全不需要准备，带着好奇心来就行'] },
        { label: '降低门槛', sender: 'A', messages: ['不能全程参加也没关系，会提供回放', '可以中途加入退出', '如果来不了，我可以帮你保留资料'] },
        { label: '表态意向', sender: 'B', messages: ['这样我就放心了', '那我应该可以参加', '好，我想试试看'] },
        { label: '引导报名', sender: 'A', messages: ['那我现在帮你报名？只要名字和联系方式', '报名链接我发给你 📎', '需要我帮你预约吗？'] },
        { label: '给信息', sender: 'B', messages: ['好，麻烦你了', '我自己报吧，链接发我', '帮我报名吧'] },
        { label: '确认成功', sender: 'A', messages: ['报名成功啦！活动前一天会再提醒你', '收到，稍后会发确认信息', 'OK，届时现场见！'] },
        { label: '感谢回复', sender: 'B', messages: ['谢谢', '好的，到时见', '期待参加'] },
        { label: '暖心结束', sender: 'A', messages: ['到时候有问题随时找我 🙋', '期待见到你，提前祝你愉快', '感谢你的信任，到时见！'] },
      ],
      售后: [
        { label: '主动关怀', sender: 'A', messages: ['你好呀，上次购买的[产品]用得还习惯吗？', '最近怎么样？产品用得顺手吗', '嗨，过来看看你用[产品]的感受'] },
        { label: '初步反馈', sender: 'B', messages: ['挺好的', '还在摸索', '有些地方不太会用'] },
        { label: '深入询问', sender: 'A', messages: ['具体哪些地方有疑问？我来帮你解答', '什么地方卡住了？我帮你看看', '哪些功能还没试？我可以教你'] },
        { label: '说明问题', sender: 'B', messages: ['[具体问题描述]', '比如 [某功能] 不知道怎么用', '刚开始上手没啥头绪'] },
        { label: '专业解答', sender: 'A', messages: ['这个很简单，按 [步骤] 操作就可以', '其实 [功能] 的设计是为了 [目的]，你可以 [使用方法]', '这种情况下建议 [做法]'] },
        { label: '确认理解', sender: 'B', messages: ['原来是这样', '明白了', '听起来不难'] },
        { label: '补充建议', sender: 'A', messages: ['还有一些使用小技巧，可以让效率更高', '另外可以注意 [细节]，体验会更好', '搭配 [功能] 使用效果会更棒'] },
        { label: '感兴趣', sender: 'B', messages: ['说来听听', '有哪些技巧？', '请教请教'] },
        { label: '分享技巧', sender: 'A', messages: ['技巧一：[tip1]，技巧二：[tip2]', '比如 [场景] 时，你可以 [做法]', '我整理了一份小指南，稍后发你'] },
        { label: '表示感谢', sender: 'B', messages: ['太谢谢了', '这些确实有用', '感谢你这么用心'] },
        { label: '反馈收集', sender: 'A', messages: ['有什么改进建议也可以随时告诉我', '你的反馈对我们很重要', '觉得哪里可以做得更好？'] },
        { label: '提建议', sender: 'B', messages: ['暂时想不到', '觉得 [某点] 可以改进一下', '挺满意的'] },
        { label: '珍惜反馈', sender: 'A', messages: ['好，我记下来，转达给产品团队', '谢谢你的建议，我们会认真考虑', '你的反馈很有价值'] },
        { label: '关联推荐', sender: 'A', messages: ['另外，[相关产品] 和你现有的搭配很好', '有一款 [产品] 很多客户都加购了，你可能也会喜欢', '新版本 [功能升级]，要不要了解一下？'] },
        { label: '考虑兴趣', sender: 'B', messages: ['这个我还没试过', '听起来也不错', '有空看看'] },
        { label: '降低压力', sender: 'A', messages: ['不急，你现在这个用熟了再说 😊', '先把现有的用好，其他的随缘', '没有任何压力，我只是顺便提一下'] },
        { label: '表达信任', sender: 'B', messages: ['你真贴心', '挺信任你们', '服务真的不错'] },
        { label: '维护关系', sender: 'A', messages: ['这是应该的，老客户更要照顾好 🤝', '希望继续为你服务', '任何时候都可以找我'] },
        { label: '承诺跟进', sender: 'A', messages: ['过段时间我再来问问你的使用情况', '下次有新功能我第一时间告诉你', '有问题随时联系，我会跟进到底'] },
        { label: '温暖结束', sender: 'B', messages: ['谢谢', '好的，保持联系', '你们服务真好'] },
      ],
      邀请: [
        { label: '轻松开场', sender: 'A', messages: ['嗨，打扰啦 😊', '你好，有个小事想问问你', '嘿，在吗？'] },
        { label: '回应', sender: 'B', messages: ['在的，怎么啦？', '什么事？', '你说'] },
        { label: '铺垫兴趣', sender: 'A', messages: ['我记得你挺喜欢 [话题/兴趣]，对吧？', '之前听你说过你对 [领域] 有兴趣', '感觉你挺关注 [主题] 的'] },
        { label: '认同', sender: 'B', messages: ['对啊，挺感兴趣的', '嗯，算是吧', '你还记得'] },
        { label: '抛出邀请', sender: 'A', messages: ['我们有一个 [社群/活动]，正好跟这个相关', '最近有个 [项目/邀请]，觉得你会感兴趣', '有个机会想跟你分享一下'] },
        { label: '好奇', sender: 'B', messages: ['什么社群？', '什么项目？', '说来听听'] },
        { label: '介绍背景', sender: 'A', messages: ['是一个专注 [主题] 的 [形式]，里面都是 [人群]', '最近刚启动的 [计划]，目标是 [愿景]', '一个小而精的圈子，大家都很 [特点]'] },
        { label: '问价值', sender: 'B', messages: ['加入有什么好处？', '具体能做什么？', '参与方式是怎样？'] },
        { label: '具体价值', sender: 'A', messages: ['可以获得 [Resource1]、[Resource2]，还能认识 [人脉]', '你能参与到 [activities]，还有专属 [benefits]', '核心价值是 [value proposition]'] },
        { label: '考虑', sender: 'B', messages: ['听起来不错', '感觉确实有价值', '让我想想'] },
        { label: '强调独特', sender: 'A', messages: ['这个 [活动/社群] 不对外公开，是邀请制', '名额有限，一期只有 [N] 个人', '我们更看重质量，不走量'] },
        { label: '心动', sender: 'B', messages: ['哇，挺难得的', '这样呀', '感觉门槛挺高'] },
        { label: '个性邀请', sender: 'A', messages: ['我第一个就想到了你', '觉得你的 [特质] 非常契合', '感觉你一定会喜欢这里的氛围'] },
        { label: '感动回应', sender: 'B', messages: ['谢谢你想到我', '挺意外的', '真的假的 😄'] },
        { label: '参与门槛', sender: 'A', messages: ['门槛就是 [简单要求]，对你来说完全没问题', '不需要提前准备，只要愿意参与就行', '加入是免费的，但要求是 [contribution expectation]'] },
        { label: '确认参与', sender: 'B', messages: ['这样我应该可以', '听起来挺合理的', '好像没什么障碍'] },
        { label: '引导行动', sender: 'A', messages: ['要不我把你加进去？', '那我给你发邀请链接', '需要我帮你介绍给负责人吗？'] },
        { label: '同意', sender: 'B', messages: ['好呀，麻烦你了', '可以', '嗯'] },
        { label: '确认完成', sender: 'A', messages: ['已经发给你了，点链接即可加入', '加进去啦，欢迎欢迎！', '稍后会有人对接你，放心'] },
        { label: '温暖收尾', sender: 'B', messages: ['谢谢你 🙌', '期待交流', '收到'] },
      ],
    };

    // 根据 variant 混洗 phases 的顺序和选用，让 10 个变体有区别
    const base = templates[cat];
    if (variant === 0) return base;
    // 变体：轻微改写开头或结尾，或替换部分 messages 变体
    return base.map((phase, idx) => ({
      ...phase,
      messages: phase.messages.map((m, j) => (j === variant % phase.messages.length ? m : phase.messages[(j + variant) % phase.messages.length])),
    }));
  }
}
