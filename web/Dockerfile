# Vastukala AI web — build context is the REPO ROOT (npm workspaces).
# For most deploys, prefer Vercel (auto-detects Next.js). This image is for
# docker-compose parity.
FROM node:20-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install workspace deps (root + web + shared)
COPY package.json ./
COPY web/package.json ./web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install

COPY . .
RUN npm run build --workspace web

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "web"]
