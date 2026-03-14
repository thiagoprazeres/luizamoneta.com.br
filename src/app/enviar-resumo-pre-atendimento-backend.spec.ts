import {
  buildAiStatusLabel,
  buildAssistantReplyForEmail,
  buildResponseMessage,
  getCc,
  isRestrictedEmailMode,
} from '../../netlify/functions/enviar-resumo-pre-atendimento';
import {
  formatRichReplyParagraphs,
  type PatientProfile,
  type TriageSummary,
} from './pre-atendimento-summary';

describe('enviar-resumo-pre-atendimento backend rules', () => {
  const patient: PatientProfile = {
    nome: 'Andre',
    idade: '56',
    regiao: 'Casa Amarela',
    sintomas: 'dor no joelho ao correr',
    detalhesDoCaso: '',
    email: 'andre@example.com',
    whatsapp: '(81) 99999-0000',
  };
  const triage: TriageSummary = {
    especialidadeRelacionada: 'Traumato-ortopedia',
    hipoteseInicial: '',
    explicacao: '',
    abordagemProativa: '',
    cobertura: 'Zona Norte, Sul e Oeste',
    horarios: 'Seg a Sex 6h-19h',
    observacaoFinal: '',
  };

  it('ativa o modo restrito quando o destinatario principal e thiagoprazeres@gmail.com', () => {
    expect(isRestrictedEmailMode('thiagoprazeres@gmail.com')).toBeTrue();
    expect(isRestrictedEmailMode(' lumoneta@gmail.com ')).toBeFalse();
  });

  it('nao inclui paciente em cc durante o finalize no modo restrito', () => {
    expect(getCc('finalize', patient, false)).toBeUndefined();
    expect(getCc('finalize', patient, true)).toEqual(['andre@example.com']);
  });

  it('gera mensagens controladas quando a copia ao paciente esta indisponivel', () => {
    expect(buildResponseMessage('finalize', false, false)).toBe(
      'Resumo enviado para a equipe por e-mail. A cópia ao paciente sera habilitada assim que o envio estiver configurado.'
    );
    expect(buildResponseMessage('user_copy', false, false)).toBe(
      'A cópia por e-mail ao paciente esta temporariamente indisponivel neste ambiente de testes.'
    );
  });

  it('avisa no e-mail quando a IA esta ativa ou quando o fluxo esta em modo assistido', () => {
    expect(buildAiStatusLabel(false)).toBe('IA ativa (OpenAI)');
    expect(buildAiStatusLabel(true)).toBe('Modo assistido/local');
  });

  it('preserva a mensagem da assistente recebida da tela em vez de reconstruir no backend', () => {
    const assistantReply =
      'Boa noite, Chesque!\n\nPoxa, que susto passar por isso jogando bola.\n\nMe chama no WhatsApp para a gente combinar sua avaliacao.';

    expect(
      buildAssistantReplyForEmail(assistantReply, patient, triage, '')
    ).toBe(formatRichReplyParagraphs(assistantReply));
  });
});
