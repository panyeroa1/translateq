
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createContext, FC, ReactNode, useContext } from 'react';
import { useLiveApi, UseLiveApiResults } from '../hooks/media/use-live-api';

const LiveAPIContext = createContext<UseLiveApiResults | undefined>(undefined);

export type LiveAPIProviderProps = {
  children: ReactNode;
};

export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  children,
}) => {
  const liveAPI = useLiveApi();

  return (
    <LiveAPIContext.Provider value={liveAPI}>
      {children}
    </LiveAPIContext.Provider>
  );
};

export const useLiveAPIContext = () => {
  const context = useContext(LiveAPIContext);
  if (!context) {
    throw new Error('useLiveAPIContext must be used within a LiveAPIProvider');
  }
  return context;
};
