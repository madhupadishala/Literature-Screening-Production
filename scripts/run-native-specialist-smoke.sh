#!/usr/bin/env bash
set -euo pipefail
# No deployment, model credentials, network transfer or clinical data.
python -m unittest -v \
  Agentic_AI.shared.tests.test_native_runtime_batch \
  Agentic_AI.shared.tests.test_native_event_engine \
  Agentic_AI.shared.tests.test_node_ipc_native_integration
node frontend/scripts/verify-native-agent-socket.mjs
