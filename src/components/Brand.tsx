/** Research’s grey BR square, matching the favicon artwork. */
export function BittreesMark({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/android-chrome-512x512.png"
      alt="Bittrees Research"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
