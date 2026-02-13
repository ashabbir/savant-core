FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
COPY talon.mjs ./
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "talon.mjs", "gateway", "--bind", "0.0.0.0"]
