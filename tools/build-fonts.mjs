#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cacheDir = path.join(repoRoot, '.cache', 'font-build');
const downloadDir = path.join(cacheDir, 'downloads');
const textDir = path.join(cacheDir, 'text');
const outputDir = path.join(repoRoot, 'source', 'assets', 'fonts');

const FONT_SOURCES = [
  {
    output: 'google-sans-flex-latin-subset.woff2',
    source: 'google-sans-flex-latin-ext-wght-normal.woff2',
    url: 'https://raw.githubusercontent.com/fontsource/font-files/main/fonts/variable/google-sans-flex/files/google-sans-flex-latin-ext-wght-normal.woff2',
    textFile: 'latin.txt'
  },
  {
    output: 'pingfang-sc-regular-subset.woff2',
    source: 'PingFangSC_Regular.otf',
    url: 'https://raw.githubusercontent.com/vzxxbacq/PingFang_Font_For_Linux/master/SC/PingFangSC_Regular.otf',
    textFile: 'zh-cn.txt'
  },
  {
    output: 'pingfang-sc-semibold-subset.woff2',
    source: 'PingFangSC_Semibold.otf',
    url: 'https://raw.githubusercontent.com/vzxxbacq/PingFang_Font_For_Linux/master/SC/PingFangSC_Semibold.otf',
    textFile: 'zh-cn.txt'
  },
  {
    output: 'pingfang-hk-regular-subset.woff2',
    source: 'PingFangHK-Regular.otf',
    url: 'https://raw.githubusercontent.com/vzxxbacq/PingFang_Font_For_Linux/master/HK/PingFangHK-Regular.otf',
    textFile: 'zh-tw.txt'
  },
  {
    output: 'pingfang-hk-semibold-subset.woff2',
    source: 'PingFangHK-Semibold.otf',
    url: 'https://raw.githubusercontent.com/vzxxbacq/PingFang_Font_For_Linux/master/HK/PingFangHK-Semibold.otf',
    textFile: 'zh-tw.txt'
  }
];

const LATIN_UI_TEXT = `
Akari
Home Archives About Search GitHub
Choose Your Language
Notes, fragments, and a little light left behind.
Enter Akari in Simplified Chinese, Traditional Chinese, English, or Japanese.
This is Akari's personal blog, a place for essays, fragments, and passing thoughts.
I hope these quiet sentences can keep a little light from going out.
`;

const ZH_CN_UI_TEXT = `
Akari
简体中文 首页 归档 关于 搜索 选择语言 GitHub
写一点字，留一点光。
这里是 Akari 的个人博客，写一些文字、片段与想法。
愿这些安静的句子，也能替我留住一点光。
`;

const ZH_TW_UI_TEXT = `
Akari
繁體中文 首頁 歸檔 關於 搜尋 選擇語言 GitHub
寫一點字，留一點光。
這裡是 Akari 的個人部落格，寫一些文字、片段與念頭。
願這些安靜的句子，也能替我留住一點光。
`;

async function ensureDirectory(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function ensureDownloaded(font) {
  const destination = path.join(downloadDir, font.source);

  try {
    await fs.access(destination);
  } catch {
    console.log(`Downloading ${font.source}`);
    await download(font.url, destination);
  }

  return destination;
}

async function collectFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'assets') {
      continue;
    }

    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function readFiles(files) {
  const chunks = await Promise.all(files.map(file => fs.readFile(file, 'utf8')));
  return chunks.join('\n');
}

function uniqueCharacters(text) {
  return [...new Set(Array.from(text))].join('');
}

function pickCharacters(text, expression) {
  return uniqueCharacters((text.match(expression) || []).join(''));
}

async function buildTextSources() {
  const postDir = path.join(repoRoot, 'source', '_posts');
  const zhCnPageDir = path.join(repoRoot, 'source', 'zh-cn');
  const zhTwPageDir = path.join(repoRoot, 'source', 'zh-tw');
  const enPageDir = path.join(repoRoot, 'source', 'en');
  const rootPage = path.join(repoRoot, 'source', 'index.md');

  const allPostFiles = await collectFiles(postDir);
  const zhCnFiles = allPostFiles.filter(file => file.endsWith('.zh-cn.md')).concat(await collectFiles(zhCnPageDir));
  const zhTwFiles = allPostFiles.filter(file => file.endsWith('.zh-tw.md')).concat(await collectFiles(zhTwPageDir));
  const enFiles = allPostFiles.filter(file => file.endsWith('.en.md')).concat(await collectFiles(enPageDir), rootPage);

  const [zhCnText, zhTwText, enText] = await Promise.all([
    readFiles(zhCnFiles),
    readFiles(zhTwFiles),
    readFiles(enFiles)
  ]);

  const latinText = pickCharacters(`${enText}\n${LATIN_UI_TEXT}`, /[\u0000-\u00FF\u0100-\u024F\u1E00-\u1EFF\u2000-\u206F]/gu);
  const simplifiedText = pickCharacters(`${zhCnText}\n${ZH_CN_UI_TEXT}`, /[\p{Script=Han}A-Za-z0-9\u3000-\u303F\uFF00-\uFFEF。，、！？：；「」『』（）《》〈〉……·“”‘’—\s.,;:!?"'()\-]/gu);
  const traditionalText = pickCharacters(`${zhTwText}\n${ZH_TW_UI_TEXT}`, /[\p{Script=Han}A-Za-z0-9\u3000-\u303F\uFF00-\uFFEF。，、！？：；「」『』（）《》〈〉……·“”‘’—\s.,;:!?"'()\-]/gu);

  await Promise.all([
    fs.writeFile(path.join(textDir, 'latin.txt'), latinText),
    fs.writeFile(path.join(textDir, 'zh-cn.txt'), simplifiedText),
    fs.writeFile(path.join(textDir, 'zh-tw.txt'), traditionalText)
  ]);
}

function subsetFont(inputFile, outputFile, textFile) {
  const result = spawnSync('pyftsubset', [
    inputFile,
    `--text-file=${textFile}`,
    `--output-file=${outputFile}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--no-hinting'
  ], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`pyftsubset failed for ${path.basename(outputFile)}`);
  }
}

function hasSubsetTool() {
  const result = spawnSync('pyftsubset', ['--help'], {
    cwd: repoRoot,
    stdio: 'ignore'
  });

  return !result.error && result.status === 0;
}

async function getMissingOutputs() {
  const missing = [];

  for (const font of FONT_SOURCES) {
    const outputFile = path.join(outputDir, font.output);

    if (!await fileExists(outputFile)) {
      missing.push(font.output);
    }
  }

  return missing;
}

async function main() {
  await Promise.all([
    ensureDirectory(downloadDir),
    ensureDirectory(textDir),
    ensureDirectory(outputDir)
  ]);

  if (!hasSubsetTool()) {
    const missingOutputs = await getMissingOutputs();

    if (missingOutputs.length === 0) {
      console.log('pyftsubset is unavailable; reusing committed font assets.');
      return;
    }

    throw new Error(
      `pyftsubset is unavailable and the following committed font assets are missing: ${missingOutputs.join(', ')}`
    );
  }

  await buildTextSources();

  for (const font of FONT_SOURCES) {
    const inputFile = await ensureDownloaded(font);
    const outputFile = path.join(outputDir, font.output);
    const textFile = path.join(textDir, font.textFile);

    console.log(`Subsetting ${font.output}`);
    subsetFont(inputFile, outputFile, textFile);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
