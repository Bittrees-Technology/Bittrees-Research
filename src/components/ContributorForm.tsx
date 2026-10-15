import { useState } from "react";
import { useAccount, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { base } from "viem/chains";
import { getWalletClient } from "@wagmi/core";
import { wagmiConfig } from "@/lib/wagmi";
import { publishPost, CONTRIB_COMMUNITY, useSchemaRegistered } from "@/lib/forum";
import { fetchCommunity, currentReviewers } from "@/lib/community";
import { deriveEncKeypair, encryptApplication, pubKeyFromHex, type Application } from "@/lib/appcrypto";
import { ChipMultiSelect, SearchMultiSelect } from "@/components/multiselect";
import type { Hash } from "viem";

/**
 * Member interest form — apply for a role at Bittrees Research. Recorded ON-CHAIN
 * (EAS on Base) but ENCRYPTED: readable only by the applicant and the reviewers
 * who hold the Operations/Executive role and have published a decryption key.
 * Mirrors the gov contributor flow.
 */

const APPLY_ROLES = ["Researcher", "Contributor", "Assistant", "Steward"] as const;
const REGIONS = ["EMEA", "APAC", "LATAM", "NORAM"] as const;
const LANGUAGES = [
  "English", "Mandarin Chinese", "Hindi", "Spanish", "French", "Standard Arabic", "Bengali",
  "Portuguese", "Russian", "Japanese", "German", "Korean", "Turkish", "Vietnamese", "Italian",
  "Thai", "Indonesian", "Polish", "Ukrainian", "Dutch", "Tagalog", "Persian", "Swahili", "Romanian",
  "Greek", "Czech", "Hungarian", "Hebrew", "Swedish", "Malay", "Tamil", "Urdu", "Punjabi", "Yoruba",
] as const;

function humanError(e: unknown): string {
  const a = e as { shortMessage?: string; message?: string };
  return a?.shortMessage || a?.message || "Submission failed";
}

export function ContributorForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { data: schemaReady } = useSchemaRegistered();

  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [specialty, setSpecialty] = useState("");
  const [region, setRegion] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [heardFrom, setHeardFrom] = useState("");
  const [email, setEmail] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [referrer, setReferrer] = useState("");

  const [status, setStatus] = useState<"idle" | "posting" | "done" | "error">("idle");
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<Hash>();

  const canSubmit =
    name.trim().length > 0 &&
    roles.length > 0 &&
    specialty.trim().length > 0 &&
    region.length > 0 &&
    heardFrom.trim().length > 0;

  async function submit() {
    if (!walletClient || !address || !canSubmit) return;
    setStatus("posting");
    setError(undefined);
    try {
      let wc = walletClient;
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
        wc = (await getWalletClient(wagmiConfig, { chainId: base.id })) ?? walletClient;
      }
      const app: Application = {
        name: name.trim(),
        roles,
        region,
        languages,
        specialty: specialty.trim(),
        heardFrom: heardFrom.trim(),
        email: email.trim(),
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        wallet: address,
        referrer: referrer.trim(),
      };
      const { publicKey } = await deriveEncKeypair(wc, address);
      const community = await fetchCommunity();
      const reviewers = currentReviewers(community)
        .map((a) => ({ addr: a, hex: community.enckeys[a] }))
        .filter((r) => /^[0-9a-f]{64}$/.test(r.hex || ""))
        .map((r) => ({ addr: r.addr, pub: pubKeyFromHex(r.hex) }));
      const recipients = [{ addr: address.toLowerCase(), pub: publicKey }, ...reviewers];
      const envelope = encryptApplication(JSON.stringify(app), recipients);
      const hash = await publishPost({
        walletClient: wc,
        account: address,
        title: "Member role application",
        body: JSON.stringify(envelope),
        community: CONTRIB_COMMUNITY,
      });
      setTxHash(hash);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(humanError(e));
    }
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", width: "100%" }}>
      <header style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.25rem", marginBottom: "1.5rem" }}>
        <p className="text-label" style={{ color: "var(--color-primary-hover)" }}>Get involved</p>
        <h2 className="text-display" style={{ fontSize: "1.6rem", margin: "0.3rem 0 0.5rem" }}>Apply to contribute</h2>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.9375rem", color: "var(--color-ink-muted)", lineHeight: 1.6, margin: 0 }}>
          Bittrees Research brings together researchers, innovators, creatives, and community
          members. Tell us how you'd like to contribute — your application is recorded{" "}
          <strong>on-chain (Base) but encrypted</strong>, readable only by you and the Bittrees
          reviewers.
        </p>
      </header>

      {status === "done" ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <p style={{ color: "var(--color-secondary)", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "0.95rem", margin: 0 }}>
            Application submitted ✓
          </p>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "var(--color-ink-muted)", margin: 0 }}>
            Encrypted and recorded on-chain. Only you and the Bittrees reviewers can decrypt it.
          </p>
          {txHash && (
            <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-ink-muted)", textDecoration: "none" }}>
              View on BaseScan ↗
            </a>
          )}
        </div>
      ) : !isConnected ? (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <p style={{ ...dim, margin: 0 }}>Connect a wallet to apply.</p>
          <ConnectButton chainStatus="none" showBalance={false} />
        </div>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <Field label="Your name (what should we call you)" required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name or handle" maxLength={120} style={inputStyle} />
          </Field>

          <Field label="Role(s) you're applying for — select all that apply" required>
            <ChipMultiSelect options={APPLY_ROLES} value={roles} onChange={setRoles} />
          </Field>

          <Field label="Briefly describe your specialty and what you'd contribute" required>
            <textarea value={specialty} onChange={(e) => setSpecialty(e.target.value)} rows={5} placeholder="A few sentences on your specialty and what you'd contribute." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </Field>

          <Field label="Region(s) — select all that apply" required>
            <ChipMultiSelect options={REGIONS} value={region} onChange={setRegion} />
          </Field>

          <Field label="Languages you speak">
            <SearchMultiSelect options={LANGUAGES} value={languages} onChange={setLanguages} placeholder="Search languages, or type your own…" />
          </Field>

          <Field label="How did you learn about Bittrees Research?" required>
            <input value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)} placeholder="X, a friend, an event, search…" maxLength={160} style={inputStyle} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.1rem" }}>
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={160} style={inputStyle} /></Field>
            <Field label="Twitter / X"><input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" maxLength={80} style={inputStyle} /></Field>
            <Field label="Telegram"><input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@handle" maxLength={80} style={inputStyle} /></Field>
            <Field label="If someone referred you, their name"><input value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="Referrer (optional)" maxLength={120} style={inputStyle} /></Field>
          </div>

          <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "var(--color-ink-dim)", lineHeight: 1.55, margin: 0 }}>
            Submitting signs once to derive your encryption key (no gas), then records the encrypted
            application on Base. Fields marked <span style={{ color: "var(--color-primary-hover)" }}>*</span> are required.
          </p>

          <div>
            <button className="btn-primary" disabled={!canSubmit || status === "posting"} onClick={submit} style={{ opacity: !canSubmit || status === "posting" ? 0.55 : 1 }}>
              {status === "posting" ? "Confirm in wallet…" : "Submit application"}
            </button>
            {schemaReady === false && (
              <span style={{ ...dim, marginLeft: "0.85rem" }}>First submission also registers the schema (one-time).</span>
            )}
          </div>

          {status === "error" && (
            <p role="alert" style={{ fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--color-ink)", margin: 0 }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <span className="text-label" style={{ margin: 0 }}>
        {label}
        {required && <span style={{ color: "var(--color-primary-hover)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.9rem",
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxSizing: "border-box" as const,
};
const dim = { fontFamily: "var(--font-sans)", fontSize: "0.76rem", color: "var(--color-ink-dim)" } as const;
