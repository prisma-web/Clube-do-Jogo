import { NextResponse } from 'next/server';

const TEAM_ID = 'K8M4BDWXM3';

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
