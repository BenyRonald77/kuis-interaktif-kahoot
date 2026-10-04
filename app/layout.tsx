import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kuis Interaktif",
  description: "Kuis interaktif ala Kahoot: host buat kuis, peserta gabung dengan PIN",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
