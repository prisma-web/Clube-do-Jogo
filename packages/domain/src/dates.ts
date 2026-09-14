const clubTimeZone = 'America/Fortaleza';

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: clubTimeZone,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: clubTimeZone,
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: clubTimeZone,
});

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: clubTimeZone,
});

export function formatDate(value?: string | Date | null): string {
  if (!value) return '-';
  return dateFormatter.format(new Date(value)).replace('.', '');
}

export function formatShortDate(value?: string | Date | null): string {
  if (!value) return '-';
  return shortDateFormatter.format(new Date(value));
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '-';
  return dateTimeFormatter.format(new Date(value));
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return '';
  return timeFormatter.format(new Date(value));
}

export function formatMonth(month: string, options: { includeYear?: boolean; capitalize?: boolean } = {}): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    ...(options.includeYear === false ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return options.capitalize === false ? label : label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone: clubTimeZone,
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isPastMonth(month: string): boolean {
  return month < monthKey();
}
