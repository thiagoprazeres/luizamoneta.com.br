import { shouldUseOpenAiForPreAtendimento } from '../../netlify/functions/pre-atendimento';
import { type PatientProfile } from './pre-atendimento-summary';

describe('pre-atendimento backend rules', () => {
  const createPatient = (
    overrides: Partial<PatientProfile> = {}
  ): PatientProfile => ({
    nome: 'Nathalia Augusta Alves Ferreira',
    idade: '36',
    regiao: 'Zona Sul',
    sintomas: 'Tonturas e dor na lombar',
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
});
