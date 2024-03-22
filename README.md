# platform-configuration-bc

**EXPERIMENTAL** vNext Platform Configuration Bounded Context Mono Repository

The platform configuration bounded context is responsible for managing configuration sets, encompassing both global settings and bounded-context-specific configurations, such as bootstrapping, updating, and storage.

## Contents
- [platform-configuration-bc](#platform-configuration-bc-bc)
  - [Contents](#contents)
  - [Packages](#packages)
  - [Running Locally](#running-locally)
  - [Configuration](#configuration)
  - [Logging](#logging)
  - [Tests](#tests)
  - [Auditing Dependencies](#auditing-dependencies)
  - [CI/CD](#cicd-pipelines)
  - [Documentation](#documentation)

## Packages
The Platform Configuration BC consists of the following packages;

`client-lib`
Platform Configuration BC Client Library.
[README](./packages/client-lib/README.md)

`configuration-svc`
Configuration Service.
[README](./packages/configuration-svc/README.md)

`domain-lib`
Domain library types.
[README](./packages/domain-lib/README.md)

`public-types-lib`
Public shared types.
[README](./packages/public-types-lib/README.md)

## Running Locally

Please follow the instruction in [Onboarding Document](Onboarding.md) to setup and run the service locally.

## Configuration

See the README.md file on each services for more Environment Variable Configuration options.

## Logging

Logs are sent to standard output by default.

## Tests

### Unit Tests

```bash
npm run test:unit
```

### Run Integration Tests

```shell
npm run test:integration
```

### Run all tests at once
Requires integration tests pre-requisites
```shell
npm run test
```

# Collect coverage (from both unit and integration test types)

After running the unit and/or integration tests: 

```shell
npm run posttest
```

You can then consult the html report in:

```shell
coverage/lcov-report/index.html
```

## Auditing Dependencies
We use npm audit to check dependencies for node vulnerabilities. 

To start a new resolution process, run:
```
npm run audit:fix
``` 

You can check to see if the CI will pass based on the current dependencies with:

```
npm run audit:check
```

## CI/CD Pipelines

### Execute locally the pre-commit checks - these will be executed with every commit and in the default CI/CD pipeline 

Make sure these pass before committing any code
```
npm run pre_commit_check
```

### Work Flow 

 As part of our CI/CD process, we use CircleCI. The CircleCI workflow automates the process of publishing changed packages to the npm registry and building Docker images for select packages before publishing them to DockerHub. It also handles versioning, tagging commits, and pushing changes back to the repository.

The process includes five phases. 
1. Setup : This phase initializes the environment, loads common functions, and retrieves commits and git change history since the last successful CI build.

2. Detecting Changed Package.

3. Publishing Changed Packages to NPM.

4. Building Docker Images and Publishing to DockerHub.

5. Pushing Commits to Git.

 All code is automatically linted, built, and unit tested by CircleCI pipelines, where unit test results are kept for all runs. All libraries are automatically published to npm.js, and all Docker images are published to Docker Hub.

 ## Documentation
The following documentation provides insight into the Platform Configuration Bounded Context.

- **MIRO Board** - https://miro.com/app/board/o9J_lJyA1TA=/
- **Work Sessions** - https://docs.google.com/document/d/1Nm6B_tSR1mOM0LEzxZ9uQnGwXkruBeYB2slgYK1Kflo/edit#heading=h.6w64vxvw6er4
