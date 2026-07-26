FROM node:22-alpine
WORKDIR /app/server
RUN apk add --no-cache python3 make g++
COPY server/package*.json ./
RUN npm ci
COPY server ./
COPY src/utils ../src/utils
COPY src/types ../src/types
# ../src/utils/hoursUtils.ts imports date-fns; Node resolves modules by walking
# up from the importing file, and /app/src is not under /app/server, so without
# this symlink date-fns (installed only in server/node_modules) can't be found.
RUN ln -s /app/server/node_modules /app/node_modules
ENV KELOMIT_DATA_DIR=/data PORT=8090
EXPOSE 8090
CMD ["npx", "tsx", "src/index.ts"]
