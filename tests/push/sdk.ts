export const CONSTANTS = { ENV: { PROD: 'prod' } };
(window as any).sdkCalls = [];
(window as any).sdkOptions = [];
export const PushAPI = { initialize: async (wallet: any, options: any) => {
  (window as any).sdkOptions.push(options);
  if ((window as any).legacyRecovery) await wallet.provider.provider.request({ method: 'eth_decrypt', params: ['synthetic-cipher', wallet.account.address] });
  await wallet.signMessage({ account: wallet.account.address, message: 'synthetic recovery' });
  const call = (name: string) => async (..._args: unknown[]) => {
    (window as any).sdkCalls.push(name);
    if ((window as any).delayAction) await new Promise(resolve => { (window as any).finishAction = resolve; });
    return name === 'create' ? { chatId: 'room-1' } : [];
  };
  return { account: wallet.account.address, decryptedPgpPvtKey: 'synthetic-key', chat: {
    history: call('history'), list: call('list'), send: call('send'), group: {
      join: call('join'), leave: call('leave'), create: call('create'), info: call('info'), add: call('add'), remove: call('remove'),
    },
  } };
} };
