import type { Logger } from '../types.js';

const ANSI = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
} as const;

type Level = 'info' | 'ok' | 'warn' | 'err' | 'debug';

const LEVEL_META: Record<Level, { color: string; label: string; stream: 'stdout' | 'stderr' }> = {
  info: { color: ANSI.blue, label: 'INFO', stream: 'stdout' },
  ok: { color: ANSI.green, label: ' OK ', stream: 'stdout' },
  warn: { color: ANSI.yellow, label: 'WARN', stream: 'stdout' },
  err: { color: ANSI.red, label: 'ERR ', stream: 'stderr' },
  debug: { color: ANSI.dim, label: 'DBG ', stream: 'stdout' },
};

export function createLogger({ colors = true, debug = false } = {}): Logger {
  const write = (level: Level, message: string): void => {
    if (level === 'debug' && !debug) return;

    const meta = LEVEL_META[level];
    const stream = meta.stream === 'stderr' ? process.stderr : process.stdout;
    const prefix = colors ? `${meta.color}[${meta.label}]${ANSI.reset}` : `[${meta.label}]`;
    stream.write(`${prefix}  ${message}\n`);
  };

  return {
    info: (message) => {
      write('info', message);
    },
    ok: (message) => {
      write('ok', message);
    },
    warn: (message) => {
      write('warn', message);
    },
    err: (message) => {
      write('err', message);
    },
    debug: (message) => {
      write('debug', message);
    },
    plain: (message) => process.stdout.write(`${message}\n`),
  };
}
