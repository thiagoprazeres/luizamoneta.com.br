import type { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import {
  buildRichFinalReply,
  canFinalizePreAtendimento,
  formatWhatsapp,
  hasValidReturnContact,
  isValidEmail,
  isValidWhatsapp,
  normalizeText,
  resolveCoverageSummary,
  type ChatApiRequest,
  type ChatApiMessage,
  type ChatApiResponse,
  type PatientProfile,
  type TriageSummary,
} from '../../src/app/pre-atendimento-summary';

const MODEL_FALLBACK = 'gpt-5-nano';
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const SAFETY_KEYWORDS = [
  'desmaio',
  'dor no peito',
  'falta de ar',
  'perda de forca',
  'fraqueza subita',
  'rosto torto',
  'fala enrolada',
  'convuls',
  'avc',
  'queda com batida na cabeca',
  'trauma grave',
  'perda subita da visao',
];

export const FINAL_REPLY_MAX_LENGTH = 1400;

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function createEmptyPatientProfile(): PatientProfile {
  return {
    nome: '',
    idade: '',
    regiao: '',
    sintomas: '',
    detalhesDoCaso: '',
    email: '',
    whatsapp: '',
  };
}

function createEmptyTriageSummary(): TriageSummary {
  return {
    especialidadeRelacionada: '',
    hipoteseInicial: '',
    explicacao: '',
    abordagemProativa: '',
    cobertura: '',
    horarios: '',
    observacaoFinal: '',
  };
}

function normalizeForSearch(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function removeAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sanitizePatient(value: unknown): PatientProfile {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<PatientProfile>)
      : createEmptyPatientProfile();

  const email = normalizeText(source.email);
  const whatsapp = normalizeText(source.whatsapp);

  return {
    nome: normalizeText(source.nome),
    idade: normalizeText(source.idade),
    regiao: normalizeText(source.regiao),
    sintomas: normalizeText(source.sintomas),
    detalhesDoCaso: normalizeText(source.detalhesDoCaso),
    email: isValidEmail(email) ? email : '',
    whatsapp: isValidWhatsapp(whatsapp) ? formatWhatsapp(whatsapp) : '',
  };
}

function sanitizeMessages(messages: unknown): ChatApiMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const candidate = message as { role?: unknown; content?: unknown };
      const role: ChatApiMessage['role'] =
        candidate.role === 'assistant' ? 'assistant' : 'user';
      const content = normalizeText(candidate.content);
      return content ? { role, content } : null;
    })
    .filter((message): message is NonNullable<typeof message> => !!message)
    .slice(-12);
}

function sanitizeTurnsUsed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isValidPayload(payload: unknown): payload is ChatApiRequest {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ChatApiRequest>;
  return (
    Array.isArray(candidate.messages) &&
    candidate.collectedData !== null &&
    typeof candidate.collectedData === 'object' &&
    typeof candidate.turnsUsed === 'number'
  );
}

export function shouldUseOpenAiForPreAtendimento(patient: PatientProfile): boolean {
  return canFinalizePreAtendimento(patient);
}

function getSafetyNotice(symptoms: string): string {
  const normalized = removeAccents(symptoms.toLowerCase());
  if (!normalized) {
    return '';
  }

  const hasSafetySignal = SAFETY_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );

  if (!hasSafetySignal) {
    return '';
  }

  return 'Como seu relatório contém um possível sinal de alerta, procure avaliação médica presencial ou atendimento de urgência o mais breve possível.';
}

function buildLocalTriage(profile: PatientProfile): TriageSummary {
  const symptomsText = removeAccents(
    `${profile.detalhesDoCaso} ${profile.sintomas} ${profile.regiao}`.toLowerCase()
  );
  const idade = Number(profile.idade);
  const coverage = resolveCoverageSummary(profile.regiao);
  const safetyNotice = getSafetyNotice(profile.sintomas);

  let especialidadeRelacionada = 'Fisioterapia domiciliar personalizada';
  let hipoteseInicial =
    'Pelo que você descreveu, vale uma avaliação presencial para entender melhor a causa principal do desconforto.';
  let explicacao =
    'A consulta ajuda a conectar sintomas, rotina e funcao corporal para identificar a especialidade mais adequada.';
  let abordagemProativa =
    'A tendencia e montar um plano individual com avaliação de movimento, orientacoes praticas e condutas baseadas em evidencia.';

  if (
    ['tontura', 'vertigem', 'labirint', 'equilibrio', 'enjoo'].some((keyword) =>
      symptomsText.includes(keyword)
    )
  ) {
    especialidadeRelacionada = 'Reabilitacao vestibular';
    hipoteseInicial =
      'Os sintomas lembram um quadro que pode estar ligado ao sistema vestibular, ao equilibrio ou a sobrecargas associadas.';
    explicacao =
      'Essa especialidade foca tonturas, vertigens, instabilidade e queixas ligadas ao equilibrio.';
    abordagemProativa =
      'O proximo passo costuma ser avaliar os gatilhos, o equilibrio e as respostas do corpo para montar exercicios especificos.';
  } else if (
    ['zumbido', 'dtm', 'mandibula', 'atm', 'maxilar'].some((keyword) =>
      symptomsText.includes(keyword)
    )
  ) {
    especialidadeRelacionada = 'Tratamento de zumbido, DTM e tonturas';
    hipoteseInicial =
      'Pode haver relacao entre a musculatura, a regiao mandibular e os sintomas que você relatou.';
    explicacao =
      'A avaliação verifica tensoes, postura, articulacao temporomandibular e sinais que podem influenciar o zumbido ou a dor.';
    abordagemProativa =
      'A ideia e avaliar postura, mobilidade e tensoes para direcionar um cuidado mais certeiro e personalizado.';
  } else if (
    ['avc', 'parkinson', 'neurolog', 'formigamento', 'sequela', 'tremor'].some(
      (keyword) => symptomsText.includes(keyword)
    )
  ) {
    especialidadeRelacionada = 'Neurologia';
    hipoteseInicial =
      'Os sinais contam uma historia mais proxima de uma demanda neurologica e merecem avaliação cuidadosa.';
    explicacao =
      'A neurologia em fisioterapia trabalha funcionalidade, equilibrio, marcha e independencia em quadros neurologicos.';
    abordagemProativa =
      'O atendimento tende a priorizar seguranca, funcionalidade e estrategias praticas para o dia a dia.';
  } else if (
    [
      'ombro',
      'joelho',
      'coluna',
      'lombar',
      'cervical',
      'fratura',
      'cirurgia',
      'tendinite',
      'lesao',
      'dor',
    ].some((keyword) => symptomsText.includes(keyword))
  ) {
    especialidadeRelacionada = 'Traumato-ortopedia';
    hipoteseInicial =
      'O relato combina com uma queixa musculoesqueletica ou ortopedica que pode se beneficiar de avaliação funcional.';
    explicacao =
      'Essa especialidade atende dores, lesoes, pos-operatorio e limitacoes de movimento com foco em recuperar funcao.';
    abordagemProativa =
      'A consulta deve mapear sobrecargas, limitacoes e padroes de movimento para orientar um plano sob medida.';
  } else if (
    idade >= 60 ||
    ['idoso', 'envelhecimento', 'quedas', 'mobilidade'].some((keyword) =>
      symptomsText.includes(keyword)
    )
  ) {
    especialidadeRelacionada = 'Gerontologia';
    hipoteseInicial =
      'Pode haver uma demanda relacionada a mobilidade, equilibrio ou funcionalidade associada ao envelhecimento.';
    explicacao =
      'A gerontologia em fisioterapia busca preservar autonomia, seguranca e qualidade de vida.';
    abordagemProativa =
      'O atendimento tende a olhar rotina, risco de quedas, equilibrio e estrategias para manter independencia com seguranca.';
  }

  return {
    especialidadeRelacionada,
    hipoteseInicial,
    explicacao,
    abordagemProativa,
    cobertura: coverage,
    horarios: 'Atendimento domiciliar: seg-sex 6h-19h e sab 6h-12h.',
    observacaoFinal: safetyNotice
      ? 'Considerando os sinais de alerta relatados, é aconselhável procurar uma avaliação médica presencial com prioridade.'
      : 'Oferecemos atendimento domiciliar em Recife, sem plano de saúde, e discutiremos os detalhes via WhatsApp.',
  };
}

function buildStoryHook(patient: PatientProfile): string {
  const details = normalizeText(patient.detalhesDoCaso);
  const symptoms = normalizeText(patient.sintomas);
  return details || symptoms;
}

export function buildSystemPrompt(hasSafetyNotice: boolean): string {
  return [
    'Você é a assistente virtual da Dra. Luiza Moneta.',
    'Escreva a mensagem final do pré-atendimento como um texto humano, acolhedor e consultivo.',
    'Fale em portugues natural, com tom natural e empático.',
    'Escreva 3 a 5 paragrafos curtos em prosa, entre 500 e 1100 caracteres, sem listas.',
    'Use o gancho narrativo do caso primeiro, priorizando detalhes do mecanismo da queixa ou do contexto vivido pelo paciente.',
    'Explique em linguagem simples, sem jargão clínico desnecessário.',
    'Quando fizer sentido, inclua uma orientação prática inicial curta em prosa.',
    'Não cite horários, cobertura, telefone, disponibilidade, plano de saúde ou detalhes operacionais no corpo da mensagem.',
    'Este chat termina neste fechamento.',
    'Não ofereça continuar por aqui.',
    'Feche com um CTA único e direto para seguir no WhatsApp.',
    hasSafetyNotice
      ? 'Como existe sinal de alerta, mantenha tom sério e inclua orientação clara para avaliação médica urgente antes do CTA.'
      : 'Você pode soar leve e calorosa quando combinar com o caso.',
    '',
    'Exemplo de voz 1:',
    'Boa noite! Poxa, sei como um susto no futebol derruba o clima. Pelo que você contou, vale olhar esse joelho com bastante atenção para entender o que irritou a articulação e te ajudar a voltar ao seu ritmo com segurança. Enquanto você não é avaliado, pega mais leve nos impactos e evita insistir no movimento que dispara a dor. Se fizer sentido para você, me chama no WhatsApp e a gente combina sua avaliação com calma.',
    '',
    'Exemplo de voz 2:',
    'Oi! Sinto muito por você estar lidando com essa tontura. Esse tipo de queixa merece uma avaliação cuidadosa para entender o que está desencadeando a sensação e te deixar mais segura nas atividades do dia a dia. Enquanto isso, tenta levantar mais devagar e buscar apoio se perceber instabilidade. Me chama no WhatsApp para alinharmos seu próximo passo com calma.',
    '',
    'Exemplo de voz 3:',
    'Oi! Dor nas costas realmente desgasta a rotina. Pelo que você descreveu, vale investigar com calma o que está sobrecarregando essa região e quais movimentos estão fazendo seu corpo reclamar mais. Até ser avaliado, tenta respeitar um ritmo mais gentil e evitar forçar o que piora a dor. Me chama no WhatsApp para combinarmos sua avaliação.',
  ].join('\n');
}

type RawLogPayload = Record<string, unknown>;

export function isOpenAiRawLoggingEnabled(
  value = process.env['PRE_ATENDIMENTO_OPENAI_RAW_LOGS'] || ''
): boolean {
  return ['1', 'true', 'on', 'yes'].includes(normalizeText(value).toLowerCase());
}

function logRaw(label: string, payload: RawLogPayload) {
  if (!isOpenAiRawLoggingEnabled()) {
    return;
  }

  console.log(`[pre-atendimento-openai] ${label}`, payload);
}

function extractTextFromResponse(response: unknown): string {
  const candidate = response as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: unknown;
      }>;
    }>;
  };

  const outputText = normalizeText(candidate.output_text ?? '');
  if (outputText) {
    return outputText;
  }

  const joined = (candidate.output ?? [])
    .flatMap((item) =>
      'content' in item && Array.isArray(item.content)
        ? item.content.map((content) =>
            'text' in content && typeof content.text === 'string'
              ? content.text
              : ''
          )
        : []
    )
    .filter(Boolean)
    .join('\n');

  return normalizeText(joined);
}

async function generateOpenAiReply(
  patient: PatientProfile,
  messages: ChatApiRequest['messages'],
  triage: TriageSummary,
  safetyNotice: string
): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const systemPrompt = buildSystemPrompt(!!normalizeText(safetyNotice));
  const userPayload = {
    paciente: patient,
    detalhesDoCaso: buildStoryHook(patient),
    sintomas: patient.sintomas,
    seguranca: safetyNotice || null,
    triagemClinica: {
      especialidadeRelacionada: triage.especialidadeRelacionada,
      hipoteseInicial: triage.hipoteseInicial,
      explicacao: triage.explicacao,
      abordagemProativa: triage.abordagemProativa,
    },
    historicoDaConversa: messages,
    instrucoesFinais: {
      canalUnico: 'whatsapp',
      naoOferecerContinuidadeNoChat: true,
      evitarDetalhesOperacionais: true,
      maximoDeCaracteres: FINAL_REPLY_MAX_LENGTH,
    },
  };

  logRaw('raw_request', {
    model: process.env['OPENAI_MODEL']?.trim() || MODEL_FALLBACK,
    systemPrompt,
    userPayload,
  });

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env['OPENAI_MODEL']?.trim() || MODEL_FALLBACK,
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify(userPayload),
      },
    ],
  });

  const reply = extractTextFromResponse(response);

  logRaw('raw_response', {
    outputText: (response as { output_text?: unknown }).output_text ?? '',
    output: (response as { output?: unknown }).output,
    usage: (response as { usage?: unknown }).usage,
  });

  return reply;
}

function buildPendingResponse(patient: PatientProfile): ChatApiResponse {
  return {
    reply: '',
    collectedData: patient,
    triage: createEmptyTriageSummary(),
    missingFields: [],
    shouldFinalize: false,
    safetyNotice: '',
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  let payload: ChatApiRequest;

  try {
    payload = event.body ? (JSON.parse(event.body) as unknown as ChatApiRequest) : ({} as ChatApiRequest);
  } catch {
    return json(400, { error: 'Invalid JSON payload.' });
  }

  if (!isValidPayload(payload)) {
    return json(400, { error: 'Invalid payload.' });
  }

  const patient = sanitizePatient(payload.collectedData);
  const messages = sanitizeMessages(payload.messages);
  void sanitizeTurnsUsed(payload.turnsUsed);

  if (!hasValidReturnContact(patient) || !shouldUseOpenAiForPreAtendimento(patient)) {
    return json(200, buildPendingResponse(patient));
  }

  const triage = buildLocalTriage(patient);
  const safetyNotice = getSafetyNotice(patient.sintomas);

  try {
    const aiReply = await generateOpenAiReply(patient, messages, triage, safetyNotice);
    const reply = normalizeText(aiReply) || buildRichFinalReply(patient, triage, safetyNotice);

    logRaw('final_reply_source', {
      source: normalizeText(aiReply) ? 'openai' : 'local_fallback_empty_reply',
    });

    return json(200, {
      reply,
      collectedData: patient,
      triage,
      missingFields: [],
      shouldFinalize: true,
      safetyNotice,
    } satisfies ChatApiResponse);
  } catch (error) {
    logRaw('raw_exception', {
      error: error instanceof Error ? error.message : String(error),
    });

    return json(500, {
      error:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel gerar o fechamento final agora.',
    });
  }
};
