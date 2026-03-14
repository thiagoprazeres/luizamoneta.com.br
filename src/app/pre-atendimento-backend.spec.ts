import {
  FINAL_REPLY_MAX_LENGTH,
  buildSystemPrompt,
  isOpenAiRawLoggingEnabled,
  shouldUseOpenAiForPreAtendimento,
} from '../../netlify/functions/pre-atendimento';
import { type PatientProfile } from './pre-atendimento-summary';

describe('pre-atendimento backend rules', () => {
  const createPatient = (
    overrides: Partial<PatientProfile> = {}
  ): PatientProfile => ({
    nome: 'Nathalia Augusta Alves Ferreira',
    idade: '36',
    regiao: 'Zona Sul',
    sintomas: 'Tonturas e dor na lombar',
    detalhesDoCaso: '',
    email: 'nathaliaoftalmozs@gmail.com',
    whatsapp: '(81) 99654-1067',
    ...overrides,
  });

  it('so libera OpenAI quando todos os dados obrigatorios e um contato valido estiverem completos', () => {
    expect(
      shouldUseOpenAiForPreAtendimento(
        createPatient({
          idade: '',
        })
      )
    ).toBeFalse();

    expect(
      shouldUseOpenAiForPreAtendimento(
        createPatient({
          email: '',
          whatsapp: '',
        })
      )
    ).toBeFalse();

    expect(shouldUseOpenAiForPreAtendimento(createPatient())).toBeTrue();
  });

  it('usa um prompt final mais consultivo, leigo e sem detalhes operacionais no corpo', () => {
    const prompt = buildSystemPrompt(true);

    expect(prompt).toContain('Fale em portugues natural, com tom natural e empático');
    expect(prompt).toContain('Não cite horários, cobertura, telefone, disponibilidade');
    expect(prompt).toContain('Este chat termina neste fechamento');
    expect(prompt).toContain('Não ofereça continuar por aqui');
    expect(FINAL_REPLY_MAX_LENGTH).toBe(1400);
  });

  it('so liga o log bruto da OpenAI quando a flag estiver habilitada', () => {
    expect(isOpenAiRawLoggingEnabled('true')).toBeTrue();
    expect(isOpenAiRawLoggingEnabled('1')).toBeTrue();
    expect(isOpenAiRawLoggingEnabled('on')).toBeTrue();
    expect(isOpenAiRawLoggingEnabled('false')).toBeFalse();
    expect(isOpenAiRawLoggingEnabled('')).toBeFalse();
  });
});
