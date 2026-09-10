# ------------------------------------------
# Stage 1: deps — install node_modules
# ------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ------------------------------------------
# Stage 2: builder — build Next.js
# ------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars must be present at BUILD time for Next.js
ARG NEXT_PUBLIC_API_URL=https://api.nebulaekids.com/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ------------------------------------------
# Stage 3: runner — minimal production image
# ------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Only copy the standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
