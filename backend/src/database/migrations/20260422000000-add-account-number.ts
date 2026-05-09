import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.2.0 Phase 0 — 账号编号系统
 *
 * 需求：
 * - 每个账号分配 #01, #02, ... 的序号（每个租户独立编号，互不影响）
 * - 从 #01 开始
 * - 删号后编号回收：新账号分配当前未使用的最小编号
 * - 现有账号按 createdAt ASC 回填 #01 开始
 *
 * 实现方式：
 * - facebook_accounts 表加 account_number INTEGER（每租户唯一）
 * - 回填：每个 userId 下按 createdAt 排序，从 1 开始分配
 * - 唯一索引 (userId, accountNumber) where deletedAt IS NULL
 *   —— 软删除的账号不占编号，真正删除后下次分配会补上这个号
 */
export class AddAccountNumber20260422000000 implements MigrationInterface {
  name = 'AddAccountNumber20260422000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 加字段（允许 null，后面回填）
    const hasColumn = await queryRunner.hasColumn('facebook_accounts', 'accountNumber');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE facebook_accounts
          ADD COLUMN "accountNumber" INTEGER
      `);
    }

    // 2. 回填：每个 userId 下按 createdAt ASC 从 1 开始分配
    // 只回填未删除的账号，软删除的账号不占号
    await queryRunner.query(`
      WITH numbered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC) AS rn
        FROM facebook_accounts
        WHERE "deletedAt" IS NULL AND "accountNumber" IS NULL
      )
      UPDATE facebook_accounts
      SET "accountNumber" = numbered.rn
      FROM numbered
      WHERE facebook_accounts.id = numbered.id
    `);

    // 3. 唯一索引：同一租户 + 未删除的情况下，accountNumber 不能重复
    // 软删除的账号释放编号，新账号可以复用
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_accounts_user_number
        ON facebook_accounts ("userId", "accountNumber")
        WHERE "deletedAt" IS NULL AND "accountNumber" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_facebook_accounts_user_number`);
    const hasColumn = await queryRunner.hasColumn('facebook_accounts', 'accountNumber');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE facebook_accounts DROP COLUMN "accountNumber"`);
    }
  }
}
