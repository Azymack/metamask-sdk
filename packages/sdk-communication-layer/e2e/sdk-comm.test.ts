import { describe, expect, it } from '@jest/globals';
import {
  CommunicationLayerPreference,
  MessageType,
  RemoteCommunication,
} from '../src';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const waitForEvent = (
  remoteConn: RemoteCommunication,
  event: string,
): Promise<unknown> => {
  return new Promise((resolve) => {
    remoteConn.on(event, (message: unknown) => {
      return resolve(message);
    });
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sleep = (ms: number) => {
  return new Promise((resolve) => {
    const ref = setTimeout(resolve, ms);
    return () => {
      clearTimeout(ref);
    };
  });
};

describe('SDK Comm Server', () => {
  let clientsReady = false;

  it('should establish client/mobile connection through comm server', async () => {
    const communicationLayerPreference = CommunicationLayerPreference.SOCKET;
    const platform = 'jest';
    // const communicationServerUrl = 'http://localhost:4000/';
    const communicationServerUrl =
      'https://metamask-sdk-socket.metafi.codefi.network/';

    const waitForReady = async (): Promise<void> => {
      return new Promise<void>((resolve) => {
        const ref = setInterval(() => {
          // console.debug(`check if ready ${clientsReady}`);
          if (clientsReady) {
            clearTimeout(ref);
            resolve();
          }
        }, 1000);
      });
    };

    const remote = new RemoteCommunication({
      communicationLayerPreference,
      platform,
      communicationServerUrl,
      dappMetadata: {
        name: 'jest dapp',
        url: 'http://somehwere.com',
      },
      context: 'initiator',
      analytics: true,
      developerMode: true,
    });

    const { channelId, pubKey } = await remote.generateChannelId();

    // TODO allow for fixed roomid / pubkey setup during testing
    // fs.writeFileSync(
    //   e2eConfig.tempFileName,
    //   JSON.stringify({ channelId, pubKey }),
    // );

    remote.on(MessageType.CLIENTS_READY, () => {
      clientsReady = true;
    });

    const mmRemote = new RemoteCommunication({
      communicationLayerPreference,
      platform,
      otherPublicKey: pubKey,
      communicationServerUrl,
      analytics: true,
      developerMode: true,
      dappMetadata: {
        name: 'SDK-COMM_TEST',
        url: 'http://somewhere.com',
      },
      context: 'mm',
    });

    mmRemote.connectToChannel(channelId);

    await waitForReady();

    // initiator

    mmRemote.disconnect();
    remote.disconnect();

    expect(clientsReady).toBe(true);
  });
});
