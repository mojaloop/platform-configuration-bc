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
