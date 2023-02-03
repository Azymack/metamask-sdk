import React from 'react';
import { WagmiConfig, createClient, Chain, Connector } from 'wagmi';
import { providers } from 'ethers';
import MetaMaskConnector from './MetaMaskConnector';
import { MetaMaskSDKOptions } from '@metamask/sdk';

const MetaMaskProvider = ({
  children,
  networks,
  sdkOptions,
  connectors = [],
}: {
  children: React.ReactNode;
  networks: Chain[];
  sdkOptions?: MetaMaskSDKOptions;
  connectors?: Connector[];
}) => {
  const MMConnector = new MetaMaskConnector({
    chains: networks,
    sdkOptions,
  });

  const client = createClient({
    autoConnect: true,
    connectors: [MMConnector, ...connectors],
    provider: (config) => {
      if (!config.chainId) return providers.getDefaultProvider();
      return new providers.Web3Provider(
        MMConnector.getProviderSync(),
        config.chainId,
      );
    },
  });

  return <WagmiConfig client={client}>{children}</WagmiConfig>;
};

export default MetaMaskProvider;
