FROM node:20-bookworm-slim

WORKDIR /app

# Build tools for native modules (utf-8-validate / bufferutil from
# @metamask/sdk-communication-layer require python + g++).
# Using debian-bookworm-slim because alpine's apk cert chain has been
# unreliable in our build environment.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
