import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');

      if (isOnDashboard) {
        // If user tries to access dashboard
        if (isLoggedIn) return true;
        // Unauthenticated → returning false will trigger redirect to `pages.signIn`
        return false;
      }

      // If user is already logged-in and tries to access a non-dashboard page, redirect to dashboard
      if (isLoggedIn) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      // Public route, allow
      return true;
    },
  },
  // We’ll add real providers later
  providers: [],
} satisfies NextAuthConfig; 