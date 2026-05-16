import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import prisma from './prisma'
import { JWT_SECRET } from './config'
import jwt from 'jsonwebtoken'

export function initializePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: '/auth/oauth/google/callback'
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] && profile.emails[0].value
          if (!email) return done(null, false)
          let user = await prisma.user.findUnique({ where: { email } })
          if (!user) {
            user = await prisma.user.create({ data: { email, password: '', role: 'USER' } })
          }
          return done(null, user)
        } catch (err) {
          return done(err as Error)
        }
      }
    )
  )

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        callbackURL: '/auth/oauth/github/callback',
        scope: ['user:email']
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] && profile.emails[0].value
          if (!email) return done(null, false)
          let user = await prisma.user.findUnique({ where: { email } })
          if (!user) {
            user = await prisma.user.create({ data: { email, password: '', role: 'USER' } })
          }
          return done(null, user)
        } catch (err) {
          return done(err as Error)
        }
      }
    )
  )

  // Not using sessions; handlers will issue JWTs directly.
  passport.serializeUser((user: any, done) => done(null, user.id))
  passport.deserializeUser(async (id: number, done) => {
    const user = await prisma.user.findUnique({ where: { id } })
    done(null, user)
  })
}

export function issueJwtForUser(user: any) {
  return jwt.sign({ sub: user.id }, JWT_SECRET)
}
