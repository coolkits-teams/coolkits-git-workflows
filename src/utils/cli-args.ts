export interface CliArgs {
  args: string[];
  hasFlag: (name: string) => boolean;
  getFlag: (name: string) => string | null;
}

/**
 * Minimal POSIX-style flag parser.
 *
 * Supported forms:
 *   --flag              → hasFlag returns true
 *   --flag value        → getFlag returns 'value'
 *   --flag=value        → getFlag returns 'value'
 *
 * @param argv  Typically `process.argv`.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  const hasFlag = (name: string): boolean =>
    args.some((arg) => arg === name || arg.startsWith(`${name}=`));

  const getFlag = (name: string): string | null => {
    for (let i = 0; i < args.length; i += 1) {
      const current = args[i];

      if (current === name) {
        const next = args[i + 1];
        if (next === undefined || next.startsWith('--')) return null;
        return next;
      }

      if (current?.startsWith(`${name}=`)) {
        return current.slice(name.length + 1);
      }
    }

    return null;
  };

  return { args, hasFlag, getFlag };
}
