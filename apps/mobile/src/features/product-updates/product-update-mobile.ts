import type { ProductUpdate, ProductUpdateStep } from '@clube-do-jogo/domain';

// The shared copy in @clube-do-jogo/domain is written for the web app. These steps
// are the only ones whose text is platform specific, so the native app swaps them
// in by eyebrow (the domain data, and the web dialog, stay untouched).
const MOBILE_STEP_OVERRIDES: Record<string, Partial<Pick<ProductUpdateStep, 'body' | 'highlights'>>> = {
  CONFIGURAÇÕES: {
    body: 'Toque na engrenagem no Perfil para abrir as Configurações. Lá você escolhe o tema, a escala de notas, as notificações e outras preferências.',
  },
  PERFORMANCE: {
    body: 'Já melhoramos o carregamento e a navegação entre várias telas, e agora o Clube do Jogo roda como um app nativo no seu celular. Ainda há bastante trabalho pela frente, e vamos continuar refinando essa experiência sem abrir mão dos temas, animações e do polimento visual.',
  },
};

export function mobileProductUpdate(update: ProductUpdate): ProductUpdate {
  return {
    ...update,
    steps: update.steps.map(step => {
      const override = MOBILE_STEP_OVERRIDES[step.eyebrow];
      return override ? { ...step, ...override } : step;
    }),
  };
}
