# Video Generation

Este arquivo resume como gerar os videos institucionais do projeto com a OpenAI Video API.

## Comando Padrao

O comando principal do projeto e:

```bash
npm run generate:video:institucional
```

Hoje ele gera, por padrao:

- `4s`
- `720x1280`
- `sora-2`
- `institucional`
- referencia visual em `public/assets/generated/agendamento-reference-720x1280.png`
- arte final oficial em `public/assets/generated/video-closing-art-720x1280.png`

Saidas padrao:

- video-base versionado: `public/assets/generated/luizamoneta-institucional-<timestamp>-<modelo>-<duracao>-<resolucao>-source.mp4`
- video-base latest: `public/assets/generated/luizamoneta-institucional-source.mp4`
- video final versionado: `public/assets/generated/luizamoneta-institucional-<timestamp>-<modelo>-<duracao>-<resolucao>.mp4`
- video final latest: `public/assets/generated/luizamoneta-institucional.mp4`
- metadata versionada: `public/assets/generated/luizamoneta-institucional-<timestamp>-<modelo>-<duracao>-<resolucao>.json`
- metadata latest: `public/assets/generated/luizamoneta-institucional.json`

## Teste Sem Gastar Creditos

Para revisar o prompt e a configuracao sem chamar a API:

```bash
npm run generate:video:institucional:dry
```

## Presets Amigaveis

Atalhos mais comuns no `package.json`:

```bash
npm run generate:video:institucional:test
npm run generate:video:institucional:test:dry
npm run generate:video:institucional:final
npm run generate:video:institucional:final:dry
npm run generate:video:luiza-ia
npm run generate:video:luiza-ia:dry
npm run generate:video:luiza-ia:final
npm run generate:video:luiza-ia:final:dry
npm run generate:video:institucional:portrait
npm run generate:video:institucional:portrait:dry
npm run generate:video:institucional:landscape-pro
npm run generate:video:institucional:landscape-pro:dry
```

O que cada um faz:

- `test`: `4s`, vertical, `sora-2`
- `final`: `12s`, vertical, `sora-2`
- `portrait`: usa `1024x1792` com `sora-2`
- `landscape-pro`: usa `1792x1024` com `sora-2-pro`
- `luiza-ia`: video mais focado em apresentar a Luiza IA e o fluxo de pre-atendimento
- cada preset tenta usar automaticamente a referencia de marca com o mesmo tamanho do video
- o preset default tambem tenta usar automaticamente a arte final oficial de fechamento quando existir no mesmo tamanho
- no foco `institucional` default em `720x1280`, a referencia estetica principal passa a ser derivada de `public/assets/agendamento.webp`

## Teste Economico

Para testar com custo menor, gere um clipe curto de `4s`:

```bash
npm run generate:video:institucional -- --seconds 4
```

Para revisar o prompt de `4s` sem consumir creditos:

```bash
npm run generate:video:institucional:dry -- --seconds 4
```

## Geracao Final

Quando o prompt estiver aprovado, gere a versao completa:

```bash
npm run generate:video:institucional -- --seconds 12
```

## Parametros Uteis

Voce pode sobrescrever parametros sem alterar codigo:

```bash
npm run generate:video:institucional -- --seconds 4
npm run generate:video:institucional -- --seconds 12
npm run generate:video:institucional -- --focus pre-atendimento --seconds 12
npm run generate:video:institucional -- --seconds 12 --model sora-2-pro
npm run generate:video:institucional -- --model sora-2
npm run generate:video:institucional -- --model sora-2-pro --size 1792x1024
npm run generate:video:institucional -- --reference public/assets/generated/brand-reference-720x1280.png
npm run generate:video:institucional -- --output public/assets/generated/meu-video.mp4
```

Parametros suportados:

- `--seconds 4|8|12`
- `--model sora-2|sora-2-pro`
- `--focus institucional|pre-atendimento`
- `--size 720x1280|1280x720|1024x1792|1792x1024`
- `1792x1024` exige `--model sora-2-pro`
- `1024x1792` pode ser usado como preset de retrato
- `1792x1024` pode ser usado como preset de paisagem no `sora-2-pro`
- `--reference <path>`
- `--closing-art <path>`
- `--output <path>`
- `--poll-interval <ms>`
- `--timeout <ms>`
- `--no-reference`
- `--no-closing-art`

## Arquivos Envolvidos

- script principal: `scripts/generate-institutional-video.mjs`
- prompts compartilhados: `scripts/openai-brand-prompts.mjs`
- referencia vertical: `public/assets/generated/brand-reference-720x1280.png`
- referencia estetica institucional default: `public/assets/generated/agendamento-reference-720x1280.png`
- referencia retrato: `public/assets/generated/brand-reference-1024x1792.png`
- referencia paisagem pro: `public/assets/generated/brand-reference-1792x1024.png`
- arte final default: `public/assets/generated/video-closing-art-720x1280.png`
- arte final retrato: `public/assets/generated/video-closing-art-1024x1792.png`

## Estrategia Recomendada

Para economizar:

1. teste primeiro em `4s`
2. valide uma coisa por vez
3. use `dry-run` antes de gerar
4. deixe o `12s` apenas para versoes finais

Boa ordem de validacao:

1. identidade visual
2. figurino e personagem
3. separacao entre Dra. Luiza Moneta e `Luiza IA`
4. fechamento com CTA para pre-atendimento

## Observacoes

- A API atual aceita `4`, `8` ou `12` segundos por geracao.
- O fechamento do video precisa ser pensado dentro desse limite.
- A metadata salva junto do video ajuda a rastrear `prompt`, `video id`, datas e configuracao usada.
- Cada geracao agora salva uma copia versionada e atualiza um alias `latest`, evitando sobrescrever renders antigos.
- Quando houver arte final oficial no mesmo tamanho do video, o prompt passa a preparar o encerramento para essa peça entrar melhor na edicao final.
- Quando houver arte final oficial no mesmo tamanho do video, o script tambem monta um MP4 final local substituindo o trecho final pela arte de fechamento.
