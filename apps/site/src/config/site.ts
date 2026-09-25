export const site = {
  name: "Easy Garden Plan",
  description: "Map your garden, choose what to grow, and get a planting schedule shaped by your location.",
  tagline: "A practical garden plan for your exact patch of ground.",
  socialImage: "/social-preview.svg",
} as const;

export const navigation = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
] as const;

export function appLink(pathname: string, appUrl = "http://localhost:42069"): string {
  const origin = new URL(appUrl);
  return new URL(pathname.replace(/^\//u, ""), `${origin.toString().replace(/\/$/u, "")}/`).toString();
}
