FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production && npm install agent-canvas-sdk@0.1.1

# Copy agent script
COPY examples/demo_agent.mjs ./examples/demo_agent.mjs

# No port exposed — this is a worker, not a web server
CMD ["node", "examples/demo_agent.mjs"]
