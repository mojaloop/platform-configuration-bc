# Onboarding

>*Note:* Before completing this guide, make sure you have completed the _general_ onboarding guide in the [base mojaloop repository](https://github.com/mojaloop/mojaloop/blob/main/onboarding.md#mojaloop-onboarding).

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Service Overview](#2-service-overview)
3. [Installing and Building](#3-installing-and-building)
4. [Running Locally](#4-running-locally-dependencies-inside-of-docker)
5. [Running Inside Docker](#5-running-inside-docker)
6. [Testing](#6-testing)
7. [Common Errors/FAQs](#7-common-errorsfaqs)


##  1. Prerequisites

If you have followed the [general onboarding guide](https://github.com/mojaloop/mojaloop/blob/main/onboarding.md#mojaloop-onboarding), you should already have the following cli tools installed:

* `brew` (macOS), [todo: windows package manager]
* `curl`, `wget`
* `docker` + `docker-compose`
* `node`, `npm` and (optionally) `nvm`

## 2. Service Overview 
The platform-configuration-bc BC consists of the following packages;

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

## 3. <a name='InstallingandBuilding'></a>Installing and Building

Firstly, clone your fork of the `platform-configuration-bc` onto your local machine:
```bash
git clone https://github.com/<your_username>/platform-configuration-bc.git
```

Then `cd` into the directory and install the node modules:
```bash
cd platform-configuration-bc
```

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

#### Build

```bash
npm run build
``` 

Create a directory and subdirectory in packages/configuration-svc/
```shell
cd packages/configuration-svc/
mkdir -p app/data 
```



## 4. Running Locally (dependencies inside of docker)

In this method, we will run all of the core dependencies inside of docker containers, while running the `settlement-bc` server on your local machine.

> Alternatively, you can run the `platform-configuration-bc` inside of `docker-compose` with the rest of the dependencies to make the setup a little easier: [Running Inside Docker](#5-running-inside-docker).


### 4.1. Startup supporting services

Use https://github.com/mojaloop/platform-shared-tools/tree/main/packages/deployment/docker-compose-infra


To startup Kafka, MongoDB, Elasticsearch and Kibana, follow the steps below(executed in docker-compose-infra/):   

1. Create a sub-directory called `exec` inside the `docker-compose-infra` (this) directory, and navigate to that directory.


```shell
mkdir exec 
cd exec
```

2. Create the following directories as sub-directories of the `docker-compose/exec` directory:
* `certs`
* `esdata01`
* `kibanadata`
* `logs`

```shell
mkdir {certs,esdata01,kibanadata,logs}
```

3. Copy the `.env.sample` to the exec dir:
```shell
cp ../.env.sample ./.env
```

4. Review the contents of the `.env` file

5. Ensure `vm.max_map_count` is set to at least `262144`: Example to apply property on live system:
```shell
sysctl -w vm.max_map_count=262144 # might require sudo
```

### Start Infrastructure Containers

Start the docker containers using docker-compose up (in the exec dir)
```shell
docker-compose -f ../docker-compose-infra.yml --env-file ./.env up -d
```


To view the logs of the infrastructure containers, run:
```shell
docker-compose -f ../docker-compose-infra.yml --env-file ./.env logs -f
```

To stop the infrastructure containers, run:
```shell
docker-compose -f ../docker-compose-infra.yml --env-file ./.env stop
```


After running the docker-compose-infra we can start configuration-svc:
```shell
npm run start:configuration-svc
```

### 4.3 Run the server

```bash
npm run start:platform-configuration-api-svc
```

## 5. Running Inside Docker


## 6. Testing
We use `npm` scripts as a common entrypoint for running the tests. Tests include unit, functional, and integration.

```bash
# unit tests:
npm run test:unit

# check test coverage
npm run test:coverage

# integration tests
npm run test:integration
```

### 6.1 Testing the `platform-configuration-bc` API with Postman

[Here](https://github.com/mojaloop/platform-shared-tools/tree/main/packages/postman) you can find a complete Postman collection, in a json file, ready to be imported to Postman.


## Common Errors/FAQs 

### Unable to load dlfcn_load
```bash
error:25066067:DSO support routines:dlfcn_load:could not load the shared library
```
Fix: https://github.com/mojaloop/security-bc.git  `export OPENSSL_CONF=/dev/null`
