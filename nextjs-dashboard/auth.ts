import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';
import postgres from 'postgres';

// Initialize a Postgres client if a connection string is present
const sql = process.env.POSTGRES_URL
  ? postgres(process.env.POSTGRES_URL, { ssl: 'require' })
  : null;

async function getUser(email: string): Promise<User | undefined> {
  if (!sql) return undefined;

  try {
    const users = await sql<User[]>`SELECT * FROM users WHERE email=${email}`;
    return users[0];
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}

export const { auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        // Validate credentials shape
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (!parsedCredentials.success) {
          console.log('Invalid credentials shape');
          return null;
        }

        const { email, password } = parsedCredentials.data;

        const user = await getUser(email);
        if (!user) {
          console.log('User not found');
          return null;
        }

        // Verify password
        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) {
          console.log('Invalid password');
          return null;
        }

        // Return user object sans password
        // NextAuth will include the returned properties in the session
        const { password: _pw, ...userWithoutPassword } = user;
        return userWithoutPassword as Omit<User, 'password'>;
      },
    }),
  ],
}); 