type DebugTraceEntry = {
  ts: string;
  source: string;
  event: string;
  href: string;
  payload?: unknown;
};

const STORAGE_KEY = 'mcpDebugTrace';
const MAX_ENTRIES = 300;

function sanitize(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  try {
    return JSON.parse(
      JSON.stringify(value, (_key, nestedValue) => {
        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
          };
        }

        if (typeof nestedValue === 'function') {
          return '[Function]';
        }

        if (nestedValue instanceof HTMLElement) {
          return {
            tagName: nestedValue.tagName,
            className: nestedValue.className,
            id: nestedValue.id,
          };
        }

        return nestedValue;
      }),
    );
  } catch {
    return String(value);
  }
}

export function traceDebug(source: string, event: string, payload?: unknown): void {
  try {
    const entry: DebugTraceEntry = {
      ts: new Date().toISOString(),
      source,
      event,
      href: window.location.href,
      payload: sanitize(payload),
    };

    const chromeApi = globalThis.chrome;
    if (!chromeApi?.storage?.local) {
      return;
    }

    chromeApi.storage.local.get([STORAGE_KEY], result => {
      const existing = Array.isArray(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      const next = [...existing.slice(-(MAX_ENTRIES - 1)), entry];
      chromeApi.storage.local.set({ [STORAGE_KEY]: next });
    });
  } catch {
    // Best-effort logging only.
  }
}

export function clearDebugTrace(): void {
  try {
    globalThis.chrome?.storage?.local?.remove(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}
