/**
 * FAhubX Backend Code Obfuscation Script
 *
 * Selectively obfuscates sensitive backend files to protect license
 * validation, machine fingerprinting, and subscription enforcement logic.
 *
 * Usage: node obfuscate.js [--backend-dist <path>]
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Files to obfuscate (relative to backend/dist/)
const TARGET_FILES = [
  'modules/license/license.service.js',
  'modules/license/machine-id.util.js',
  'common/guards/subscription.guard.js',
  'modules/simple-tasks/task-auto-runner.service.js',
];

// Obfuscation config - tuned for NestJS compatibility
const OBFUSCATION_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,             // false: would break Node.js debugging
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,               // false: NestJS DI relies on class names
  selfDefending: false,               // false: breaks in strict mode
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,         // false: TypeORM/API keys must survive
  unicodeEscapeSequence: false,
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
};

function getBackendDistPath() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--backend-dist');
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return path.join(__dirname, '..', 'backend', 'dist');
}

function obfuscateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  [SKIP] File not found: ${filePath}`);
    return false;
  }

  const code = fs.readFileSync(filePath, 'utf-8');
  const originalSize = Buffer.byteLength(code, 'utf-8');

  console.log(`  [OBFUSCATE] ${path.basename(filePath)} (${(originalSize / 1024).toFixed(1)} KB)`);

  const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATION_OPTIONS);
  const obfuscatedCode = result.getObfuscatedCode();
  const newSize = Buffer.byteLength(obfuscatedCode, 'utf-8');

  fs.writeFileSync(filePath, obfuscatedCode, 'utf-8');

  // Delete source map if exists
  const mapFile = filePath + '.map';
  if (fs.existsSync(mapFile)) {
    fs.unlinkSync(mapFile);
    console.log(`  [DELETE] ${path.basename(mapFile)}`);
  }

  // Also remove sourceMapping comment from obfuscated file
  const finalCode = obfuscatedCode.replace(/\/\/# sourceMappingURL=.*$/gm, '');
  if (finalCode !== obfuscatedCode) {
    fs.writeFileSync(filePath, finalCode, 'utf-8');
  }

  console.log(`  [DONE]  ${(originalSize / 1024).toFixed(1)} KB -> ${(newSize / 1024).toFixed(1)} KB (${((newSize / originalSize) * 100).toFixed(0)}%)`);
  return true;
}

function main() {
  const distPath = getBackendDistPath();

  console.log('========================================');
  console.log('  FAhubX Code Obfuscation');
  console.log('========================================');
  console.log(`Backend dist: ${distPath}`);
  console.log('');

  if (!fs.existsSync(distPath)) {
    console.error(`ERROR: Backend dist directory not found: ${distPath}`);
    console.error('Run "npx nest build" first.');
    process.exit(1);
  }

  let successCount = 0;
  let skipCount = 0;

  for (const relPath of TARGET_FILES) {
    const fullPath = path.join(distPath, relPath);
    if (obfuscateFile(fullPath)) {
      successCount++;
    } else {
      skipCount++;
    }
  }

  console.log('');
  console.log(`Obfuscation complete: ${successCount} files processed, ${skipCount} skipped`);
  console.log('========================================');

  if (successCount === 0) {
    console.error('WARNING: No files were obfuscated!');
    process.exit(1);
  }
}

main();
