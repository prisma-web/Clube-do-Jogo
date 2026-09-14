const byCode = new Map([
  ['invalid_credentials', 'Email ou senha incorretos.'],
  ['email_not_confirmed', 'Confirme seu email pelo link que enviamos antes de entrar.'],
  ['user_already_exists', 'Este email já está cadastrado.'],
  ['weak_password', 'A senha precisa ser mais forte.'],
  ['over_request_rate_limit', 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
  ['over_email_send_rate_limit', 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
]);

const byMessage: Array<[RegExp, string]> = [
  [/invalid login|invalid credentials/i, 'Email ou senha incorretos.'],
  [/email not confirmed|not confirmed/i, 'Confirme seu email pelo link que enviamos antes de entrar.'],
  [/already registered|user already/i, 'Este email já está cadastrado.'],
  [/rate limit|too many requests/i, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
  [/network|fetch|connect/i, 'Não foi possível conectar. Tente novamente.'],
];

function field(error: unknown, name: string) {
  if (!error || typeof error !== 'object' || !(name in error)) return '';
  const value = (error as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

export function authMessage(error: unknown, fallback: string) {
  const code = field(error, 'code') || field(error, 'error_code');
  const mapped = byCode.get(code);
  if (mapped) return mapped;

  const message = field(error, 'message');
  if (/password/i.test(message) && /short|weak|length/i.test(message)) return 'A senha precisa ser mais forte.';
  for (const [pattern, sentence] of byMessage) {
    if (pattern.test(message)) return sentence;
  }
  return fallback;
}
