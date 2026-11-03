import type { Metadata } from 'next';
import './globals.css';
import './explore.css';
import './readability.css';
import './community.css';

export const metadata: Metadata = {
  title: 'Her Haven — Come as you are',
  description: 'A little space to be heard, find your people, and grow at your own pace. Private reflection and approved community circles.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
