import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createServerApi } from './httpApi';
import type { WeddingApi } from './models';

const ApiContext = createContext<WeddingApi | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => createServerApi(), []);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi() {
  return useContext(ApiContext);
}
