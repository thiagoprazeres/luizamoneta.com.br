export type ChatRole = 'assistant' | 'user';
export type RequiredField = 'nome' | 'idade' | 'regiao' | 'sintomas';
export type EmailSummaryMode = 'finalize' | 'user_copy';
export type DebugAbandonmentReason = 'inactivity' | 'tab_closed';

export interface PatientProfile {
  nome: string;
  idade: string;
  regiao: string;
  sintomas: string;
  email: string;
  whatsapp: string;
}

export interface TriageSummary {
  especialidadeRelacionada: string;
  hipoteseInicial: string;
  explicacao: string;
  abordagemProativa: string;
  cobertura: string;
  horarios: string;
  observacaoFinal: string;
}

export interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

export interface ChatApiRequest {
  messages: ChatApiMessage[];
  collectedData: PatientProfile;
  turnsUsed: number;
  maxTurns: number;
}

export interface ChatApiResponse {
  reply: string;
  collectedData: PatientProfile;
  triage: TriageSummary;
  missingFields: RequiredField[];
  shouldFinalize: boolean;
  safetyNotice?: string;
}

export interface PreAtendimentoEmailPayload {
  mode: EmailSummaryMode;
  patient: PatientProfile;
  triage: TriageSummary;
  safetyNotice?: string;
  assistantReply?: string;
  userMessages?: string[];
}

export interface PreAtendimentoEmailResponse {
  ok: boolean;
  mode: EmailSummaryMode;
  message: string;
  userIncluded: boolean;
  userCopyAvailable: boolean;
}

export interface PreAtendimentoDebugPayload {
  sessionId: string;
  reason: DebugAbandonmentReason;
  patient: PatientProfile;
  userMessages: string[];
  assistantReply?: string;
  turnCount: number;
  isFallbackMode: boolean;
  hasValidReturnContact: boolean;
  startedAt: string;
  lastInteractionAt: string;
}

export interface PreAtendimentoDebugResponse {
  ok: boolean;
  duplicate: boolean;
  message: string;
}

export const REQUIRED_FIELDS: RequiredField[] = [
  'nome',
  'idade',
  'regiao',
  'sintomas',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const COVERED_RECIFE_NEIGHBORHOODS = [
  'gracas',
  'aflitos',
  'espinheiro',
  'casa forte',
  'jaqueira',
  'parnamirim',
  'rosarinho',
  'tamarineira',
  'hipodromo',
  'santana',
  'torre',
  'madalena',
  'cordeiro',
  'varzea',
  'caxanga',
  'ilha do retiro',
  'boa viagem',
  'pina',
  'imbiribeira',
  'ipsep',
  'brasilia teimosa',
];

type SummarySection = {
  title: string;
  items: Array<{
    label: string;
    value: string;
  }>;
};

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function stripWhatsappDigits(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits;
}

export function isValidWhatsapp(value: string): boolean {
  const digits = stripWhatsappDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function formatWhatsapp(value: string): string {
  const digits = stripWhatsappDigits(value);

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return normalizeText(value);
}

export function hasValidReturnContact(
  profile: Pick<PatientProfile, 'email' | 'whatsapp'>
): boolean {
  return (
    isValidEmail(normalizeText(profile.email)) ||
    isValidWhatsapp(normalizeText(profile.whatsapp))
  );
}

export function formatSummaryField(value: string): string {
  return normalizeText(value) || 'Nao informado';
}

export function resolveCoverageSummary(regiao: string): string {
  const normalized = normalizeForSearch(regiao);

  if (!normalized) {
    return 'Cobertura domiciliar sera confirmada no WhatsApp.';
  }

  if (normalized.includes('zona norte')) {
    return 'Atendimento domiciliar em Recife com foco tambem na Zona Norte; confirmo a area exata no WhatsApp.';
  }

  if (normalized.includes('zona sul')) {
    return 'Atendimento domiciliar em Recife com foco tambem na Zona Sul; confirmo a area exata no WhatsApp.';
  }

  if (normalized.includes('zona oeste')) {
    return 'Atendimento domiciliar em Recife com foco tambem na Zona Oeste; confirmo a area exata no WhatsApp.';
  }

  if (
    COVERED_RECIFE_NEIGHBORHOODS.some((neighborhood) =>
      normalized.includes(neighborhood)
    )
  ) {
    return 'Esse ponto de Recife conversa com a area de atendimento domiciliar da Dra. Luiza, e alinhamos os detalhes da visita pelo WhatsApp.';
  }

  if (normalized.includes('recife')) {
    return 'Atendimento domiciliar em Recife, com confirmacao final da sua area no WhatsApp.';
  }

  return 'Vou confirmar no WhatsApp se sua regiao esta dentro da cobertura domiciliar em Recife.';
}

function normalizeForSearch(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getSpecialtyKeywords(especialidade: string): string[] {
  return normalizeForSearch(especialidade)
    .split(/[^a-z0-9]+/g)
    .filter(
      (keyword) =>
        keyword.length >= 3 &&
        !['tratamento', 'de', 'e', 'da', 'do'].includes(keyword)
    );
}

function hasFinalReplyCta(reply: string): boolean {
  const normalized = normalizeForSearch(reply);

  return ['whatsapp', 'agendar', 'agenda', 'consulta', 'horario'].some(
    (keyword) => normalized.includes(keyword)
  );
}

function endsWithCompleteThought(reply: string): boolean {
  const normalized = normalizeText(reply);

  if (!normalized) {
    return false;
  }

  return /([.!?…]|[)\]"]|[\u{1F300}-\u{1FAFF}])$/u.test(normalized);
}

function hasSpecialtyMention(reply: string, triage: TriageSummary): boolean {
  const normalized = normalizeForSearch(reply);
  return getSpecialtyKeywords(triage.especialidadeRelacionada).some((keyword) =>
    normalized.includes(keyword)
  );
}

function buildRecoveryMotivation(patient: PatientProfile): string {
  const sintomas = normalizeForSearch(patient.sintomas);

  const activityGoals: Array<{ pattern: RegExp; text: string }> = [
    {
      pattern: /\b(jogar bola|futebol|pelada)\b/,
      text: 'para você se recuperar com seguranca e voltar a jogar bola com mais confianca ⚽',
    },
    {
      pattern: /\b(correr|corrida|run|maratona|treino de corrida)\b/,
      text: 'para você retomar a corrida com mais seguranca e sem medo de piorar a dor',
    },
    {
      pattern: /\b(caminhar|caminhada|andar)\b/,
      text: 'para você voltar a caminhar com mais conforto e seguranca no dia a dia',
    },
    {
      pattern: /\b(academia|musculacao|treinar|treino|crossfit|pilates)\b/,
      text: 'para você voltar aos seus treinos com mais seguranca e movimento de qualidade',
    },
    {
      pattern: /\b(trabalhar|trabalho|servico|serviço|plantao|plantão)\b/,
      text: 'para você retomar sua rotina de trabalho com mais conforto e funcionalidade',
    },
    {
      pattern: /\b(dormir|sono|noite)\b/,
      text: 'para você voltar a descansar melhor e ter dias mais leves',
    },
    {
      pattern: /\b(dirigir|carro|volante)\b/,
      text: 'para você voltar a dirigir e se movimentar com mais tranquilidade',
    },
  ];

  const matchedGoal = activityGoals.find(({ pattern }) => pattern.test(sintomas));
  if (matchedGoal) {
    return matchedGoal.text;
  }

  return 'para você recuperar movimento com seguranca e voltar para a sua rotina com mais conforto';
}

export function shouldUseRichFinalReplyFallback(
  reply: string,
  triage: TriageSummary
): boolean {
  const normalizedReply = normalizeText(reply);

  return (
    normalizedReply.length < 260 ||
    normalizedReply.length > 1050 ||
    !endsWithCompleteThought(normalizedReply) ||
    !hasSpecialtyMention(normalizedReply, triage) ||
    !hasFinalReplyCta(normalizedReply)
  );
}

export function formatRichReplyParagraphs(reply: string): string {
  const normalizedReply = normalizeText(reply);

  if (!normalizedReply) {
    return '';
  }

  if (normalizedReply.includes('\n')) {
    return normalizedReply.replace(/\n{3,}/g, '\n\n');
  }

  const semanticMarkers = [
    'Pelo que',
    'No seu caso',
    'A Dra.',
    'Sobre a sua regiao',
    'Sobre a cobertura',
    'Se quiser',
    'Vamos alinhar',
    'Pode me',
    'Como seu relato',
    'Depois de ser',
  ];

  let formattedReply = normalizedReply;

  for (const marker of semanticMarkers) {
    const markerPattern = new RegExp(`([.!?])\\s+(?=${marker})`, 'g');
    formattedReply = formattedReply.replace(markerPattern, '$1\n\n');
  }

  if (formattedReply.includes('\n\n')) {
    return formattedReply.replace(/\n{3,}/g, '\n\n');
  }

  const sentences = normalizedReply.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 4) {
    return normalizedReply;
  }

  return [
    sentences[0],
    sentences.slice(1, 3).join(' '),
    sentences.slice(3, 4).join(' '),
    sentences.slice(4).join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildRichFinalReply(
  patient: PatientProfile,
  triage: TriageSummary,
  safetyNotice = ''
): string {
  const nome = normalizeText(patient.nome);
  const sintomas = normalizeText(patient.sintomas);
  const regiao = normalizeText(patient.regiao);
  const especialidade = formatSummaryField(triage.especialidadeRelacionada);
  const explicacao = formatSummaryField(triage.explicacao);
  const abordagem = formatSummaryField(triage.abordagemProativa);
  const cobertura = formatSummaryField(triage.cobertura);
  const safety = normalizeText(safetyNotice);
  const motivacao = buildRecoveryMotivation(patient);

  const saudacao = nome
    ? safety
      ? `Olá, ${nome}.`
      : `Olá, ${nome}! Tudo bem por aqui? 😊`
    : safety
      ? 'Ola.'
      : 'Ola! Tudo bem por aqui? 😊';

  const abertura = safety
    ? `${saudacao} Sou a assistente da Dra. Luiza Moneta e revisei com carinho o que você contou no pre-atendimento.`
    : `${saudacao} Sou a assistente da Dra. Luiza Moneta, e que bom ter você por aqui com a gente!`;

  const leituraClinica = sintomas
    ? `Pelo que você descreveu sobre ${sintomas}, essa queixa conversa bastante com a area de ${especialidade}. Isso nao fecha diagnostico online, ta? Mas aponta para a especialidade mais adequada para uma avaliacao presencial bem feita.`
    : `Pelo que você compartilhou ate aqui, a area que mais combina com o seu caso neste momento e ${especialidade}. Isso nao fecha diagnostico online, mas ajuda a direcionar a avaliacao presencial com mais precisao.`;

  const abordagemTexto = `${explicacao} ${abordagem}`;

  const coberturaTexto = regiao
    ? `Sobre a regiao informada (${regiao}), ${cobertura.charAt(0).toLowerCase()}${cobertura.slice(1)}`
    : `Sobre a cobertura do atendimento: ${cobertura}`;

  const ctaSeguro =
    'Depois de ser avaliado(a) presencialmente, se fizer sentido, seguimos pelo WhatsApp para orientar o atendimento domiciliar com calma e definir o melhor encaixe.';
  const ctaPadrao =
    'Se quiser, a gente ja pode continuar pelo WhatsApp para combinar sua avaliacao domiciliar no melhor horario para você. A ideia e deixar essa queixa mais comportada e você mais perto de retomar sua rotina com tranquilidade 😉';

  if (safety) {
    return [
      abertura,
      leituraClinica,
      `${safety} Antes de pensar no atendimento domiciliar, esse cuidado vem em primeiro lugar.`,
      `${coberturaTexto} ${ctaSeguro}`,
    ].join('\n\n');
  }

  return [
    abertura,
    leituraClinica,
    `A Dra. Luiza e craque em fazer uma avaliacao cuidadosa para entender a origem do desconforto, observar os movimentos que pioram a queixa e montar um plano individualizado ${motivacao}. ${abordagemTexto}`,
    coberturaTexto,
    ctaPadrao,
  ].join('\n\n');
}

function formatWhatsappGreeting(saudacao: string): string {
  const normalized = normalizeText(saudacao);

  if (!normalized) {
    return 'Ola!';
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}!`;
}

function extractPrimaryComplaint(rawSymptoms: string): string {
  const normalized = normalizeText(rawSymptoms);

  if (!normalized) {
    return '';
  }

  const [firstSentence = ''] = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);

  return firstSentence;
}

function truncatePrimaryComplaint(complaint: string, maxLength = 120): string {
  const sanitized = normalizeText(complaint).replace(/[.!?]+$/g, '');

  if (!sanitized) {
    return '';
  }

  if (sanitized.length <= maxLength) {
    return `${sanitized}.`;
  }

  const clipped = sanitized.slice(0, Math.max(1, maxLength - 3)).trimEnd();
  const lastSpace = clipped.lastIndexOf(' ');
  const withoutBrokenWord =
    lastSpace >= Math.floor(clipped.length / 2)
      ? clipped.slice(0, lastSpace)
      : clipped;

  return `${withoutBrokenWord.trimEnd()}...`;
}

export function buildWhatsAppHandoffMessage(
  patient: PatientProfile,
  saudacao = '',
  safetyNotice = ''
): string {
  void safetyNotice;

  const abertura = normalizeText(patient.nome)
    ? `Oi, sou ${normalizeText(patient.nome)}. Acabei de concluir meu pre-atendimento pelo site e queria continuar por aqui.`
    : 'Oi, acabei de concluir meu pre-atendimento pelo site e queria continuar por aqui.';
  const gancho = truncatePrimaryComplaint(
    extractPrimaryComplaint(patient.sintomas)
  );

  return [
    formatWhatsappGreeting(saudacao),
    abertura,
    gancho ? `Minha principal queixa e: ${gancho}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function getPreAtendimentoSummarySections(
  patient: PatientProfile,
  triage: TriageSummary,
  safetyNotice = ''
): SummarySection[] {
  const sections: SummarySection[] = [
    {
      title: 'Dados do paciente',
      items: [
        { label: 'Nome', value: formatSummaryField(patient.nome) },
        { label: 'Idade', value: formatSummaryField(patient.idade) },
        { label: 'WhatsApp', value: formatSummaryField(formatWhatsapp(patient.whatsapp)) },
        { label: 'E-mail', value: formatSummaryField(patient.email) },
        { label: 'Regiao', value: formatSummaryField(patient.regiao) },
        { label: 'Sintomas', value: formatSummaryField(patient.sintomas) },
      ],
    },
    {
      title: 'Pre-atendimento virtual',
      items: [
        {
          label: 'Especialidade relacionada',
          value: formatSummaryField(triage.especialidadeRelacionada),
        },
        {
          label: 'Hipotese inicial',
          value: formatSummaryField(triage.hipoteseInicial),
        },
        { label: 'Explicacao', value: formatSummaryField(triage.explicacao) },
        {
          label: 'Abordagem proativa',
          value: formatSummaryField(triage.abordagemProativa),
        },
        { label: 'Cobertura', value: formatSummaryField(triage.cobertura) },
        { label: 'Horarios', value: formatSummaryField(triage.horarios) },
        {
          label: 'Observacao final',
          value: formatSummaryField(triage.observacaoFinal),
        },
      ],
    },
  ];

  if (normalizeText(safetyNotice)) {
    sections.push({
      title: 'Atencao',
      items: [{ label: 'Aviso', value: normalizeText(safetyNotice) }],
    });
  }

  return sections;
}

export function buildPreAtendimentoTextSummary(
  patient: PatientProfile,
  triage: TriageSummary,
  safetyNotice = ''
): string {
  return getPreAtendimentoSummarySections(patient, triage, safetyNotice)
    .map(
      (section) =>
        `*${section.title}*\n${section.items
          .map((item) => `*${item.label}:* ${item.value}`)
          .join('\n')}`
    )
    .join('\n\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPreAtendimentoHtmlSummary(
  patient: PatientProfile,
  triage: TriageSummary,
  safetyNotice = ''
): string {
  const sections = getPreAtendimentoSummarySections(patient, triage, safetyNotice);

  const renderedSections = sections
    .map(
      (section) => `
        <section style="margin: 0 0 24px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #19494b;">${escapeHtml(
            section.title
          )}</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            ${section.items
              .map(
                (item) => `
                  <tr>
                    <td style="padding: 8px 12px; border: 1px solid #d9e4e5; background: #f7fbfb; width: 220px; font-weight: 700; color: #19494b;">${escapeHtml(
                      item.label
                    )}</td>
                    <td style="padding: 8px 12px; border: 1px solid #d9e4e5; color: #1f2937;">${escapeHtml(
                      item.value
                    )}</td>
                  </tr>
                `
              )
              .join('')}
          </table>
        </section>
      `
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      ${renderedSections}
    </div>
  `.trim();
}
