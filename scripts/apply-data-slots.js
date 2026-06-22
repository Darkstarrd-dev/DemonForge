/**
 * 应用 workflow 返回的 data-slot 编辑结果
 *
 * 用法：node scripts/apply-data-slots.js <workflow-result.json>
 */

const fs = require('fs');
const path = require('path');

function applyEdits(filePath, edits) {
  console.log(`\n处理文件: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ 文件不存在: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (let i = 0; i < edits.length; i++) {
    const { old, new: newCode } = edits[i];

    if (!content.includes(old)) {
      console.warn(`  ⚠️ 编辑 ${i + 1}/${edits.length}: 未找到匹配的代码片段`);
      console.warn(`    查找: ${old.slice(0, 80)}...`);
      continue;
    }

    content = content.replace(old, newCode);
    modified = true;
    console.log(`  ✓ 编辑 ${i + 1}/${edits.length}: 已应用`);
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✅ 文件已保存`);
    return true;
  } else {
    console.log(`  ℹ️ 无修改`);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('用法: node scripts/apply-data-slots.js <workflow-result.json>');
    console.error('或者直接传入 JSON 对象（从 workflow 结果复制）');
    process.exit(1);
  }

  let result;

  // 尝试作为文件路径读取
  if (fs.existsSync(args[0])) {
    console.log(`读取文件: ${args[0]}`);
    result = JSON.parse(fs.readFileSync(args[0], 'utf-8'));
  } else {
    // 尝试作为 JSON 字符串解析
    try {
      result = JSON.parse(args[0]);
    } catch (e) {
      console.error('无法解析输入为 JSON:', e.message);
      process.exit(1);
    }
  }

  console.log('='.repeat(60));
  console.log('开始应用 data-slot 修改');
  console.log('='.repeat(60));

  let totalFiles = 0;
  let modifiedFiles = 0;

  // 处理 m1 模块
  if (result.m1 && Array.isArray(result.m1)) {
    for (const module of result.m1) {
      if (module && module.file && module.edits) {
        totalFiles++;
        if (applyEdits(module.file, module.edits)) {
          modifiedFiles++;
        }
      }
    }
  }

  // 处理核心模块
  if (result.core && Array.isArray(result.core)) {
    for (const module of result.core) {
      if (module && module.file && module.edits) {
        totalFiles++;
        if (applyEdits(module.file, module.edits)) {
          modifiedFiles++;
        }
      }
    }
  }

  // 处理辅助模块
  if (result.utility && Array.isArray(result.utility)) {
    for (const module of result.utility) {
      if (module && module.file && module.edits) {
        totalFiles++;
        if (applyEdits(module.file, module.edits)) {
          modifiedFiles++;
        }
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`完成: ${modifiedFiles}/${totalFiles} 个文件已修改`);
  console.log('='.repeat(60));

  if (result.summary) {
    console.log('\n摘要:');
    console.log(`  总模块数: ${result.summary.totalModules}`);
    console.log(`  完成数: ${result.summary.completed}`);
  }
}

main();
