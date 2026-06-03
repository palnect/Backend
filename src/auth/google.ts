import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import { UserRepository, ProfileRepository } from '../db/supabase/repositories';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('auth:google');

export const setupGoogleOAuth = (): void => {
  if (!config.google.clientId || !config.google.clientSecret) {
    log.warn('Google OAuth not configured — skipping setup');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No email from Google'));

          // Check if user exists by Google ID
          let user = await UserRepository.findByGoogleId(profile.id);

          if (!user) {
            // Check if email exists (account merging)
            const existing = await UserRepository.findByEmail(email);
            if (existing) {
              user = await UserRepository.update(existing.id, {
                avatar_url: profile.photos?.[0]?.value,
              });
            } else {
              // Create new user
              const nameParts = (profile.displayName ?? email.split('@')[0]).split(' ');
              user = await UserRepository.create({
                email,
                first_name: nameParts[0] ?? email.split('@')[0],
                last_name: nameParts.slice(1).join(' ') || '',
                avatar_url: profile.photos?.[0]?.value,
                provider: 'google',
              });

              // Initialize empty profile — completed during onboarding
              await ProfileRepository.create(user.id, {
                weak_topics: [],
                total_sessions: 0,
                total_minutes: 0,
                streak_days: 0,
                longest_streak: 0,
                last_session_date: null,
                onboarded_at: null,
              });

              log.info('New Google user created', { userId: user.id });
              return done(null, { ...user, userId: user.id, isNewUser: true } as User & { userId: string; isNewUser: boolean });
            }
          }

          return done(null, { ...user, userId: user.id, isNewUser: false } as User & { userId: string; isNewUser: boolean });
        } catch (err) {
          log.error('Google OAuth error', { err });
          return done(err as Error);
        }
      }
    )
  );
};