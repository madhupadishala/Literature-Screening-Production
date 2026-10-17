FROM node:22-bookworm-slim
WORKDIR /app
RUN groupadd -g 11001 nexus && useradd -u 11001 -g nexus -M nexus
COPY frontend/package*.json /app/frontend/
RUN cd frontend && npm ci --ignore-scripts
COPY frontend /app/frontend
COPY Agentic_AI /app/Agentic_AI
COPY ops/native-node-health.mjs /app/ops/native-node-health.mjs
RUN mkdir -p /run/nexus-agents && chown 11001:11001 /run/nexus-agents
USER 11001:11001
CMD ["node","--import","tsx","/app/frontend/scripts/run-native-agent-worker.ts"]
