import { CommunicationLayerPreference } from '@metamask/sdk-communication-layer';
import shouldInjectProvider from './provider/shouldInject';
import initializeProvider from './provider/initializeProvider';
import setupProviderStreams from './provider/setupProviderStreams';
import WalletConnect from './services/WalletConnect';
import ManageMetaMaskInstallation from './Platform/ManageMetaMaskInstallation';
import Platform, { PlatformName, WakeLockType } from './Platform';
import Ethereum from './services/Ethereum';
import PostMessageStreams from './PostMessageStreams';
import PortStreams from './portStreams';
import RemoteConnection from './services/RemoteConnection';
import { DappMetadata } from './constants';
import { shouldForceInjectProvider } from './utils';

export type MetaMaskSDKOptions = {
  injectProvider?: boolean;
  forceInjectProvider?: boolean;
  forceDeleteProvider?: boolean;
  checkInstallationImmediately?: boolean;
  forceRestartWalletConnect?: boolean;
  checkInstallationOnAllCalls?: boolean;
  preferDesktop?: boolean;
  openDeeplink?: (string) => void;
  useDeeplink?: boolean;
  wakeLockType?: WakeLockType;
  WalletConnectInstance?: any;
  shouldShimWeb3?: boolean;
  webRTCLib?: any;
  communicationLayerPreference?: CommunicationLayerPreference;
  transports?: string[];
  dappMetadata?: DappMetadata;
  timer?: any;
  enableDebug?: boolean;
};

export default class MetaMaskSDK {
  provider: any;

  constructor({
    dappMetadata,
    // Provider
    injectProvider = true,
    forceInjectProvider,
    forceDeleteProvider,
    // Shim web3 on Provider
    shouldShimWeb3 = true,
    // Installation
    checkInstallationImmediately,
    checkInstallationOnAllCalls,
    // Platform settings
    preferDesktop,
    openDeeplink,
    useDeeplink,
    wakeLockType,
    communicationLayerPreference = CommunicationLayerPreference.SOCKET,
    // WalletConnect
    WalletConnectInstance,
    forceRestartWalletConnect,
    // WebRTC
    webRTCLib,
    transports,
    timer,
    // Debugging
    enableDebug = true,
  }: MetaMaskSDKOptions = {}) {
    const platform = Platform.getPlatform();

    if (
      shouldForceInjectProvider(forceInjectProvider) ||
      platform === PlatformName.NonBrowser ||
      shouldInjectProvider()
    ) {
      if (
        shouldForceInjectProvider(forceInjectProvider) &&
        forceDeleteProvider
      ) {
        Ethereum.ethereum = null;
        delete window.ethereum;
      }

      PostMessageStreams.communicationLayerPreference =
        communicationLayerPreference;
      WalletConnect.WalletConnectInstance = WalletConnectInstance;
      RemoteConnection.webRTCLib = webRTCLib;

      if (openDeeplink) {
        Platform.preferredOpenLink = openDeeplink;
      }

      if (useDeeplink) {
        Platform.useDeeplink = useDeeplink;
      }

      if (wakeLockType) {
        Platform.wakeLockType = wakeLockType;
      }

      if (dappMetadata) {
        RemoteConnection.dappMetadata = dappMetadata;
      }

      if (transports) {
        RemoteConnection.transports = transports;
      }

      if (timer) {
        RemoteConnection.timer = timer;
      }

      if (enableDebug) {
        RemoteConnection.enableDebug = enableDebug;
      }

      WalletConnect.forceRestart = Boolean(forceRestartWalletConnect);
      ManageMetaMaskInstallation.preferDesktop = Boolean(preferDesktop);

      // Inject our provider into window.ethereum
      this.provider = initializeProvider({
        checkInstallationOnAllCalls,
        injectProvider,
        shouldShimWeb3,
      });

      // Setup provider streams, only needed for our mobile in-app browser
      const PortStream = PortStreams.getPortStreamToUse();
      if (PortStream) {
        setupProviderStreams(PortStream);
      }

      // This will check if the connection was correctly done or if the user needs to install MetaMask
      if (checkInstallationImmediately) {
        ManageMetaMaskInstallation.start({ wait: true });
      }
    } else {
      this.provider = window.ethereum;
    }
  }

  // Get the connector object from WalletConnect
  getWalletConnectConnector = () => {
    return WalletConnect.getConnector();
  };

  // Return the ethereum provider object
  getProvider() {
    return this.provider;
  }

  getUniversalLink() {
    if (RemoteConnection.universalLink) {
      return RemoteConnection.universalLink;
    }

    if (WalletConnect.universalLink) {
      return WalletConnect.universalLink;
    }

    throw new Error(
      'No Universal Link available, please call eth_requestAccounts first.',
    );
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    ReactNativeWebView: any;
    ethereum: any;
    extension: any;
    MSStream: any;
  }
}
