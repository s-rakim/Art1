import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

/** The home page is laid out like Nextcloud's Dashboard: no side navigation, panels straight on the wallpaper. */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <div className="glass mx-2 mb-2 overflow-hidden rounded-large">
        <Footer />
      </div>
    </>
  );
}
