########################################
FROM node:18.13-alpine as builder

# Create app directory
WORKDIR /app

RUN apk add --no-cache -t build-dependencies git make gcc g++ python3 \
    libtool autoconf pkgconfig automake librdkafka-dev bash # wget tar xz

RUN cd $(npm root -g)/npm
RUN npm config set unsafe-perm true
RUN npm install -g node-gyp

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

COPY packages/domain-lib/package.json ./packages/domain-lib/
COPY packages/public-types-lib/package.json ./packages/public-types-lib/
COPY packages/configuration-svc/package.json ./packages/configuration-svc/

#RUN ls -la

# If you are building your code for production
#RUN npm ci --only=production
RUN BUILD_LIBRDKAFKA=0 npm install

# Note on BUILD_LIBRDKAFKA:
#   Use BUILD_LIBRDKAFKA=0 only if we have installed librdkafka-dev in
#   the builder image and librdkafka in the final image

########################################
# Copy code and build

# root tsconfig.json
COPY tsconfig.json ./

# copy required supporting packages/packages (only the private ones not published to npm)
COPY packages/domain-lib ./packages/domain-lib
COPY packages/public-types-lib ./packages/public-types-lib

# copy service code
COPY packages/configuration-svc ./packages/configuration-svc


#RUN ls -la
#RUN ls -la ./packages/domain-lib
#RUN ls -la ./packages/configuration-svc
#RUN ls -la ./node_packages/@mojaloop/

# build
RUN npm run build

########################################
FROM node:18.13-alpine
WORKDIR /app
CMD mkdir /app/data

RUN apk add librdkafka

COPY --from=builder /app .

# kafka handler, no http server yet
EXPOSE 3100

CMD [ "npm", "run", "start:configuration-svc" ]
