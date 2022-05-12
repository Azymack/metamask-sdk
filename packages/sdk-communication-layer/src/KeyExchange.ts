import { EventEmitter2 } from 'eventemitter2';
import ECDH from './ECDH';

enum KeySteps {
  NONE = 'none',
  SYN = 'key_handshake_SYN',
  SYNACK = 'key_handshake_SYNACK',
  ACK = 'key_handshake_ACK',
}

export default class KeyExchange extends EventEmitter2 {
  keysExchanged = false;

  myECDH = null;

  otherPublicKey = null;

  secretKey = null;

  commLayer: any;

  myPublicKey: any;

  sendPublicKey: any;

  step: string = KeySteps.NONE;

  constructor({ commLayer, otherPublicKey, sendPublicKey }) {
    super();

    this.myECDH = new ECDH();
    this.myECDH.generateECDH();
    this.commLayer = commLayer;
    this.myPublicKey = this.myECDH.getPublicKey();

    if (otherPublicKey) {
      this.onOtherPublicKey(otherPublicKey);
    }
    this.sendPublicKey = sendPublicKey;

    this.commLayer.on('key_exchange', ({ message }) => {
      if (this.keysExchanged) {
        return;
      }
      if (message.type === KeySteps.SYN) {
        this.checkStep(KeySteps.NONE);
        this.step = KeySteps.ACK;

        if (this.sendPublicKey && message.pubkey && !this.otherPublicKey) {
          this.onOtherPublicKey(message.pubkey);
        }

        this.commLayer.sendMessage({
          type: KeySteps.SYNACK,
          pubkey: this.myPublicKey,
        });
      } else if (message.type === KeySteps.SYNACK) {
        this.checkStep(KeySteps.SYNACK);

        this.onOtherPublicKey(message.pubkey);

        this.commLayer.sendMessage({ type: KeySteps.ACK });
        this.keysExchanged = true;
        this.emit('keys_exchanged');
      } else if (message.type === KeySteps.ACK) {
        this.checkStep(KeySteps.ACK);
        this.keysExchanged = true;
        this.emit('keys_exchanged');
      }
    });
  }

  start() {
    this.checkStep(KeySteps.NONE);
    this.step = KeySteps.SYNACK;
    this.commLayer.sendMessage({
      type: KeySteps.SYN,
      pubkey: this.sendPublicKey ? this.myPublicKey : undefined,
    });
  }

  checkStep(step) {
    if (this.step !== step) {
      throw new Error(`Wrong Step ${this.step} ${step}`);
    }
  }

  onOtherPublicKey(pubkey) {
    this.otherPublicKey = pubkey;
    this.myECDH.computeECDHSecret(this.otherPublicKey);
    this.secretKey = this.myECDH.secretKey;
  }

  encryptMessage(message) {
    if (!this.secretKey) {
      throw new Error('Keys not exchanged');
    }
    return this.myECDH.encryptAuthIV(message);
  }

  decryptMessage(message) {
    if (!this.secretKey) {
      throw new Error('Keys not exchanged');
    }
    return this.myECDH.decryptAuthIV(message);
  }
}
