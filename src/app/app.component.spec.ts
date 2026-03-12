import { AppComponent } from './app.component';
import { type PatientProfile } from './pre-atendimento-summary';

describe('AppComponent', () => {
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
});
