export { formatMonth, formatShortDate, shiftMonth } from '@clube-do-jogo/domain';

export function initials(name?: string | null): string {
  return (name || 'Membro')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export function formatFinishedCount(count: number): string {
  return `${count} ${count === 1 ? 'finalizou' : 'finalizaram'}`;
}
