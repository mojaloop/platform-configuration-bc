# Mojaloop vNext Platform Configuration Client Library

[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/platform-configuration-bc.svg?style=flat)](https://github.com/mojaloop/platform-configuration-bc/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/platform-configuration-bc.svg?style=flat)](https://github.com/mojaloop/platform-configuration-bc/releases)
[![Npm Version](https://img.shields.io/npm/v/@mojaloop/platform-configuration-bc-client-lib.svg?style=flat)](https://www.npmjs.com/package/@mojaloop/platform-configuration-bc-client-lib)
[![NPM Vulnerabilities](https://img.shields.io/snyk/vulnerabilities/npm/@mojaloop/platform-configuration-bc-client-lib.svg?style=flat)](https://www.npmjs.com/package/@mojaloop/platform-configuration-bc-client-lib)
[![CircleCI](https://circleci.com/gh/mojaloop/platform-configuration-bc.svg?style=svg)](https://circleci.com/gh/mojaloop/platform-configuration-bc)


This library provides a nodejs platform configuration client implementation, to be used by components that require centrally stored and managed configurations.
It works in conjunction with the platform configuration central service (check the see also section below).

There are two sets of configurations:
- **Per bounded context configurations** - with schemas defined by the bounded contexts
- **Global configurations** - with schemas defined centrally by the Platform Configuration BC code and its config bootstrapper

## Usage (quick start)

### Create the configuration schema
```typescript
"use strict"

import {ConsoleLogger} from "@mojaloop/logging-bc-public-types-lib";
import {ConfigParameterTypes} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {IConfigProvider, ConfigurationClient, DefaultConfigProvider} from "@mojaloop/platform-configuration-bc-client-lib";

const BC_NAME = "my-bounded-context";                       // Bounded context registering the configuration schema
const APP_NAME = "my-server-app";                           // Application name using the ConfigurationClient
const APP_VERSION = "0.1.2";                                // Version of the application (should come from npm env var)
const SCHEMA_VERSION = "0.0.1";                             // This is the version of the config schema

const CONFIG_SVC_BASEURL = "http://localhost:3100";         // Base URL of the configuration REST service
const AUTH_TOKEN_ENPOINT = "http://localhost:3201/token";   // Token endpoint of the authentitcation REST service

// Service credentials of the Application using the ConfigurationClient (provisioned from authentitcation-svc)
const CLIENT_ID = "my-server-app";
const CLIENT_SECRET = "superServiceSecret";

const logger = new ConsoleLogger();

// mandatory - create an instance of IAuthenticatedHttpRequester
const authRequester = new AuthenticatedHttpRequester(logger, AUTH_TOKEN_ENPOINT);
authRequester.setAppCredentials(CLIENT_ID, CLIENT_SECRET);

// optional - messageConsumer required to enable automatic reloads, triggered by server changes
const messageConsumer = new MLKafkaJsonConsumer({kafkaBrokerList: "localhost:9092", kafkaGroupId: "test"}, logger);

// create the default provider instance
const defaultConfigProvider:IConfigProvider = new DefaultConfigProvider(authRequester, messageConsumer, CONFIG_SVC_BASEURL);

// NOTE: you can skip passing the CONFIG_SVC_BASEURL to the DefaultConfigProvider constructor (or pass null)
// if the PLATFORM_CONFIG_BASE_SVC_URL env var contains the platform config service base url
// const defaultConfigProvider:IConfigProvider = new DefaultConfigProvider();

// create the configClient instance, passing the defaultConfigProvider
const  configClient = new ConfigurationClient(BC_NAME, APP_NAME, APP_VERSION, CONFIGSET_VERSION, defaultConfigProvider);

// Add the parameters your Bounded Context uses to the configuration schema
configClient.bcConfigs.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1");
configClient.bcConfigs.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1");
configClient.bcConfigs.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 42, "description int number param 1");
configClient.bcConfigs.addNewParam("floatParam1", ConfigParameterTypes.FLOAT_NUMBER, 3.1415, "description float number param 1");

// Add object param, including JSON Type Definition (JTD) which can be used with OBJECT and LIST param types
// JTD will be used to validate future value changes, specification here: https://datatracker.ietf.org/doc/rfc8927/
// Note: For ConfigParameterTypes.LIST, the JTD is the specification for each item, not the entire array
configClient.bcConfigs.addNewParam(
    "objParam1",
    ConfigParameterTypes.OBJECT,
    {name: "Pedro", age: 46},
    "description",
    '{"properties":{"name":{"type":"string"},"age":{"type":"int32"}}}'
);

// Add the feature flags your Bounded Context uses to the configuration schema
configClient.bcConfigs.addNewFeatureFlag("useBetaFeatureY", false, "description feature flag");

// Add the secrets your Bounded Context uses to the configuration schema
configClient.bcConfigs.addNewSecret("secret1", "password", "description secret 1");
```


### Initialise the client
(continued from code snippet above)
```typescript
await configClient.init();
```


### Bootstrap - send the configuration schema to the central service
(continued from code snippet above)
```typescript
const bootStrapSuccess = await configClient.bootstrap();
```

### Fetch the current values from the central service
This will get both the Bounded Context config schema current values and the global schema current values.

(continued from code snippet above)
```typescript
await configClient.fetch();
```

#### Hook the change notification mechanism (must instantiate the provider with a messageConsumer)
(continued from code snippet above)
```typescript
configClient.setChangeHandlerFunction((type:"BC"|"GLOBAL") => {
    console.log("Configurations where changed in the service and have been re-fetched already");
    if(type==="BC")
        console.log("  Changes were on this bounded context configuration set");
    else
        console.log("  Changes were on the global configuration set");
});
```


### After init() and fetch() you can use your configClient instance anywhere you need config values

## Get your own Bounded Context schema values - current version and latest iteration

```typescript
const stringParam1Obj = configClient.bcConfigs.getParam("stringParam1");
const stringParam1: string = stringParam1Obj.currentValue;

const boolParam1Obj = configClient.bcConfigs.getParam("boolParam1");
const boolParam1: boolean = boolParam1Obj.currentValue;

const intParam1Obj = configClient.bcConfigs.getParam("intParam1");
const intParam1: number = intParam1Obj.currentValue;

const floatParam1Obj = configClient.bcConfigs.getParam("floatParam1");
const floatParam1: number = floatParam1Obj.currentValue;

const featureFlag1Obj = configClient.bcConfigs.getFeatureFlag("featureFlag1");
const featureFlag1: boolean = featureFlag1Obj.currentValue;

const secret1Obj = configClient.bcConfigs.getSecret("secret1");
const secret1: string = secret1Obj.currentValue;
```

## Global schema values - latest version and iteration

```typescript
const globalParam1Obj = configClient.globalConfigs.getParam("globalParam1");
const strGlobalParam1: string = globalParam1Obj.currentValue;

const globalFeatureFlag1Obj = configClient.globalConfigs.getFeatureFlag("globalFeatureFlag1");
const globalFeatureFlag1: boolean = globalFeatureFlag1Obj.currentValue;

const globalSecret1Obj = configClient.globalConfigs.getSecret("globalSecret1");
const globalSecret1: string = globalSecret1Obj.currentValue;
```

Note: The `getParam`, `getFeatureFlag` and `getSecret` will return null if the config items are not found

You can also request all params, feature flags and secrets, using the `getAllParams`, `getAllFeatureFlags` and `getAllSecrets`, respectively.

### Reacting to platform configuration changes triggered upstream

See example above on how to use ```ConfigurationClient.setChangeHandlerFunction()```

## How it works

- Bounded contexts define a **configuration schema**, which include the configurations items they need the configuration schema version;
- This configuration schema is sent to the central service by the client during the **boostrap step**, and stored in the form of a `ConfigurationSet` list;
- Administrators can change the central values (and trigger change notifications to connected clients);
- Everytime a change is made in a configuration set, its `iterationNumber` increases by one;
- Applications can fetch the centrally stored values at startup, on time, or as result of centrally emitted change notification.

In a configuration schema, there are three types of configuration values:
- **Parameters** - General parameters that can be of type: bool, string, int and float
- **Feature Flags** - These are boolean values, which can be enabled or disabled
- **Secrets** - Centrally stored string secret values

All per bc configuration schemas are identified by their owner bounded context.
All configuration types have a unique name and a description.
Parameters and Feature Flags have a default value that is provided by the developer (secrets, for security reasons do not have te ability to set a default value).

The per bounded context configuration schema that is sent to the central service by the client during the boostrap step, called `BoundedContextConfigurationSet`, looks like:
```typescript
export type BoundedContextConfigurationSet = {
    boundedContextName: string;                     // target bounded context
    schemaVersion: string;                          // schema version (semver format)
    iterationNumber: number;                        // monotonic integer - increases on every configuration/values change
    readonly parameters: ConfigParameter[];         // parameter list
    readonly featureFlags: ConfigFeatureFlag[];     // featureFlag list
    readonly secrets: ConfigSecret[];               // secret list
}
```

This client library provides an `ConfigurationClient` object that encapsulates both the `BoundedContextConfigurationSet` and the `GlobalConfigurationSet`, which deliver all the functionality required by the consuming Bounded Context.
The `ConfigurationClient` requires an implementation of a `IConfigProvider` in order to interact with the central/remote system. The library provides a default implementation that allows the client to connect to the default central system interface.
For development only purposes, the client can be instantiated without an `IConfigProvider` implementation - this forces the client to work in a standalone mode, using only locally provided values.

### Load order / precedence
1. Parameter / FeatureFlag / ~~Secret~~ default values definition when instantiating the `ConfigurationClient`;
2. Fetch request (from the IConfigProvider) that fetches central/remote values;
3. Environment Variables - these can be defined at OS level before the application starts.

**Note**: Each step overrides the previous

### DefaultProvider configuration via env var

The default implementation of the `ConfigProvider` this library provides, called `DefaultConfigProvider` can be configured via an environment variable, to that end, set the `PLATFORM_CONFIG_BASE_SVC_URL` env var with the value of the central platform configuration service base url and construct the `DefaultConfigProvider` instance without passing a `configSvcBaseUrl`.


### Overriding with Environment Variables

All configuration values can be overridden locally by defining a configuration value with the following name format:
- For local per bounded context config items: `ML_BC_`+`CONFIG_ITEM_NAME_UPPERCASE`
- For global config items: `ML_GLOBAL_`+`CONFIG_ITEM_NAME_UPPERCASE`

#### Example
For the following parameter:
```
configClient.addNewParam(
    "serverBaseUrl",
    ConfigParameterTypes.STRING,
    "http://localhost:3000",
    "Base URL for the server, including protocol and port"
);
```
Set the environment variable with corresponding name to override the parameter:
```
export ML_BC_SERVERBASEURL=https://192.168.1.1:443
```

## Standalone mode (for development)

Standalone mode means that no values will be fetched from the central/remote service. In other works, any provided `IConfigProvider` will be disabled.

**This might be useful in local development mode, where the central service is not available.**

There are two ways to have the ConfigurationClient working in standalone:
- By setting a specially called env var with any non-null value, called: `PLATFORM_CONFIG_STANDALONE`
- By providing a null `IConfigProvider` when instantiating the `ConfigurationClient` object.


### Bootstrapping initial / new configuration schemas

## See also

This client is aligned with the central component of the Mojaloop vNex Platform Configuration.
- See the `@mojaloop/platform-configuration-bc-types-lib` library [here](https://www.npmjs.com/package/@mojaloop/platform-configuration-bc-types-lib) for the shared types.
- See the central configuration service [here](https://github.com/mojaloop/platform-configuration-bc/tree/main/modules/configuration-svc)

## Install

To install this library use:

```shell
npm install @mojaloop/platform-configuration-bc-client-lib

OR

yarn add @mojaloop/platform-configuration-bc-client-lib
```
