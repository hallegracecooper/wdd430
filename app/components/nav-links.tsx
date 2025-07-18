'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const links = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'Dashboard', href: '/dashboard' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4">
      {links.map((link) => (
        <Link
          key={link.name}
          href={link.href}
          className={clsx(
            'text-sm font-medium hover:underline',
            pathname === link.href && 'underline'
          )}
        >
          {link.name}
        </Link>
      ))}
    </nav>
  );
} 