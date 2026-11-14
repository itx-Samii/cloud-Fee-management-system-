import { NextResponse, type NextRequest } from 'next/server';
import { decodeSession, SESSION_COOKIE } from './lib/session';

// Page-level redirects only. API routes check the session themselves (lib/auth.ts) and
// answer with JSON errors, so they are excluded by the matcher below.

const PUBLIC_PAGES = ['/home', '/login', '/signup', '/license-blocked'];
const LEGACY_LOGIN_PAGES = ['/login/superadmin', '/portal/login'];
const ADMIN_ONLY_PAGES = ['/reports', '/students', '/promotion', '/classes', '/salaries', '/ac-ledger', '/users', '/activity'];

function isUnder(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LEGACY_LOGIN_PAGES.includes(pathname)) return NextResponse.redirect(new URL('/login', request.url));
  if (PUBLIC_PAGES.includes(pathname)) return NextResponse.next();

  const user = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    const destination = pathname === '/' ? '/home' : '/login';
    const response = NextResponse.redirect(new URL(destination, request.url));
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Parents see the portal and nothing else; staff have no use for it.
  if (user.role === 'parent') {
    return isUnder(pathname, ['/portal']) ? NextResponse.next() : NextResponse.redirect(new URL('/portal', request.url));
  }
  if (isUnder(pathname, ['/portal'])) return NextResponse.redirect(new URL('/', request.url));

  if (user.role !== 'superadmin' && isUnder(pathname, ['/superadmin'])) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  if (user.role === 'accountant') {
    // The dashboard is for principals; accountants start at Receive Payment.
    if (pathname === '/') return NextResponse.redirect(new URL('/collection', request.url));
    if (isUnder(pathname, ADMIN_ONLY_PAGES)) return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next.js internals and static files (anything with a file extension).
  matcher: ['/((?!api/|_next/static|_next/image|.*\\..*).*)'],
};
