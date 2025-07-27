import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next()
  }

  console.log('🔒 Middleware: Processing request for:', pathname)

  // Create a response object that we can modify
  const res = NextResponse.next()

  // Create a custom cookies object that works with NextResponse
  const cookies = {
    get(name: string) {
      return req.cookies.get(name)
    },
    set(name: string, value: string, options: CookieOptions) {
      res.cookies.set({
        name,
        value,
        ...options,
      })
    },
    remove(name: string, options: CookieOptions) {
      res.cookies.set({
        name,
        value: '',
        expires: new Date(0),
        ...options,
      })
    },
  }

  // Create Supabase client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookies.set(name, value, options)
        },
        remove(name: string, options: CookieOptions) {
          cookies.remove(name, options)
        },
      },
    }
  )

  try {
    // Get session with reasonable timeout for slow database connections
    console.log('🔒 Middleware: Checking session for path:', pathname)
    
    // Check for redirect loops by looking at referer
    const referer = req.headers.get('referer')
    if (referer && pathname.includes('/auth/login') && referer.includes('/auth/login')) {
      console.log('🔒 Middleware: Potential redirect loop detected, allowing request')
      return res
    }
    
    const sessionPromise = supabase.auth.getSession()
    const { data: { session }, error: sessionError } = await Promise.race([
      sessionPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 5000) // Increased to 5 seconds
      )
    ]) as any
    
    if (sessionError) {
      console.error('🔒 Middleware: Session error:', sessionError)
      // On session error, allow the request to continue but log it
      console.log('🔒 Middleware: Allowing request despite session error')
      return res
    }
    
    console.log('🔒 Middleware: Session result:', session ? `found for user ${session.user.id}` : 'not found')

    // Extract locale from pathname (pathname is already declared above)
    const pathnameIsMissingLocale = ['en', 'ar'].every(
      (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    )

    // Default locale
    const locale = 'en'

    // Redirect if there is no locale
    if (pathnameIsMissingLocale) {
      const url = req.nextUrl.clone()
      url.pathname = `/${locale}${pathname}`
      return NextResponse.redirect(url)
    }

    // Extract locale from pathname
    const pathLocale = pathname.split('/')[1]
    const validLocales = ['en', 'ar']
    const currentLocale = validLocales.includes(pathLocale) ? pathLocale : 'en'

    // Define public routes that don't require authentication
    const publicRoutes = [
      `/${currentLocale}/auth/login`,
      `/${currentLocale}/auth/signup`,
      `/${currentLocale}/auth/forgot-password`,
      `/${currentLocale}/auth/reset-password`,
      `/${currentLocale}/auth/callback`,
      `/${currentLocale}/auth/bypass`,
      `/${currentLocale}/demo`,
      `/${currentLocale}/onboarding`,
      `/${currentLocale}/test-auth`,
      `/${currentLocale}/test-auth-system`,
      `/${currentLocale}/test-user-signup`,
      `/${currentLocale}/debug-auth`,
      `/${currentLocale}/debug-promoter`,
      `/${currentLocale}/dashboard/debug`,
      `/${currentLocale}/test-dashboard`,
      `/${currentLocale}/debug-redirect`,
      `/${currentLocale}/test-cookie-fix`,
      `/${currentLocale}/debug-login-flow`,
      `/${currentLocale}/test-client-session`,
      '/test-login'
    ]

    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

    // If not authenticated and trying to access protected route, redirect to login
    if (!session && !isPublicRoute) {
      // Only log for actual page requests, not system requests
      if (!pathname.includes('.well-known') && !pathname.includes('robots.txt') && !pathname.includes('sitemap.xml')) {
        console.log('🔒 Middleware: No session, redirecting to login from:', pathname)
      }
      
      // Prevent redirect loops by checking if we're already going to login
      if (pathname.includes('/auth/login')) {
        console.log('🔒 Middleware: Already on login page, allowing request')
        return res
      }
      
      const url = req.nextUrl.clone()
      url.pathname = `/${currentLocale}/auth/login`
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // If user is authenticated and trying to access login page, redirect to dashboard
    if (session && pathname.startsWith(`/${currentLocale}/auth/login`)) {
      console.log('🔒 Middleware: Authenticated user on login page, redirecting to dashboard')
      const url = req.nextUrl.clone()
      url.pathname = `/${currentLocale}/dashboard`
      // Use 302 redirect to prevent caching issues
      return NextResponse.redirect(url, 302)
    }

    // Check for invalid cookies and clear them if needed
    const authToken0 = req.cookies.get('sb-auth-token.0')
    const authToken1 = req.cookies.get('sb-auth-token.1')
    
    // Improved cookie validation - only check for obviously invalid cookies
    const isTruncated = (cookie: any) => {
      if (!cookie || !cookie.value) return false
      
      // Check for obvious truncation indicators
      if (cookie.value.endsWith('...')) return true
      
      // Check for extremely short tokens (less than 10 chars is suspicious)
      if (cookie.value.length < 10) return true
      
      // Check for malformed JWT tokens (should have 3 parts separated by dots)
      const parts = cookie.value.split('.')
      if (parts.length !== 3) return true
      
      return false
    }
    
    // Only clear cookies if they are obviously invalid
    if (isTruncated(authToken0) || isTruncated(authToken1)) {
      console.log('🔒 Middleware: Detected invalid/truncated cookies, clearing them')
      console.log(`🔒 Middleware: Token0 length: ${authToken0?.value?.length || 0}, Token1 length: ${authToken1?.value?.length || 0}`)
      
      // Only clear cookies if we have a valid session to prevent redirect loops
      if (!session) {
        // Clear the invalid cookies
        res.cookies.set({
          name: 'sb-auth-token.0',
          value: '',
          expires: new Date(0),
          path: '/'
        })
        res.cookies.set({
          name: 'sb-auth-token.1',
          value: '',
          expires: new Date(0),
          path: '/'
        })
        
        // If user was trying to access a protected route, redirect to login
        if (!isPublicRoute) {
          console.log('🔒 Middleware: Redirecting to login after clearing invalid cookies')
          const url = req.nextUrl.clone()
          url.pathname = `/${currentLocale}/auth/login`
          url.searchParams.set('redirect', pathname)
          return NextResponse.redirect(url)
        }
      } else {
        console.log('🔒 Middleware: Valid session exists, not clearing cookies to prevent redirect loop')
      }
    } else {
      // Log cookie status for debugging (but don't clear valid cookies)
      console.log(`🔒 Middleware: Cookie validation passed - Token0: ${authToken0?.value?.length || 0} chars, Token1: ${authToken1?.value?.length || 0} chars`)
    }

    // Handle root path - redirect to locale dashboard (if authenticated) or login
    if (req.nextUrl.pathname === '/') {
      const url = req.nextUrl.clone()
      if (session) {
        console.log('🔒 Middleware: Root path, authenticated user, redirecting to dashboard')
        url.pathname = `/${currentLocale}/dashboard`
      } else {
        console.log('🔒 Middleware: Root path, unauthenticated user, redirecting to login')
        url.pathname = `/${currentLocale}/auth/login`
      }
      return NextResponse.redirect(url)
    }

    return res
  } catch (error) {
    console.error('🔒 Middleware error:', error)
    // On error, allow the request to continue but log the issue
    // This prevents the app from being completely broken due to slow database
    console.log('🔒 Middleware: Allowing request despite error')
    return res
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - .well-known (system files)
     * - robots.txt (SEO files)
     * - sitemap.xml (SEO files)
     * - manifest.json (PWA files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.well-known|robots.txt|sitemap.xml|manifest.json).*)',
  ],
}
