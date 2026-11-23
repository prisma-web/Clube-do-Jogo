import type { Metadata } from 'next';
import { GotyExperience } from '@/components/goty/goty-experience';

export const metadata: Metadata = {
  title: 'GOTY 2026',
  description: 'Bolão oficial do The Game Awards 2026 e o mural comunitário Seu GOTY do Clube do Jogo.',
};

export default function Goty2026Page() {
  return <GotyExperience />;
}
