import type { Metadata, Viewport } from "next";
import { Header, Footer } from "@/components/shell";
import { production, siteUrl } from "@/config";
import "./globals.css";
import "./premium.css";
import "./experience.css";
import "./illustrations.css";
import "./live.css";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Express Congo — Préparer vos envois France → Congo",
    template: "%s | Express Congo",
  },
  description:
    "Solutions de fret aérien, maritime et conteneurs complets. Préparez votre envoi et votre demande de devis.",
  robots: { index: production(), follow: production() },
  icons: {
    icon: "/assets/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
};
export const viewport: Viewport = { themeColor: "#0b1d3f" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
