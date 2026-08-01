export interface ProductUpdateImage {
  src: string;
  alt: string;
  position?: 'top' | 'center' | 'bottom';
}

export type ProductUpdateArtwork = 'overview' | 'performance';

export interface ProductUpdateStep {
  eyebrow: string;
  title: string;
  body: string;
  highlights?: string[];
  image?: ProductUpdateImage;
  artwork?: ProductUpdateArtwork;
}

export interface ProductUpdate {
  id: string;
  version: string;
  title: string;
  steps: ProductUpdateStep[];
}

export const PRODUCT_UPDATE_EVENT = 'clube-do-jogo:open-product-update';

export function productUpdateStorageKey(updateId: string) {
  return `clube-do-jogo:product-update:${updateId}:completed`;
}

export const currentProductUpdate: ProductUpdate = {
  id: 'v1.1',
  version: 'V1.1',
  title: 'Atualização V1.1',
  steps: [
    {
      eyebrow: 'ATUALIZAÇÃO V1.1',
      title: 'Mais jogos. Mais você.',
      body: 'O Clube do Jogo cresceu para além da votação do mês. Agora ficou mais fácil descobrir, organizar e acompanhar tudo o que você joga, sem perder o que faz o clube ser o clube.',
      artwork: 'overview',
    },
    {
      eyebrow: 'RANKING',
      title: 'O ranking entrou na fila de balanceamento',
      body: 'A votação ficou mais direta: escolha entre Jogaria e Não. Finalizar um jogo não interfere mais na pontuação, e jogos com a mesma quantidade de pontos dividem a mesma colocação.',
      highlights: [
        '“Não” agora permite informar o motivo.',
        'Toque novamente no seu voto para removê-lo.',
        'Mesma pontuação, mesma posição.',
      ],
      image: { src: '/updates/v1.1/ranking.webp', alt: 'Página real do ranking com votos Jogaria e Não e a pontuação dos jogos.' },
    },
    {
      eyebrow: 'ADICIONADOS RECENTEMENTE',
      title: 'Todo jogo merece alguns minutos no palco',
      body: 'A nova visão agrupa os jogos pelo dia em que entraram na votação. Assim, uma novidade não desaparece só porque começou longe do topo.',
      image: { src: '/updates/v1.1/recent.webp', alt: 'Visão real de jogos adicionados recentemente agrupados por data.' },
    },
    {
      eyebrow: 'EXPLORAR',
      title: 'Seu próximo jogo pode estar aqui',
      body: 'A nova área Explorar reúne o catálogo em um só lugar. Busque por nome e navegue usando filtros de gênero, plataforma, ano, popularidade, avaliação e lançamento.',
      highlights: [
        'Filtros e ordenações aparecem em mais áreas.',
        'Suas escolhas ficam salvas para a próxima visita.',
      ],
      image: { src: '/updates/v1.1/explore.webp', alt: 'Página real Explorar com busca, filtros rápidos e cards de jogos.' },
    },
    {
      eyebrow: 'MEUS JOGOS',
      title: 'Sua biblioteca, no seu ritmo',
      body: 'Meus Jogos é uma área pessoal, independente do jogo escolhido pelo clube. Use esse espaço para organizar tudo o que você quer jogar ou já jogou, com pesquisa, filtros e ordenações.',
      highlights: [
        'Jogue fora do ciclo do clube.',
        'Status, datas e progresso reunidos.',
        'Perfil focado no que você gosta.',
      ],
      image: { src: '/updates/v1.1/library.webp', alt: 'Página real Meus Jogos com busca, filtros, ordenação e jogos adicionados.' },
    },
    {
      eyebrow: 'PROGRESSO E ANOTAÇÕES',
      title: 'O jogo do mês é só o começo',
      body: 'Progresso, notas e anotações agora acompanham qualquer jogo da sua biblioteca. Use o Clube do Jogo como seu diário pessoal, mesmo quando estiver jogando algo fora da escolha do mês.',
      image: { src: '/updates/v1.1/progress.webp', alt: 'Aba real de progresso de Hades com status, nota e progresso do clube.' },
    },
    {
      eyebrow: 'FAVORITOS E PERFIL',
      title: 'Mostre os jogos que são a sua cara',
      body: 'Favorite os jogos que você ama e destaque-os no seu perfil. Quem visitar encontra seus favoritos, jogos adicionados, finalizados e consoles nas abas do perfil.',
      image: { src: '/updates/v1.1/favorites.webp', alt: 'Perfil real mostrando a aba Favoritos e os jogos destacados pelo usuário.' },
    },
    {
      eyebrow: 'REAÇÕES',
      title: 'Segure para conhecer a torcida',
      body: 'Pressione e segure uma reação já existente para ver quem reagiu e descobrir qual emoji cada pessoa escolheu.',
      highlights: [
        'Um toque continua adicionando ou removendo sua reação.',
        'Segurar mostra todas as pessoas e os emojis usados.',
      ],
      image: { src: '/updates/v1.1/reactions.webp', alt: 'Modal real de reações com os nomes das pessoas e os emojis escolhidos.', position: 'center' },
    },
    {
      eyebrow: 'CONFIGURAÇÕES',
      title: 'Seu app, suas regras',
      body: 'Toque no avatar do cabeçalho para abrir as Configurações. Lá você escolhe o tema, a escala de notas, as notificações e outras preferências.',
      highlights: [
        'Admins também encontram as opções do clube e de acessos.',
        'As novidades podem ser abertas novamente por aqui.',
      ],
      image: { src: '/updates/v1.1/settings.webp', alt: 'Página real de Configurações com as abas Preferências, Clube e Acessos.' },
    },
    {
      eyebrow: 'PERFORMANCE',
      title: 'Mais rápido, passo a passo',
      body: 'Já melhoramos o carregamento e a navegação entre várias telas, mas ainda há bastante trabalho pela frente. Algumas limitações vêm do app ainda ser construído como um site, e não como um aplicativo nativo. Vamos continuar refinando essa experiência sem abrir mão dos temas, animações e do polimento visual.',
      artwork: 'performance',
    },
  ],
};
