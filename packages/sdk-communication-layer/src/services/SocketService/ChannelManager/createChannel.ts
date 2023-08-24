import { v4 as uuidv4 } from 'uuid';
import { SocketService } from '../../../SocketService';
import { EventType } from '../../../types/EventType';
import { setupChannelListeners } from './setupChannelListeners';

/**
 * Creates a new communication channel for a given SocketService instance.
 * If debugging is enabled, logs the creation process. If the socket is not
 * connected, it initiates a connection. The function also sets up listeners
 * for the new channel and emits a JOIN_CHANNEL event.
 *
 * @param instance The current instance of the SocketService.
 * @returns {Object} An object containing the newly generated channel ID and
 * the public key associated with the instance, if available.
 * @property {string} channelId The unique identifier for the newly created channel.
 * @property {string} pubKey The public key associated with the SocketService
 * instance, or an empty string if not available.
 */
export function createChannel(instance: SocketService) {
  if (instance.state.debug) {
    console.debug(`SocketService::${instance.state.context}::createChannel()`);
  }

  if (!instance.state.socket?.connected) {
    instance.state.socket?.connect();
  }

  instance.state.manualDisconnect = false;
  instance.state.isOriginator = true;
  const channelId = uuidv4();
  instance.state.channelId = channelId;
  setupChannelListeners(instance, channelId);
  instance.state.socket?.emit(
    EventType.JOIN_CHANNEL,
    channelId,
    `${instance.state.context}createChannel`,
  );
  return {
    channelId,
    pubKey: instance.state.keyExchange?.getMyPublicKey() || '',
  };
}
