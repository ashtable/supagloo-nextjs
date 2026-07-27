# syntax=docker/dockerfile:1

# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NOT load-bearing any more, and deliberately kept anyway. Since RX-1 (`app/layout.tsx`
# reads the key per request, behind `await connection()`) `next build` no longer evaluates
# the env at all — VERIFIED: a build with YV_APP_KEY entirely unset exits 0 and prerenders
# nothing that touches the root layout. It stays declared because root's
# docker-compose.yml passes a NON-SECRET placeholder here (an undeclared build arg is a
# warning), and because a value in this stage must never be trusted as the runtime key: the
# runner stage inherits no ENV from builder, and compose's `environment:` block is the real
# source of truth (D43.3). Never put the real credential here — it would be baked into the
# image layer.
ARG YV_APP_KEY
ENV YV_APP_KEY=$YV_APP_KEY
ARG NEXT_PUBLIC_YV_AUTH_REDIRECT_URL
ENV NEXT_PUBLIC_YV_AUTH_REDIRECT_URL=$NEXT_PUBLIC_YV_AUTH_REDIRECT_URL
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["npm", "run", "start"]
