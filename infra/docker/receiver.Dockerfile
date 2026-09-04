FROM node:24-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/receiver/package.json apps/receiver/package.json
RUN pnpm install --frozen-lockfile --filter @rwp/receiver...

COPY apps/receiver apps/receiver
RUN pnpm --filter @rwp/receiver build
RUN pnpm --filter @rwp/receiver deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=build /out ./

EXPOSE 4000
USER node
CMD ["node", "dist/server.js"]
