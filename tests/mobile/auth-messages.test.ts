import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authMessage } from '../../apps/mobile/src/state/auth-messages';

const fallback = 'Não foi possível entrar.';

test('conta que nunca confirmou o email diz o que fazer, em vez da falha genérica', () => {
  assert.equal(
    authMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' }, fallback),
    'Confirme seu email pelo link que enviamos antes de entrar.',
  );
});

test('senha errada continua explícita', () => {
  assert.equal(
    authMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }, fallback),
    'Email ou senha incorretos.',
  );
});

test('bloqueio por tentativas diz para esperar', () => {
  assert.equal(
    authMessage({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }, fallback),
    'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  );
});

test('email já cadastrado e senha fraca continuam mapeados', () => {
  assert.equal(authMessage({ code: 'user_already_exists', message: 'User already registered' }, fallback), 'Este email já está cadastrado.');
  assert.equal(authMessage({ code: 'weak_password', message: 'Password is too short' }, fallback), 'A senha precisa ser mais forte.');
});

test('erro sem código cai na mensagem, que é como versões antigas do Supabase respondem', () => {
  assert.equal(authMessage({ message: 'Invalid login credentials' }, fallback), 'Email ou senha incorretos.');
  assert.equal(authMessage({ message: 'Email not confirmed' }, fallback), 'Confirme seu email pelo link que enviamos antes de entrar.');
  assert.equal(authMessage({ message: 'network request failed' }, fallback), 'Não foi possível conectar. Tente novamente.');
});

test('erro desconhecido não inventa explicação', () => {
  assert.equal(authMessage({ code: 'algo_novo', message: 'Something new' }, fallback), fallback);
  assert.equal(authMessage(null, fallback), fallback);
  assert.equal(authMessage('texto solto', fallback), fallback);
});
