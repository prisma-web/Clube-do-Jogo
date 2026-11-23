import { useId } from 'react';
import { cn } from '@/lib/utils';

export function TgaEmblem({
  className,
  solid = false,
}: {
  className?: string;
  solid?: boolean;
}) {
  const gradientId = useId();
  const fill = solid ? 'currentColor' : `url(#${gradientId})`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {!solid && (
        <defs>
          <linearGradient id={gradientId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF0B8" />
            <stop offset="48%" stopColor="#DFB451" />
            <stop offset="100%" stopColor="#8E6419" />
          </linearGradient>
        </defs>
      )}
      {/* Silhueta geométrica inspirada na estatueta alada do The Game Awards */}
      {/* Núcleo central da figura */}
      <polygon points="32,7 35.4,15.5 34.4,45.5 32,57 29.6,45.5 28.6,15.5" fill={fill} />
      {/* Lâminas da asa esquerda */}
      <polygon points="10,12 26.5,24.5 26.5,29.5 13.5,19.8" fill={fill} />
      <polygon points="13.5,23.2 26.5,32.6 26.5,37.4 17.2,30.6" fill={fill} />
      <polygon points="18.2,34.4 26.8,40.4 26.8,44.8 21.4,41" fill={fill} />
      {/* Lâminas da asa direita */}
      <polygon points="54,12 37.5,24.5 37.5,29.5 50.5,19.8" fill={fill} />
      <polygon points="50.5,23.2 37.5,32.6 37.5,37.4 46.8,30.6" fill={fill} />
      <polygon points="45.8,34.4 37.2,40.4 37.2,44.8 42.6,41" fill={fill} />
      {/* Base pedestal minimalista */}
      <polygon points="24,57.5 40,57.5 37.5,53.5 26.5,53.5" fill={fill} opacity="0.92" />
    </svg>
  );
}
