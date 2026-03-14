import {
  buildDebugSubject,
  hasProcessedDebugSession,
  markDebugSessionProcessed,
  resetProcessedDebugSessions,
} from '../../netlify/functions/debug-pre-atendimento-abandonado';
import {
  type DebugAbandonmentReason,
  type PatientProfile,
} from './pre-atendimento-summary';

describe('debug-pre-atendimento-abandonado backend rules', () => {
  const patient: PatientProfile = {
    nome: 'Andre',
    idade: '56',
    regiao: 'Casa Amarela',
    sintomas: 'dor no joelho ao correr',
    detalhesDoCaso: '',
    email: 'andre@example.com',
    whatsapp: '(81) 99999-0000',
  };

  beforeEach(() => {
    resetProcessedDebugSessions();
  });

  it('gera assunto com motivo e nome quando houver paciente identificado', () => {
    expect(buildDebugSubject('inactivity', patient)).toBe(
      'Debug pre-atendimento abandonado - inactivity - Andre'
    );
  });

  it('usa sem nome quando o paciente ainda nao foi identificado', () => {
    expect(
      buildDebugSubject('tab_closed' as DebugAbandonmentReason, {
        ...patient,
        nome: '',
      })
    ).toBe('Debug pre-atendimento abandonado - tab_closed - sem nome');
  });

  it('deduplica sessoes de debug pelo sessionId', () => {
    expect(hasProcessedDebugSession('sessao-1')).toBeFalse();

    markDebugSessionProcessed('sessao-1');

    expect(hasProcessedDebugSession('sessao-1')).toBeTrue();
  });
});
