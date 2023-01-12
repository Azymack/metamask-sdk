import { CommunicationLayerPreference } from '@metamask/sdk-communication-layer';
import { ProviderConstants } from '../constants';
import { MetaMaskInstaller } from '../Platform/MetaMaskInstaller';
import { Platform } from '../Platform/Platfform';
import { getPostMessageStream } from '../PostMessageStream/getPostMessageStream';
import { Ethereum } from '../services/Ethereum';
import { RemoteConnection } from '../services/RemoteConnection';
import { WalletConnect } from '../services/WalletConnect';
import { PlatformType } from '../types/PlatformType';

const initializeProvider = ({
  checkInstallationOnAllCalls = false,
  communicationLayerPreference,
  platformType,
  injectProvider,
  shouldShimWeb3,
  installer,
  remoteConnection,
  walletConnect,
}: {
  communicationLayerPreference: CommunicationLayerPreference;
  checkInstallationOnAllCalls?: boolean;
  platformType: PlatformType;
  injectProvider?: boolean;
  shouldShimWeb3: boolean;
  installer: MetaMaskInstaller;
  remoteConnection?: RemoteConnection;
  walletConnect?: WalletConnect;
}) => {
  // Setup stream for content script communication
  const metamaskStream = getPostMessageStream({
    name: ProviderConstants.INPAGE,
    target: ProviderConstants.CONTENT_SCRIPT,
    communicationLayerPreference,
    remoteConnection,
    walletConnect,
  });

  // Initialize provider object (window.ethereum)
  const shouldSetOnWindow = !(
    !injectProvider ||
    // Don't inject if it's non browser
    platformType === PlatformType.NonBrowser
  );

  const ethereum = Ethereum.init({
    shouldSetOnWindow,
    connectionStream: metamaskStream,
    shouldShimWeb3,
  });

  metamaskStream.start();

  // TODO don't use any!!!!
  const sendRequest = async (method: string, args: any, f: any) => {
    const isInstalled = Platform.getInstance().isMetaMaskInstalled();

    console.debug(
      `[sendRequest] isInstalled=${isInstalled} method=${method}`,
      args,
    );

    if (!isInstalled && method !== 'metamask_getProviderState') {
      if (method === 'eth_requestAccounts' || checkInstallationOnAllCalls) {
        console.log(`start installer`);
        // Start installation and once installed try the request again
        const isConnectedNow = await installer.start({
          wait: false,
        });

        console.debug(
          `installer finished: method=${method} isConnectedNow=${isConnectedNow}`,
        );

        // Installation/connection is now completed so we are re-sending the request
        if (isConnectedNow) {
          console.debug(`sending  method=${method} on f(...args)`, f);
          return f(...args);
        }
      }

      throw new Error(
        'MetaMask is not connected/installed, please call eth_requestAccounts to connect first.',
      );
    }

    console.log(`AAAAAAAAAAAAAAA it should send '${method}'`);
    return await f(...args);
  };

  // Wrap ethereum.request call to check if the user needs to install MetaMask
  const { request } = ethereum;
  ethereum.request = async (...args) => {
    return sendRequest(args?.[0].method, args, request);
  };

  const { send } = ethereum;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore // FIXME remove support for deprecated method
  ethereum.send = async (...args) => {
    return sendRequest(args?.[0] as string, args, send);
  };

  return ethereum;
};

export default initializeProvider;
