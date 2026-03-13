#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { buildLuizaIaAvatarPrompt } from './openai-brand-prompts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_MODEL = 'gpt-image-1.5';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'high';
const DEFAULT_OUTPUT_FORMAT = 'webp';
const DEFAULT_OUTPUT_COMPRESSION = 90;
const DEFAULT_OUTPUT = 'public/assets/generated/luiza-ia-avatar.webp';
const DEFAULT_BACKGROUND = 'opaque';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function printUsage() {
  console.log(`
Uso:
  node scripts/generate-luiza-ia-avatar.mjs [--dry-run] [--model gpt-image-1.5]

Opcoes:
  --dry-run                 Mostra configuracao e prompt sem chamar a API
  --model <name>            Modelo de imagem. Padrao: ${DEFAULT_MODEL}
  --size <size>             Tamanho da imagem. Padrao: ${DEFAULT_SIZE}
  --quality <quality>       Qualidade. Padrao: ${DEFAULT_QUALITY}
  --output <path>           Caminho do avatar gerado no projeto
  --background <mode>       Fundo da imagem. Padrao: ${DEFAULT_BACKGROUND}
  --help                    Exibe esta ajuda

Variaveis opcionais:
  OPENAI_IMAGE_MODEL
  OPENAI_IMAGE_SIZE
  OPENAI_IMAGE_QUALITY
  OPENAI_IMAGE_OUTPUT
  OPENAI_IMAGE_BACKGROUND
  `.trim());
}

function takeFlag(args, flagName) {
  const index = args.indexOf(flagName);
  if (index === -1) {
    return false;
  }

  args.splice(index, 1);
  return true;
}

function takeOption(args, optionName) {
  const index = args.indexOf(optionName);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`A opcao ${optionName} exige um valor.`);
  }

  args.splice(index, 2);
  return value;
}

function resolveProjectPath(value, fallback) {
  const relativePath = value || fallback;
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(projectRoot, relativePath);
}

function toRelativeProjectPath(targetPath) {
  return path.relative(projectRoot, targetPath) || '.';
}

function formatDateTime(timestampSeconds) {
  if (!timestampSeconds) {
    return null;
  }

  return new Date(timestampSeconds * 1000).toISOString();
}

loadDotEnv(path.resolve(projectRoot, '.env'));

const rawArgs = process.argv.slice(2);

if (takeFlag(rawArgs, '--help')) {
  printUsage();
  process.exit(0);
}

const dryRun = takeFlag(rawArgs, '--dry-run');
const model = takeOption(rawArgs, '--model') || process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;
const size = takeOption(rawArgs, '--size') || process.env.OPENAI_IMAGE_SIZE || DEFAULT_SIZE;
const quality =
  takeOption(rawArgs, '--quality') ||
  process.env.OPENAI_IMAGE_QUALITY ||
  DEFAULT_QUALITY;
const outputPath = resolveProjectPath(
  takeOption(rawArgs, '--output') || process.env.OPENAI_IMAGE_OUTPUT,
  DEFAULT_OUTPUT
);
const background =
  takeOption(rawArgs, '--background') ||
  process.env.OPENAI_IMAGE_BACKGROUND ||
  DEFAULT_BACKGROUND;

if (rawArgs.length > 0) {
  throw new Error(`Argumentos desconhecidos: ${rawArgs.join(', ')}`);
}

if (!['1024x1024', '1024x1536', '1536x1024', 'auto'].includes(size)) {
  throw new Error(
    'OPENAI_IMAGE_SIZE precisa ser 1024x1024, 1024x1536, 1536x1024 ou auto.'
  );
}

if (!['standard', 'low', 'medium', 'high', 'auto'].includes(quality)) {
  throw new Error(
    'OPENAI_IMAGE_QUALITY precisa ser standard, low, medium, high ou auto.'
  );
}

if (!['transparent', 'opaque', 'auto'].includes(background)) {
  throw new Error(
    'OPENAI_IMAGE_BACKGROUND precisa ser transparent, opaque ou auto.'
  );
}

const prompt = buildLuizaIaAvatarPrompt();
const outputDirectory = path.dirname(outputPath);
const outputBaseName = path.basename(outputPath, path.extname(outputPath));
const metadataPath = path.join(outputDirectory, `${outputBaseName}.json`);

console.log(`Projeto: ${projectRoot}`);
console.log(`Saida da imagem: ${toRelativeProjectPath(outputPath)}`);
console.log(`Saida da metadata: ${toRelativeProjectPath(metadataPath)}`);
console.log(`Modelo: ${model}`);
console.log(`Tamanho: ${size}`);
console.log(`Qualidade: ${quality}`);
console.log(`Fundo: ${background}`);

if (dryRun) {
  console.log('\nPrompt enviado ao modelo de imagem:\n');
  console.log(prompt);
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY nao foi encontrada. Configure a chave no .env ou nas variaveis de ambiente.'
  );
}

await fsp.mkdir(outputDirectory, { recursive: true });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log('\nGerando avatar...');
const response = await client.images.generate({
  model,
  prompt,
  size,
  quality,
  background,
  output_format: DEFAULT_OUTPUT_FORMAT,
  output_compression: DEFAULT_OUTPUT_COMPRESSION,
});

const image = response.data?.[0];
if (!image?.b64_json) {
  throw new Error('A API nao retornou a imagem em base64 como esperado.');
}

const imageBuffer = Buffer.from(image.b64_json, 'base64');
await fsp.writeFile(outputPath, imageBuffer);

const metadata = {
  generatedAt: new Date().toISOString(),
  project: 'luizamoneta.com.br',
  outputPath: toRelativeProjectPath(outputPath),
  prompt,
  model,
  size,
  quality,
  background,
  outputFormat: DEFAULT_OUTPUT_FORMAT,
  outputCompression: DEFAULT_OUTPUT_COMPRESSION,
  responseCreatedAt: formatDateTime(response.created),
  usage: response.usage ?? null,
};

await fsp.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

console.log('\nAvatar gerado com sucesso.');
console.log(`Imagem: ${toRelativeProjectPath(outputPath)}`);
console.log(`Metadata: ${toRelativeProjectPath(metadataPath)}`);
