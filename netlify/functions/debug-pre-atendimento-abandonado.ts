import type { Handler } from '@netlify/functions';
import { Resend } from 'resend';
import {
  buildPreAtendimentoHtmlSummary,
  buildPreAtendimentoTextSummary,
  hasValidReturnContact,
  isValidEmail,
  isValidWhatsapp,
  normalizeText,
  formatWhatsapp,
  type DebugAbandonmentReason,
  type PatientProfile,
  type PreAtendimentoDebugPayload,
  type PreAtendimentoDebugResponse,
  type TriageSummary,
} from '../../src/app/pre-atendimento-summary';

const DEBUG_EMAIL_FALLBACK = 'thiagoprazeres@gmail.com';
const processedSessionIds = new Set<string>();

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidReason(value: unknown): value is DebugAbandonmentReason {
  return value === 'inactivity' || value === 'tab_closed';
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
    email: isValidEmail(email) ? email : '',
    whatsapp: isValidWhatsapp(whatsapp) ? formatWhatsapp(whatsapp) : '',
  };
}

function sanitizeUserMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => normalizeText(message))
    .filter(Boolean)
    .slice(0, 10);
}

function sanitizeIsoDate(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function isValidPayload(payload: unknown): payload is PreAtendimentoDebugPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<PreAtendimentoDebugPayload>;
  return (
    !!normalizeText(candidate.sessionId) &&
    isValidReason(candidate.reason) &&
    candidate.patient !== null &&
    typeof candidate.patient === 'object' &&
    Array.isArray(candidate.userMessages) &&
    typeof candidate.turnCount === 'number' &&
    typeof candidate.isFallbackMode === 'boolean' &&
    typeof candidate.hasValidReturnContact === 'boolean' &&
    !!normalizeText(candidate.startedAt) &&
    !!normalizeText(candidate.lastInteractionAt)
  );
}

function getDebugRecipient(): string {
  return process.env['PRE_ATENDIMENTO_DEBUG_EMAIL_TO']?.trim() || DEBUG_EMAIL_FALLBACK;
}

function getReplyTo(): string {
  return (
    process.env['PRE_ATENDIMENTO_EMAIL_REPLY_TO']?.trim() ||
    process.env['PRE_ATENDIMENTO_EMAIL_TO']?.trim() ||
    'lumoneta@gmail.com'
  );
}

export function resetProcessedDebugSessions() {
  processedSessionIds.clear();
}

export function markDebugSessionProcessed(sessionId: string) {
  processedSessionIds.add(sessionId);
}

export function hasProcessedDebugSession(sessionId: string): boolean {
  return processedSessionIds.has(sessionId);
}

export function buildDebugSubject(
  reason: DebugAbandonmentReason,
  patient: PatientProfile
): string {
  const label = reason === 'inactivity' ? 'inactivity' : 'tab_closed';
  const nome = normalizeText(patient.nome) || 'sem nome';
  return `Debug pre-atendimento abandonado - ${label} - ${nome}`;
}

function buildDebugMetaText(payload: PreAtendimentoDebugPayload): string {
  return [
    'Metadados de debug:',
    `- Session ID: ${payload.sessionId}`,
    `- Motivo: ${payload.reason}`,
    `- Turnos usados: ${payload.turnCount}`,
    `- Modo fallback: ${payload.isFallbackMode ? 'sim' : 'nao'}`,
    `- Tem contato valido: ${payload.hasValidReturnContact ? 'sim' : 'nao'}`,
    `- Inicio da sessao: ${payload.startedAt}`,
    `- Ultima interacao: ${payload.lastInteractionAt}`,
  ].join('\n');
}

function buildDebugMetaHtml(payload: PreAtendimentoDebugPayload): string {
  const rows = [
    ['Session ID', payload.sessionId],
    ['Motivo', payload.reason],
    ['Turnos usados', String(payload.turnCount)],
    ['Modo fallback', payload.isFallbackMode ? 'sim' : 'nao'],
    ['Tem contato valido', payload.hasValidReturnContact ? 'sim' : 'nao'],
    ['Inicio da sessao', payload.startedAt],
    ['Ultima interacao', payload.lastInteractionAt],
  ];

  return `
    <section style="margin: 0 0 24px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #7c2d12;">Metadados de debug</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${rows
          .map(
            ([label, value]) => `
              <tr>
                <td style="padding: 8px; border: 1px solid #fed7aa; font-weight: 700;">${escapeHtml(label)}</td>
                <td style="padding: 8px; border: 1px solid #fed7aa;">${escapeHtml(value)}</td>
              </tr>
            `
          )
          .join('')}
      </table>
    </section>
  `.trim();
}

function buildMessagesText(messages: string[]): string {
  return `Mensagens do paciente:\n${messages
    .map((message, index) => `${index + 1}. ${message}`)
    .join('\n')}`;
}

function buildMessagesHtml(messages: string[]): string {
  return `
    <section style="margin: 0 0 24px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #7c2d12;">Mensagens do paciente</h2>
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

function buildAssistantReplyText(reply: string): string {
  return reply ? `Ultima resposta da assistente:\n${reply}` : '';
}

function buildAssistantReplyHtml(reply: string): string {
  if (!reply) {
    return '';
  }

  return `
    <section style="margin: 0 0 24px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #7c2d12;">Ultima resposta da assistente</h2>
      <p style="margin: 0; white-space: pre-line;">${escapeHtml(reply)}</p>
    </section>
  `.trim();
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed.' });
  }

  if (!process.env['RESEND_API_KEY']) {
    return json(500, { message: 'RESEND_API_KEY is not configured.' });
  }

  if (!process.env['PRE_ATENDIMENTO_EMAIL_FROM']?.trim()) {
    return json(500, {
      message: 'PRE_ATENDIMENTO_EMAIL_FROM is not configured.',
    });
  }

  let payload: PreAtendimentoDebugPayload;

  try {
    payload = JSON.parse(event.body ?? '{}') as PreAtendimentoDebugPayload;
  } catch {
    return json(400, { message: 'Invalid JSON payload.' });
  }

  if (!isValidPayload(payload)) {
    return json(400, { message: 'Invalid request payload.' });
  }

  const sessionId = normalizeText(payload.sessionId);
  const patient = sanitizePatient(payload.patient);
  const userMessages = sanitizeUserMessages(payload.userMessages);
  const assistantReply = normalizeText(payload.assistantReply);
  const startedAt = sanitizeIsoDate(payload.startedAt);
  const lastInteractionAt = sanitizeIsoDate(payload.lastInteractionAt);

  if (!sessionId || userMessages.length === 0 || !startedAt || !lastInteractionAt) {
    return json(400, {
      message:
        'Session ID, mensagens do paciente e timestamps validos sao obrigatorios.',
    });
  }

  if (hasProcessedDebugSession(sessionId)) {
    const duplicateResult: PreAtendimentoDebugResponse = {
      ok: true,
      duplicate: true,
      message: 'Debug ja registrado para esta sessao.',
    };
    return json(200, duplicateResult);
  }

  const resend = new Resend(process.env['RESEND_API_KEY']);
  const normalizedPayload: PreAtendimentoDebugPayload = {
    ...payload,
    sessionId,
    patient,
    userMessages,
    assistantReply,
    hasValidReturnContact: hasValidReturnContact(patient),
    startedAt,
    lastInteractionAt,
  };
  const emptyTriage = createEmptyTriageSummary();
  const text = [
    buildDebugMetaText(normalizedPayload),
    buildAssistantReplyText(assistantReply),
    buildMessagesText(userMessages),
    buildPreAtendimentoTextSummary(patient, emptyTriage, ''),
  ]
    .filter(Boolean)
    .join('\n\n');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937;">
      ${buildDebugMetaHtml(normalizedPayload)}
      ${buildAssistantReplyHtml(assistantReply)}
      ${buildMessagesHtml(userMessages)}
      ${buildPreAtendimentoHtmlSummary(patient, emptyTriage, '')}
    </div>
  `.trim();

  try {
    const response = await resend.emails.send({
      from: process.env['PRE_ATENDIMENTO_EMAIL_FROM'],
      to: [getDebugRecipient()],
      replyTo: getReplyTo(),
      subject: buildDebugSubject(payload.reason, patient),
      text,
      html,
    });

    if (response.error) {
      console.error('[pre-atendimento-debug-email] send_failed', {
        sessionId,
        error: normalizeText(response.error.message) || 'unknown',
      });

      return json(502, {
        message:
          normalizeText(response.error.message) ||
          'Nao foi possivel enviar o debug agora.',
      });
    }

    markDebugSessionProcessed(sessionId);
    console.info('[pre-atendimento-debug-email] send_success', {
      sessionId,
      reason: payload.reason,
    });

    const result: PreAtendimentoDebugResponse = {
      ok: true,
      duplicate: false,
      message: 'Debug enviado com sucesso.',
    };
    return json(200, result);
  } catch (error) {
    const message =
      error instanceof Error
        ? normalizeText(error.message) || 'Nao foi possivel enviar o debug agora.'
        : 'Nao foi possivel enviar o debug agora.';

    console.error('[pre-atendimento-debug-email] send_exception', {
      sessionId,
      error: message,
    });

    return json(502, { message });
  }
};
