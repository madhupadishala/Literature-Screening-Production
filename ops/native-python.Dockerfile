FROM python:3.12-slim
WORKDIR /app
RUN groupadd -g 11001 nexus && useradd -u 11001 -g nexus -M nexus
COPY requirements-agents.txt requirements-agents-test.txt /app/
RUN pip install --no-cache-dir -r requirements-agents.txt -r requirements-agents-test.txt psycopg[binary]
COPY Agentic_AI /app/Agentic_AI
COPY backend /app/backend
COPY scripts /app/scripts
RUN mkdir -p /run/nexus-agents && chown 11001:11001 /run/nexus-agents
USER 11001:11001
CMD ["python","-m","backend.services.pv_agents.native_qualification_runner"]
