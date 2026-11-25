import type { ArtShape, ProductArt as Art } from "@/lib/types";
import { safeColor, safeImageUrl } from "@/lib/safe";

// Flat catalogue illustrations, drawn when a listing has no photo yet.
// Each shape is a single silhouette on a coloured backdrop with a floor shadow.
const shapes: Record<ArtShape, (fg: string) => React.ReactNode> = {
  dress: (c) => <path fill={c} d="M84 40h32l-3 22 22 34 13 64H52l13-64 22-34z M90 40c0-6 20-6 20 0" />,
  tee: (c) => <path fill={c} d="M76 52l-30 16 10 26 14-6v76h60V88l14 6 10-26-30-16c-4 10-14 14-24 14s-20-4-24-14z" />,
  jacket: (c) => <g fill={c}><path d="M74 46l-30 18 6 98h34V82zM126 46l30 18-6 98h-34V82z" /><path d="M86 46h28l-14 22z" opacity=".55" /><rect x="97" y="78" width="6" height="84" opacity=".35" /></g>,
  sneaker: (c) => <g><path fill={c} d="M40 130c0-14 6-30 14-38l22 10 20-6 32 22 30 8c8 2 12 8 12 14v6H40z" /><rect x="40" y="140" width="130" height="8" fill="#16130f" opacity=".85" /></g>,
  bag: (c) => <g fill="none"><path d="M78 76c0-24 44-24 44 0" stroke={c} strokeWidth="7" /><rect x="52" y="76" width="96" height="84" rx="4" fill={c} /><rect x="92" y="96" width="16" height="10" fill="#16130f" opacity=".4" /></g>,
  lamp: (c) => <g fill={c}><path d="M70 50h60l14 44H56z" /><rect x="97" y="94" width="6" height="56" /><rect x="72" y="150" width="56" height="10" /></g>,
  mug: (c) => <g><path fill={c} d="M58 72h70v62c0 14-10 24-24 24H82c-14 0-24-10-24-24z" /><path d="M128 88h10c10 0 14 8 14 16s-4 16-14 16h-10" fill="none" stroke={c} strokeWidth="9" /></g>,
  headphones: (c) => <g fill="none" stroke={c} strokeWidth="9"><path d="M58 120V100a42 42 0 0 1 84 0v20" /><rect x="48" y="112" width="24" height="42" rx="6" fill={c} /><rect x="128" y="112" width="24" height="42" rx="6" fill={c} /></g>,
  chair: (c) => <g fill="none" stroke={c} strokeWidth="8" strokeLinecap="square"><path d="M72 44v68M128 44v68M72 52h56M72 112h56M76 112l-8 50M124 112l8 50" /><path d="M66 104h68v12H66z" fill={c} /></g>,
  plant: (c) => <g><path fill="#4f6b3f" d="M100 96c-24-6-34-30-28-50 18 4 30 22 28 50zM100 96c22-8 30-32 24-50-18 6-28 24-24 50zM100 98c-2-26 4-42 0-60-6 18-6 36 0 60z" /><path fill={c} d="M64 98h72l-10 62H74z" /></g>,
  watch: (c) => <g><rect x="86" y="36" width="28" height="128" rx="6" fill={c} /><circle cx="100" cy="100" r="30" fill="#16130f" /><circle cx="100" cy="100" r="24" fill="#f4f0e6" /><path d="M100 84v16l10 6" stroke="#16130f" strokeWidth="4" fill="none" /></g>,
  glasses: (c) => <g fill="none" stroke={c} strokeWidth="8"><circle cx="72" cy="104" r="24" /><circle cx="128" cy="104" r="24" /><path d="M96 100c4-6 4-6 8 0M48 96l-12-8M152 96l12-8" /></g>,
  bottle: (c) => <g><rect x="88" y="40" width="24" height="16" fill="#16130f" opacity=".85" /><path fill={c} d="M84 56h32v14c10 6 14 14 14 24v66H70V94c0-10 4-18 14-24z" /><rect x="76" y="104" width="48" height="30" fill="#f4f0e6" opacity=".75" /></g>,
  phone: (c) => <g><rect x="70" y="36" width="60" height="128" rx="8" fill={c} /><rect x="76" y="46" width="48" height="98" rx="2" fill="#16130f" opacity=".85" /><circle cx="100" cy="154" r="4" fill="#f4f0e6" /></g>,
};

export function ProductArt({ art, className, label }: { art?: Art; className?: string; label?: string }) {
  const a = {
    shape: art && art.shape in shapes ? art.shape : ("bag" as ArtShape),
    fg: safeColor(art?.fg, "#16130f"),
  };
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={label ?? "Product illustration"} preserveAspectRatio="xMidYMid slice">
      {/* Placeholders share one pale blue backdrop so listings read as part of the same blue and white page. */}
      <rect width="200" height="200" style={{ fill: "var(--color-primary-element-light)" }} />
      <ellipse cx="100" cy="166" rx="56" ry="6" fill="#16130f" opacity=".12" />
      {shapes[a.shape](a.fg)}
    </svg>
  );
}

export function ProductImage({
  src, art, alt, className,
}: { src?: string | null; art?: Art; alt: string; className?: string }) {
  const url = safeImageUrl(src);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} referrerPolicy="no-referrer" loading="lazy" className={`h-full w-full object-cover ${className ?? ""}`} />;
  }
  return <ProductArt art={art} label={alt} className={`h-full w-full ${className ?? ""}`} />;
}
