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
- `OPENAI_IMAGE_MODEL`: modelo de imagem utilizado para gerar o avatar estatico da Luiza IA (`gpt-image-1.5` por padrão).
- `OPENAI_IMAGE_SIZE`: tamanho do avatar estatico (`1024x1024` por padrão).
- `OPENAI_IMAGE_QUALITY`: qualidade da imagem do avatar (`high` por padrão).
- `OPENAI_IMAGE_OUTPUT`: caminho do avatar gerado dentro do projeto.
- `OPENAI_IMAGE_BACKGROUND`: fundo da imagem (`opaque` por padrão).
- `OPENAI_VIDEO_MODEL`: modelo de vídeo utilizado pelo script institucional (`sora-2` por padrão).
- `OPENAI_VIDEO_FOCUS`: direção do vídeo (`institucional` ou `pre-atendimento`; o padrão atual do script é `institucional`).
- `OPENAI_VIDEO_SECONDS`: duração do vídeo institucional (`4`, `8` ou `12`; o padrão atual do script é `4`).
- `OPENAI_VIDEO_SIZE`: resolução do vídeo (`720x1280` por padrão).
- `OPENAI_VIDEO_OUTPUT`: caminho do MP4 gerado dentro do projeto.
- `OPENAI_VIDEO_REFERENCE`: imagem de referência opcional para guiar a identidade visual do vídeo. No fluxo institucional default, ela pode apontar para uma referência estética derivada da Dra. Luiza.
- `OPENAI_VIDEO_CLOSING_ART`: arte final opcional usada como fechamento oficial na versão editada do vídeo.
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
npm run generate:image:luiza-ia-avatar:dry
npm run generate:image:luiza-ia-avatar
npm run generate:video:institucional:dry
npm run generate:video:institucional
```

## Geracao de Avatar da Luiza IA

O projeto possui um script local para gerar um avatar estatico da Luiza IA usando a OpenAI Images API e salvar o arquivo final no repositório.

### O que o script faz

- Usa o mesmo bloco descritivo da personagem que alimenta o prompt do video institucional.
- Gera um retrato quadrado focado em avatar de produto digital.
- Salva a imagem final em `public/assets/generated/luiza-ia-avatar.webp`.
- Salva um `.json` ao lado da imagem com prompt, modelo, configuracao e uso retornado pela API.

### Comandos

Para revisar o prompt sem consumir creditos:

```bash
npm run generate:image:luiza-ia-avatar:dry
```

Para gerar de fato o avatar:

```bash
npm run generate:image:luiza-ia-avatar
```

## Geração de Vídeo Institucional

O projeto possui um script local para gerar um único vídeo institucional com Sora 2, fazer o polling da renderização e baixar o MP4 final para dentro do repositório.

### O que o script faz

- Usa a OpenAI Video API via SDK oficial já instalado no projeto.
- Monta um prompt institucional alinhado ao posicionamento da Dra. Luiza Moneta.
- Usa uma referência visual da marca compatível com a resolução escolhida, evitando assets com rostos humanos.
- No fluxo institucional default `720x1280`, usa uma referência estética derivada de `public/assets/agendamento.webp` para aproximar melhor cabelo, óculos, roupa e presença da Dra. Luiza.
- Se existir uma arte final oficial compatível com a resolução, adapta o prompt para preparar melhor a entrada dessa tela no fechamento.
- Faz polling manual até a geração ser concluída.
- Salva um MP4 base versionado por render e atualiza o alias `public/assets/generated/luizamoneta-institucional-source.mp4`.
- Quando houver arte final oficial compatível, também monta um MP4 final versionado e atualiza o alias `public/assets/generated/luizamoneta-institucional.mp4`.
- Salva também uma metadata versionada e atualiza o alias `public/assets/generated/luizamoneta-institucional.json`.
- Tenta baixar também um thumbnail versionado da geração e atualizar o thumbnail `latest`, quando disponível.

### Comandos

Para revisar o prompt e a configuração sem consumir créditos:

```bash
npm run generate:video:institucional:dry
```

Para gerar de fato o vídeo:

```bash
npm run generate:video:institucional
```

### Observações importantes

- A geração consome créditos da OpenAI e pode levar alguns minutos.
- Com o SDK atual instalado neste projeto, a duração disponível para uma única geração é `4`, `8` ou `12` segundos.
- Se você quiser um vídeo mais longo, o caminho recomendado é gerar múltiplos clipes e editar depois, ou iterar via remix/novas gerações.
- A documentação atual da OpenAI restringe referências com rostos humanos na API de vídeo. Por isso o script usa a marca do projeto como referência padrão.
- A referência visual padrão foi preparada em `720x1280` para encaixar diretamente nas gerações verticais sem erro de proporção.

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
