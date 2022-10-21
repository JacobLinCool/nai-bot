FROM node:alpine as builder

RUN npm i -g pnpm
RUN apk add --no-cache python3 make g++
RUN ln -s /usr/bin/python3 /usr/bin/python
WORKDIR /app
COPY . .
RUN pnpm i && pnpm rebuild && pnpm build && rm -rf node_modules && pnpm i --prod

FROM jacoblincool/playwright:chromium-light as nai-bot

WORKDIR /app
COPY --from=builder /app .
ENTRYPOINT [ "npm", "run" ]
CMD [ "start" ]
