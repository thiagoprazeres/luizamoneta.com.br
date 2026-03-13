import {
  canFinalizePreAtendimento,
  buildWhatsAppHandoffMessage,
  buildRichFinalReply,
  shouldUseRichFinalReplyFallback,
  type PatientProfile,
  type TriageSummary,
} from './pre-atendimento-summary';

describe('buildWhatsAppHandoffMessage', () => {
  const createPatient = (
    overrides: Partial<PatientProfile> = {}
  ): PatientProfile => ({
    nome: 'Marina',
    idade: '62',
    regiao: 'Zona Norte do Recife',
    sintomas: 'dor no joelho ao subir escadas',
    email: 'marina@example.com',
    whatsapp: '(81) 98131-0778',
    ...overrides,
  });
  const createTriage = (
    overrides: Partial<TriageSummary> = {}
  ): TriageSummary => ({
    especialidadeRelacionada: 'Traumato-ortopedia',
    hipoteseInicial: '',
    explicacao: '',
    abordagemProativa: '',
    cobertura: '',
    horarios: '',
    observacaoFinal: '',
    ...overrides,
  });

  it('monta o handoff com nome e queixa curta', () => {
    const message = buildWhatsAppHandoffMessage(
      createPatient(),
      'Bom dia'
    );

    expect(message).toBe(
      'Bom dia!\n\nOi, sou Marina. Acabei de concluir meu pre-atendimento pelo site e queria continuar por aqui.\n\nMinha principal queixa e: dor no joelho ao subir escadas.'
    );
  });

  it('trunca a queixa longa sem carregar a frase seguinte', () => {
    const message = buildWhatsAppHandoffMessage(
      createPatient({
        sintomas:
          'dor no ombro direito ha algumas semanas, piora para levantar o braco, vestir roupa, carregar sacolas pesadas, dirigir por muito tempo e alcancar objetos altos no armario. Tambem sinto dormencia nos dedos.',
      }),
      'Boa tarde'
    );

    expect(message).toContain(
      'Minha principal queixa e: dor no ombro direito ha algumas semanas, piora para levantar o braco, vestir roupa, carregar sacolas pesadas,...'
    );
    expect(message).not.toContain('Tambem sinto dormencia nos dedos');
  });

  it('remove a linha da queixa quando sintomas nao estao disponiveis', () => {
    const message = buildWhatsAppHandoffMessage(
      createPatient({ sintomas: '   ' }),
      'Boa noite'
    );

    expect(message).toBe(
      'Boa noite!\n\nOi, sou Marina. Acabei de concluir meu pre-atendimento pelo site e queria continuar por aqui.'
    );
    expect(message).not.toContain('Minha principal queixa e:');
  });

  it('ignora o safetyNotice e mantem a mesma mensagem', () => {
    const patient = createPatient({
      sintomas: 'tontura ao levantar da cama',
    });

    const withoutSafety = buildWhatsAppHandoffMessage(patient, 'Bom dia');
    const withSafety = buildWhatsAppHandoffMessage(
      patient,
      'Bom dia',
      'Se a tontura piorar, procure urgencia.'
    );

    expect(withSafety).toBe(withoutSafety);
  });

  it('so permite finalizar quando todos os campos obrigatorios e um contato valido estiverem presentes', () => {
    expect(
      canFinalizePreAtendimento(
        createPatient({
          idade: '',
          regiao: '',
        })
      )
    ).toBeFalse();

    expect(canFinalizePreAtendimento(createPatient())).toBeTrue();
  });

  it('faz fallback quando a resposta final vem seca demais em poucos blocos', () => {
    const reply =
      'Oi Thiago! Que bom te conhecer.\n\nA Dra. Luiza e especialista em traumatologia/ortopedia e vamos alinhar seu atendimento pelo WhatsApp.';

    expect(
      shouldUseRichFinalReplyFallback(reply, createTriage())
    ).toBeTrue();
  });

  it('faz fallback quando a resposta final vem longa, mas sem o toque leve de emoji', () => {
    const reply =
      'Oi Nathalia!\n\nQue bom te conhecer. Pela sua queixa, a Reabilitacao Vestibular faz sentido para investigar melhor as tonturas e entender como isso conversa com a dor lombar no seu dia a dia.\n\nA ideia e observar gatilhos, equilibrio e sobrecargas para montar um plano individualizado, e depois seguimos pelo WhatsApp para combinar o atendimento domiciliar em Recife.\n\nSe quiser, a gente alinha os proximos passos por la.';

    expect(
      shouldUseRichFinalReplyFallback(
        reply,
        createTriage({ especialidadeRelacionada: 'Reabilitacao vestibular' })
      )
    ).toBeTrue();
  });

  it('limpa pontuacao sobrando dos sintomas no fechamento rico', () => {
    const reply = buildRichFinalReply(
      createPatient({
        nome: 'Nathalia Augusta Alves ferreira',
        sintomas: 'Tonturas e dor na lombar, ,',
      }),
      createTriage({ especialidadeRelacionada: 'Reabilitacao vestibular' })
    );

    expect(reply).toContain('Pelo que você descreveu sobre Tonturas e dor na lombar, essa queixa');
    expect(reply).not.toContain('lombar, ,');
    expect(reply).not.toContain('lombar, ,,');
  });
});
