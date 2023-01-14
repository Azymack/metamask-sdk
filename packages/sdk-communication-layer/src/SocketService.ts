import { EventEmitter2 } from 'eventemitter2';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_SOCKET_TRANSPORTS } from './config';
import { ECIESProps } from './ECIES';
import { KeyExchange } from './KeyExchange';
import { Channel } from './types/Channel';
import { CommunicationLayer } from './types/CommunicationLayer';
import { CommunicationLayerMessage } from './types/CommunicationLayerMessage';
import { CommunicationLayerPreference } from './types/CommunicationLayerPreference';
import { MessageType } from './types/MessageType';

export interface SocketServiceProps {
  communicationLayerPreference: CommunicationLayerPreference;
  reconnect?: boolean;
  transports?: string[];
  otherPublicKey?: string;
  communicationServerUrl: string;
  context: string;
  ecies?: ECIESProps;
  debug: boolean;
}

export class SocketService extends EventEmitter2 implements CommunicationLayer {
  private socket: Socket;

  private clientsConnected = false;

  private clientsReady = false;

  private isOriginator?: boolean;

  private channelId?: string;

  private keyExchange: KeyExchange;

  private manualDisconnect = false;

  private reconnect?: boolean;

  private communicationLayerPreference: CommunicationLayerPreference;

  private context: string;

  private communicationServerUrl: string;

  private debug: boolean;

  constructor({
    otherPublicKey,
    reconnect,
    communicationLayerPreference,
    transports,
    communicationServerUrl,
    context,
    ecies,
    debug = false,
  }: SocketServiceProps) {
    super();

    this.reconnect = reconnect;
    this.context = context;
    this.communicationLayerPreference = communicationLayerPreference;
    this.debug = debug;
    this.communicationServerUrl = communicationServerUrl;

    const options = {
      autoConnect: false,
      transports: DEFAULT_SOCKET_TRANSPORTS,
    };

    if (transports) {
      options.transports = transports;
    }

    this.socket = io(communicationServerUrl, options);

    const connectAgain = () => {
      window.removeEventListener('focus', connectAgain);
      this.reconnect = true;
      this.socket.connect();
      this.socket.emit(MessageType.JOIN_CHANNEL, this.channelId);
    };

    const checkFocus = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
      }
      this.socket.disconnect();
      if (document.hasFocus()) {
        connectAgain();
      } else {
        window.addEventListener('focus', connectAgain);
      }
    };

    this.socket.on('error', () => {
      // #if _WEB
      checkFocus();
      // #endif
    });

    this.socket.on('disconnect', () => {
      // #if _WEB
      checkFocus();
      // #endif
    });

    const keyExchangeInitParameter = {
      communicationLayer: this,
      otherPublicKey,
      sendPublicKey: false,
      context: this.context,
      ecies,
      debug,
    };

    this.keyExchange = new KeyExchange(keyExchangeInitParameter);

    this.keyExchange.on(MessageType.KEYS_EXCHANGED, () => {
      this.emit(MessageType.CLIENTS_READY, {
        isOriginator: this.isOriginator,
      });
    });
  }

  private checkSameId(id: string) {
    if (id !== this.channelId) {
      throw new Error('Wrong id');
    }
  }

  private setupChannelListeners(channelId: string): void {
    this.socket.on(`clients_connected-${channelId}`, (id: string) => {
      if (this.debug) {
        console.debug(
          `SocketService::${this.context}::setupChannelListener::on 'clients_connected-${channelId}'`,
          id,
        );
      }
      this.channelId = id;
      this.clientsConnected = true;
      if (this.isOriginator) {
        if (!this.keyExchange.areKeysExchanged()) {
          this.keyExchange.start(this.isOriginator);
        }
      }

      if (this.reconnect) {
        if (this.keyExchange.areKeysExchanged()) {
          this.sendMessage({ type: MessageType.READY });
          if (
            this.communicationLayerPreference ===
            CommunicationLayerPreference.WEBRTC
          ) {
            this.emit(MessageType.CLIENTS_READY, {
              isOriginator: this.isOriginator,
            });
          }
        } else if (!this.isOriginator) {
          this.sendMessage({
            type: MessageType.KEY_HANDSHAKE_START,
          });
        }
        // FIXME why turning reconnect at false?
        // should we have max attempts instead?
        // this.reconnect = false;
      }
    });

    this.socket.on(`channel_created-${channelId}`, (id) => {
      if (this.debug) {
        console.debug(
          `SocketService::${this.context}::setupChannelListener::on 'channel_created-${channelId}'`,
          id,
        );
      }
      this.emit(MessageType.CHANNEL_CREATED, id);
    });

    this.socket.on(`clients_disconnected-${channelId}`, () => {
      this.clientsConnected = false;
      this.emit(MessageType.CLIENTS_DISCONNECTED, channelId);
    });

    this.socket.on(`message-${channelId}`, ({ id, message, error }) => {
      if (this.debug) {
        console.debug(
          `SocketService::${this.context}::setupChannelListener::on 'message-${channelId}' error=${error}`,
          message,
        );
      }

      if (error) {
        throw new Error(error);
      }

      this.checkSameId(id);

      if (
        this.isOriginator &&
        this.keyExchange.areKeysExchanged() &&
        message?.type === MessageType.KEY_HANDSHAKE_START
      ) {
        return this.keyExchange.start(this.isOriginator);
      }

      if (!this.keyExchange.areKeysExchanged()) {
        if (message?.type.startsWith('key_handshake')) {
          return this.emit(MessageType.KEY_EXCHANGE, {
            message,
          });
        }
        throw new Error('Keys not exchanged');
      }

      const decryptedMessage = this.keyExchange.decryptMessage(message);
      const messageReceived = JSON.parse(decryptedMessage);
      return this.emit(MessageType.MESSAGE, messageReceived);
    });

    this.socket.on(
      `clients_waiting_to_join-${channelId}`,
      (numberUsers: number) => {
        if (this.debug) {
          console.debug(
            `SocketService::${this.context}::setupChannelListener::on 'clients_waiting_to_join-${channelId}'`,
            numberUsers,
          );
        }
        this.emit(MessageType.CLIENTS_WAITING, numberUsers);
      },
    );
  }

  createChannel(): Channel {
    if (this.debug) {
      console.debug(`SocketService::${this.context}::createChannel()`);
    }
    this.socket.connect();
    this.isOriginator = true;
    const channelId = uuidv4();
    this.setupChannelListeners(channelId);
    this.socket.emit(MessageType.JOIN_CHANNEL, channelId);
    return { channelId, pubKey: this.keyExchange.getMyPublicKey() };
  }

  connectToChannel(channelId: string): void {
    if (this.debug) {
      console.debug(
        `SocketService::${this.context}::createChannel() channelId=${channelId}`,
      );
    }
    this.socket.connect();
    this.channelId = channelId;
    this.setupChannelListeners(channelId);
    this.socket.emit(MessageType.JOIN_CHANNEL, channelId);
  }

  sendMessage(message: CommunicationLayerMessage): void {
    if (!this.channelId) {
      throw new Error('Create a channel first');
    }

    if (!this.keyExchange.areKeysExchanged()) {
      if (message?.type.startsWith('key_handshake')) {
        this.socket.emit(MessageType.MESSAGE, { id: this.channelId, message });
        return;
      }
      throw new Error('Keys not exchanged');
    }

    const encryptedMessage = this.keyExchange.encryptMessage(
      JSON.stringify(message),
    );

    const messageToSend = {
      id: this.channelId,
      message: encryptedMessage,
    };
    if (this.debug) {
      console.debug(
        `SocketService::${this.context}::sendMessage()`,
        messageToSend,
      );
    }
    this.socket.emit(MessageType.MESSAGE, messageToSend);
  }

  pause(): void {
    this.manualDisconnect = true;
    if (this.keyExchange.areKeysExchanged()) {
      this.sendMessage({ type: MessageType.PAUSE });
    }
    this.socket.disconnect();
  }

  resume(): void {
    this.manualDisconnect = false;
    if (this.keyExchange.areKeysExchanged()) {
      this.reconnect = true;
      this.socket.connect();
      this.socket.emit(MessageType.JOIN_CHANNEL, this.channelId);
    }
  }

  disconnect(): void {
    this.socket.disconnect();
    this.socket.close();
  }
}
