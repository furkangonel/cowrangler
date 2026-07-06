import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, 'src');
const distDir = path.resolve(__dirname, 'dist');

// 1. Copy i18n messages
fs.mkdirSync(path.join(distDir, 'i18n', 'messages'), { recursive: true });
const messagesSrc = path.join(srcDir, 'i18n', 'messages');
const messagesDest = path.join(distDir, 'i18n', 'messages');
if (fs.existsSync(messagesSrc)) {
  const files = fs.readdirSync(messagesSrc);
  for (const file of files) {
    if (file.endsWith('.json')) {
      fs.copyFileSync(path.join(messagesSrc, file), path.join(messagesDest, file));
    }
  }
}

// 2. Copy sandbox bundle recursively
const sandboxSrc = path.join(srcDir, 'cowrangler-sandbox.bundle');
const sandboxDest = path.join(distDir, 'cowrangler-sandbox.bundle');
if (fs.existsSync(sandboxSrc)) {
  fs.cpSync(sandboxSrc, sandboxDest, { recursive: true, force: true });
}

// 3. Copy providers.json
fs.mkdirSync(path.join(distDir, 'model'), { recursive: true });
const providersSrc = path.join(srcDir, 'model', 'providers.json');
const providersDest = path.join(distDir, 'model', 'providers.json');
if (fs.existsSync(providersSrc)) {
  fs.copyFileSync(providersSrc, providersDest);
}

console.log('✅ Core assets copied successfully.');
