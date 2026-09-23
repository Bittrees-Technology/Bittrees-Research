import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { watchPushSession } from '../../src/lib/pushRuntime';
import { usePush, usePushSessionKey } from '../../src/lib/usePush';
import { saveRoomChatId } from '../../src/lib/rooms';
function View() {
  const push = usePush(); const [result, setResult] = useState('');
  async function action(registry: boolean) {
    if (!push.client) return;
    try {
      if (registry) {
        await push.client.chat.group.create('test');
        await saveRoomChatId({ walletClient: push.wallet!, account: push.wallet!.account!.address, roomKey: 'test', chatId: 'room-1' });
      } else await push.client.chat.send('room', 'test');
      setResult('completed');
    } catch (error) { setResult((error as Error).message); }
  }
  return <section><p data-testid="status">{push.status}</p><p role="alert">{push.error}</p>
    <button onClick={() => void push.enable()}>Enable</button>
    <button disabled={!push.client} onClick={() => void action(false)}>Send</button>
    <button disabled={!push.client} onClick={() => void action(true)}>Create and publish</button>
    <p data-testid="result">{result}</p><p data-testid="session-key">{push.sessionKey}</p>
  </section>;
}
function App() {
  useEffect(watchPushSession, []); const key = usePushSessionKey(); const [shown, setShown] = useState(true);
  return <><button onClick={() => setShown(v => !v)}>Toggle view</button>{shown && <View key={key} />}</>;
}
createRoot(document.getElementById('root')!).render(<App />);
