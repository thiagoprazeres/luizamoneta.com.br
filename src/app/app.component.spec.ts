import {
  AppComponent,
  extractPatientDataFromMessage,
  getWhatsappMaskExpression,
} from './app.component';
import {
  hasValidReturnContact,
  type PatientProfile,
} from './pre-atendimento-summary';

describe('AppComponent', () => {
  afterEach(() => {
    try {
      jasmine.clock().uninstall();
    } catch {
      // Some specs do not install the mocked clock.
    }
  });

  it('monta uma mensagem de WhatsApp curta, sem o resumo estruturado', () => {
    const patient: PatientProfile = {
      nome: 'Marina',
      idade: '62',
      regiao: 'Zona Norte do Recife',
      sintomas: 'tontura ha 3 semanas ao caminhar',
      email: 'marina@example.com',
      whatsapp: '(81) 98131-0778',
    };

    const message = AppComponent.prototype.montarMensagemWhatsApp.call(
      {
        saudacao: 'Boa tarde',
        safetyNotice: 'Procure urgencia se piorar.',
      } as AppComponent,
      patient
    );

    expect(message).toContain('Boa tarde!');
    expect(message).toContain(
      'Oi, sou Marina. Acabei de concluir meu pre-atendimento pelo site e queria continuar por aqui.'
    );
    expect(message).toContain(
      'Minha principal queixa e: tontura ha 3 semanas ao caminhar.'
    );
    expect(message).not.toContain('*Dados do paciente*');
    expect(message).not.toContain('*WhatsApp:*');
    expect(message).not.toContain('*E-mail:*');
    expect(message).not.toContain('Zona Norte do Recife');
    expect(message).not.toContain('marina@example.com');
    expect(message).not.toContain('(81) 98131-0778');
    expect(message).not.toContain('Procure urgencia se piorar.');
  });

  it('nao tenta enviar cópia ao paciente quando a cópia por e-mail esta indisponivel', async () => {
    const enviarResumoPorEmail = jasmine
      .createSpy('enviarResumoPorEmail')
      .and.returnValue(Promise.resolve(true));
    const windowOpenSpy = spyOn(window, 'open');
    const patient: PatientProfile = {
      nome: 'Marina',
      idade: '62',
      regiao: 'Zona Norte do Recife',
      sintomas: 'tontura ha 3 semanas ao caminhar',
      email: 'marina@example.com',
      whatsapp: '(81) 98131-0778',
    };

    const componentLike = {
      readyForWhatsApp: true,
      canProceedToWhatsApp: true,
      platformId: 'browser',
      PHONE_NUMBER: '+5581981310778',
      dadosUsuario: patient,
      triageSummary: {
        especialidadeRelacionada: '',
        hipoteseInicial: '',
        explicacao: '',
        abordagemProativa: '',
        cobertura: '',
        horarios: '',
        observacaoFinal: '',
      },
      userCopyEmailAvailable: false,
      userCopyEmailSent: false,
      userCopyEmailTarget: '',
      enviado: false,
      obterDadosPaciente: () => patient,
      buildLocalTriage: () => ({
        especialidadeRelacionada: '',
        hipoteseInicial: '',
        explicacao: '',
        abordagemProativa: '',
        cobertura: '',
        horarios: '',
        observacaoFinal: '',
      }),
      mergeTriageSummary: (_primary: unknown, fallback: unknown) => fallback,
      montarMensagemWhatsApp: () => 'mensagem curta',
      enviarResumoPorEmail,
    } as unknown as AppComponent;

    await AppComponent.prototype.enviarWhatsApp.call(componentLike);

    expect(windowOpenSpy).toHaveBeenCalled();
    expect(enviarResumoPorEmail).not.toHaveBeenCalled();
  });

  it('extrai idade e regiao de uma mensagem curta com os dois campos juntos', () => {
    expect(extractPatientDataFromMessage('54 Recife pernambucano')).toEqual({
      idade: '54',
      regiao: 'Recife pernambucano',
    });
  });

  it('extrai nome, idade e regiao de uma mensagem compacta separada por virgulas', () => {
    expect(extractPatientDataFromMessage('Nathalia,34,recife')).toEqual({
      nome: 'Nathalia',
      idade: '34',
      regiao: 'recife',
    });
  });

  it('extrai nome completo e zona quando a mensagem vem como nome e regiao', () => {
    expect(
      extractPatientDataFromMessage(
        'Nathalia Augusta Alves ferreira,zona sul'
      )
    ).toEqual({
      nome: 'Nathalia Augusta Alves ferreira',
      regiao: 'Zona Sul',
    });
  });

  it('usa mascara de WhatsApp com nono digito para numeros de celular', () => {
    expect(getWhatsappMaskExpression('819')).toEqual([
      '(',
      /\d/,
      /\d/,
      ')',
      ' ',
      /\d/,
      /\d/,
      /\d/,
      /\d/,
      /\d/,
      '-',
      /\d/,
      /\d/,
      /\d/,
      /\d/,
    ]);
  });

  it('usa mascara de telefone com 8 digitos quando o terceiro digito nao e 9', () => {
    expect(getWhatsappMaskExpression('813')).toEqual([
      '(',
      /\d/,
      /\d/,
      ')',
      ' ',
      /\d/,
      /\d/,
      /\d/,
      /\d/,
      '-',
      /\d/,
      /\d/,
      /\d/,
      /\d/,
    ]);
  });

  it('limpa a regiao e impede que sintomas carreguem contato junto', () => {
    expect(
      extractPatientDataFromMessage(
        'Olá Luiza, meu nome é Thiago, tenho 40 anos e moro nas Graças. Estou sentindo uma dor forte no tornozelo, principalmente após jogar bola. Meu e-mail é thiagoprazeres@gmail.com e meu WhatsApp (81) 99707-0825'
      )
    ).toEqual({
      nome: 'Thiago',
      idade: '40',
      regiao: 'Graças',
      sintomas:
        'uma dor forte no tornozelo, principalmente apos jogar bola',
      email: 'thiagoprazeres@gmail.com',
      whatsapp: '(81) 99707-0825',
    });
  });

  it('remove virgulas soltas dos sintomas quando telefone e email sao extraidos da mesma frase', () => {
    expect(
      extractPatientDataFromMessage(
        'Tonturas e dor na lombar, 81996541067, nathaliaoftalmozs@gmail.com'
      )
    ).toEqual({
      sintomas: 'Tonturas e dor na lombar',
      email: 'nathaliaoftalmozs@gmail.com',
      whatsapp: '(81) 99654-1067',
    });
  });

  it('apos duas mensagens compactas, deixa apenas a idade pendente', () => {
    const patient: PatientProfile = {
      nome: '',
      idade: '',
      regiao: '',
      sintomas: 'Tonturas e dor na lombar',
      email: 'nathaliaoftalmozs@gmail.com',
      whatsapp: '(81) 99654-1067',
    };

    const componentLike = {
      extrairDadosDaMensagem: (message: string) =>
        extractPatientDataFromMessage(message),
      obterDadosPaciente: () => patient,
      getMissingRequiredFields:
        AppComponent.prototype['getMissingRequiredFields'],
      buildLocalTriage: () => ({
        especialidadeRelacionada: '',
        hipoteseInicial: '',
        explicacao: '',
        abordagemProativa: '',
        cobertura: '',
        horarios: '',
        observacaoFinal: '',
      }),
      getSafetyNotice: () => '',
      buildPendingReply: AppComponent.prototype['buildPendingReply'],
      formatarCamposPendentes:
        AppComponent.prototype['formatarCamposPendentes'],
      formatarListaNatural: AppComponent.prototype['formatarListaNatural'],
      normalizeText: (value: unknown) =>
        typeof value === 'string' ? value.trim() : '',
    } as unknown as AppComponent;

    const response = AppComponent.prototype['buildFallbackResponse'].call(
      componentLike,
      'Nathalia Augusta Alves ferreira,zona sul'
    );

    expect(response.collectedData.nome).toBe('Nathalia Augusta Alves ferreira');
    expect(response.collectedData.regiao).toBe('Zona Sul');
    expect(response.missingFields).toEqual(['idade']);
    expect(response.reply).toContain('sua idade');
    expect(response.reply).not.toContain('seu nome');
  });

  it('quando a IA falha, envia apenas a resposta de fallback no chat', async () => {
    const mensagem = 'Quero finalizar meu pre-atendimento';
    const patient: PatientProfile = {
      nome: 'Nathalia Augusta Alves ferreira',
      idade: '36',
      regiao: 'Zona Sul',
      sintomas: 'Tonturas e dor na lombar',
      email: 'nathaliaoftalmozs@gmail.com',
      whatsapp: '(81) 99654-1067',
    };
    const fallbackReply =
      'Anotei tudo direitinho ate aqui. Agora me manda seu nome, sua idade e sua regiao em Recife para eu fechar seu pre-atendimento.';
    const addMessage = jasmine.createSpy('addMessage');
    const buildFallbackResponse = jasmine
      .createSpy('buildFallbackResponse')
      .and.returnValue({
        reply: fallbackReply,
        collectedData: patient,
        triage: {
          especialidadeRelacionada: '',
          hipoteseInicial: '',
          explicacao: '',
          abordagemProativa: '',
          cobertura: '',
          horarios: '',
          observacaoFinal: '',
        },
        missingFields: ['nome', 'idade', 'regiao'],
        shouldFinalize: false,
        safetyNotice: '',
      });
    const componentLike = {
      mensagemControl: {
        value: mensagem,
        setValue: () => undefined,
      },
      isLoading: false,
      readyForWhatsApp: false,
      isFallbackMode: false,
      erroChat: '',
      turnCount: 0,
      normalizeText: (value: unknown) =>
        typeof value === 'string' ? value.trim() : '',
      extrairDadosDaMensagem: () => ({}),
      aplicarDadosExtraidos: () => undefined,
      obterDadosPaciente: () => patient,
      addMessage,
      markUserInteraction: () => undefined,
      scheduleDebugInactivityTimer: () => undefined,
      getMissingRequiredFields: () => [],
      solicitarPreAtendimento: () => Promise.reject(new Error('falha de teste')),
      getChatErrorMessage: () => 'falha de teste',
      buildFallbackResponse,
      aplicarRespostaAgente: (response: { reply: string }) => {
        addMessage('assistant', response.reply, 'Assistente virtual');
      },
    } as unknown as AppComponent;

    await AppComponent.prototype.enviarMensagemChat.call(componentLike);

    expect(addMessage.calls.allArgs()).toEqual([
      ['user', mensagem, 'Você'],
      ['assistant', fallbackReply, 'Assistente virtual'],
    ]);
    expect(buildFallbackResponse).toHaveBeenCalledOnceWith(
      mensagem,
      'falha de teste'
    );
    expect(componentLike.isFallbackMode).toBeTrue();
    expect(componentLike.erroChat).toBe('falha de teste');
  });

  it('mantem a coleta local quando ainda faltam campos, mesmo com contato valido', async () => {
    const mensagem =
      'Tonturas e dor na lombar, 81996541067, nathaliaoftalmozs@gmail.com';
    const patient: PatientProfile = {
      nome: '',
      idade: '',
      regiao: '',
      sintomas: '',
      email: '',
      whatsapp: '',
    };
    const addMessage = jasmine.createSpy('addMessage');
    const solicitarPreAtendimento = jasmine.createSpy(
      'solicitarPreAtendimento'
    );
    const pendingReply =
      'Anotei tudo direitinho ate aqui. Agora me manda seu nome, sua idade e sua regiao em Recife para eu fechar seu pre-atendimento.';

    const componentLike = {
      mensagemControl: {
        value: mensagem,
        setValue(this: { value: string }, value: string) {
          this.value = value;
        },
      },
      isLoading: false,
      readyForWhatsApp: false,
      isFallbackMode: false,
      erroChat: '',
      turnCount: 0,
      normalizeText: (value: unknown) =>
        typeof value === 'string' ? value.trim() : '',
      extrairDadosDaMensagem: (value: string) =>
        extractPatientDataFromMessage(value),
      aplicarDadosExtraidos: (data: Partial<PatientProfile>) =>
        Object.assign(patient, data),
      obterDadosPaciente: () => patient,
      addMessage,
      markUserInteraction: () => undefined,
      scheduleDebugInactivityTimer: () => undefined,
      buildMissingContactReply: () => '',
      getMissingRequiredFields: () => ['nome', 'idade', 'regiao'],
      buildPendingReply: () => pendingReply,
      solicitarPreAtendimento,
      aplicarRespostaAgente: () => undefined,
    } as unknown as AppComponent;

    await AppComponent.prototype.enviarMensagemChat.call(componentLike);

    expect(solicitarPreAtendimento).not.toHaveBeenCalled();
    expect(componentLike.turnCount).toBe(0);
    expect(addMessage.calls.allArgs()).toEqual([
      ['user', mensagem, 'Você'],
      ['assistant', pendingReply, 'Assistente virtual'],
    ]);
  });

  it('so chama a OpenAI uma vez, quando os dados obrigatorios ficam completos', async () => {
    const patient: PatientProfile = {
      nome: '',
      idade: '',
      regiao: '',
      sintomas: '',
      email: '',
      whatsapp: '',
    };
    const addMessage = jasmine.createSpy('addMessage');
    const solicitarPreAtendimento = jasmine
      .createSpy('solicitarPreAtendimento')
      .and.returnValue(
        Promise.resolve({
          reply: 'Fechamento final com a IA 😊',
          collectedData: {
            nome: 'Nathalia Augusta Alves ferreira',
            idade: '36',
            regiao: 'Zona Sul',
            sintomas: 'Tonturas e dor na lombar',
            email: 'nathaliaoftalmozs@gmail.com',
            whatsapp: '(81) 99654-1067',
          },
          triage: {
            especialidadeRelacionada: 'Reabilitacao vestibular',
            hipoteseInicial: '',
            explicacao: '',
            abordagemProativa: '',
            cobertura: '',
            horarios: '',
            observacaoFinal: '',
          },
          missingFields: [],
          shouldFinalize: true,
          safetyNotice: '',
        })
      );
    const pendingReplyOne =
      'Anotei tudo direitinho ate aqui. Agora me manda seu nome, sua idade e sua região em Recife para eu fechar seu pre-atendimento.';
    const pendingReplyTwo =
      'Anotei tudo direitinho ate aqui. Agora me manda sua idade para eu fechar seu pre-atendimento.';
    const messageControl = {
      value: '',
      setValue(this: { value: string }, value: string) {
        this.value = value;
      },
    };

    const componentLike = {
      mensagemControl: messageControl,
      isLoading: false,
      readyForWhatsApp: false,
      isFallbackMode: false,
      erroChat: '',
      turnCount: 0,
      normalizeText: (value: unknown) =>
        typeof value === 'string' ? value.trim() : '',
      extrairDadosDaMensagem: (value: string) =>
        extractPatientDataFromMessage(value),
      aplicarDadosExtraidos: (data: Partial<PatientProfile>) =>
        Object.assign(patient, data),
      obterDadosPaciente: () => patient,
      addMessage,
      markUserInteraction: () => undefined,
      scheduleDebugInactivityTimer: () => undefined,
      buildMissingContactReply: () => '',
      getMissingRequiredFields:
        AppComponent.prototype['getMissingRequiredFields'],
      buildPendingReply: AppComponent.prototype['buildPendingReply'],
      formatarCamposPendentes:
        AppComponent.prototype['formatarCamposPendentes'],
      formatarListaNatural: AppComponent.prototype['formatarListaNatural'],
      solicitarPreAtendimento,
      aplicarRespostaAgente: () => undefined,
    } as unknown as AppComponent;

    messageControl.value =
      'Tonturas e dor na lombar, 81996541067, nathaliaoftalmozs@gmail.com';
    await AppComponent.prototype.enviarMensagemChat.call(componentLike);

    messageControl.value = 'Nathalia Augusta Alves ferreira,zona sul';
    await AppComponent.prototype.enviarMensagemChat.call(componentLike);

    messageControl.value = '36';
    await AppComponent.prototype.enviarMensagemChat.call(componentLike);

    expect(solicitarPreAtendimento).toHaveBeenCalledTimes(1);
    expect(componentLike.turnCount).toBe(1);
    expect(addMessage.calls.allArgs()).toEqual([
      [
        'user',
        'Tonturas e dor na lombar, 81996541067, nathaliaoftalmozs@gmail.com',
        'Você',
      ],
      ['assistant', pendingReplyOne, 'Assistente virtual'],
      ['user', 'Nathalia Augusta Alves ferreira,zona sul', 'Você'],
      ['assistant', pendingReplyTwo, 'Assistente virtual'],
      ['user', '36', 'Você'],
    ]);
  });

  it('agenda o debug por inatividade e reinicia o timer a cada nova mensagem', () => {
    jasmine.clock().install();

    const enviarDebugAbandono = jasmine
      .createSpy('enviarDebugAbandono')
      .and.returnValue(Promise.resolve(true));
    const componentLike = {
      platformId: 'browser',
      preAtendimentoSession: {
        sessionId: 'sessao-1',
        startedAt: '2026-03-12T12:00:00.000Z',
        lastUserMessageAt: '2026-03-12T12:00:00.000Z',
        finalizedAt: '',
        debugEmailSentAt: '',
        debugReason: '',
      },
      debugInactivityTimer: null,
      canSendDebugEmail: () => true,
      cancelDebugInactivityTimer(this: { debugInactivityTimer: ReturnType<typeof setTimeout> | null }) {
        if (this.debugInactivityTimer) {
          clearTimeout(this.debugInactivityTimer);
          this.debugInactivityTimer = null;
        }
      },
      enviarDebugAbandono,
    } as unknown as AppComponent;

    AppComponent.prototype['scheduleDebugInactivityTimer'].call(componentLike);
    jasmine.clock().tick(4 * 60 * 1000);
    expect(enviarDebugAbandono).not.toHaveBeenCalled();

    AppComponent.prototype['scheduleDebugInactivityTimer'].call(componentLike);
    jasmine.clock().tick(4 * 60 * 1000);
    expect(enviarDebugAbandono).not.toHaveBeenCalled();

    jasmine.clock().tick(60 * 1000);
    expect(enviarDebugAbandono).toHaveBeenCalledOnceWith('inactivity');
  });

  it('finalizarChat cancela o debug e impede novo envio', () => {
    const patient: PatientProfile = {
      nome: 'Marina',
      idade: '62',
      regiao: 'Zona Norte do Recife',
      sintomas: 'tontura ha 3 semanas ao caminhar',
      email: 'marina@example.com',
      whatsapp: '(81) 98131-0778',
    };
    const cancelDebugInactivityTimer = jasmine.createSpy(
      'cancelDebugInactivityTimer'
    );
    const componentLike = {
      consultaForm: {
        getRawValue: () => patient,
      },
      dadosUsuario: patient,
      triageSummary: {
        especialidadeRelacionada: '',
        hipoteseInicial: '',
        explicacao: '',
        abordagemProativa: '',
        cobertura: '',
        horarios: '',
        observacaoFinal: '',
      },
      readyForWhatsApp: false,
      safetyNotice: '',
      preAtendimentoSession: {
        sessionId: 'sessao-2',
        startedAt: '2026-03-12T12:00:00.000Z',
        lastUserMessageAt: '2026-03-12T12:02:00.000Z',
        finalizedAt: '',
        debugEmailSentAt: '',
        debugReason: '',
      },
      mensagemControl: {
        disable: () => undefined,
      },
      obterDadosPaciente: () => patient,
      mergeTriageSummary: (_primary: unknown, fallback: unknown) => fallback,
      buildLocalTriage: () => ({
        especialidadeRelacionada: '',
        hipoteseInicial: '',
        explicacao: '',
        abordagemProativa: '',
        cobertura: '',
        horarios: '',
        observacaoFinal: '',
      }),
      getSafetyNotice: () => '',
      scrollToLatestAssistantMessage: () => undefined,
      enviarResumoPorEmail: () => Promise.resolve(true),
      cancelDebugInactivityTimer,
      addMessage: () => undefined,
      canSendDebugEmail: AppComponent.prototype['canSendDebugEmail'],
      normalizeText: (value: unknown) =>
        typeof value === 'string' ? value.trim() : '',
    } as unknown as AppComponent;

    AppComponent.prototype['finalizarChat'].call(componentLike);

    expect(cancelDebugInactivityTimer).toHaveBeenCalled();
    expect(componentLike.preAtendimentoSession.finalizedAt).toBeTruthy();
    expect(
      AppComponent.prototype['canSendDebugEmail'].call(componentLike)
    ).toBeFalse();
  });

  it('envia debug no pagehide apenas para sessoes elegiveis', () => {
    const sendDebugBeacon = jasmine
      .createSpy('sendDebugBeacon')
      .and.returnValue(true);
    const componentLike = {
      platformId: 'browser',
      preAtendimentoSession: {
        sessionId: 'sessao-3',
        startedAt: '2026-03-12T12:00:00.000Z',
        lastUserMessageAt: '2026-03-12T12:02:00.000Z',
        finalizedAt: '',
        debugEmailSentAt: '',
        debugReason: '',
      },
      cancelDebugInactivityTimer: () => undefined,
      canSendDebugEmail: AppComponent.prototype['canSendDebugEmail'],
      buildDebugPayload: () => ({
        sessionId: 'sessao-3',
        reason: 'tab_closed',
        patient: {
          nome: '',
          idade: '',
          regiao: '',
          sintomas: '',
          email: '',
          whatsapp: '',
        },
        userMessages: ['Oi'],
        assistantReply: 'Resposta',
        turnCount: 1,
        isFallbackMode: false,
        hasValidReturnContact: false,
        startedAt: '2026-03-12T12:00:00.000Z',
        lastInteractionAt: '2026-03-12T12:02:00.000Z',
      }),
      sendDebugBeacon,
    } as unknown as AppComponent;

    AppComponent.prototype['handlePageExit'].call(componentLike, 'tab_closed');
    expect(sendDebugBeacon).toHaveBeenCalled();
    expect(componentLike.preAtendimentoSession.debugReason).toBe('tab_closed');

    sendDebugBeacon.calls.reset();
    AppComponent.prototype['handlePageExit'].call(componentLike, 'tab_closed');
    expect(sendDebugBeacon).not.toHaveBeenCalled();
  });

  it('monta o payload de debug com o contexto atual da conversa', () => {
    const patient: PatientProfile = {
      nome: 'Marina',
      idade: '62',
      regiao: 'Zona Norte do Recife',
      sintomas: 'tontura ha 3 semanas ao caminhar',
      email: 'marina@example.com',
      whatsapp: '(81) 98131-0778',
    };
    const componentLike = {
      preAtendimentoSession: {
        sessionId: 'sessao-4',
        startedAt: '2026-03-12T12:00:00.000Z',
        lastUserMessageAt: '2026-03-12T12:02:00.000Z',
        finalizedAt: '',
        debugEmailSentAt: '',
        debugReason: '',
      },
      turnCount: 2,
      isFallbackMode: true,
      obterDadosPaciente: () => patient,
      getUserMessagesForEmail: () => ['Oi', 'Tenho tontura'],
      getLatestAssistantReply: () => 'Me conta um pouco mais.',
    } as unknown as AppComponent;

    const payload = AppComponent.prototype['buildDebugPayload'].call(
      componentLike,
      'inactivity'
    );

    expect(payload.sessionId).toBe('sessao-4');
    expect(payload.reason).toBe('inactivity');
    expect(payload.userMessages).toEqual(['Oi', 'Tenho tontura']);
    expect(payload.assistantReply).toBe('Me conta um pouco mais.');
    expect(payload.turnCount).toBe(2);
    expect(payload.isFallbackMode).toBeTrue();
    expect(payload.hasValidReturnContact).toBe(hasValidReturnContact(patient));
  });
});
