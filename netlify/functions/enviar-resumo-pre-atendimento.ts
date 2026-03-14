import type { Handler } from '@netlify/functions';
import { Resend } from 'resend';
import {
  buildRichFinalReply,
  buildPreAtendimentoHtmlSummary,
  buildPreAtendimentoTextSummary,
  formatRichReplyParagraphs,
  formatWhatsapp,
  hasValidReturnContact,
  isValidEmail,
  isValidWhatsapp,
  normalizeText,
  type EmailSummaryMode,
  type PatientProfile,
  type PreAtendimentoEmailPayload,
  type PreAtendimentoEmailResponse,
  type TriageSummary,
} from '../../src/app/pre-atendimento-summary';

const RESTRICTED_TEAM_EMAIL = 'thiagoprazeres@gmail.com';

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
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

function sanitizeTriage(value: unknown): TriageSummary {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<TriageSummary>)
      : createEmptyTriageSummary();

  return {
    especialidadeRelacionada: normalizeText(source.especialidadeRelacionada),
    hipoteseInicial: normalizeText(source.hipoteseInicial),
    explicacao: normalizeText(source.explicacao),
    abordagemProativa: normalizeText(source.abordagemProativa),
    cobertura: normalizeText(source.cobertura),
    horarios: normalizeText(source.horarios),
    observacaoFinal: normalizeText(source.observacaoFinal),
  };
}

function isValidMode(value: unknown): value is EmailSummaryMode {
  return value === 'finalize' || value === 'user_copy';
}

function isValidPayload(payload: unknown): payload is PreAtendimentoEmailPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<PreAtendimentoEmailPayload>;
  return (
    isValidMode(candidate.mode) &&
    candidate.patient !== null &&
    typeof candidate.patient === 'object' &&
    candidate.triage !== null &&
    typeof candidate.triage === 'object'
  );
}

function getRecipient(mode: EmailSummaryMode, patient: PatientProfile): string[] {
  if (mode === 'user_copy') {
    return [patient.email];
  }

  return [getPrimaryTeamRecipient()];
}

export function isRestrictedEmailMode(teamRecipient = ''): boolean {
  return normalizeText(teamRecipient).toLowerCase() === RESTRICTED_TEAM_EMAIL;
}

function getPrimaryTeamRecipient(): string {
  return process.env['PRE_ATENDIMENTO_EMAIL_TO']?.trim() || 'lumoneta@gmail.com';
}

function getBcc(mode: EmailSummaryMode): string[] | undefined {
  if (mode !== 'finalize') {
    return undefined;
  }

  const bcc = process.env['PRE_ATENDIMENTO_EMAIL_BCC']?.trim();
  return [bcc || 'thiagoprazeres@gmail.com'];
}

export function getCc(
  mode: EmailSummaryMode,
  patient: PatientProfile,
  userCopyAvailable = true
): string[] | undefined {
  if (mode !== 'finalize' || !isValidEmail(patient.email)) {
    return undefined;
  }

  if (!userCopyAvailable) {
    return undefined;
  }

  return [patient.email];
}

function getReplyTo(): string {
  return (
    process.env['PRE_ATENDIMENTO_EMAIL_REPLY_TO']?.trim() || 'lumoneta@gmail.com'
  );
}

function buildSubject(mode: EmailSummaryMode, patient: PatientProfile): string {
  const nome = normalizeText(patient.nome) || 'Paciente sem nome';
  const regiao = normalizeText(patient.regiao) || 'Regiao nao informada';

  if (mode === 'user_copy') {
    return 'Copia do seu pre-atendimento - Dra. Luiza Moneta';
  }

  return `Novo pre-atendimento - ${nome} - ${regiao}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAssistantReplyForEmail(
  assistantReply: string,
  patient: PatientProfile,
  triage: TriageSummary,
  safetyNotice: string
): string {
  const reply = formatRichReplyParagraphs(assistantReply);
  if (reply) {
    return reply;
  }

  return buildRichFinalReply(patient, triage, safetyNotice);
}

export function buildAiStatusLabel(isFallbackMode = false): string {
  return isFallbackMode ? 'Modo assistido/local' : 'IA ativa (OpenAI)';
}

function buildAiStatusText(isFallbackMode = false): string {
  return `Status da IA: ${buildAiStatusLabel(isFallbackMode)}`;
}

function buildAiStatusHtml(isFallbackMode = false): string {
  const tone = isFallbackMode ? '#92400e' : '#166534';
  const background = isFallbackMode ? '#fef3c7' : '#dcfce7';

  return `
    <section style="margin: 0 0 24px;">
      <p style="margin: 0; display: inline-block; padding: 8px 12px; border-radius: 999px; background: ${background}; color: ${tone}; font-weight: 600;">
        Status da IA: ${escapeHtml(buildAiStatusLabel(isFallbackMode))}
      </p>
    </section>
  `.trim();
}

function buildAssistantReplyHtml(reply: string): string {
  return reply
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 16px;">${escapeHtml(paragraph)}</p>`
    )
    .join('');
}

function sanitizeUserMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => normalizeText(message))
    .filter(Boolean)
    .slice(0, 6);
}

function buildUserMessagesText(messages: string[]): string {
  if (messages.length === 0) {
    return '';
  }

  return `Mensagens do paciente:\n${messages
    .map((message, index) => `${index + 1}. ${message}`)
    .join('\n')}`;
}

function buildUserMessagesHtml(messages: string[]): string {
  if (messages.length === 0) {
    return '';
  }

  return `
    <section style="margin: 0 0 24px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #19494b;">Mensagens do paciente</h2>
      <ol style="margin: 0; padding-left: 20px; color: #1f2937;">
        ${messages
          .map(
            (message) =>
              `<li style="margin: 0 0 10px;">${escapeHtml(message)}</li>`
          )
          .join('')}
      </ol>
    </section>
  `.trim();
}

export function buildResponseMessage(
  mode: EmailSummaryMode,
  userIncluded: boolean,
  userCopyAvailable: boolean
): string {
  if (!userCopyAvailable) {
    return mode === 'user_copy'
      ? 'A cópia por e-mail ao paciente esta temporariamente indisponivel neste ambiente de testes.'
      : 'Resumo enviado para a equipe por e-mail. A cópia ao paciente sera habilitada assim que o envio estiver configurado.';
  }

  if (mode === 'user_copy') {
    return 'Copia enviada para o e-mail informado.';
  }

  if (userIncluded) {
    return 'Resumo enviado para a equipe e uma cópia foi enviada para o e-mail informado.';
  }

  return 'Resumo enviado para a equipe. Se você preencher um e-mail valido, eu envio uma cópia tambem.';
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (!process.env['RESEND_API_KEY']) {
    return json(500, { message: 'RESEND_API_KEY is not configured.' });
  }

  if (!process.env['PRE_ATENDIMENTO_EMAIL_FROM']?.trim()) {
    return json(500, {
      message: 'PRE_ATENDIMENTO_EMAIL_FROM is not configured.',
    });
  }

  let payload: PreAtendimentoEmailPayload;

  try {
    payload = JSON.parse(event.body ?? '{}') as PreAtendimentoEmailPayload;
  } catch {
    return json(400, { message: 'Invalid JSON payload.' });
  }

  if (!isValidPayload(payload)) {
    return json(400, { message: 'Invalid request payload.' });
  }

  const patient = sanitizePatient(payload.patient);
  const triage = sanitizeTriage(payload.triage);
  const safetyNotice = normalizeText(payload.safetyNotice);
  const userMessages = sanitizeUserMessages(payload.userMessages);
  const isFallbackMode = payload.isFallbackMode === true;
  const assistantReply = buildAssistantReplyForEmail(
    typeof payload.assistantReply === 'string' ? payload.assistantReply : '',
    patient,
    triage,
    safetyNotice
  );

  if (payload.mode === 'finalize' && !hasValidReturnContact(patient)) {
    return json(400, {
      message:
        'A finalizacao exige pelo menos um WhatsApp com DDD ou e-mail valido.',
    });
  }

  if (payload.mode === 'user_copy' && !isValidEmail(patient.email)) {
    return json(400, {
      message: 'Um e-mail valido e obrigatorio para enviar a cópia ao usuario.',
    });
  }

  const primaryTeamRecipient = getPrimaryTeamRecipient();
  const userCopyAvailable = !isRestrictedEmailMode(primaryTeamRecipient);

  if (payload.mode === 'user_copy' && !userCopyAvailable) {
    const result: PreAtendimentoEmailResponse = {
      ok: true,
      mode: payload.mode,
      message: buildResponseMessage(payload.mode, false, userCopyAvailable),
      userIncluded: false,
      userCopyAvailable,
    };

    return json(200, result);
  }

  const resend = new Resend(process.env['RESEND_API_KEY']);
  const subject = buildSubject(payload.mode, patient);
  const userIncluded =
    payload.mode === 'finalize' && isValidEmail(patient.email) && userCopyAvailable;
  const textParts = [
    buildAiStatusText(isFallbackMode),
    assistantReply,
    buildUserMessagesText(userMessages),
    buildPreAtendimentoTextSummary(patient, triage, safetyNotice),
  ].filter(Boolean);
  const text = textParts.join('\n\n');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937;">
      ${buildAiStatusHtml(isFallbackMode)}
      ${buildAssistantReplyHtml(assistantReply)}
      ${buildUserMessagesHtml(userMessages)}
      ${buildPreAtendimentoHtmlSummary(patient, triage, safetyNotice)}
    </div>
  `.trim();

  try {
    const response = await resend.emails.send({
      from: process.env['PRE_ATENDIMENTO_EMAIL_FROM'],
      to: getRecipient(payload.mode, patient),
      cc: getCc(payload.mode, patient, userCopyAvailable),
      bcc: getBcc(payload.mode),
      replyTo: getReplyTo(),
      subject,
      text,
      html,
    });

    if (response.error) {
      console.error('[pre-atendimento-email] send_failed', {
        mode: payload.mode,
        error: normalizeText(response.error.message) || 'unknown',
      });

      return json(502, {
        message:
          normalizeText(response.error.message) ||
          'Nao foi possivel enviar o e-mail agora.',
      });
    }

    console.info('[pre-atendimento-email] send_success', {
      mode: payload.mode,
      userIncluded,
    });

    const result: PreAtendimentoEmailResponse = {
      ok: true,
      mode: payload.mode,
      message: buildResponseMessage(
        payload.mode,
        userIncluded,
        userCopyAvailable
      ),
      userIncluded,
      userCopyAvailable,
    };

    return json(200, result);
  } catch (error) {
    const message =
      error instanceof Error
        ? normalizeText(error.message) || 'Nao foi possivel enviar o e-mail agora.'
        : 'Nao foi possivel enviar o e-mail agora.';

    console.error('[pre-atendimento-email] send_exception', {
      mode: payload.mode,
      error: message,
    });

    return json(502, { message });
  }
};
