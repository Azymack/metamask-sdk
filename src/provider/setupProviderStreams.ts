import { shimWeb3 } from '@metamask/providers';
import ObjectMultiplex from 'obj-multiplex';
import pump from 'pump';
import { WindowPostMessageStream } from '@metamask/post-message-stream';
import { ProviderConstants } from '../constants';

/**
 * Setup function called from content script after the DOM is ready.
 */
function setupProviderStreams(PortStream) {
  // the transport-specific streams for communication between inpage and background
  const pageStream = new WindowPostMessageStream({
    name: ProviderConstants.CONTENT_SCRIPT,
    target: ProviderConstants.INPAGE,
  });

  const appStream = new PortStream({
    name: ProviderConstants.CONTENT_SCRIPT,
  });

  // create and connect channel muxes
  // so we can handle the channels individually
  const pageMux = new ObjectMultiplex();
  pageMux.setMaxListeners(25);
  const appMux = new ObjectMultiplex();
  appMux.setMaxListeners(25);

  pump(pageMux, pageStream, pageMux, (err) =>
    logStreamDisconnectWarning('MetaMask Inpage Multiplex', err),
  );
  pump(appMux, appStream, appMux, (err) => {
    logStreamDisconnectWarning('MetaMask Background Multiplex', err);
    notifyProviderOfStreamFailure();
  });

  // forward communication across inpage-background for these channels only
  forwardTrafficBetweenMuxes(ProviderConstants.PROVIDER, pageMux, appMux);

  // add web3 shim
  shimWeb3(window.ethereum);
}

/**
 * Set up two-way communication between muxes for a single, named channel.
 *
 * @param {string} channelName - The name of the channel.
 * @param {ObjectMultiplex} muxA - The first mux.
 * @param {ObjectMultiplex} muxB - The second mux.
 */
function forwardTrafficBetweenMuxes(channelName, muxA, muxB) {
  const channelA = muxA.createStream(channelName);
  const channelB = muxB.createStream(channelName);
  pump(channelA, channelB, channelA, (err) =>
    logStreamDisconnectWarning(
      `MetaMask muxed traffic for channel "${channelName}" failed.`,
      err,
    ),
  );
}

/**
 * Error handler for page to extension stream disconnections
 *
 * @param {string} remoteLabel - Remote stream name
 * @param {Error} err - Stream connection error
 */
function logStreamDisconnectWarning(remoteLabel, err) {
  let warningMsg = `MetamaskContentscript - lost connection to ${remoteLabel}`;
  if (err) {
    warningMsg += `\n${err.stack}`;
  }
  console.warn(warningMsg);
  console.error(err);
}

/**
 * This function must ONLY be called in pump destruction/close callbacks.
 * Notifies the inpage context that streams have failed, via window.postMessage.
 * Relies on @metamask/object-multiplex and post-message-stream implementation details.
 */
function notifyProviderOfStreamFailure() {
  window.postMessage(
    {
      target: ProviderConstants.INPAGE, // the post-message-stream "target"
      data: {
        // this object gets passed to object-multiplex
        name: ProviderConstants.PROVIDER, // the object-multiplex channel name
        data: {
          jsonrpc: '2.0',
          method: 'METAMASK_STREAM_FAILURE',
        },
      },
    },
    window.location.origin,
  );
}

export default setupProviderStreams;
