FROM python:3.10-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs npm ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Shim for initial bring-up; can be replaced by the real savant-context install.
RUN printf '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo "savant-context 0.1.0"\n  exit 0\nfi\nif [ "$1" = "index" ] && [ "$2" = "repo" ]; then\n  echo "indexed $3"\n  exit 0\nfi\necho "unsupported savant-context args: $*" >&2\nexit 1\n' > /usr/local/bin/savant-context \
  && chmod +x /usr/local/bin/savant-context

COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV PORT=4444 HOST=0.0.0.0
EXPOSE 4444

CMD ["npm", "start"]
