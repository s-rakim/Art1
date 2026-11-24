import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
});

export const Search = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
export const Bag = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
export const User = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></svg>;
export const Heart = ({ size, filled, ...p }: P & { filled?: boolean }) => <svg {...base(size)} fill={filled ? "currentColor" : "none"} {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>;
export const Menu = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
export const X = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Chevron = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m9 6 6 6-6 6" /></svg>;
export const ChevronDown = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m6 9 6 6 6-6" /></svg>;
export const Star = ({ size, filled = true, ...p }: P & { filled?: boolean }) => <svg {...base(size)} fill={filled ? "currentColor" : "none"} strokeWidth={1.4} {...p}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" /></svg>;
export const Check = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const Truck = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></svg>;
export const Shield = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
export const Return = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
export const Store = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 2 3s2-1.3 2-3c0 1.7 1.3 3 3 3s3-1.3 3-3" /><path d="M10 20v-5h4v5" /></svg>;
export const Grid = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="4" y="4" width="6.5" height="6.5" /><rect x="13.5" y="4" width="6.5" height="6.5" /><rect x="4" y="13.5" width="6.5" height="6.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" /></svg>;
export const Box = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" /><path d="m4 7.5 8 3.5 8-3.5M12 11v9" /></svg>;
export const Chart = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>;
export const Settings = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></svg>;
export const Megaphone = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 10v4h3l7 4V6L7 10H4Z" /><path d="M18 9a4 4 0 0 1 0 6" /></svg>;
export const Wallet = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="3.5" y="6" width="17" height="13" rx="1" /><path d="M3.5 9.5h17M15.5 14h2" /></svg>;
export const Filter = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
export const Minus = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 12h12" /></svg>;
export const Plus = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 6v12M6 12h12" /></svg>;
export const Pin = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
export const Message = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 5h16v11H9l-5 4V5Z" /></svg>;
export const Bolt = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" /></svg>;
