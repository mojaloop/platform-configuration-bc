########################################
FROM node:18.13-alpine as builder

# Create app directory
WORKDIR /app

# build requirements
RUN apk --no-cache add git
RUN apk add --no-cache -t build-dependencies make gcc g++ python3 libtool libressl-dev openssl-dev autoconf automake \
    && cd $(npm root -g)/npm \
    && npm config set unsafe-perm true \
    && npm install -g node-gyp

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

COPY packages/domain-lib/package.json ./packages/domain-lib/
COPY packages/public-types-lib/package.json ./packages/public-types-lib/
COPY packages/configuration-svc/package.json ./packages/configuration-svc/

#RUN ls -la

# If you are building your code for production
#RUN npm ci --only=production
RUN npm install

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
FROM node:16.13-alpine
WORKDIR /app

COPY --from=builder /app .

# kafka handler, no http server yet
EXPOSE 3100

CMD [ "npm", "run", "start:configuration-svc" ]
