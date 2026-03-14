export type ChatRole = 'assistant' | 'user';
export type RequiredField = 'nome' | 'idade' | 'regiao' | 'sintomas';
export type EmailSummaryMode = 'finalize' | 'user_copy';
export type DebugAbandonmentReason = 'inactivity' | 'tab_closed';

export interface PatientProfile {
  nome: string;
  idade: string;
  regiao: string;
  sintomas: string;
  detalhesDoCaso: string;
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
  isFallbackMode?: boolean;
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

export function canFinalizePreAtendimento(profile: PatientProfile): boolean {
  return (
    REQUIRED_FIELDS.every((field) => !!normalizeText(profile[field])) &&
    hasValidReturnContact(profile)
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

function sanitizeSymptomsForReply(value: string): string {
  return normalizeText(value)
    .replace(/\s*[,;:]+\s*(?=[,;:.!?]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasFinalReplyCta(reply: string): boolean {
  const normalized = normalizeForSearch(reply);

  return ['whatsapp', 'agendar', 'agenda', 'consulta', 'horario'].some(
    (keyword) => normalized.includes(keyword)
  );
}

function hasSafetyGuidance(reply: string): boolean {
  const normalized = normalizeForSearch(reply);

  return ['urgencia', 'urgente', 'avaliacao medica', 'atendimento medico'].some(
    (keyword) => normalized.includes(keyword)
  );
}

function hasInvalidFinalChannelCta(reply: string): boolean {
  const normalized = normalizeForSearch(reply);

  return [
    'continuar por aqui',
    'seguir por aqui',
    'prefere ja falar pelo whatsapp',
    'prefere falar pelo whatsapp',
    'quer continuar por aqui',
    'por aqui ou',
    'aqui ou pelo whatsapp',
  ].some((keyword) => normalized.includes(keyword));
}

function hasOperationalBodyDetails(reply: string): boolean {
  const normalized = normalizeForSearch(reply);

  return [
    'seg a sex',
    'seg-sex',
    'segunda a sexta',
    'sabado',
    '6h',
    '12h',
    '19h',
    'cobertura',
    'disponibilidade',
    'horario disponivel',
    'horarios disponiveis',
    'atendimento domiciliar em recife',
    'area exata',
    'zona sul',
    'zona norte',
    'zona oeste',
    'plano de saude',
  ].some((keyword) => normalized.includes(keyword));
}

function hasExcessClinicalJargon(reply: string): boolean {
  const normalized = normalizeForSearch(reply);

  return [
    'musculoesquelet',
    'avaliacao funcional',
    'mapear for',
    'mapear movimento',
    'mapear limitac',
    'limitacoes funcionais',
    'linha de cuidado',
    'hipotese inicial',
    'especialidade relacionada',
    'quadro compativel',
    'mecanismo lesional',
  ].some((keyword) => normalized.includes(keyword));
}

function endsWithCompleteThought(reply: string): boolean {
  const normalized = normalizeText(reply);

  if (!normalized) {
    return false;
  }

  return /([.!?…]|[)\]"]|[\u{1F300}-\u{1FAFF}])$/u.test(normalized);
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

function buildRecoveryContinuation(motivacao: string): string {
  const normalized = normalizeText(motivacao).replace(/^para você\s+/i, '');
  return normalized || 'recuperar seu movimento com mais conforto';
}

function buildWarmReaction(contextoCompleto: string): string {
  if (
    /\b(jogar bola|futebol|pelada)\b/.test(contextoCompleto) &&
    /\b(pancada|torceu|torci|saiu do lugar|tranco|machuquei|machucou)\b/.test(
      contextoCompleto
    )
  ) {
    return 'Poxa, que balde de agua fria no futebol.';
  }

  if (/\b(pancada|torceu|torci|queda|caiu|saiu do lugar|tranco)\b/.test(contextoCompleto)) {
    return 'Poxa, que susto passar por isso.';
  }

  if (/\b(tontura|vertigem|zonzeira)\b/.test(contextoCompleto)) {
    return 'Sinto muito por esse mal-estar.';
  }

  return 'Sinto muito que você esteja passando por isso.';
}

function buildSimpleClinicalRead(gancho: string, contextoCompleto: string): string {
  if (!gancho) {
    return 'Pelo que você contou, vale olhar isso com calma numa avaliação presencial para entender melhor de onde vem esse desconforto e como te ajudar a sair dessa com mais segurança.';
  }

  if (/\b(joelho)\b/.test(contextoCompleto) && /\b(saiu do lugar|pancada|torceu|torci|tranco)\b/.test(contextoCompleto)) {
    return `Pelo que você descreveu sobre ${gancho}, isso merece uma avaliação cuidadosa porque o joelho pode ficar bem sensível depois de uma pancada dessas e não vale a pena empurrar a dor com a barriga.`;
  }

  if (/\b(tontura|vertigem|zonzeira)\b/.test(contextoCompleto)) {
    return `Pelo que você descreveu sobre ${gancho}, essa sensação merece uma avaliação cuidadosa para entender o que pode estar provocando isso e te deixar mais segura nos movimentos do dia a dia.`;
  }

  if (/\b(lombar|costas)\b/.test(contextoCompleto)) {
    return `Pelo que você descreveu sobre ${gancho}, vale olhar isso com calma para entender o que está irritando essa região e por que alguns movimentos estão pesando mais no seu corpo agora.`;
  }

  return `Pelo que você descreveu sobre ${gancho}, vale olhar isso com calma para entender melhor o que está irritando seu corpo agora e o que pode te ajudar a recuperar movimento com mais segurança.`;
}

function buildInitialCareGuidance(contextoCompleto: string): string {
  if (/\b(joelho|tornozelo|ombro|pe|quadril)\b/.test(contextoCompleto) && /\b(pancada|torceu|torci|saiu do lugar|tranco|dor)\b/.test(contextoCompleto)) {
    return 'Enquanto você não e avaliado, vale pegar leve nos impactos, evitar forçar o movimento que dispara a dor e usar gelo por 15 a 20 minutos se isso te aliviar.';
  }

  if (/\b(tontura|vertigem|zonzeira)\b/.test(contextoCompleto)) {
    return 'Enquanto isso, tente levantar mais devagar, evitar movimentos bruscos e buscar apoio se a tontura apertar.';
  }

  if (/\b(lombar|costas)\b/.test(contextoCompleto)) {
    return 'Enquanto isso, tente pegar mais leve nos movimentos que travam a lombar e respeitar um ritmo mais gentil ate a avaliação.';
  }

  if (/\b(dor)\b/.test(contextoCompleto)) {
    return 'Enquanto isso, vale pegar um pouco mais leve no que piora a queixa e observar quais movimentos fazem seu corpo reclamar mais.';
  }

  return '';
}

function countReplyParagraphs(reply: string): number {
  return formatRichReplyParagraphs(reply)
    .split(/\n{2,}/)
    .filter(Boolean).length;
}

export function shouldUseRichFinalReplyFallback(
  reply: string,
  triage: TriageSummary,
  safetyNotice = ''
): boolean {
  const normalizedReply = normalizeText(reply);
  const hasSafetyNotice = !!normalizeText(safetyNotice);
  const formattedReply = formatRichReplyParagraphs(normalizedReply);
  const paragraphCount = countReplyParagraphs(formattedReply);
  void triage;

  return (
    normalizedReply.length < 320 ||
    normalizedReply.length > 1400 ||
    paragraphCount < 3 ||
    paragraphCount > 5 ||
    !endsWithCompleteThought(normalizedReply) ||
    !hasFinalReplyCta(normalizedReply) ||
    hasInvalidFinalChannelCta(normalizedReply) ||
    hasOperationalBodyDetails(formattedReply) ||
    hasExcessClinicalJargon(formattedReply) ||
    (hasSafetyNotice && !hasSafetyGuidance(normalizedReply))
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
    'Quando isso',
    'Quando a dor',
    'No seu caso',
    'A Dra.',
    'Enquanto isso',
    'Enquanto voce',
    'Enquanto você',
    'Até ser avaliado',
    'Ate ser avaliado',
    'Se quiser',
    'Se fizer sentido',
    'Me chama no WhatsApp',
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
  void triage;
  const nome = normalizeText(patient.nome);
  const sintomas = sanitizeSymptomsForReply(patient.sintomas);
  const detalhesDoCaso = normalizeText(patient.detalhesDoCaso);
  const safety = normalizeText(safetyNotice);
  const gancho = extractPrimaryComplaint(detalhesDoCaso || sintomas);
  const contextoCompleto = normalizeForSearch(`${detalhesDoCaso} ${sintomas}`);
  const motivacao = buildRecoveryMotivation({
    ...patient,
    sintomas: `${detalhesDoCaso} ${sintomas}`,
  });
  const continuidade = buildRecoveryContinuation(motivacao);

  const saudacao = nome
    ? safety
      ? `Olá, ${nome}.`
      : `Olá, ${nome}! Tudo bem por aqui? 😊`
    : safety
      ? 'Ola.'
      : 'Ola! Tudo bem por aqui? 😊';

  const abertura = safety
    ? `${saudacao} Sou a assistente da Dra. Luiza Moneta e revisei com carinho o que você contou no pre-atendimento.`
    : `${saudacao} ${buildWarmReaction(contextoCompleto)}`;

  const leituraClinica = buildSimpleClinicalRead(gancho, contextoCompleto);
  const plano = `A Dra. Luiza costuma começar entendendo com calma a sua história, vendo o que piora a queixa e montando um plano bem redondinho para te ajudar a ${continuidade}.`;
  const orientacaoInicial = buildInitialCareGuidance(contextoCompleto);
  const ctaSeguro =
    'Esse cuidado vem em primeiro lugar agora. Depois de ser avaliado, se fizer sentido, seguimos pelo WhatsApp para orientar o proximo passo.';
  const ctaPadrao = `Se fizer sentido para você, me chama no WhatsApp para a gente combinar sua avaliação com calma.`;

  if (safety) {
    return [
      abertura,
      `${leituraClinica} ${safety}`,
      ctaSeguro,
    ].join('\n\n');
  }

  return [
    abertura,
    leituraClinica,
    plano,
    [orientacaoInicial, ctaPadrao].filter(Boolean).join(' '),
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
  const patientItems = [
    { label: 'Nome', value: formatSummaryField(patient.nome) },
    { label: 'Idade', value: formatSummaryField(patient.idade) },
    {
      label: 'WhatsApp',
      value: formatSummaryField(formatWhatsapp(patient.whatsapp)),
    },
    { label: 'E-mail', value: formatSummaryField(patient.email) },
    { label: 'Regiao', value: formatSummaryField(patient.regiao) },
    { label: 'Sintomas', value: formatSummaryField(patient.sintomas) },
  ];

  if (normalizeText(patient.detalhesDoCaso)) {
    patientItems.push({
      label: 'Detalhes do caso',
      value: formatSummaryField(patient.detalhesDoCaso),
    });
  }

  const sections: SummarySection[] = [
    {
      title: 'Dados do paciente',
      items: patientItems,
    },
    {
      title: 'Pré-atendimento virtual',
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
