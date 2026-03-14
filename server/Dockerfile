FROM node:22-slim
WORKDIR /app
COPY . .
WORKDIR /app/server
RUN npm install --omit=dev
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--no-warnings", "mcp_server.js"]
