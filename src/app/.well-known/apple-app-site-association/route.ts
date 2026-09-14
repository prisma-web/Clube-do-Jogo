import { NextResponse } from 'next/server';

// Liga as credenciais salvas neste domínio ao app iOS, para o Apple Passwords
// sugerir o login do site na tela de login do app.
//
// Serve como route handler em vez de arquivo em `public/` porque a Apple exige
// `application/json` e o arquivo não tem extensão, então o Next entregaria
// `application/octet-stream` e o iOS descartaria em silêncio.
//
// O `webcredentials` só passa a valer depois que este endpoint estiver no ar em
// produção: o iOS busca este arquivo quando instala o app. Precisa combinar com
// `ios.associatedDomains` em `apps/mobile/app.config.ts`.

const TEAM_ID = 'K8M4BDWXM3';

// Uma entrada por variante do app, porque cada uma tem bundle identifier próprio.
const BUNDLE_IDENTIFIERS = [
  'com.clubedojogo.mobile.dev',
  'com.clubedojogo.mobile',
];

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(
    {
      webcredentials: {
        apps: BUNDLE_IDENTIFIERS.map(bundleId => `${TEAM_ID}.${bundleId}`),
      },
    },
    { headers: { 'content-type': 'application/json' } }
  );
}
