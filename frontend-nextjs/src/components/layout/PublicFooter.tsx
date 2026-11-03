import Link from 'next/link';
import Image from 'next/image';

export interface PublicFooterProps {
  brandName?: string;
  logoUrl?: string;
  description?: string;
  exploreHeading?: string;
  exploreLinks?: Array<{ href: string; label: string }>;
  accessHeading?: string;
  accessLinks?: Array<{ href: string; label: string }>;
  copyright?: string;
}

function formatCopyright(copyright: string | undefined, brandName: string): string {
  if (copyright && copyright.trim()) {
    const trimmed = copyright.trim();
    if (/^(©|\(c\)|&copy;)/i.test(trimmed)) {
      return trimmed;
    }
    return `© ${new Date().getFullYear()} ${trimmed}`;
  }
  return `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`;
}

const defaultExploreLinks = [
  { href: '/#programs', label: 'Programs' },
  { href: '/classes', label: 'Classes' },
  { href: '/events', label: 'Events' },
  { href: '/#features', label: 'Features' },
];

const defaultAccessLinks = [
  { href: '/member-explore', label: 'Member Sign In' },
  { href: '/staff-login', label: 'Studio Login' },
];

export const PublicFooter: React.FC<PublicFooterProps> = ({
  brandName = 'Fitness AI',
  logoUrl,
  description = 'Studio management and member portal experiences for configurable dance, fitness and wellness businesses.',
  exploreHeading = 'Explore',
  exploreLinks = defaultExploreLinks,
  accessHeading = 'Access',
  accessLinks = defaultAccessLinks,
  copyright,
}) => (
  <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8 lg:py-16">
      <div className="md:col-span-2">
        <Link href="/" className="inline-flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300" aria-label={`${brandName} home`}>
          {logoUrl ? (
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10 p-1">
              <Image
                src={logoUrl}
                alt={brandName}
                fill
                unoptimized
                className="object-contain p-0.5"
              />
            </span>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center text-rose-400" aria-hidden="true">
              <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
              </svg>
            </span>
          )}
          <span className="font-serif text-xl font-bold tracking-tight text-white">{brandName}</span>
        </Link>
        <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
          {description}
        </p>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">{exploreHeading}</h2>
        <ul className="mt-5 space-y-3 text-sm text-slate-400">
          {exploreLinks.map((link, idx) => (
            <li key={idx}>
              <Link href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">{accessHeading}</h2>
        <ul className="mt-5 space-y-3 text-sm text-slate-400">
          {accessLinks.map((link, idx) => (
            <li key={idx}>
              <Link href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>

    <div className="border-t border-slate-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p>{formatCopyright(copyright, brandName)}</p>
      </div>
    </div>
  </footer>
);
