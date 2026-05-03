FROM node:20-alpine

WORKDIR /app

# Create a minimal package.json with only the demo agent's dependencies
# This prevents Railway from auto-detecting the root package.json's "start" script
RUN echo '{ "type": "module", "private": true, "dependencies": { "agent-canvas-sdk": "0.1.1", "dotenv": "16.4.1", "ethers": "6.10.0" } }' > package.json

RUN npm install

# Copy the agent script
COPY examples/demo_agent.mjs ./demo_agent.mjs

# Explicit CMD — no npm start, no auto-detection
CMD ["node", "--no-warnings", "demo_agent.mjs"]
