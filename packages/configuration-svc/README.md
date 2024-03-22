# platform-configuration-bc-configuration-svc

[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/platform-configuration-bc.svg?style=flat)](https://github.com/mojaloop/platform-configuration-bc/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/platform-configuration-bc.svg?style=flat)](https://github.com/mojaloop/platform-configuration-bc/releases)
[![Npm Version](https://img.shields.io/npm/v/@mojaloop-poc/platform-configuration-bc.svg?style=flat)](https://www.npmjs.com/package/@mojaloop-poc/platform-configuration-bc)
[![NPM Vulnerabilities](https://img.shields.io/snyk/vulnerabilities/npm/@mojaloop/platform-configuration-bc.svg?style=flat)](https://www.npmjs.com/package/@mojaloop-poc/platform-configuration-bc)
[![CircleCI](https://circleci.com/gh/mojaloop/platform-configuration-bc.svg?style=svg)](https://circleci.com/gh/mojaloop/platform-configuration-bc)

Mojaloop Platform Configuration BC Configuration Service

## Usage

### Install Node version

More information on how to install NVM: https://github.com/nvm-sh/nvm

```bash
nvm install
nvm use
```

### Install Dependencies

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm run start
```

## Unit Tests

```bash
npm run test:unit
```

## Known Issues

- added `typescript` to [.ncurc.json](./.ncurc.json) as the `dep:update` script will install a non-supported version of typescript

## Configuration 

### Environment variables

| Environment Variable | Description    | Example Values         |
|---------------------|-----------------|-----------------------------------------|
| PRODUCTION_MODE      | Flag indicating production mode   | FALSE                  |
| LOG_LEVEL            | Logging level for the application                  | LogLevel.DEBUG        |
| AUTH_N_SVC_BASEURL | Authentication service base URL  |http://localhost:3201|
| AUTH_N_TOKEN_ISSUER_NAME    | Authentication service token issuer name           |   mojaloop.vnext.dev.default_issuer    |
| AUTH_N_TOKEN_AUDIENCE        | Authentication service token audience    |    mojaloop.vnext.dev.default_audience   |
| AUTH_N_SVC_JWKS_URL  | Authentication service base URL    | http://authentication-svc:3201         |
| AUTH_Z_SVC_BASEURL   | Authorization service base URL    | http://authorization-svc:3202           |
| KAFKA_URL       | Kafka broker URL     | localhost:9092          |
| MONGO_URL            | MongoDB connection URL             | mongodb://root:mongoDbPas42@localhost:27017/ |
| KAFKA_LOGS_TOPIC      | Kafka topic for logs          | logs    |
| KAFKA_AUDITS_TOPIC        | Kafka topic for audits              | audits                 |
| AUDIT_KEY_FILE_PATH  | File path for audit key           | /app/data/audit_private_key.pem         |
| CONFIG_REPO_STORAGE_FILE_PATH | File Path for Configuration Repo Storage | /app/data/configSetRepoTempStorageFile.json |
| SVC_CLIENT_ID        | Service client ID                 | platform-configuration-bc-api-svc              |
| SVC_CLIENT_SECRET    | Service client secret             | superServiceSecret     |
| SVC_DEFAULT_HTTP_PORT  | Default HTTP port for the service                  | 3100  |
| SERVICE_START_TIMEOUT_MS               | Timeout for service startup in milliseconds        | 60_000                 |