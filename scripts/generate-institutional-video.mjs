#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import {
  buildInstitutionalVideoPrompt,
  getSupportedVideoFocuses,
} from './openai-brand-prompts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_MODEL = 'sora-2';
const DEFAULT_SECONDS = '4';
const DEFAULT_SIZE = '720x1280';
const DEFAULT_FOCUS = 'institucional';
const DEFAULT_OUTPUT = 'public/assets/generated/luizamoneta-institucional.mp4';
const DEFAULT_REFERENCES = {
  '720x1280': 'public/assets/generated/brand-reference-720x1280.png',
  '1280x720': 'public/assets/generated/brand-reference-1280x720.png',
  '1024x1792': 'public/assets/generated/brand-reference-1024x1792.png',
  '1792x1024': 'public/assets/generated/brand-reference-1792x1024.png',
};
const DEFAULT_FOCUS_REFERENCE_OVERRIDES = {
  institucional: {
    '720x1280': 'public/assets/generated/agendamento-reference-720x1280.png',
  },
};
const DEFAULT_CLOSING_ARTS = {
  '720x1280': 'public/assets/generated/video-closing-art-720x1280.png',
  '1024x1792': 'public/assets/generated/video-closing-art-1024x1792.png',
};
const DEFAULT_POLL_INTERVAL_MS = 15000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_CLOSING_ART_SECONDS = 2;
const SUPPORTED_MODELS = ['sora-2', 'sora-2-pro'];
const SUPPORTED_SIZES = ['720x1280', '1280x720', '1024x1792', '1792x1024'];
const PRO_ONLY_SIZES = ['1792x1024'];
const SUPPORTED_FOCUSES = getSupportedVideoFocuses();

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
  node scripts/generate-institutional-video.mjs [--dry-run] [--model sora-2] [--seconds 4] [--size 720x1280]

Opcoes:
  --dry-run              Mostra configuracao, prompt e caminhos sem chamar a API
  --model <name>         Modelo de video. Opcoes: ${SUPPORTED_MODELS.join(', ')}. Padrao: ${DEFAULT_MODEL}
  --focus <name>         Direcao do video. Opcoes: ${SUPPORTED_FOCUSES.join(', ')}. Padrao: ${DEFAULT_FOCUS}
  --seconds <4|8|12>     Duracao do video. Padrao: ${DEFAULT_SECONDS}
  --size <WxH>           Resolucao. Padrao: ${DEFAULT_SIZE}
                         Retrato: 1024x1792
                         Paisagem: 1792x1024 (apenas com sora-2-pro)
  --output <path>        Caminho do MP4 gerado no projeto
  --reference <path>     Imagem de referencia opcional para guiar identidade visual
  --no-reference         Desabilita o envio da imagem de referencia
  --closing-art <path>   Arte final opcional para o fechamento oficial em pos-producao
  --no-closing-art       Desabilita a arte final oficial
  --poll-interval <ms>   Intervalo de polling da geracao
  --timeout <ms>         Tempo maximo de espera
  --help                 Exibe esta ajuda

Variaveis opcionais:
  OPENAI_VIDEO_MODEL
  OPENAI_VIDEO_FOCUS
  OPENAI_VIDEO_SECONDS
  OPENAI_VIDEO_SIZE
  OPENAI_VIDEO_OUTPUT
  OPENAI_VIDEO_REFERENCE
  OPENAI_VIDEO_CLOSING_ART
  OPENAI_VIDEO_POLL_INTERVAL_MS
  OPENAI_VIDEO_TIMEOUT_MS
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

function parseNumber(value, fallback, fieldName) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} precisa ser um numero positivo.`);
  }

  return parsed;
}

function resolveProjectPath(value, fallback) {
  const relativePath = value || fallback;
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(projectRoot, relativePath);
}

function getDefaultReferenceFor({ size, focus }) {
  const focusOverrides = DEFAULT_FOCUS_REFERENCE_OVERRIDES[focus] || {};
  return (
    focusOverrides[size] ||
    DEFAULT_REFERENCES[size] ||
    DEFAULT_REFERENCES[DEFAULT_SIZE]
  );
}

function isKnownDefaultReference(value) {
  return [
    ...Object.values(DEFAULT_REFERENCES),
    ...Object.values(DEFAULT_FOCUS_REFERENCE_OVERRIDES).flatMap((entry) =>
      Object.values(entry)
    ),
  ].includes(value);
}

function getDefaultClosingArtForSize(size) {
  return DEFAULT_CLOSING_ARTS[size] || null;
}

function isKnownDefaultClosingArt(value) {
  return Object.values(DEFAULT_CLOSING_ARTS).includes(value);
}

function parseVideoSize(size) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return null;
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function readJpegDimensions(buffer) {
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);

    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    if (!segmentLength || segmentLength < 2) {
      break;
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer) {
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);

  if (riff !== 'RIFF' || webp !== 'WEBP') {
    return null;
  }

  const chunkType = buffer.toString('ascii', 12, 16);

  if (chunkType === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunkType === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

async function getImageDimensions(filePath) {
  const buffer = await fsp.readFile(filePath);

  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return readJpegDimensions(buffer);
  }

  return readWebpDimensions(buffer);
}

function toRelativeProjectPath(targetPath) {
  return path.relative(projectRoot, targetPath) || '.';
}

function sanitizeFilePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildVersionSuffix({ date, model, seconds, size }) {
  const isoStamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-');

  return [
    isoStamp,
    sanitizeFilePart(model),
    `${sanitizeFilePart(seconds)}s`,
    sanitizeFilePart(size),
  ].join('-');
}

function formatDateTime(timestampSeconds) {
  if (!timestampSeconds) {
    return null;
  }

  return new Date(timestampSeconds * 1000).toISOString();
}

function getContentExtension(contentType) {
  const normalized = (contentType || '').toLowerCase();

  if (normalized.includes('image/')) {
    if (normalized.includes('png')) {
      return '.png';
    }

    if (normalized.includes('jpeg') || normalized.includes('jpg')) {
      return '.jpg';
    }

    if (normalized.includes('webp')) {
      return '.webp';
    }
  }

  if (normalized.includes('application/octet-stream')) {
    return '.mp4';
  }

  if (normalized.includes('video/')) {
    return '.mp4';
  }

  return '';
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} falhou com codigo ${code}.\n${stderr || stdout}`.trim()
        )
      );
    });
  });
}

async function getVideoDurationSeconds(filePath) {
  const { stdout } = await runProcess('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);

  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Nao foi possivel determinar a duracao do video em ${toRelativeProjectPath(filePath)}.`
    );
  }

  return duration;
}

async function composeVideoWithClosingArt({
  sourceVideoPath,
  closingArtPath,
  outputPath,
  size,
  closingArtSeconds,
}) {
  const dimensions = parseVideoSize(size);
  if (!dimensions) {
    throw new Error(`Resolucao invalida para composicao final: ${size}.`);
  }

  const sourceDuration = await getVideoDurationSeconds(sourceVideoPath);
  const artDuration = Math.min(closingArtSeconds, Math.max(sourceDuration - 0.25, 0.5));
  const keepDuration = Math.max(sourceDuration - artDuration, 0.25);

  const filter = [
    `[0:v]scale=${dimensions.width}:${dimensions.height},fps=25,format=yuv420p,trim=duration=${keepDuration.toFixed(3)},setpts=PTS-STARTPTS[v0]`,
    `[1:v]scale=${dimensions.width}:${dimensions.height},fps=25,format=yuv420p,trim=duration=${artDuration.toFixed(3)},setpts=PTS-STARTPTS[v1]`,
    '[v0][v1]concat=n=2:v=1:a=0[v]',
  ].join(';');

  await runProcess('ffmpeg', [
    '-y',
    '-i',
    sourceVideoPath,
    '-loop',
    '1',
    '-t',
    artDuration.toFixed(3),
    '-i',
    closingArtPath,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-c:a',
    'copy',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-shortest',
    outputPath,
  ]);

  return {
    sourceDuration,
    keepDuration,
    artDuration,
    finalDuration: keepDuration + artDuration,
  };
}

async function pollVideo(client, videoId, pollIntervalMs, timeoutMs) {
  const startedAt = Date.now();
  let lastSummary = '';

  while (Date.now() - startedAt < timeoutMs) {
    const video = await client.videos.retrieve(videoId);
    const summary = `${video.status}:${video.progress}`;

    if (summary !== lastSummary) {
      console.log(
        `[video ${video.id}] status=${video.status} progress=${video.progress}%`
      );
      lastSummary = summary;
    }

    if (video.status === 'completed') {
      return video;
    }

    if (video.status === 'failed') {
      const reason = video.error?.message || 'Falha sem detalhe retornado.';
      throw new Error(`A geracao do video falhou: ${reason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `A geracao nao concluiu dentro de ${Math.round(timeoutMs / 1000)} segundos.`
  );
}

loadDotEnv(path.resolve(projectRoot, '.env'));

const rawArgs = process.argv.slice(2);

if (takeFlag(rawArgs, '--help')) {
  printUsage();
  process.exit(0);
}

const dryRun = takeFlag(rawArgs, '--dry-run');
const disableReference = takeFlag(rawArgs, '--no-reference');
const disableClosingArt = takeFlag(rawArgs, '--no-closing-art');
const model = takeOption(rawArgs, '--model') || process.env.OPENAI_VIDEO_MODEL || DEFAULT_MODEL;
const focus = takeOption(rawArgs, '--focus') || process.env.OPENAI_VIDEO_FOCUS || DEFAULT_FOCUS;
const seconds =
  takeOption(rawArgs, '--seconds') || process.env.OPENAI_VIDEO_SECONDS || DEFAULT_SECONDS;
const size = takeOption(rawArgs, '--size') || process.env.OPENAI_VIDEO_SIZE || DEFAULT_SIZE;
const referenceOption = takeOption(rawArgs, '--reference');
const closingArtOption = takeOption(rawArgs, '--closing-art');
const envReference = process.env.OPENAI_VIDEO_REFERENCE;
const envClosingArt = process.env.OPENAI_VIDEO_CLOSING_ART;
const resolvedReferenceSetting =
  referenceOption ||
  (envReference && !isKnownDefaultReference(envReference)
    ? envReference
    : getDefaultReferenceFor({ size, focus }));
const resolvedClosingArtSetting =
  closingArtOption ||
  (envClosingArt && !isKnownDefaultClosingArt(envClosingArt)
    ? envClosingArt
    : getDefaultClosingArtForSize(size));
const outputPath = resolveProjectPath(
  takeOption(rawArgs, '--output') || process.env.OPENAI_VIDEO_OUTPUT,
  DEFAULT_OUTPUT
);
const referencePath = disableReference
  ? null
  : resolveProjectPath(
      resolvedReferenceSetting,
      getDefaultReferenceFor({ size, focus })
    );
const closingArtPath = disableClosingArt || !resolvedClosingArtSetting
  ? null
  : resolveProjectPath(resolvedClosingArtSetting, getDefaultClosingArtForSize(size));
const pollIntervalMs = parseNumber(
  takeOption(rawArgs, '--poll-interval') || process.env.OPENAI_VIDEO_POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  'poll interval'
);
const timeoutMs = parseNumber(
  takeOption(rawArgs, '--timeout') || process.env.OPENAI_VIDEO_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  'timeout'
);

if (rawArgs.length > 0) {
  throw new Error(`Argumentos desconhecidos: ${rawArgs.join(', ')}`);
}

if (!['4', '8', '12'].includes(seconds)) {
  throw new Error('OPENAI_VIDEO_SECONDS precisa ser 4, 8 ou 12.');
}

if (!SUPPORTED_MODELS.includes(model)) {
  throw new Error(`OPENAI_VIDEO_MODEL precisa ser um destes: ${SUPPORTED_MODELS.join(', ')}.`);
}

if (!SUPPORTED_FOCUSES.includes(focus)) {
  throw new Error(`OPENAI_VIDEO_FOCUS precisa ser um destes: ${SUPPORTED_FOCUSES.join(', ')}.`);
}

if (!SUPPORTED_SIZES.includes(size)) {
  throw new Error(
    `OPENAI_VIDEO_SIZE precisa ser ${SUPPORTED_SIZES.join(', ')}.`
  );
}

if (PRO_ONLY_SIZES.includes(size) && model !== 'sora-2-pro') {
  throw new Error(
    `A resolucao ${size} exige o modelo sora-2-pro. Use --model sora-2-pro ou escolha outra resolucao.`
  );
}

const outputDirectory = path.dirname(outputPath);
const outputBaseName = path.basename(outputPath, path.extname(outputPath));
const outputExtension = path.extname(outputPath);
const metadataPath = path.join(outputDirectory, `${outputBaseName}.json`);
const sourceOutputPath = path.join(
  outputDirectory,
  `${outputBaseName}-source${outputExtension}`
);
const runStartedAt = new Date();
const versionSuffix = buildVersionSuffix({
  date: runStartedAt,
  model,
  seconds,
  size,
});
const versionedOutputPath = path.join(
  outputDirectory,
  `${outputBaseName}-${versionSuffix}${outputExtension}`
);
const versionedSourceOutputPath = path.join(
  outputDirectory,
  `${outputBaseName}-${versionSuffix}-source${outputExtension}`
);
const versionedMetadataPath = path.join(
  outputDirectory,
  `${outputBaseName}-${versionSuffix}.json`
);

let referenceExists = false;
let referenceUsable = false;
let referenceDimensions = null;
if (referencePath) {
  referenceExists = fs.existsSync(referencePath);
  if (!referenceExists) {
    console.warn(
      `Imagem de referencia nao encontrada em ${toRelativeProjectPath(referencePath)}. O video sera gerado sem referencia visual.`
    );
  } else {
    const expectedSize = parseVideoSize(size);
    referenceDimensions = await getImageDimensions(referencePath);

    if (!referenceDimensions) {
      console.warn(
        `Nao consegui ler as dimensoes de ${toRelativeProjectPath(referencePath)}. O video sera gerado sem referencia visual.`
      );
    } else if (
      expectedSize &&
      (referenceDimensions.width !== expectedSize.width ||
        referenceDimensions.height !== expectedSize.height)
    ) {
      console.warn(
        `A referencia ${toRelativeProjectPath(referencePath)} tem ${referenceDimensions.width}x${referenceDimensions.height}, mas o video exige ${expectedSize.width}x${expectedSize.height}. O video sera gerado sem referencia visual.`
      );
    } else {
      referenceUsable = true;
    }
  }
}

let closingArtExists = false;
let closingArtUsable = false;
let closingArtDimensions = null;
if (closingArtPath) {
  closingArtExists = fs.existsSync(closingArtPath);
  if (!closingArtExists) {
    console.warn(
      `Arte final nao encontrada em ${toRelativeProjectPath(closingArtPath)}. O prompt seguira sem arte oficial de fechamento.`
    );
  } else {
    const expectedSize = parseVideoSize(size);
    closingArtDimensions = await getImageDimensions(closingArtPath);

    if (!closingArtDimensions) {
      console.warn(
        `Nao consegui ler as dimensoes de ${toRelativeProjectPath(closingArtPath)}. O prompt seguira sem arte oficial de fechamento.`
      );
    } else if (
      expectedSize &&
      (closingArtDimensions.width !== expectedSize.width ||
        closingArtDimensions.height !== expectedSize.height)
    ) {
      console.warn(
        `A arte final ${toRelativeProjectPath(closingArtPath)} tem ${closingArtDimensions.width}x${closingArtDimensions.height}, mas o video exige ${expectedSize.width}x${expectedSize.height}. O prompt seguira sem arte oficial de fechamento.`
      );
    } else {
      closingArtUsable = true;
    }
  }
}

const prompt = buildInstitutionalVideoPrompt({
  seconds,
  hasReference: referenceUsable,
  hasClosingArt: closingArtUsable,
  focus,
});

console.log(`Projeto: ${projectRoot}`);
console.log(`Saida versionada do video: ${toRelativeProjectPath(versionedOutputPath)}`);
console.log(`Alias latest do video: ${toRelativeProjectPath(outputPath)}`);
console.log(`Saida versionada do video-base: ${toRelativeProjectPath(versionedSourceOutputPath)}`);
console.log(`Alias latest do video-base: ${toRelativeProjectPath(sourceOutputPath)}`);
console.log(`Saida versionada da metadata: ${toRelativeProjectPath(versionedMetadataPath)}`);
console.log(`Alias latest da metadata: ${toRelativeProjectPath(metadataPath)}`);
console.log(`Modelo: ${model}`);
console.log(`Foco: ${focus}`);
console.log(`Duracao: ${seconds}s`);
console.log(`Resolucao: ${size}`);
console.log(
  `Referencia visual: ${
    referenceUsable && referencePath
      ? toRelativeProjectPath(referencePath)
      : 'nenhuma'
  }`
);
console.log(
  `Arte final oficial: ${
    closingArtUsable && closingArtPath
      ? toRelativeProjectPath(closingArtPath)
      : 'nenhuma'
  }`
);

if (dryRun) {
  console.log('\nPrompt enviado ao Sora 2:\n');
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

const createParams = {
  model,
  seconds,
  size,
  prompt,
};

let uploadedReferenceFile = null;

if (referenceUsable && referencePath) {
  console.log('\nEnviando imagem de referencia...');
  uploadedReferenceFile = await client.files.create({
    file: fs.createReadStream(referencePath),
    purpose: 'vision',
  });

  createParams.input_reference = { file_id: uploadedReferenceFile.id };
}

console.log('\nCriando job de video...');
const createdVideo = await client.videos.create(createParams);
console.log(`[video ${createdVideo.id}] status=${createdVideo.status}`);

const completedVideo = await pollVideo(
  client,
  createdVideo.id,
  pollIntervalMs,
  timeoutMs
);

console.log('\nBaixando MP4 final...');
const response = await client.videos.downloadContent(completedVideo.id);

if (!response.ok) {
  throw new Error(`Falha ao baixar o video final. HTTP ${response.status}.`);
}

const arrayBuffer = await response.arrayBuffer();
await fsp.writeFile(versionedSourceOutputPath, Buffer.from(arrayBuffer));
await fsp.copyFile(versionedSourceOutputPath, sourceOutputPath);

let closingArtComposition = null;

if (closingArtUsable) {
  console.log('\nCompondo video final com a arte oficial de fechamento...');
  closingArtComposition = await composeVideoWithClosingArt({
    sourceVideoPath: versionedSourceOutputPath,
    closingArtPath,
    outputPath: versionedOutputPath,
    size,
    closingArtSeconds: DEFAULT_CLOSING_ART_SECONDS,
  });
  await fsp.copyFile(versionedOutputPath, outputPath);
} else {
  await fsp.copyFile(versionedSourceOutputPath, versionedOutputPath);
  await fsp.copyFile(versionedOutputPath, outputPath);
}

const metadata = {
  generatedAt: new Date().toISOString(),
  project: 'luizamoneta.com.br',
  outputPath: toRelativeProjectPath(outputPath),
  versionedOutputPath: toRelativeProjectPath(versionedOutputPath),
  sourceOutputPath: toRelativeProjectPath(sourceOutputPath),
  versionedSourceOutputPath: toRelativeProjectPath(versionedSourceOutputPath),
  metadataPath: toRelativeProjectPath(metadataPath),
  versionedMetadataPath: toRelativeProjectPath(versionedMetadataPath),
  referencePath:
    referenceUsable && referencePath
      ? toRelativeProjectPath(referencePath)
      : null,
  closingArtPath:
    closingArtUsable && closingArtPath
      ? toRelativeProjectPath(closingArtPath)
      : null,
  uploadedReferenceFileId: uploadedReferenceFile?.id ?? null,
  referenceDimensions,
  closingArtDimensions,
  closingArtApplied: Boolean(closingArtComposition),
  closingArtComposition,
  prompt,
  video: {
    id: completedVideo.id,
    status: completedVideo.status,
    model: completedVideo.model,
    size: completedVideo.size,
    seconds: completedVideo.seconds,
    progress: completedVideo.progress,
    createdAt: formatDateTime(completedVideo.created_at),
    completedAt: formatDateTime(completedVideo.completed_at),
    expiresAt: formatDateTime(completedVideo.expires_at),
    remixedFromVideoId: completedVideo.remixed_from_video_id,
  },
};

await fsp.writeFile(versionedMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
await fsp.copyFile(versionedMetadataPath, metadataPath);

const thumbnailResponse = await client.videos.downloadContent(completedVideo.id, {
  variant: 'thumbnail',
});

if (thumbnailResponse.ok) {
  const thumbnailExtension = getContentExtension(
    thumbnailResponse.headers.get('content-type')
  );
  const thumbnailPath = path.join(
    outputDirectory,
    `${outputBaseName}-thumbnail${thumbnailExtension || '.png'}`
  );
  const versionedThumbnailPath = path.join(
    outputDirectory,
    `${outputBaseName}-${versionSuffix}-thumbnail${thumbnailExtension || '.png'}`
  );
  const thumbnailArrayBuffer = await thumbnailResponse.arrayBuffer();
  await fsp.writeFile(versionedThumbnailPath, Buffer.from(thumbnailArrayBuffer));
  await fsp.copyFile(versionedThumbnailPath, thumbnailPath);
  console.log(`Thumbnail versionada salva em ${toRelativeProjectPath(versionedThumbnailPath)}`);
  console.log(`Thumbnail latest salva em ${toRelativeProjectPath(thumbnailPath)}`);
}

console.log('\nVideo gerado com sucesso.');
console.log(`MP4 base versionado: ${toRelativeProjectPath(versionedSourceOutputPath)}`);
console.log(`MP4 base latest: ${toRelativeProjectPath(sourceOutputPath)}`);
console.log(`MP4 versionado: ${toRelativeProjectPath(versionedOutputPath)}`);
console.log(`MP4 latest: ${toRelativeProjectPath(outputPath)}`);
console.log(`Metadata versionada: ${toRelativeProjectPath(versionedMetadataPath)}`);
console.log(`Metadata latest: ${toRelativeProjectPath(metadataPath)}`);
