FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY tsconfig.json ./tsconfig.json
COPY apps/backend apps/backend
RUN pnpm --filter ClassRoomToolkitBackend build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder --chown=node:node /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder --chown=node:node /app/apps/backend/dist ./apps/backend/dist

USER node
WORKDIR /app/apps/backend
EXPOSE 3000

CMD ["node", "dist/main.js"]

# Keep OCR and layout models out of the memory-constrained Node backend.
FROM python:3.12-slim AS docling-parser

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 \
    CUDA_VISIBLE_DEVICES="" \
    DOCLING_ARTIFACTS_PATH=/opt/docling-models

WORKDIR /app
COPY deploy/docling-parser/requirements.txt ./requirements.txt
# Install the CPU wheels first so pip does not pull CUDA runtime packages into
# this CPU-only OCR image through Docling's local-model extra.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    "torch==2.9.1" "torchvision==0.24.1" \
    && pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y opencv-python \
    && pip install --no-cache-dir --no-deps opencv-python-headless==5.0.0.93 \
    && docling-tools models download -o /opt/docling-models --rapidocr-backend-lang onnxruntime:ch
COPY deploy/docling-parser/app.py ./app.py
COPY deploy/docling-parser/heading_units.py ./heading_units.py

RUN useradd --create-home --uid 10001 parser \
    && mkdir -p /tmp/docling \
    && chown -R parser:parser /opt/docling-models /tmp/docling /app
USER parser
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
