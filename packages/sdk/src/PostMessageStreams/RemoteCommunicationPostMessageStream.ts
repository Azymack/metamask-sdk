import { Duplex } from 'stream';
import { Buffer } from 'buffer';
import RemoteCommunication from '@metamask/sdk-communication-layer';
import { METHODS_TO_REDIRECT, ProviderConstants } from '../constants';
import Ethereum from '../services/Ethereum';
import RemoteConnection from '../services/RemoteConnection';
import Platform, { PlatformName } from '../Platform';

class RemoteCommunicationPostMessageStream extends Duplex {
  private _name: any;

  comm: RemoteCommunication;

  constructor({ name }) {
    super({
      objectMode: true,
    });
    this._name = name;

    this.comm = RemoteConnection.getConnector();

    this._onMessage = this._onMessage.bind(this);
    this.comm.on('message', this._onMessage);

    this.comm.on('clients_ready', () => {
      Ethereum.ethereum._state.initialized = true;
      Ethereum.ethereum._initializeState();
    });

    this.comm.on('clients_disconnected', () => {
      Ethereum.ethereum._handleAccountsChanged([]);
      Ethereum.ethereum._handleDisconnect(true);
    });
  }

  _write(msg, _encoding, callback) {
    if (!RemoteConnection.isConnected()) {
      return callback();
    }

    try {
      let data;
      if (Buffer.isBuffer(msg)) {
        data = msg.toJSON();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        data._isBuffer = true;
      } else {
        data = msg;
      }

      this.comm.sendMessage(data?.data);

      const isDesktop = Platform.getPlatform() === PlatformName.DesktopWeb;

      // Check if should open app
      if (METHODS_TO_REDIRECT[data?.data?.method] && !isDesktop) {
        Platform.openDeeplink(
          'https://metamask.app.link/',
          'metamask://',
          '_self',
        );
      } else if (RemoteConnection.isPaused() && !isDesktop) {
        Platform.openDeeplink(
          'https://metamask.app.link/connect?redirect=true',
          'metamask://connect?redirect=true',
          '_self',
        );
      }
    } catch (err) {
      return callback(
        new Error('RemoteCommunicationPostMessageStream - disconnected'),
      );
    }

    return callback();
  }

  _read() {
    return undefined;
  }

  _onMessage({ message }) {
    // validate message
    /* if (this._origin !== '*' && event.origin !== this._origin) {
      return;
    }*/

    if (!message || typeof message !== 'object') {
      return;
    }

    if (!message.data || typeof message.data !== 'object') {
      return;
    }

    if (message.name && message.name !== ProviderConstants.PROVIDER) {
      return;
    }

    if (Buffer.isBuffer(message)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete msg._isBuffer;
      const data = Buffer.from(message);
      this.push(data);
    } else {
      this.push(message);
    }
  }

  start() {
    // Ethereum.ethereum.isConnected = () => RemoteConnection.isConnected();
  }
}

export default RemoteCommunicationPostMessageStream;
