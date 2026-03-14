import {
  canFinalizePreAtendimento,
  buildWhatsAppHandoffMessage,
  buildRichFinalReply,
  getPreAtendimentoSummarySections,
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
    detalhesDoCaso: '',
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

  it('limpa pontuacao sobrando dos sintomas no fechamento rico', () => {
    const reply = buildRichFinalReply(
      createPatient({
        nome: 'Nathalia Augusta Alves ferreira',
        sintomas: 'Tonturas e dor na lombar, ,',
      }),
      createTriage({ especialidadeRelacionada: 'Reabilitacao vestibular' })
    );

    expect(reply).toContain('Pelo que você descreveu sobre Tonturas e dor na lombar');
    expect(reply).not.toContain('lombar, ,');
    expect(reply).not.toContain('lombar, ,,');
  });

  it('usa o gancho da lesao esportiva no fallback local sem puxar horario ou cobertura', () => {
    const reply = buildRichFinalReply(
      createPatient({
        nome: 'Chesque',
        regiao: 'Zona Sul',
        sintomas: 'dor no joelho ao agachar, subir escada e correr',
        detalhesDoCaso:
          'Estava jogando futebol e senti o joelho saindo do lugar depois de uma pancada.',
      }),
      createTriage({ especialidadeRelacionada: 'Traumato-ortopedia' })
    );

    expect(reply).toContain('futebol');
    expect(reply).toContain('joelho');
    expect(reply).toContain('WhatsApp');
    expect(reply).not.toContain('Seg a Sex');
    expect(reply).not.toContain('Zona Sul');
    expect(reply).not.toContain('avaliação funcional');
  });

  it('inclui detalhes do caso no resumo apenas quando houver conteudo', () => {
    const withDetails = getPreAtendimentoSummarySections(
      createPatient({ detalhesDoCaso: 'Torci o joelho na pelada de domingo.' }),
      createTriage()
    );
    const withoutDetails = getPreAtendimentoSummarySections(
      createPatient(),
      createTriage()
    );

    expect(withDetails[0].items.some((item) => item.label === 'Detalhes do caso')).toBeTrue();
    expect(withoutDetails[0].items.some((item) => item.label === 'Detalhes do caso')).toBeFalse();
  });
});
