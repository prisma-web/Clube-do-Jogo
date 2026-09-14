export class DataError extends Error {
  readonly operation: string;
  readonly cause: unknown;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.operation = operation;
    this.cause = cause;
  }
}

function errorCode(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function toDataError(operation: string, message: string, cause: unknown): DataError {
  if (cause instanceof DataError) return cause;

  const code = errorCode(cause);
  if (code === '401' || code === 'PGRST301' || code === 'invalid_grant') {
    return new DataError(operation, 'Sua sessão expirou. Entre novamente para continuar.', cause);
  }
  if (code === 'refused-after-refresh') {
    return new DataError(operation, 'O servidor recusou o acesso mesmo com a sessão renovada. Avise quem cuida do clube.', cause);
  }
  if (code === '23505') {
    return new DataError(operation, 'Este registro já existe.', cause);
  }

  return new DataError(operation, message, cause);
}

export async function withDataErrors<T>(operation: string, message: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (cause) {
    throw toDataError(operation, message, cause);
  }
}

export function requireValue<T>(value: T | null | undefined, operation: string, message: string): T {
  if (value == null) throw new DataError(operation, message);
  return value;
}
