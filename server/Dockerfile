FROM node:22-alpine
WORKDIR /app/server
RUN apk add --no-cache python3 make g++
# /report.pdf prints the report with headless Chromium (puppeteer-core never
# downloads a browser of its own). font-noto is what draws the sheet — without
# a font package Chromium renders every glyph as a box.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates font-noto tzdata
COPY server/package*.json ./
RUN npm ci
COPY server ./
# Shared app code the server imports directly. Adding a new `../../../src/...`
# import to any server file means adding it here too, or the image builds fine
# and then dies at startup with ERR_MODULE_NOT_FOUND. `npm run check:image`
# catches exactly that.
COPY src/utils ../src/utils
COPY src/types ../src/types
COPY src/reports ../src/reports
# ../src/utils/hoursUtils.ts imports date-fns; Node resolves modules by walking
# up from the importing file, and /app/src is not under /app/server, so without
# this symlink date-fns (installed only in server/node_modules) can't be found.
RUN ln -s /app/server/node_modules /app/node_modules
# Work periods are stored as absolute instants and printed as wall-clock times,
# so the container has to keep the phone's clock or every "08:00–16:00" on a
# report is silently shifted by the UTC offset. Override in compose if the
# phone ever moves timezone.
ENV TZ=Europe/Helsinki
ENV KELOMIT_DATA_DIR=/data PORT=8090
EXPOSE 8090
CMD ["npx", "tsx", "src/index.ts"]
