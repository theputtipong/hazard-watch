import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LANG, isLang } from '@hw/core/i18n';
import { contentSecurityPolicy, createNonce } from '@/lib/csp';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];
  if (isLang(first)) {
    const csp = await contentSecurityPolicy(createNonce());
    const headers = new Headers(request.headers);
    // Lets the not-found page know the language (it receives no route params).
    headers.set('x-pathname', pathname);
    // Next.js takes the nonce for its inline scripts from the request's CSP; pages render per request, so each gets a fresh one.
    headers.set('content-security-policy', csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set('content-security-policy', csp);
    return response;
  }
  const saved = request.cookies.get('lang')?.value;
  request.nextUrl.pathname = `/${isLang(saved) ? saved : DEFAULT_LANG}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
