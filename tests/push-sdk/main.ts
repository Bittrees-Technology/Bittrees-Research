import { PGPHelper } from '@pushprotocol/restapi/src/lib/chat/helpers/pgp';
import { decryptAndVerifyMessage } from '@pushprotocol/restapi/src/lib/chat/helpers/crypto';
import { aesEncrypt } from '@pushprotocol/restapi/src/lib/chat/helpers/aes';
import { decryptPGPKey, getPublicKey } from '@pushprotocol/restapi/src/lib/helpers/crypto';
import { guardPushWallet } from '../../src/lib/pushSessionWallet';
(window as any).checkPushIsolation = async () => {
  const keys = await PGPHelper.generateKeyPair(); const otherKeys = await PGPHelper.generateKeyPair();
  const secret = 'synthetic-room-secret';
  (window as any).encryptedSecret = await PGPHelper.pgpEncrypt({ plainText: secret, keys: [keys.publicKeyArmored] });
  const content = aesEncrypt({ plainText: 'Private room content', secretKey: secret });
  const message: any = { messageContent: content, encType: 'pgpv1:group', sessionKey: 'synthetic-session-key', link: 'previous-message',
    signature: await PGPHelper.sign({ message: content, signingKey: keys.privateKeyArmored }) };
  const first = await decryptAndVerifyMessage(message, keys.publicKeyArmored, keys.privateKeyArmored, 'prod' as any);
  const second = await decryptAndVerifyMessage(message, keys.publicKeyArmored, otherKeys.privateKeyArmored, 'prod' as any);
  const owner = `0x${'a'.repeat(40)}`; let active = true; let wrongProviderCalls = 0;
  const wallet: any = { account: { address: owner }, chain: { id: 1 }, getAddresses: async () => [owner], getChainId: async () => 1,
    signMessage: async (_args: unknown) => '0x01', signTypedData: async (_args: unknown) => '0x02',
    request: async ({ method }: { method: string }) => { if (method === 'eth_decrypt') return keys.privateKeyArmored; if (method === 'eth_getEncryptionPublicKey') return 'synthetic-public-key'; throw new Error('Unexpected RPC'); } };
  const signer = guardPushWallet(wallet, owner, () => { if (!active) throw new Error('Wallet changed'); });
  delete (window as any).ethereum;
  const absentRecovery = await decryptPGPKey({ signer: signer as any, account: owner, encryptedPGPPrivateKey: JSON.stringify({ version: 'x25519-xsalsa20-poly1305' }), toUpgrade: false });
  const absentPublicKey = await getPublicKey({ signer: signer as any, account: owner });
  (window as any).ethereum = { request: () => { wrongProviderCalls++; throw new Error('Wrong provider'); } };
  const boundRecovery = await decryptPGPKey({ signer: signer as any, account: owner, encryptedPGPPrivateKey: JSON.stringify({ version: 'x25519-xsalsa20-poly1305' }), toUpgrade: false });
  active = false;
  let staleRejected = false;
  try { await (signer as any).provider.provider.request({ method: 'eth_decrypt', params: ['cipher', owner] }); } catch { staleRejected = true; }
  return { firstRead: first.messageContent, secondRead: second.messageContent, absentRecovery: absentRecovery === keys.privateKeyArmored,
    absentPublicKey: absentPublicKey === 'synthetic-public-key', boundRecovery: boundRecovery === keys.privateKeyArmored, wrongProviderCalls, staleRejected };
};
document.body.textContent = 'Ready';
