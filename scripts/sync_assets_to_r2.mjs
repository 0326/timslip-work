#!/usr/bin/env node
/**
 * 批量同步本地角色视觉资产到 R2 + Turso DB
 *
 * 用法:
 *   node sync_assets_to_r2.mjs                    # 全量同步
 *   node sync_assets_to_r2.mjs --dry-run          # 只打印不执行
 *   node sync_assets_to_r2.mjs --limit 50         # 限制数量
 *   node sync_assets_to_r2.mjs --figures aguqi,ahoubian  # 指定角色
 *
 * 需要环境变量:
 *   TURSO_DATABASE_URL / TURSO_AUTH_TOKEN  (读 .dev.vars)
 *   wrangler 已登录
 *
 * 流程:
 *   1. 找出本地有文件但 DB 无 asset_files 记录的角色
 *   2. 对每个角色:
 *      a. wrangler r2 object put 上传 avatar/default.jpg → R2
 *      b. wrangler r2 object put 上传 portrait/bust-default.webp → R2
 *      c. SQL upsert figure_assets + asset_files + figures.avatar_url
 *   3. 输出统计
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client/web";

const ROOT = process.cwd();
const FIGURES_DIR = path.join(ROOT, "public/assets/figures");
const BUCKET = "timslip-assets";
const STYLE_ID = "classical";

// 读取 .dev.vars
function loadEnv() {
  const devVarsPath = path.join(ROOT, ".dev.vars");
  if (fs.existsSync(devVarsPath)) {
    const content = fs.readFileSync(devVarsPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("缺 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN（检查 .dev.vars）");
  process.exit(1);
}
const db = createClient({ url, authToken });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;
const figIdx = args.indexOf("--figures");
const specifiedFigs = figIdx >= 0 ? args[figIdx + 1].split(",") : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 获取图片尺寸（JPEG/WebP）
function getImageDims(buf, ext) {
  if (ext === "jpg" || ext === "jpeg") {
    if (buf.length < 4) return null;
    // JPEG: 扫描 SOF0 (0xFFC0) 标记
    let off = 2;
    while (off < buf.length - 1) {
      if (buf[off] !== 0xFF) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xC0 && marker <= 0xC3) {
        const h = (buf[off + 5] << 8) | buf[off + 6];
        const w = (buf[off + 7] << 8) | buf[off + 8];
        return { w, h };
      }
      const len = (buf[off + 2] << 8) | buf[off + 3];
      off += 2 + len;
    }
    return null;
  }
  if (ext === "webp") {
    if (buf.length < 30) return null;
    if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46) return null;
    if (buf[8] !== 0x57 || buf[9] !== 0x45 || buf[10] !== 0x42 || buf[11] !== 0x50) return null;
    let off = 12;
    while (off + 8 <= buf.length) {
      const fourCC = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]);
      const chunkSize = buf[off+4] | (buf[off+5] << 8) | (buf[off+6] << 16) | (buf[off+7] << 24);
      const dataOff = off + 8;
      if (fourCC === "VP8 " && dataOff + 10 <= buf.length) {
        const w = (buf[dataOff+6] | (buf[dataOff+7] << 8)) & 0x3FFF;
        const h = (buf[dataOff+8] | (buf[dataOff+9] << 8)) & 0x3FFF;
        return { w, h };
      }
      if (fourCC === "VP8L" && dataOff + 5 <= buf.length) {
        const b0 = buf[dataOff+1], b1 = buf[dataOff+2], b2 = buf[dataOff+3], b3 = buf[dataOff+4];
        const w = 1 + ((b1 & 0x3F) << 8 | b0);
        const h = 1 + ((b3 & 0x0F) << 10 | b2 << 2 | (b1 & 0xC0) >> 6);
        return { w, h };
      }
      if (fourCC === "VP8X" && dataOff + 10 <= buf.length) {
        const w = 1 + ((buf[dataOff+4] << 16) | (buf[dataOff+3] << 8) | buf[dataOff+2]);
        const h = 1 + ((buf[dataOff+7] << 16) | (buf[dataOff+6] << 8) | buf[dataOff+5]);
        return { w, h };
      }
      off = dataOff + chunkSize + (chunkSize % 2);
    }
    return null;
  }
  return null;
}

// 执行 wrangler r2 object put
function r2Put(localPath, r2Key, contentType) {
  const cmd = `npx wrangler r2 object put ${BUCKET}/${r2Key} --file "${localPath}" --content-type "${contentType}" --remote 2>&1`;
  try {
    execSync(cmd, { stdio: "pipe", timeout: 30000 });
    return true;
  } catch (e) {
    // 重试一次
    try {
      execSync(cmd, { stdio: "pipe", timeout: 30000 });
      return true;
    } catch (e2) {
      console.error(`  R2上传失败: ${r2Key} - ${e2.message?.slice(0, 80)}`);
      return false;
    }
  }
}

// SQL 批量执行（带重试）
async function sqlBatch(stmts, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await db.batch(stmts, "write");
      return;
    } catch (e) {
      if (attempt === 5) throw e;
      process.stdout.write(`  · ${label} 第${attempt}次失败(${e.message?.slice(0, 50)})，重试\n`);
      await sleep(2000 * attempt);
    }
  }
}

async function main() {
  console.log(`=== 角色资产同步工具 ===`);
  console.log(`R2 Bucket: ${BUCKET}`);
  console.log(`DB: ${url.slice(0, 40)}...`);
  console.log(`模式: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log("");

  // 1. 获取已有 asset_files 的角色列表
  const existingRs = await db.execute("SELECT DISTINCT asset_id FROM asset_files");
  const existingIds = new Set(existingRs.rows.map(r => r.asset_id?.replace(/:classical$/, "")));
  console.log(`DB 中已有 asset_files 的角色: ${existingIds.size}`);

  // 1b. 获取 DB 中所有有效的 figure IDs（用于过滤本地孤儿目录）
  const figRs = await db.execute("SELECT id FROM figures");
  const dbFigIds = new Set(figRs.rows.map(r => r.id));
  console.log(`DB 中有效角色: ${dbFigIds.size}`);

  // 2. 获取本地角色目录
  const localDirs = fs.readdirSync(FIGURES_DIR).filter(d => {
    const stat = fs.statSync(path.join(FIGURES_DIR, d));
    return stat.isDirectory() && dbFigIds.has(d); // 只保留 DB 中存在的角色
  });

  // 3. 找出需要同步的角色
  const allLocalDirs = fs.readdirSync(FIGURES_DIR).filter(d => {
    return fs.statSync(path.join(FIGURES_DIR, d)).isDirectory();
  });
  const orphanCount = allLocalDirs.length - localDirs.length;
  let needSync = localDirs.filter(id => !existingIds.has(id));
  if (orphanCount > 0) {
    console.log(`跳过 ${orphanCount} 个不在 DB 中的本地目录`);
  }
  if (specifiedFigs) {
    needSync = needSync.filter(id => specifiedFigs.includes(id));
  }
  if (limit > 0) needSync = needSync.slice(0, limit);
  console.log(`需要同步: ${needSync.length} 个角色`);
  console.log("");

  if (needSync.length === 0) {
    console.log("无需同步，全部已在线上。");
    return;
  }

  let success = 0;
  let failed = 0;
  const failedIds = [];

  for (let i = 0; i < needSync.length; i++) {
    const figId = needSync[i];
    const baseDir = path.join(FIGURES_DIR, figId, "classical");
    const avatarPath = path.join(baseDir, "avatar/default.jpg");
    const bustPath = path.join(baseDir, "portrait/bust-default.webp");

    // 检查文件存在
    const hasAvatar = fs.existsSync(avatarPath);
    const hasBust = fs.existsSync(bustPath);
    if (!hasAvatar && !hasBust) {
      console.log(`[${i+1}/${needSync.length}] SKIP ${figId} (无文件)`);
      failed++;
      failedIds.push(figId);
      continue;
    }

    if (dryRun) {
      console.log(`[${i+1}/${needSync.length}] DRY ${figId} (avatar=${hasAvatar}, bust=${hasBust})`);
      success++;
      continue;
    }

    process.stdout.write(`[${i+1}/${needSync.length}] ${figId}...`);

    const now = Math.floor(Date.now() / 1000);
    const sqlStmts = [];
    const assetId = `${figId}:${STYLE_ID}`;

    // 上传 avatar
    if (hasAvatar) {
      const r2Key = `figures/${figId}/${STYLE_ID}/avatar/default.jpg`;
      const ok = r2Put(avatarPath, r2Key, "image/jpeg");
      if (ok) {
        const buf = fs.readFileSync(avatarPath);
        const dims = getImageDims(buf, "jpg");
        const fileId = `${assetId}:avatar:default`;
        sqlStmts.push({
          sql: `INSERT INTO asset_files (id, asset_id, asset_type, variant, r2_key, mime_type, width, height, size_bytes, sort_order, metadata, created_at) VALUES (?, ?, 'avatar', 'default', ?, 'image/jpeg', ?, ?, ?, 0, NULL, ?) ON CONFLICT(id) DO UPDATE SET r2_key=excluded.r2_key, mime_type=excluded.mime_type, width=excluded.width, height=excluded.height, size_bytes=excluded.size_bytes`,
          args: [fileId, assetId, r2Key, dims?.w ?? null, dims?.h ?? null, buf.length, now],
        });
        // 更新 figures.avatar_url
        sqlStmts.push({
          sql: `UPDATE figures SET avatar_url = ? WHERE id = ?`,
          args: [`/api/asset/${r2Key}`, figId],
        });
      }
    }

    // 上传 bust
    if (hasBust) {
      const r2Key = `figures/${figId}/${STYLE_ID}/portrait/bust-default.webp`;
      const ok = r2Put(bustPath, r2Key, "image/webp");
      if (ok) {
        const buf = fs.readFileSync(bustPath);
        const dims = getImageDims(buf, "webp");
        const fileId = `${assetId}:portrait-bust:default`;
        sqlStmts.push({
          sql: `INSERT INTO asset_files (id, asset_id, asset_type, variant, r2_key, mime_type, width, height, size_bytes, sort_order, metadata, created_at) VALUES (?, ?, 'portrait-bust', 'default', ?, 'image/webp', ?, ?, ?, 0, NULL, ?) ON CONFLICT(id) DO UPDATE SET r2_key=excluded.r2_key, mime_type=excluded.mime_type, width=excluded.width, height=excluded.height, size_bytes=excluded.size_bytes`,
          args: [fileId, assetId, r2Key, dims?.w ?? null, dims?.h ?? null, buf.length, now],
        });
      }
    }

    // 确保 figure_assets 记录存在
    sqlStmts.unshift({
      sql: `INSERT INTO figure_assets (id, figure_id, style_id, is_default, creator, status, metadata, created_at, updated_at) VALUES (?, ?, 'classical', 1, 'trae-batch', 'active', NULL, ?, ?) ON CONFLICT(id) DO UPDATE SET status='active', updated_at=excluded.updated_at`,
      args: [assetId, figId, now, now],
    });

    // 执行 SQL
    try {
      await sqlBatch(sqlStmts, figId);
      process.stdout.write(" OK\n");
      success++;
    } catch (e) {
      process.stdout.write(` SQL失败: ${e.message?.slice(0, 60)}\n`);
      failed++;
      failedIds.push(figId);
    }

    // 每 50 个角色打印进度
    if ((i + 1) % 50 === 0) {
      console.log(`  --- 进度: ${i+1}/${needSync.length} (成功 ${success}, 失败 ${failed}) ---`);
    }
  }

  console.log("");
  console.log("=== 同步完成 ===");
  console.log(`成功: ${success}`);
  console.log(`失败: ${failed}`);
  if (failedIds.length > 0) {
    console.log(`失败角色: ${failedIds.join(", ")}`);
    fs.writeFileSync("/tmp/sync_failed.txt", failedIds.join("\n"));
    console.log(`失败列表已保存到 /tmp/sync_failed.txt`);
  }
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
