import { useEnsName, useEnsAvatar, useEnsAddress } from "wagmi";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { shortAddress } from "../lib/links";

/**
 * Shows an address as its ENS name (reverse-resolved on mainnet) when one is set,
 * falling back to the shortened 0x form. Pass `avatar` to show the ENS avatar.
 */
export function AddressName({ address, avatar = false }: { address?: string; avatar?: boolean }) {
  const addr = address as `0x${string}` | undefined;
  const { data: reverse, isError: reverseError } = useEnsName({ address: addr, chainId: mainnet.id, query: { enabled: !!addr, staleTime: 30000, refetchInterval: 45000 } });
  const { data: forward, isError: forwardError } = useEnsAddress({ name: reverse || undefined, chainId: mainnet.id, query: { enabled: !!reverse && !reverseError, staleTime: 30000, refetchInterval: 45000 } });
  const name = !reverseError && !forwardError && forward?.toLowerCase() === address?.toLowerCase() ? reverse : undefined;
  const { data: img, isError: avatarError } = useEnsAvatar({ name: name ? normalize(name) : undefined, chainId: mainnet.id, query: { enabled: !!name && avatar, staleTime: 30000, refetchInterval: 45000 } });
  if (!address) return null;
  const label = name || shortAddress(address);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }} title={address}>
      {avatar && (
        name && img && !avatarError ? (
          <img src={img} referrerPolicy="no-referrer" alt="" width={18} height={18} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <span aria-hidden style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border-light)", flexShrink: 0 }} />
        )
      )}
      <span style={{ fontFamily: name ? "var(--font-sans)" : "var(--font-mono)", fontSize: "0.82rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </span>
  );
}
