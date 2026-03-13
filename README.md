# luizamoneta.com.br

Aplicação web da Dra. Luiza Moneta com landing page institucional e fluxo de pré-atendimento conversacional. O projeto utiliza Angular no frontend, Netlify Functions no backend serverless, OpenAI para interpretação do fluxo conversacional e Resend para envio de resumos por e-mail e notificações de debug.

## Stack

- Angular 21
- TypeScript
- Tailwind CSS
- DaisyUI
- Netlify Functions
- OpenAI API
- Resend

## Arquitetura

O projeto é dividido em quatro blocos principais:

- Frontend Angular: renderiza a landing page, mantém o estado do chat, aplica validações locais, gerencia o formulário e executa o handoff para WhatsApp.
- Módulo compartilhado de domínio: concentra tipos, normalização, validações e funções utilitárias reutilizadas entre frontend e backend em `src/app/pre-atendimento-summary.ts`.
- Função de pré-atendimento: processa o turno conversacional, chama a OpenAI com schema estruturado e retorna dados normalizados para o frontend.
- Funções de e-mail e observabilidade: enviam o resumo final do pré-atendimento e os alertas de abandono de conversa.

## Funcionalidades

- Landing page responsiva com conteúdo institucional.
- Fluxo de pré-atendimento conversacional com coleta de nome, idade, região, sintomas e contato.
- Extração e validação local de dados antes e depois da chamada ao backend.
- Fallback local para continuidade do atendimento quando a IA falha.
- Handoff para WhatsApp após finalização do pré-atendimento.
- Envio de resumo por e-mail para equipe e, quando aplicável, para o paciente.
- Envio de e-mail de debug para conversas não finalizadas.

## Fluxos Principais

### `pre-atendimento`

Função serverless responsável pela etapa conversacional. Recebe a mensagem atual, combina os dados já coletados, chama a OpenAI com resposta estruturada e devolve:

- `reply`
- `collectedData`
- `missingFields`
- `shouldFinalize`
- `safetyNotice`
- `triage`

### `enviar-resumo-pre-atendimento`

Função serverless responsável pelo envio do resumo final do pré-atendimento por e-mail. O fluxo suporta os modos:

- `finalize`
- `user_copy`

### `debug-pre-atendimento-abandonado`

Função serverless responsável pela observabilidade de abandono. Recebe eventos de debug quando a sessão não é finalizada por inatividade ou saída da página e envia um e-mail técnico para o destinatário configurado.

## Estrutura do Projeto

```text
.
├── netlify/functions/
│   ├── pre-atendimento.ts
│   ├── enviar-resumo-pre-atendimento.ts
│   └── debug-pre-atendimento-abandonado.ts
├── src/app/
│   ├── app.component.ts
│   ├── app.component.html
│   ├── pre-atendimento-summary.ts
│   └── *.spec.ts
├── public/
├── .env.example
├── netlify.toml
└── package.json
```

## Pré-requisitos

- Node.js 20 ou superior
- npm

## Instalação

```bash
npm install
```

## Configuração

Crie um arquivo `.env` com base em `.env.example` e preencha as variáveis necessárias para OpenAI e Resend.

## Variáveis de Ambiente

O projeto utiliza as seguintes variáveis:

- `OPENAI_API_KEY`: chave da OpenAI usada pela função de pré-atendimento.
- `OPENAI_MODEL`: modelo utilizado pela integração com OpenAI.
- `RESEND_API_KEY`: chave da API Resend para envio de e-mails.
- `PRE_ATENDIMENTO_EMAIL_FROM`: remetente utilizado nos e-mails transacionais.
- `PRE_ATENDIMENTO_EMAIL_TO`: destinatário principal do resumo de pré-atendimento.
- `PRE_ATENDIMENTO_EMAIL_BCC`: destinatário em cópia oculta do resumo de pré-atendimento.
- `PRE_ATENDIMENTO_EMAIL_REPLY_TO`: endereço de resposta dos e-mails enviados.
- `PRE_ATENDIMENTO_DEBUG_EMAIL_TO`: destinatário dos e-mails de debug de abandono.

## Executando Localmente

Para rodar a aplicação com Netlify Functions:

```bash
npm start
```

O ambiente local utiliza a configuração de `netlify.toml` e expõe a aplicação em `http://localhost:8888`.

Para rodar apenas o frontend Angular:

```bash
npm run start:app
```

O frontend é servido em `http://localhost:4200`.

## Scripts

```bash
npm start
npm run start:app
npm run build
npm run watch
npm test
```

## Testes

O projeto utiliza Jasmine e Karma para testes unitários e de integração leve.

```bash
npm test
```

A cobertura inclui regras de resumo, comportamento do componente principal e validações das funções backend.

## Observações Operacionais

- O chat utiliza limite de 3 turnos do usuário no fluxo principal.
- O frontend mantém extração e validação local de dados para aumentar resiliência.
- Quando a OpenAI falha, o fluxo continua em modo assistido com fallback local.
- O envio de e-mails depende de `RESEND_API_KEY` e `PRE_ATENDIMENTO_EMAIL_FROM`.
- A função de debug de abandono deduplica eventos em memória por `sessionId`, com escopo limitado à instância em execução.

## Arquivos Centrais

- `src/app/app.component.ts`: lógica principal da interface, chat, estado local e handoff para WhatsApp.
- `src/app/pre-atendimento-summary.ts`: tipos compartilhados, validações, normalização e montagem de resumos.
- `netlify/functions/pre-atendimento.ts`: integração com OpenAI e resposta estruturada do chat.
- `netlify/functions/enviar-resumo-pre-atendimento.ts`: envio do resumo do pré-atendimento por e-mail.
- `netlify/functions/debug-pre-atendimento-abandonado.ts`: envio de debug para sessões não finalizadas.
