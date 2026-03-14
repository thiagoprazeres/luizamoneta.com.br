const SUPPORTED_VIDEO_FOCUSES = ['institucional', 'pre-atendimento'];

export function getSupportedVideoFocuses() {
  return [...SUPPORTED_VIDEO_FOCUSES];
}

export function getLuizaIaSharedDescription() {
  return [
    'A Luiza IA e a assistente virtual do site e do pre-atendimento. Ela nunca deve ser identificada, nomeada ou apresentada como Dra. Luiza Moneta ou simplesmente Luiza Moneta.',
    'Quando a personagem do produto aparecer no video, o nome correto dela deve ser sempre Luiza IA.',
    'A Luiza IA não é a propria Dra. Luiza Moneta falando para a camera. Ela é uma camada digital de atendimento e triagem do site.',
    'Quando a Luiza IA aparecer, mostre sua presenca por interface, conversa, avatar de assistente ou elementos de produto, e não como uma porta-voz humana em primeiro plano.',
    'Se houver qualquer texto, label, balão, interface ou identificação visual para a assistente, usar apenas o nome "Luiza IA". Nunca usar "Luiza Moneta" como nome da assistente.',
    'Se aparecer uma fisioterapeuta em cena, ela deve remeter visualmente a Dra. Luiza Moneta e não a uma personagem generica de banco de imagens.',
    'Descrição visual da fisioterapeuta: mulher brasileira adulta, cabelo escuro castanho quase preto, ondulado, na altura dos ombros, com repartição lateral suave; usa oculos grandes de metal claro com desenho geometrico delicado; expressao acolhedora, sorriso caloroso, postura confiante e humana.',
    'Acessorios discretos: colar dourado curto, brincos pequenos, aparencia elegante e proxima, sem visual frio ou excessivamente formal.',
    'Figurino obrigatório da fisioterapeuta: roupa realista de atendimento domiciliar, elegante e cotidiana, semelhante aos looks das fotos da marca.',
    'Preferir combinacoes como sobreposição bege rosado claro com blusa creme ou off-white, ou blusa texturizada em bege e marrom claro, com calca de alfaiataria ou look casual-profissional em tons caramelo, areia, bege e creme.',
    'Evitar camisa polo, evitar uniforme corporativo, evitar jaleco, evitar scrub, evitar roupa com cara de franquia ou clinica generica.',
    'Se houver marca na roupa, usar no maximo um detalhe pequeno e discreto, como um bordado ou aplicação sutil; nunca uma logo grande centralizada.',
  ];
}

export function buildInstitutionalVideoPrompt({
  seconds,
  hasReference,
  hasClosingArt = false,
  focus = 'institucional',
}) {
  const normalizedFocus = SUPPORTED_VIDEO_FOCUSES.includes(focus)
    ? focus
    : 'institucional';

  const isPreAtendimentoFocus = normalizedFocus === 'pre-atendimento';

  const promptParts = [
    isPreAtendimentoFocus
      ? `Crie um unico video curto de ${seconds} segundos para apresentar a Luiza IA e o pre-atendimento online do site da Dra. Luiza Moneta.`
      : `Crie um unico video institucional de ${seconds} segundos para a marca brasileira Dra. Luiza Moneta.`,
    'O video deve seguir a persona da marca: acolhedora, empática, profissional, humana, levemente tagarela e bem-humorada sem exagero.',
    'Nao use tom corporativo generico, não use linguagem fria, não use visual de banco de imagens sem personalidade.',
    'Separação obrigatoria de papeis: Dra. Luiza Moneta e a fisioterapeuta real da marca; Luiza IA e a assistente virtual do site. Nunca confundir as duas.',
    'Contexto obrigatório da marca: Dra. Luiza Moneta, fisioterapeuta, atendimento exclusivamente domiciliar em Recife, foco em reabilitação vestibular, traumato-ortopedia, gerontologia, neurologia, zumbido, DTM e tonturas.',
    'Filosofia da marca: Movimento e vida.',
    'Visual: Recife, luz natural, atmosfera residencial sofisticada, sensação de cuidado real, proximidade, conforto e confianca.',
    hasReference
      ? 'Paleta e direção de arte guiadas pela imagem de referencia da marca, com laranja e creme, design limpo, elegante e memoravel.'
      : 'Paleta e direção de arte inspiradas na identidade da marca, com laranja e creme, design limpo, elegante e memoravel.',
    'Adicionar uma cor secundaria sofisticada para equilibrar a cena: verde sálvia suave, dessaturado e elegante, combinando com o laranja queimado e os tons creme da marca.',
    'A cor primaria da marca deve ficar reservada principalmente para a Luiza IA, para a interface, para elementos de produto e para detalhes centrais de identidade visual.',
    'Os demais personagens, especialmente paciente e acompanhante, devem usar outras cores harmoniosas e complementares, como verde sálvia, areia fria, oliva suave, azul acinzentado claro ou neutros quentes discretos, mas nunca a propria cor primaria da marca como cor dominante no figurino.',
    'Usar o verde sálvia e outras cores secundarias principalmente no figurino do paciente, em almofadas, mantas, detalhes residenciais ou pequenos elementos de apoio, para evitar que tudo fique monocromatico demais.',
    'Nao vestir o paciente nem outros personagens com a mesma cor principal da marca em destaque. O laranja deve continuar como cor principal da identidade visual da Luiza IA e dos elementos de interface, enquanto as cores secundarias entram como apoio elegante e harmonioso.',
    isPreAtendimentoFocus
      ? 'Estrutura narrativa: abrir apresentando a Luiza IA no site; mostrar rapidamente a conversa de pre-atendimento, coleta de sintomas, nome, idade, bairro ou regiao do Recife e continuidade antes do WhatsApp; deixar claro que esse fluxo facilita o inicio do atendimento.'
      : 'Estrutura narrativa: abrir com uma pessoa em casa enfrentando tontura, dor, tensao na mandibula ou dificuldade de movimento; transicionar para cenas de fisioterapia domiciliar segura, atenciosa e baseada em evidencia; depois destacar o pre-atendimento online com a assistente Luiza IA preparando a conversa antes da continuidade no WhatsApp.',
    'Como o video tem duracao curta, seja sintetico no desenvolvimento e nao tente contar etapas demais no miolo.',
    ...getLuizaIaSharedDescription(),
    isPreAtendimentoFocus
      ? 'A fisioterapeuta real pode aparecer de forma muito breve ou nem aparecer; o foco principal deve ser a experiencia digital da Luiza IA e a clareza do pre-atendimento online.'
      : 'A fisioterapeuta pode aparecer apenas de forma breve e natural, enquanto o foco principal continua sendo o cuidado domiciliar e a experiencia de pre-atendimento com a Luiza IA.',
    'A interface da Luiza IA deve parecer intencional, amigável e premium, com bolhas de conversa legíveis e sinais visuais de coleta de nome, idade, região do Recife, sintomas e contato.',
    'Nao replique literalmente a tela do site, mas comunique claramente que existe um agente de IA de pre-atendimento no site.',
  ];

  if (hasClosingArt) {
    promptParts.push(
      isPreAtendimentoFocus
        ? 'Distribuicao recomendada do tempo: abrir ja com a Luiza IA e o pre-atendimento em andamento, mostrar rapidamente o valor do fluxo e terminar com conclusao natural sem um encerramento forte dentro do proprio Sora.'
        : 'Distribuicao recomendada do tempo: abertura muito curta com a dor ou necessidade, transicao rapida para o cuidado domiciliar, destaque breve da Luiza IA no fluxo de pre-atendimento, e conclusao natural sem um encerramento forte dentro do proprio Sora.',
      'Existe uma arte final oficial de fechamento que sera aplicada depois, fora do Sora, na versao final deste video.',
      'Por isso, nao tente renderizar texto final longo, nao tente escrever CTA completo na ultima cena e nao construa um encerramento fechado demais dentro do video gerado.',
      'Nos 2 segundos finais, manter continuidade natural de cena, com movimento suave, composição estavel e respiro visual, preparando a entrada da arte final oficial sem parecer corte abrupto.',
      'O CTA textual final "O que você sente?" ficara na arte oficial de fechamento, nao precisa ser gerado pelo Sora.',
      hasReference
        ? 'Terminar o trecho gerado com composição calma inspirada no simbolo da marca e com area visual limpa para a arte oficial de fechamento.'
        : 'Terminar o trecho gerado com composição calma de marca e com area visual limpa para a arte oficial de fechamento.'
    );
  } else {
    promptParts.push(
      isPreAtendimentoFocus
        ? 'Distribuicao recomendada do tempo: apresentar a Luiza IA desde o inicio, mostrar o fluxo de pre-atendimento no site e fechar com clareza no convite para comecar.'
        : 'Distribuicao recomendada do tempo: abertura muito curta com a dor ou necessidade, transicao rapida para o cuidado domiciliar, e fechamento claro dedicado ao pre-atendimento com a Luiza IA.',
      'Reservar os 3 segundos finais para um fechamento completo e legivel, sem truncar a ultima cena.',
      'Fechamento obrigatório: terminar com uma chamada clara para iniciar o pre-atendimento com a Luiza IA, com sensação de continuidade e convite para agendar atendimento domiciliar.',
      isPreAtendimentoFocus
        ? 'No fechamento, o foco principal deve ser a Luiza IA e o pre-atendimento online, e nao a apresentação institucional da fisioterapia.'
        : 'No fechamento, o foco principal deve ser o pre-atendimento online e nao a apresentação institucional.',
      'Quando houver texto final ou CTA em tela, a ultima frase deve ser sempre: "O que você sente?"',
      'Sugestao de tela final: "Luiza IA" e em seguida "O que você sente?".',
      hasReference
        ? 'Encerrar com composição final inspirada no simbolo da marca e com espaco visual para o CTA.'
        : 'Encerrar com composição final de marca e com espaco visual para o CTA.'
    );
  }

  promptParts.push(
    'Movimentos de camera suaves, transicoes coesas e ritmo de filme publicitario curto.',
    'Evitar hospital, evitar diagnostico medico, evitar texto demais na tela, evitar visual de tecnologia futurista exagerada, evitar qualquer pessoa famosa e evitar usar rosto humano enviado como referencia.'
  );

  return promptParts.join(' ');
}

export function buildLuizaIaAvatarPrompt() {
  return [
    'Crie um avatar estatico quadrado para a assistente virtual Luiza IA, usado no chat do site da Dra. Luiza Moneta.',
    'A personagem deve parecer a versao digital e acolhedora da assistente do site, e não uma personagem generica nem um retrato corporativo frio.',
    'O avatar deve transmitir empatia, proximidade, confianca e leveza, com olhar direto para a camera e expressao amigável.',
    ...getLuizaIaSharedDescription(),
    'Composição: retrato de busto, enquadramento central, cabeca e ombros visiveis, com boa leitura mesmo em tamanho pequeno e recorte circular.',
    'Estilo: retrato semi-realista premium, iluminação suave, acabamento limpo, elegante e acolhedor, sem parecer banco de imagens.',
    'Paleta: laranja suave, creme, bege e caramelo, alinhada a identidade visual da marca.',
    'Plano de fundo simples e limpo, preferencialmente em tom claro quente ou gradiente sutil, sem elementos distrativos e sem texto.',
    'A roupa deve seguir o mesmo estilo casual-profissional descrito acima e pode ter, no maximo, um detalhe de marca pequeno e discreto.',
    'Evitar headset, evitar microfone, evitar visual de call center, evitar exagero futurista, evitar estetica de robô, evitar mãos em destaque, evitar props desnecessarios.',
    'Resultado final deve funcionar como imagem de avatar de produto digital para a Luiza IA.',
  ].join(' ');
}
