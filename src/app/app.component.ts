import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  Inject,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MaskitoDirective } from '@maskito/angular';
import type { MaskitoMaskExpression, MaskitoOptions } from '@maskito/core';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { firstValueFrom } from 'rxjs';
import {
  buildRichFinalReply,
  buildWhatsAppHandoffMessage,
  canFinalizePreAtendimento,
  type ChatApiRequest,
  type ChatApiResponse,
  type ChatRole,
  type DebugAbandonmentReason,
  type EmailSummaryMode,
  formatWhatsapp,
  hasValidReturnContact,
  isValidEmail as isValidEmailValue,
  isValidWhatsapp,
  normalizeText as normalizeTextValue,
  type PatientProfile,
  type PreAtendimentoDebugPayload,
  type PreAtendimentoDebugResponse,
  type PreAtendimentoEmailPayload,
  type PreAtendimentoEmailResponse,
  REQUIRED_FIELDS,
  resolveCoverageSummary,
  type RequiredField,
  type TriageSummary,
} from './pre-atendimento-summary';

gsap.registerPlugin(ScrollTrigger);

interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  footer: string;
}

interface PreAtendimentoSessionState {
  sessionId: string;
  startedAt: string;
  lastUserMessageAt: string;
  finalizedAt: string;
  debugEmailSentAt: string;
  debugReason: DebugAbandonmentReason | '';
}

type EmailDispatchState = 'idle' | 'sending' | 'sent' | 'error';
type EmailDispatchTone = 'info' | 'warning' | 'success';

const DEBUG_INACTIVITY_MS = 5 * 60 * 1000;
const FIELD_LABELS: Record<RequiredField, string> = {
  nome: 'seu nome',
  idade: 'sua idade',
  regiao: 'sua região em Recife',
  sintomas: 'o que você está sentindo',
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
const SYMPTOM_KEYWORDS = [
  'dor',
  'tontura',
  'vertigem',
  'zumbido',
  'ombro',
  'joelho',
  'coluna',
  'lombar',
  'cervical',
  'mandibula',
  'equilibrio',
  'fraqueza',
  'formigamento',
  'queda',
  'rigidez',
];
const MASKITO_DIGIT = /\d/;
const WHATSAPP_MASK_10: MaskitoMaskExpression = [
  '(',
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  ')',
  ' ',
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  '-',
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
];
const WHATSAPP_MASK_11: MaskitoMaskExpression = [
  '(',
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  ')',
  ' ',
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  '-',
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
  MASKITO_DIGIT,
];

function whatsappValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const value = normalizeTextValue(control.value);
  if (!value) {
    return null;
  }

  return isValidWhatsapp(value) ? null : { whatsapp: true };
}

export function getWhatsappMaskExpression(
  value: string
): MaskitoMaskExpression {
  const digits = value.replace(/\D/g, '');

  if (digits.length <= 2) {
    return WHATSAPP_MASK_11;
  }

  return digits[2] === '9' ? WHATSAPP_MASK_11 : WHATSAPP_MASK_10;
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

function removeAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function limparFragmentoExtraido(value: string): string {
  return normalizeTextValue(
    value
      .replace(/\b(e tenho|e moro|e sinto|e estou|com sintomas?.*)$/i, '')
      .replace(/[,.!;:]+$/, '')
  );
}

function normalizeRegionFragment(value: string): string {
  return limparFragmentoExtraido(value).replace(/^(?:em|na|no|nas|nos)\s+/i, '');
}

function sanitizeSymptomPunctuation(value: string): string {
  return normalizeTextValue(value)
    .replace(/\s*[,;:]+\s*(?=[,;:.!?]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripTrailingContactInfo(value: string): string {
  return normalizeTextValue(value)
    .replace(
      /\b(?:meu\s+(?:e-?mail|whatsapp|zap)|e-?mail|whatsapp|zap)\b.*$/i,
      ''
    )
    .replace(/\s*[,;:-]?\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}.*$/i, '')
    .replace(
      /\s*[,;:-]?\s*(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)\d{4,5}[-.\s]?\d{4}.*$/i,
      ''
    );
}

function cleanSymptomFragment(value: string): string {
  return limparFragmentoExtraido(
    normalizeTextValue(
      stripTrailingContactInfo(
        sanitizeSymptomPunctuation(limparFragmentoExtraido(value))
      )
    )
  );
}

function containsSymptomKeyword(text: string): boolean {
  return SYMPTOM_KEYWORDS.some((keyword) => text.includes(keyword));
}

function buildResidualMessage(rawMessage: string, segmentsToStrip: string[]): string {
  let cleanedMessage = rawMessage;

  for (const segment of segmentsToStrip) {
    cleanedMessage = cleanedMessage.replace(segment, ' ');
  }

  return normalizeTextValue(cleanedMessage);
}

function looksLikeRegionFragment(fragment: string): boolean {
  const normalized = removeAccents(normalizeTextValue(fragment).toLowerCase());

  if (!normalized || containsSymptomKeyword(normalized)) {
    return false;
  }

  return normalized.includes('recife') || normalized.includes('zona ') || normalized.split(/\s+/).length >= 2;
}

function extractLooseAgeAndRegion(message: string): Partial<PatientProfile> {
  const normalized = normalizeTextValue(message);
  if (!normalized) {
    return {};
  }

  const compactAgeAndRegion = normalized.match(
    /^(\d{1,3})(?:\s+anos?)?(?:\s+|[-,.;:]+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})$/i
  );
  if (compactAgeAndRegion) {
      return {
        idade: compactAgeAndRegion[1],
        regiao: normalizeRegionFragment(compactAgeAndRegion[2]),
      };
  }

  const ageOnly = normalized.match(/^(\d{1,3})(?:\s+anos?)?$/i);
  if (ageOnly) {
    return { idade: ageOnly[1] };
  }

  if (looksLikeRegionFragment(normalized)) {
    return { regiao: normalizeRegionFragment(normalized) };
  }

  return {};
}

function extractCompactIdentity(message: string): Partial<PatientProfile> {
  const normalized = normalizeTextValue(message);
  if (!normalized) {
    return {};
  }

  const compactIdentity = normalized.match(
    /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,50})\s*[,;/-]\s*(\d{1,3})(?:\s+anos?)?\s*[,;/-]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})$/i
  );

  if (!compactIdentity) {
    return {};
  }

  return {
    nome: limparFragmentoExtraido(compactIdentity[1]),
    idade: compactIdentity[2],
    regiao: normalizeRegionFragment(compactIdentity[3]),
  };
}

function extractLeadingCompactIdentity(message: string): Partial<PatientProfile> {
  const normalized = normalizeTextValue(message);
  if (!normalized) {
    return {};
  }

  const leadingCompactIdentity = normalized.match(
    /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,80})\s*,\s*(\d{1,3})(?:\s+anos?)?\s*,\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})(?=\s*,|$)/i
  );

  if (!leadingCompactIdentity) {
    return {};
  }

  return {
    nome: limparFragmentoExtraido(leadingCompactIdentity[1]),
    idade: leadingCompactIdentity[2],
    regiao: normalizeRegionFragment(leadingCompactIdentity[3]),
  };
}

function extractCompactNameAndRegion(message: string): Partial<PatientProfile> {
  const normalized = normalizeTextValue(message);
  if (!normalized) {
    return {};
  }

  const compactNameAndRegion = normalized.match(
    /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,80})\s*[,;/-]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})$/i
  );

  if (!compactNameAndRegion) {
    return {};
  }

  return {
    nome: limparFragmentoExtraido(compactNameAndRegion[1]),
    regiao: normalizeRegionFragment(compactNameAndRegion[2]),
  };
}

function extractLooseName(message: string): string {
  const candidate = limparFragmentoExtraido(message);
  const normalized = removeAccents(candidate.toLowerCase());
  const looksLikeRegionOnly =
    /\brecife\b/i.test(candidate) || /^zona\s+(norte|sul|oeste)\b/i.test(candidate);

  if (
    !candidate ||
    /\d/.test(candidate) ||
    containsSymptomKeyword(normalized) ||
    looksLikeRegionOnly ||
    /^(ola|olá|oi|bom dia|boa tarde|boa noite)\b/i.test(candidate)
  ) {
    return '';
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  return words.length >= 2 ? candidate : '';
}

export function extractPatientDataFromMessage(
  message: string
): Partial<PatientProfile> {
  const extracted: Partial<PatientProfile> = {};
  const rawMessage = message.trim();
  const lowerMessage = removeAccents(rawMessage.toLowerCase());
  const segmentsToStrip: string[] = [];

  const emailMatch = rawMessage.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    extracted.email = emailMatch[0].trim();
    segmentsToStrip.push(emailMatch[0]);
  }

  const whatsappMatch = rawMessage.match(
    /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)\d{4,5}[-.\s]?\d{4}/
  );
  if (whatsappMatch && isValidWhatsapp(whatsappMatch[0])) {
    extracted.whatsapp = formatWhatsapp(whatsappMatch[0]);
    segmentsToStrip.push(whatsappMatch[0]);
  }

  const agePatterns = [
    /(?:idade\s*[:\-]?\s*|tenho\s+)(\d{1,3})\s*anos?/i,
    /\b(\d{1,3})\s*anos?\b/i,
  ];
  for (const pattern of agePatterns) {
    const match = rawMessage.match(pattern);
    if (match?.[1]) {
      extracted.idade = match[1];
      segmentsToStrip.push(match[0]);
      break;
    }
  }

  const namePatterns = [
    /(?:meu nome e|me chamo|pode me chamar de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,50})/i,
    /^(?:sou|eu sou)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,50})(?:[,.!\n]|$)/i,
  ];
  for (const pattern of namePatterns) {
    const match = removeAccents(rawMessage).match(pattern);
    if (match?.[1]) {
      const candidate = limparFragmentoExtraido(match[1]);
      if (candidate && !/^(da|de|do|zona)\b/i.test(candidate)) {
        extracted.nome = candidate;
        segmentsToStrip.push(match[0]);
        break;
      }
    }
  }

  const explicitZone = lowerMessage.match(/\bzona\s+(norte|sul|oeste)\b/);
  if (explicitZone?.[1]) {
        extracted.regiao = `Zona ${explicitZone[1][0].toUpperCase()}${explicitZone[1].slice(1)}`;
        segmentsToStrip.push(explicitZone[0]);
  } else {
    const regionPatterns = [
      /(?:regiao(?: de recife)?\s*[:\-]?\s*|bairro\s*[:\-]?\s*|moro(?: nas| nos| em| na| no)?\s+|sou da\s+|sou de\s+|fico(?: nas| nos| em| na| no)?\s+)([A-Za-zÀ-ÿ0-9' -]{2,60})/i,
    ];
    for (const pattern of regionPatterns) {
      const match = rawMessage.match(pattern);
      if (match?.[1]) {
        extracted.regiao = normalizeRegionFragment(match[1]);
        segmentsToStrip.push(match[0]);
        break;
      }
    }
  }

  const symptomPatterns = [
    /(?:sintomas?\s*[:\-]?\s*|estou sentindo\s+|eu estou sentindo\s+|tenho sentido\s+|to sentindo\s+)(.+)$/i,
    /(?:estou com\s+|to com\s+|sinto\s+)(.+)$/i,
  ];
  for (const pattern of symptomPatterns) {
    const match = removeAccents(rawMessage).match(pattern);
    if (match?.[1]) {
      const candidate = cleanSymptomFragment(match[1]);
      if (candidate && !/^\d{1,3}\s*anos?/i.test(candidate)) {
        extracted.sintomas = candidate;
        segmentsToStrip.push(match[0]);
        break;
      }
    }
  }

  const residualMessage = buildResidualMessage(rawMessage, segmentsToStrip);
  const leadingCompactIdentity = extractLeadingCompactIdentity(rawMessage);
  const compactIdentity = extractCompactIdentity(residualMessage);
  const compactNameAndRegion = extractCompactNameAndRegion(residualMessage);
  const looseAgeAndRegion = extractLooseAgeAndRegion(residualMessage);

  if (
    !extracted.nome &&
    (leadingCompactIdentity.nome || compactIdentity.nome || compactNameAndRegion.nome)
  ) {
    extracted.nome =
      leadingCompactIdentity.nome || compactIdentity.nome || compactNameAndRegion.nome;
  }

  if (
    !extracted.idade &&
    (leadingCompactIdentity.idade || compactIdentity.idade || looseAgeAndRegion.idade)
  ) {
    extracted.idade =
      leadingCompactIdentity.idade || compactIdentity.idade || looseAgeAndRegion.idade;
  }

  if (
    !extracted.regiao &&
    (leadingCompactIdentity.regiao ||
      compactIdentity.regiao ||
      compactNameAndRegion.regiao ||
      looseAgeAndRegion.regiao)
  ) {
    extracted.regiao =
      leadingCompactIdentity.regiao ||
      compactIdentity.regiao ||
      compactNameAndRegion.regiao ||
      looseAgeAndRegion.regiao;
  }

  if (!extracted.nome && extracted.regiao) {
    const looseName = extractLooseName(residualMessage);
    if (looseName) {
      extracted.nome = looseName;
    }
  }

  if (!extracted.sintomas && containsSymptomKeyword(lowerMessage)) {
    if (residualMessage.length >= 12) {
      extracted.sintomas = limparFragmentoExtraido(
        sanitizeSymptomPunctuation(residualMessage)
      );
    }
  }

  return extracted;
}

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, MaskitoDirective],
  templateUrl: './app.component.html',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly http = inject(HttpClient);

  readonly PHONE_NUMBER = '+5581981310778';
  readonly whatsappMaskOptions: MaskitoOptions = {
    mask: ({ value }) => getWhatsappMaskExpression(value),
  };

  consultaForm = new FormGroup({
    nome: new FormControl('', { nonNullable: true }),
    idade: new FormControl('', { nonNullable: true }),
    regiao: new FormControl('', { nonNullable: true }),
    sintomas: new FormControl('', { nonNullable: true }),
    whatsapp: new FormControl('', {
      nonNullable: true,
      validators: [whatsappValidator],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email],
    }),
  });
  mensagemControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  saudacao = '';
  dadosUsuario: PatientProfile = createEmptyPatientProfile();
  triageSummary: TriageSummary = createEmptyTriageSummary();
  chatMessages: ChatMessage[] = [];
  turnCount = 0;
  enviado = false;
  isLoading = false;
  isFallbackMode = false;
  readyForWhatsApp = false;
  erroChat = '';
  safetyNotice = '';
  emailDispatchState: EmailDispatchState = 'idle';
  emailDispatchTone: EmailDispatchTone = 'info';
  emailDispatchMessage = '';
  userCopyEmailSent = false;
  userCopyEmailTarget = '';
  userCopyEmailAvailable = true;
  preAtendimentoSession: PreAtendimentoSessionState = this.createSessionState();

  private nextMessageId = 1;
  private debugInactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly boundPageHide = () => {
    void this.handlePageExit('tab_closed');
  };
  private readonly boundBeforeUnload = () => {
    void this.handlePageExit('tab_closed');
  };
  private readonly boundVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void this.handlePageExit('tab_closed');
    }
  };

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ngZone: NgZone
  ) {
    this.definirSaudacao();
    this.iniciarChat();
    this.registrarListenersDeDebug();
  }

  get canSendMessage(): boolean {
    return (
      !this.isLoading &&
      !this.readyForWhatsApp &&
      !!this.mensagemControl.value.trim()
    );
  }

  get emailResumo(): string {
    const email = normalizeTextValue(this.consultaForm.controls.email.getRawValue());
    return isValidEmailValue(email) ? email : '';
  }

  get whatsappResumo(): string {
    const whatsapp = normalizeTextValue(
      this.consultaForm.controls.whatsapp.getRawValue()
    );
    return isValidWhatsapp(whatsapp) ? formatWhatsapp(whatsapp) : '';
  }

  get canProceedToWhatsApp(): boolean {
    const rawEmail = normalizeTextValue(
      this.consultaForm.controls.email.getRawValue()
    );
    const rawWhatsapp = normalizeTextValue(
      this.consultaForm.controls.whatsapp.getRawValue()
    );

    return (
      (!rawEmail || this.consultaForm.controls.email.valid) &&
      (!rawWhatsapp || this.consultaForm.controls.whatsapp.valid) &&
      hasValidReturnContact(this.obterDadosPaciente())
    );
  }

  private definirSaudacao() {
    const hora = new Date().getHours();

    if (hora >= 5 && hora < 12) {
      this.saudacao = 'Bom dia ☀️';
    } else if (hora >= 12 && hora < 18) {
      this.saudacao = 'Boa tarde 😎';
    } else {
      this.saudacao = 'Boa noite 🌙';
    }
  }

  private iniciarChat() {
    this.cancelDebugInactivityTimer();
    this.chatMessages = [];
    this.turnCount = 0;
    this.enviado = false;
    this.isLoading = false;
    this.isFallbackMode = false;
    this.readyForWhatsApp = false;
    this.erroChat = '';
    this.safetyNotice = '';
    this.emailDispatchState = 'idle';
    this.emailDispatchTone = 'info';
    this.emailDispatchMessage = '';
    this.userCopyEmailSent = false;
    this.userCopyEmailTarget = '';
    this.userCopyEmailAvailable = true;
    this.preAtendimentoSession = this.createSessionState();
    this.dadosUsuario = createEmptyPatientProfile();
    this.triageSummary = createEmptyTriageSummary();
    this.nextMessageId = 1;
    this.consultaForm.reset(createEmptyPatientProfile());
    this.mensagemControl.reset('');
    this.mensagemControl.enable({ emitEvent: false });
    this.addMessage(
      'assistant',
      `${this.saudacao}\nQue bom que você está aqui para cuidar da sua saúde.\n\n Conte-me, do seu jeito: seu nome, sua idade, em qual região do Recife você está, como você está se sentindo e um número de WhatsApp com DDD e/ou um endereço de e-mail válido para que eu possa entrar em contato com você.`,
      'Assistente virtual'
    );
  }

  async enviarMensagemChat() {
    const mensagem = this.normalizeText(this.mensagemControl.value);
    if (!mensagem || this.isLoading || this.readyForWhatsApp) {
      return;
    }

    this.erroChat = '';

    const extracted = this.extrairDadosDaMensagem(mensagem);
    this.aplicarDadosExtraidos(extracted);
    const profileAfterMerge = this.obterDadosPaciente();

    this.addMessage('user', mensagem, 'Você');
    this.markUserInteraction();
    this.mensagemControl.setValue('');

    if (!hasValidReturnContact(profileAfterMerge)) {
      this.scheduleDebugInactivityTimer();
      this.addMessage(
        'assistant',
        this.buildMissingContactReply(),
        'Assistente virtual'
      );
      return;
    }

    if (!canFinalizePreAtendimento(profileAfterMerge)) {
      this.scheduleDebugInactivityTimer();
      this.addMessage(
        'assistant',
        this.buildPendingReply(this.getMissingRequiredFields(profileAfterMerge)),
        'Assistente virtual'
      );
      return;
    }

    this.turnCount += 1;
    this.isLoading = true;
    this.scheduleDebugInactivityTimer();

    try {
      const response = this.isFallbackMode
        ? this.buildFallbackResponse(mensagem)
        : await this.solicitarPreAtendimento(mensagem);

      this.aplicarRespostaAgente(response);
    } catch (error) {
      const errorMessage = this.getChatErrorMessage(error);
      this.erroChat = errorMessage;
      if (!this.isFallbackMode) {
        this.isFallbackMode = true;
      }

      this.aplicarRespostaAgente(
        this.buildFallbackResponse(mensagem, errorMessage)
      );
    } finally {
      this.isLoading = false;
    }
  }

  private async solicitarPreAtendimento(
    latestUserMessage: string
  ): Promise<ChatApiResponse> {
    const payload: ChatApiRequest = {
      messages: [{ role: 'user', content: latestUserMessage }],
      collectedData: this.obterDadosPaciente(),
      turnsUsed: this.turnCount,
    };

    return await firstValueFrom(
      this.http.post<ChatApiResponse>(
        '/.netlify/functions/pre-atendimento',
        payload
      )
    );
  }

  private aplicarRespostaAgente(response: ChatApiResponse) {
    this.aplicarDadosExtraidos(response.collectedData);
    this.safetyNotice = response.safetyNotice?.trim() || this.safetyNotice;

    if (response.reply.trim()) {
      this.addMessage('assistant', response.reply.trim(), 'Assistente virtual');
    }

    if (response.shouldFinalize) {
      this.finalizarChat(response.triage, response.safetyNotice);
    }
  }

  private getChatErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const backendMessage =
        typeof error.error === 'string'
          ? error.error
          : this.normalizeText(error.error?.error);
      const normalized = this.removeAccents(backendMessage.toLowerCase());

      if (
        error.status === 429 ||
        normalized.includes('quota') ||
        normalized.includes('billing')
      ) {
        return 'A IA da OpenAI respondeu que a conta esta sem cota ou credito de API no momento. Vou seguir no modo assistido para nao travar seu atendimento.';
      }

      if (error.status === 401 || normalized.includes('api key')) {
        return 'A chave da OpenAI parece invalida ou nao foi aceita. Vou seguir no modo assistido para nao travar seu atendimento.';
      }

      if (backendMessage) {
        return `A IA ficou indisponivel agora (${backendMessage}). Vou seguir no modo assistido para nao travar seu atendimento.`;
      }
    }

    return 'Tive uma instabilidade rapidinha na IA e vou continuar seu pre-atendimento aqui mesmo.';
  }

  private aplicarDadosExtraidos(data: Partial<PatientProfile>) {
    const current = this.obterDadosPacienteRaw();
    const next: PatientProfile = {
      nome: this.normalizeText(data.nome) || current.nome,
      idade: this.normalizeText(data.idade) || current.idade,
      regiao: this.normalizeText(data.regiao) || current.regiao,
      sintomas: this.normalizeText(data.sintomas) || current.sintomas,
      email: current.email,
      whatsapp: current.whatsapp,
    };

    const incomingEmail = this.normalizeText(data.email);
    if (incomingEmail) {
      next.email = incomingEmail;
    }

    const incomingWhatsapp = this.normalizeText(data.whatsapp);
    if (incomingWhatsapp) {
      next.whatsapp = isValidWhatsapp(incomingWhatsapp)
        ? formatWhatsapp(incomingWhatsapp)
        : incomingWhatsapp;
    }

    this.consultaForm.patchValue(next);
  }

  private finalizarChat(summary?: TriageSummary, safetyNotice?: string) {
    const patient = this.obterDadosPaciente();
    if (!hasValidReturnContact(patient)) {
      this.addMessage(
        'assistant',
        this.buildMissingContactReply(),
        'Assistente virtual'
      );
      return;
    }

    const triage = this.mergeTriageSummary(summary, this.buildLocalTriage(patient));

    this.dadosUsuario = patient;
    this.triageSummary = triage;
    this.safetyNotice =
      safetyNotice?.trim() || this.getSafetyNotice(patient.sintomas) || '';
    this.preAtendimentoSession.finalizedAt = new Date().toISOString();
    this.readyForWhatsApp = true;
    this.mensagemControl.disable({ emitEvent: false });
    this.cancelDebugInactivityTimer();
    this.scrollToLatestAssistantMessage();
    void this.enviarResumoPorEmail('finalize', patient, triage);
  }

  private createSessionState(): PreAtendimentoSessionState {
    const now = new Date().toISOString();

    return {
      sessionId: this.generateSessionId(),
      startedAt: now,
      lastUserMessageAt: '',
      finalizedAt: '',
      debugEmailSentAt: '',
      debugReason: '',
    };
  }

  private generateSessionId(): string {
    if (
      isPlatformBrowser(this.platformId) &&
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }

    return `pre-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private markUserInteraction() {
    this.preAtendimentoSession.lastUserMessageAt = new Date().toISOString();
  }

  private canSendDebugEmail(): boolean {
    return (
      !!this.preAtendimentoSession.sessionId &&
      !!this.preAtendimentoSession.lastUserMessageAt &&
      !this.preAtendimentoSession.finalizedAt &&
      !this.preAtendimentoSession.debugEmailSentAt
    );
  }

  private scheduleDebugInactivityTimer() {
    if (!isPlatformBrowser(this.platformId) || !this.canSendDebugEmail()) {
      return;
    }

    this.cancelDebugInactivityTimer();
    this.debugInactivityTimer = setTimeout(() => {
      void this.enviarDebugAbandono('inactivity');
    }, DEBUG_INACTIVITY_MS);
  }

  private cancelDebugInactivityTimer() {
    if (this.debugInactivityTimer) {
      clearTimeout(this.debugInactivityTimer);
      this.debugInactivityTimer = null;
    }
  }

  private registrarListenersDeDebug() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    window.addEventListener('pagehide', this.boundPageHide);
    window.addEventListener('beforeunload', this.boundBeforeUnload);
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
  }

  private removerListenersDeDebug() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    window.removeEventListener('pagehide', this.boundPageHide);
    window.removeEventListener('beforeunload', this.boundBeforeUnload);
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);
  }

  private buildDebugPayload(
    reason: DebugAbandonmentReason
  ): PreAtendimentoDebugPayload {
    const patient = this.obterDadosPaciente();

    return {
      sessionId: this.preAtendimentoSession.sessionId,
      reason,
      patient,
      userMessages: this.getUserMessagesForEmail(),
      assistantReply: this.getLatestAssistantReply() || undefined,
      turnCount: this.turnCount,
      isFallbackMode: this.isFallbackMode,
      hasValidReturnContact: hasValidReturnContact(patient),
      startedAt: this.preAtendimentoSession.startedAt,
      lastInteractionAt:
        this.preAtendimentoSession.lastUserMessageAt ||
        this.preAtendimentoSession.startedAt,
    };
  }

  private async enviarDebugAbandono(
    reason: DebugAbandonmentReason
  ): Promise<boolean> {
    if (!this.canSendDebugEmail()) {
      return false;
    }

    this.preAtendimentoSession.debugEmailSentAt = new Date().toISOString();
    this.preAtendimentoSession.debugReason = reason;
    this.cancelDebugInactivityTimer();

    try {
      const response = await firstValueFrom(
        this.http.post<PreAtendimentoDebugResponse>(
          '/.netlify/functions/debug-pre-atendimento-abandonado',
          this.buildDebugPayload(reason)
        )
      );

      if (response.duplicate) {
        return true;
      }

      return response.ok;
    } catch {
      return false;
    }
  }

  private sendDebugBeacon(payload: PreAtendimentoDebugPayload): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    const body = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], {
        type: 'application/json; charset=UTF-8',
      });
      return navigator.sendBeacon(
        '/.netlify/functions/debug-pre-atendimento-abandonado',
        blob
      );
    }

    void fetch('/.netlify/functions/debug-pre-atendimento-abandonado', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body,
      keepalive: true,
    }).catch(() => undefined);

    return true;
  }

  private async handlePageExit(
    reason: DebugAbandonmentReason
  ): Promise<boolean> {
    if (!this.canSendDebugEmail()) {
      return false;
    }

    this.preAtendimentoSession.debugEmailSentAt = new Date().toISOString();
    this.preAtendimentoSession.debugReason = reason;
    this.cancelDebugInactivityTimer();

    return this.sendDebugBeacon(this.buildDebugPayload(reason));
  }

  private mergeTriageSummary(
    primary?: Partial<TriageSummary>,
    fallback?: TriageSummary
  ): TriageSummary {
    const backup = fallback ?? createEmptyTriageSummary();

    return {
      especialidadeRelacionada:
        this.normalizeText(primary?.especialidadeRelacionada) ||
        backup.especialidadeRelacionada,
      hipoteseInicial:
        this.normalizeText(primary?.hipoteseInicial) || backup.hipoteseInicial,
      explicacao: this.normalizeText(primary?.explicacao) || backup.explicacao,
      abordagemProativa:
        this.normalizeText(primary?.abordagemProativa) ||
        backup.abordagemProativa,
      cobertura: this.normalizeText(primary?.cobertura) || backup.cobertura,
      horarios: this.normalizeText(primary?.horarios) || backup.horarios,
      observacaoFinal:
        this.normalizeText(primary?.observacaoFinal) || backup.observacaoFinal,
    };
  }

  async enviarWhatsApp() {
    if (
      !this.readyForWhatsApp ||
      !this.canProceedToWhatsApp ||
      !isPlatformBrowser(this.platformId)
    ) {
      return;
    }

    const patient = this.obterDadosPaciente();
    const triage = this.mergeTriageSummary(
      this.triageSummary,
      this.buildLocalTriage(patient)
    );
    const mensagem = this.montarMensagemWhatsApp(patient);
    const numero = this.PHONE_NUMBER.replace(/\D/g, '');
    const urlWhatsApp = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

    this.dadosUsuario = patient;
    this.triageSummary = triage;
    this.enviado = true;
    window.open(urlWhatsApp, '_blank', 'noopener,noreferrer');

    if (
      this.userCopyEmailAvailable &&
      isValidEmailValue(patient.email) &&
      (!this.userCopyEmailSent || this.userCopyEmailTarget !== patient.email)
    ) {
      void this.enviarResumoPorEmail('user_copy', patient, triage);
    }
  }

  montarMensagemWhatsApp(
    patient: PatientProfile = this.obterDadosPaciente()
  ): string {
    return buildWhatsAppHandoffMessage(
      patient,
      this.saudacao,
      this.safetyNotice
    );
  }

  corrigirDados() {
    this.resetarChat();
  }

  resetarChat() {
    this.iniciarChat();
  }

  formatarCampo(valor: string): string {
    return this.normalizeText(valor) || 'Nao informado';
  }

  private obterDadosPacienteRaw(): PatientProfile {
    const rawValue = this.consultaForm.getRawValue();

    return {
      nome: this.normalizeText(rawValue.nome),
      idade: this.normalizeText(rawValue.idade),
      regiao: this.normalizeText(rawValue.regiao),
      sintomas: this.normalizeText(rawValue.sintomas),
      email: this.normalizeText(rawValue.email),
      whatsapp: this.normalizeText(rawValue.whatsapp),
    };
  }

  private obterDadosPaciente(): PatientProfile {
    const rawValue = this.obterDadosPacienteRaw();

    return {
      ...rawValue,
      email: isValidEmailValue(rawValue.email) ? rawValue.email : '',
      whatsapp: isValidWhatsapp(rawValue.whatsapp)
        ? formatWhatsapp(rawValue.whatsapp)
        : '',
    };
  }

  private normalizeText(value: unknown): string {
    return normalizeTextValue(value);
  }

  private addMessage(role: ChatRole, content: string, footer: string) {
    this.chatMessages = [
      ...this.chatMessages,
      {
        id: this.nextMessageId++,
        role,
        content,
        footer,
      },
    ];
    this.scrollChatToBottom();
  }

  private scrollChatToBottom() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    setTimeout(() => {
      const log = this.elementRef.nativeElement.querySelector(
        '#agendamento-chat-log'
      ) as HTMLElement | null;
      if (log) {
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  private scrollToLatestAssistantMessage() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    setTimeout(() => {
      const log = this.elementRef.nativeElement.querySelector(
        '#agendamento-chat-log'
      ) as HTMLElement | null;
      if (!log) {
        return;
      }

      const assistantMessages = log.querySelectorAll('.chat.chat-start');
      const lastAssistantMessage = assistantMessages.item(
        assistantMessages.length - 1
      ) as HTMLElement | null;

      if (lastAssistantMessage) {
        log.scrollTop = Math.max(0, lastAssistantMessage.offsetTop - 12);
      }
    });
  }

  private async enviarResumoPorEmail(
    mode: EmailSummaryMode,
    patient: PatientProfile,
    triage: TriageSummary
  ): Promise<boolean> {
    if (mode === 'user_copy' && !isValidEmailValue(patient.email)) {
      return false;
    }

    this.emailDispatchState = 'sending';
    this.emailDispatchTone = 'info';
    this.emailDispatchMessage =
      mode === 'finalize'
        ? 'Enviando o resumo do pre-atendimento por e-mail...'
        : 'Enviando sua cópia por e-mail...';

    const payload: PreAtendimentoEmailPayload = {
      mode,
      patient,
      triage,
      safetyNotice: this.safetyNotice || undefined,
      assistantReply: this.getLatestAssistantReply() || undefined,
      userMessages: this.getUserMessagesForEmail(),
    };

    try {
      const response = await firstValueFrom(
        this.http.post<PreAtendimentoEmailResponse>(
          '/.netlify/functions/enviar-resumo-pre-atendimento',
          payload
        )
      );

      this.emailDispatchState = 'sent';
      this.emailDispatchTone = 'success';
      this.emailDispatchMessage = response.message;
      this.userCopyEmailAvailable = response.userCopyAvailable;

      if (mode === 'finalize' && response.userIncluded && patient.email) {
        this.userCopyEmailSent = true;
        this.userCopyEmailTarget = patient.email;
      }

      if (
        mode === 'user_copy' &&
        response.userCopyAvailable &&
        patient.email
      ) {
        this.userCopyEmailSent = true;
        this.userCopyEmailTarget = patient.email;
      }

      return true;
    } catch (error) {
      this.emailDispatchState = 'error';
      this.emailDispatchTone = 'warning';
      this.emailDispatchMessage =
        mode === 'finalize'
          ? 'Nao consegui enviar o resumo por e-mail agora, mas você pode seguir no WhatsApp sem problema.'
          : 'Nao consegui enviar sua cópia por e-mail agora, mas o WhatsApp ja esta pronto para continuar.';

      if (error instanceof HttpErrorResponse) {
        const backendMessage =
          typeof error.error === 'string'
            ? error.error
            : this.normalizeText(error.error?.message || error.error?.error);

        if (backendMessage) {
          this.emailDispatchMessage = `${this.emailDispatchMessage} (${backendMessage})`;
        }
      }

      return false;
    }
  }

  private getLatestAssistantReply(): string {
    return (
      [...this.chatMessages]
        .reverse()
        .find((message) => message.role === 'assistant')
        ?.content.trim() ?? ''
    );
  }

  private getUserMessagesForEmail(): string[] {
    return this.chatMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.content.trim())
      .filter(Boolean);
  }

  private buildFallbackResponse(
    userMessage: string,
    fallbackReason = ''
  ): ChatApiResponse {
    const extracted = this.extrairDadosDaMensagem(userMessage);
    const current = this.obterDadosPaciente();
    const merged: PatientProfile = {
      nome: extracted.nome || current.nome,
      idade: extracted.idade || current.idade,
      regiao: extracted.regiao || current.regiao,
      sintomas: extracted.sintomas || current.sintomas,
      email:
        extracted.email && this.isValidEmail(extracted.email)
          ? extracted.email
          : current.email,
      whatsapp:
        extracted.whatsapp && isValidWhatsapp(extracted.whatsapp)
          ? formatWhatsapp(extracted.whatsapp)
          : current.whatsapp,
    };

    const missingFields = this.getMissingRequiredFields(merged);
    const triage = this.buildLocalTriage(merged);
    const safetyNotice = this.getSafetyNotice(merged.sintomas);
    const hasReturnContact = hasValidReturnContact(merged);
    const shouldFinalize =
      canFinalizePreAtendimento(merged);

    let reply = '';

    if (!hasReturnContact) {
      reply = this.buildMissingContactReply();
    } else if (shouldFinalize) {
      reply = buildRichFinalReply(merged, triage, safetyNotice);
    } else {
      reply = this.buildPendingReply(missingFields);
    }

    if (fallbackReason) {
      triage.observacaoFinal = this.normalizeText(
        `${triage.observacaoFinal} Estou em modo assistido por aqui, mas sigo com seu atendimento normalmente.`
      );
    }

    return {
      reply,
      collectedData: merged,
      triage,
      missingFields,
      shouldFinalize,
      safetyNotice,
    };
  }

  private extrairDadosDaMensagem(message: string): Partial<PatientProfile> {
    return extractPatientDataFromMessage(message);
  }

  private limparFragmento(value: string): string {
    return limparFragmentoExtraido(value);
  }

  private containsSymptomKeyword(text: string): boolean {
    return containsSymptomKeyword(text);
  }

  private getMissingRequiredFields(
    profile: PatientProfile = this.obterDadosPaciente()
  ): RequiredField[] {
    return REQUIRED_FIELDS.filter((field) => !this.normalizeText(profile[field]));
  }

  private formatarCamposPendentes(fields: RequiredField[]): string {
    return this.formatarListaNatural(fields.map((field) => FIELD_LABELS[field]));
  }

  private formatarListaNatural(items: string[]): string {
    if (items.length === 0) {
      return '';
    }

    if (items.length === 1) {
      return items[0];
    }

    if (items.length === 2) {
      return `${items[0]} e ${items[1]}`;
    }

    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  }

  private isValidEmail(email: string): boolean {
    return isValidEmailValue(email.trim());
  }

  private buildMissingContactReply(): string {
    const rawEmail = normalizeTextValue(this.consultaForm.controls.email.getRawValue());
    const rawWhatsapp = normalizeTextValue(
      this.consultaForm.controls.whatsapp.getRawValue()
    );
    const hasInvalidContact =
      (!!rawEmail && this.consultaForm.controls.email.invalid) ||
      (!!rawWhatsapp && this.consultaForm.controls.whatsapp.invalid);

    if (hasInvalidContact) {
      return 'As informações de contato que apareceram aqui não são válidas. Antes de entrar em contato, preciso de um número de WhatsApp com DDD e/ou um endereço de e-mail válido para que a Dra. Luiza possa responder. Você poderia me enviar essas informações?';
    }

    return 'Preciso de um número de WhatsApp com DDD e/ou um endereço de e-mail válido para que a Dra. Luiza possa responder. Dessa forma, a equipe poderá entrar em contato com você sem perder a etapa de pré-atendimento.';
  }

  private buildPendingReply(missingFields: RequiredField[]): string {
    return `Anotei tudo direitinho ate aqui. Agora me manda ${this.formatarCamposPendentes(
      missingFields
    )} para eu fechar seu pre-atendimento.`;
  }

  private buildLocalTriage(profile: PatientProfile): TriageSummary {
    const symptomsText = this.removeAccents(
      `${profile.sintomas} ${profile.regiao}`.toLowerCase()
    );
    const idade = Number(profile.idade);
    const coverage = this.resolveCoverage(profile.regiao);
    const safetyNotice = this.getSafetyNotice(profile.sintomas);

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
      ['ombro', 'joelho', 'coluna', 'lombar', 'cervical', 'fratura', 'cirurgia', 'tendinite', 'lesao', 'dor'].some(
        (keyword) => symptomsText.includes(keyword)
      )
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

  private resolveCoverage(regiao: string): string {
    return resolveCoverageSummary(regiao);
  }

  private getSafetyNotice(symptoms: string): string {
    const normalized = this.removeAccents(symptoms.toLowerCase());
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

  private removeAccents(value: string): string {
    return removeAccents(value);
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      const select = (selector: string) =>
        this.elementRef.nativeElement.querySelector(selector);

      const selectAll = (selector: string): NodeListOf<Element> =>
        this.elementRef.nativeElement.querySelectorAll(selector);

      const tl = gsap.timeline({
        defaults: {
          duration: 1,
          ease: 'power3.out',
        },
      });

      const isotype = select('#isotype');
      const combinationMark = select('#combination-mark');
      const isotypePaths = selectAll('#isotype path');
      const logotype = select('#logotype');
      const wordmark = selectAll('#wordmark path');
      const tagline = selectAll('#tagline path');
      const cabecalho = selectAll('#cabecalho *');
      const diferencial = selectAll('#diferencial > div');

      tl.to(isotype, { x: 64, duration: 0.08 })
        .to(logotype, { x: -36, duration: 0.08 })
        .to(cabecalho, { opacity: 0, y: 4, duration: 0.08 })
        .to(diferencial, { opacity: 0, y: 4, duration: 0.08 })
        .from(combinationMark, {
          scale: 0,
          opacity: 0,
          duration: 1,
          ease: 'elastic.out(1, 0.5)',
        })
        .from(
          isotypePaths,
          {
            stagger: 0.1,
            scale: 0,
            opacity: 0,
            transformOrigin: 'center',
            ease: 'bounce.out',
          },
          '-=0.8'
        )
        .to(isotype, { x: 0 })
        .to(logotype, { x: 0 }, '-=1')
        .from(
          wordmark,
          {
            opacity: 0,
            scale: 0.1,
          },
          '-=1'
        )
        .from(
          tagline,
          {
            stagger: 0.07,
            scale: 0,
            opacity: 0,
            transformOrigin: 'center',
            ease: 'bounce.out',
          },
          '-=1.2'
        )
        .to(
          cabecalho,
          {
            opacity: 1,
            y: 0,
            duration: 1,
            stagger: 0.1,
          },
          '-=1.2'
        )
        .to(
          diferencial,
          {
            opacity: 1,
            y: 0,
            duration: 1,
            stagger: 0.1,
          },
          '-=0.8'
        );

      const sectionIds = [
        'sintomas',
        'tratamento',
        'especialidades',
        'justificativa',
        'agendamento',
        'dicas-habitos',
        'bem-estar',
      ];

      sectionIds.forEach((id) => {
        const el = select(`#${id} > div`);
        if (el) {
          const timeline = gsap.timeline({
            defaults: { duration: 1, ease: 'power3.out' },
          });
          timeline.from(el, { opacity: 0, y: 100 });
          ScrollTrigger.create({
            trigger: el,
            start: 'top 95%',
            end: 'top 25%',
            scrub: true,
            animation: timeline,
          });
        }
      });
    });
  }

  ngOnDestroy() {
    this.cancelDebugInactivityTimer();
    this.removerListenersDeDebug();
  }
}
