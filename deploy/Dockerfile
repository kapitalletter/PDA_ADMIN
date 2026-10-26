# CodeBuild overrides these with ECR Public mirrors to avoid Docker Hub rate limits.
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.30.5-alpine

FROM ${NODE_IMAGE} AS build

WORKDIR /app

# pnpm (version from .mise.toml) with pnpm-lock.yaml: `npm ci` stops with EBADPLATFORM
# on the Windows-only @rolldown/binding-win32-x64-msvc devDependency, pnpm skips it.
RUN npm install --global --no-audit --no-fund pnpm@10.34.3

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# The Docker build context is the repository root. Only the files Vite needs are
# copied: vite.config.ts imports .figma/make/site.json and scripts/pdfAssets.ts, so
# those two come in, while the rest of scripts/ and .figma/ stays outside the image.
COPY index.html vite.config.ts tsconfig.json ./
COPY .figma/make/site.json ./.figma/make/
COPY scripts/pdfAssets.ts scripts/security.test.mjs ./scripts/
COPY public ./public
COPY src ./src

# Build gate: a type error or a failing security check stops the image here, so
# CodeBuild never pushes it. Only dist/ reaches the runtime stage.
RUN pnpm run typecheck && pnpm run test:security

# Vite inlines VITE_* values from .env.production into the bundle at build time, so
# the image needs no runtime env. Do not set VITE_* as ENV/ARG here: environment
# variables take precedence over the file, even when empty.
COPY .env.production ./

# vite.config.ts writes the production CSP into index.html as a <meta> tag. The same
# policy is turned into an Nginx header here (plus frame-ancestors, which a <meta>
# policy cannot carry), so the API origin is kept in .env.production only.
RUN pnpm run build \
    && csp="$(sed -n 's/.*<meta http-equiv="Content-Security-Policy" content="\([^"]*\)".*/\1/p' dist/index.html | sed "s/&#39;/'/g")" \
    && test -n "${csp}" \
    && printf 'add_header Content-Security-Policy "%s; %s" always;\n' "${csp}" "frame-ancestors 'none'" > csp-header.conf

FROM ${NGINX_IMAGE} AS runtime

# Replace the image's default config; nginx.conf keeps pid and temp files in /tmp
# so the server runs as the unprivileged nginx user.
RUN rm -f /etc/nginx/conf.d/default.conf && rm -rf /usr/share/nginx/html/*
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/csp-header.conf /etc/nginx/csp-header.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER nginx

# The shared Nginx (nginx_container) proxies admin.ped-pda.com to pda-admin:3000.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
