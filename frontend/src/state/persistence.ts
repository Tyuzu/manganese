import { Store } from './store';

export interface PersistOptions<T> {
  key: string;
  version?: number;
  migrations?: Record<number, (oldState: any) => any>;
  pick?: (state: T) => Partial<T>;
  debounceMs?: number;
}

interface PersistedEnvelope<T> {
  version: number;
  state: Partial<T>;
}

export function withPersistence<T extends Record<string, any>>(
  store: Store<T>,
  options: PersistOptions<T>
): Store<T> {
  const currentVersion = options.version ?? 1;
  const debounceDelay = options.debounceMs ?? 0;
  const savedData = localStorage.getItem(options.key);

  if (savedData) {
    try {
      const envelope: PersistedEnvelope<T> = JSON.parse(savedData);
      let storedVersion = envelope.version ?? 1;
      let workingState = envelope.state;

      if (options.migrations) {
        while (storedVersion < currentVersion) {
          const nextVersion = storedVersion + 1;
          const migrationFn = options.migrations[nextVersion];

          if (migrationFn) {
            console.info(`Migrating state from v${storedVersion} to v${nextVersion}...`);
            workingState = migrationFn(workingState);
          }
          storedVersion = nextVersion;
        }
      }

      store.setState(workingState);
    } catch (error) {
      console.error(`Failed to parse or migrate persisted state for key "${options.key}":`, error);
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  store.subscribe((state) => {
    const dataToSave = options.pick ? options.pick(state) : state;
    const envelope: PersistedEnvelope<T> = {
      version: currentVersion,
      state: dataToSave,
    };

    const persistAction = () => {
      localStorage.setItem(options.key, JSON.stringify(envelope));
    };

    if (debounceDelay > 0) {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(persistAction, debounceDelay);
    } else {
      persistAction();
    }
  });

  return store;
}
