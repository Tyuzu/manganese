type AppStateValue = Record<string, unknown>;

let state: AppStateValue = {};

export function getState(): AppStateValue {
  return state;
}

export function setState(nextState: AppStateValue): void {
  state = nextState;
}
