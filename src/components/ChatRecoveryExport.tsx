import './ChatRecoveryExport.css';
import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { verifyMessage } from 'viem';
import { encryptRecoveryArchive } from '../lib/chatRecoveryArchive';
import { assertExportUnchanged, proveExportWallet, reviewChatExport, type ExportReview } from '../lib/chatRecoveryExport';

export function ChatRecoveryExport() {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const verifier = usePublicClient({ chainId });
  const [shared, setShared] = useState(false);
  const [review, setReview] = useState<ExportReview | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const generation = useRef(0);
  const live = useRef({ address, chainId, wallet }); live.current = { address, chainId, wallet };
  useEffect(() => {
    generation.current++; setReview(null); setShared(false); setPassword(''); setConfirmation(''); setStatus(''); setBusy(false);
    return () => { generation.current++; };
  }, [address, chainId, wallet]);
  function preview() {
    setStatus(''); setFailed(false);
    try { if (!address) throw new Error('Connect your wallet first.'); setReview(reviewChatExport(localStorage, address, shared, 'research')); }
    catch (error) { setReview(null); setFailed(true); setStatus(error instanceof Error ? error.message : 'Could not read local data. Originals are unchanged.'); }
  }
  async function download() {
    if (!address || !wallet || !review || running.current) return;
    const current = generation.current;
    const ensure = () => {
      if (generation.current !== current || live.current.address !== address || live.current.chainId !== chainId || live.current.wallet !== wallet) throw new Error('Wallet session changed. Review and try again.');
    };
    running.current = true; setBusy(true); setFailed(false); setStatus('Verify ownership in your wallet to create the encrypted file.');
    try {
      if (password !== confirmation) throw new Error('The passphrases do not match.');
      assertExportUnchanged(localStorage, review);
      const check = await proveExportWallet(wallet, address, window.location.origin, ensure, async (args, chain) => {
        try { if (await verifyMessage(args)) return true; } catch { /* Contract signatures can have a different encoding. */ }
        if (!verifier || verifier.chain.id !== chain) return false;
        return verifier.verifyMessage(args);
      });
      ensure(); assertExportUnchanged(localStorage, review);
      const raw = await encryptRecoveryArchive(review.data, password);
      await check(); ensure(); assertExportUnchanged(localStorage, review);
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      try {
        const link = document.createElement('a'); link.href = url; link.download = 'chat-research-recovery.json';
        document.body.append(link); link.click(); link.remove();
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
      setStatus('Encrypted file prepared for download. Keep its passphrase separately. Open Chat Settings → Restore local data to review and import it. Your original data remains here.');
      setReview(null);
    } catch (error) {
      if (generation.current === current) { setFailed(true); setStatus(error instanceof Error ? error.message : 'Export failed. Originals are unchanged.'); }
    } finally {
      running.current = false;
      if (generation.current === current) { setBusy(false); setPassword(''); setConfirmation(''); }
    }
  }
  const valid = password.length >= 12 && password.length <= 1024 && !!password.trim() && password === confirmation;
  return <section className="chat-recovery-export" data-insights-ignore="true" aria-label="Export local data to Chat" style={{ display: 'grid', gap: '0.7rem', overflowWrap: 'anywhere' }}>
    <h3>Export local data to Chat</h3>
    <p>Save an encrypted copy of this wallet’s contacts and local Saved Messages. This does not export message history, keys, rooms, memberships or email access. Originals stay in this messenger.</p>
    <label><input type="checkbox" checked={shared} disabled={busy} onChange={e => { setShared(e.target.checked); setReview(null); setStatus(''); }} /> I confirm this browser’s shared receipt settings and blocked list belong to this wallet, and want to include them.</label>
    <p>Shared preferences may belong to another person who used this browser. Pins, archives and read positions are not included. If unchecked, the file contains no blocked addresses or receipt overrides and has receipts off; Chat still asks before applying preferences.</p>
    <button type="button" disabled={busy || !address} onClick={preview}>Review export</button>
    {review && <>
      <p>Wallet: {review.data.wallet}<br />Contacts: {review.data.contacts.length} · Local notes: {review.data.notes.length}</p>
      <details><summary>Inspect data to include</summary>
        <ul>{review.data.contacts.map(c => <li key={c.address}>{c.address}: {c.label}</li>)}</ul>
        <ul>{review.data.notes.map(n => <li key={n.id}><strong>{n.id}</strong><p style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{n.text}</p></li>)}</ul>
        <p>Shared preferences: {review.sharedPreferences ? 'included by your choice' : 'excluded'}. Default receipts in file: {review.data.preferences.readReceiptsDefault ? 'on' : 'off'}.</p>
        <ul>{review.data.preferences.blocked.map(a => <li key={a}>Blocked: {a}</li>)}</ul>
        <ul>{Object.entries(review.data.preferences.readReceiptOverrides).map(([id, on]) => <li key={id}>{id}: receipts {on ? 'on' : 'off'}</li>)}</ul>
      </details>
      <label>Recovery passphrase (at least 12 characters)<input style={{ display: 'block', width: '100%', minWidth: 0 }} type="password" autoComplete="new-password" maxLength={1024} disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Confirm passphrase<input style={{ display: 'block', width: '100%', minWidth: 0 }} type="password" autoComplete="new-password" maxLength={1024} disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <p>Anyone with the file and passphrase can read it. Chat cannot recover a lost passphrase. A fresh wallet signature verifies ownership; it does not send a transaction.</p>
      <button type="button" disabled={busy || !valid} onClick={() => void download()}>{busy ? 'Preparing encrypted file…' : 'Verify wallet and download'}</button>
      <button type="button" disabled={busy} onClick={() => { setReview(null); setPassword(''); setConfirmation(''); }}>Cancel</button>
    </>}
    {status && <p role={failed ? 'alert' : 'status'}>{status}</p>}
  </section>;
}
