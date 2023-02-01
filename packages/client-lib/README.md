# Mojaloop vNext Platform Configuration Client Library

[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/platform-configuration-bc.svg?style=flat)](https://github.com/mojaloop/platform-configuration-bc/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/platform-configuration-bc.svg?style=flat)](https://github.com/mojaloop/platform-configuration-bc/releases)
[![Npm Version](https://img.shields.io/npm/v/@mojaloop/platform-configuration-bc-client-lib.svg?style=flat)](https://www.npmjs.com/package/@mojaloop/platform-configuration-bc-client-lib)
[![NPM Vulnerabilities](https://img.shields.io/snyk/vulnerabilities/npm/@mojaloop/platform-configuration-bc-client-lib.svg?style=flat)](https://www.npmjs.com/package/@mojaloop/platform-configuration-bc-client-lib)
[![CircleCI](https://circleci.com/gh/mojaloop/platform-configuration-bc.svg?style=svg)](https://circleci.com/gh/mojaloop/platform-configuration-bc)


This library provides a nodejs platform configuration client implementation, to be used by components that require centrally stored and managed configurations.
It works in conjunction with the platform configuration central service (check the see also section below).

There are two sets of configurations:
- **Per application configurations** - with schemas defined by the applications
- **Global configurations** - with schemas defined centrally by the Platform Configuation BC code

## Usage (quick start)

### Create the configuration schema
```typescript
"use strict"

import {ConfigurationClient, IConfigProvider, DefaultConfigProvider} from "@mojaloop/platform-configuration-bc-client-lib";
import {ConfigParameterTypes} from "@mojaloop/platform-configuration-bc-public-types-lib";

const ENV_NAME = "dev";                                 // Global platform environment name
const BC_NAME = "my-bounded-context";                   // Bounded context which the App registering the schema belongs to
const APP_NAME = "my-server-app";                       // Application name that defined the configuration schema
const APP_VERSION = "0.0.1";                            // Current version of the application owning the schema
const CONFIGSET_VERSION = "0.0.1";                      // This is the version of the config schema, may differ from the app version that owns it
const CONFIG_SVC_BASEURL = "http://localhost:3000";     // Base URL of the configuration REST service

// create the default provider instance
const defaultConfigProvider:IConfigProvider = new DefaultConfigProvider(CONFIG_SVC_BASEURL);

// NOTE: you can skip passing the CONFIG_SVC_BASEURL to the DefaultConfigProvider constructor
// if the PLATFORM_CONFIG_CENTRAL_URL env var contains the platform config service base url
// const defaultConfigProvider:IConfigProvider = new DefaultConfigProvider();

// create the configClient instance, passing the defaultConfigProvider
const  configClient = new ConfigurationClient(ENV_NAME, BC_NAME, APP_NAME, APP_VERSION, CONFIGSET_VERSION, defaultConfigProvider);

// Add the parameters your application uses to the configuration schema
configClient.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1");
configClient.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1");
configClient.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 42, "description int number param 1");
configClient.addNewParam("floatParam1", ConfigParameterTypes.FLOAT_NUMBER, 3.1415, "description float number param 1");

// Add the feature flags your application uses to the configuration schema
configClient.addNewFeatureFlag("useBetaFeatureY", false, "description feature flag");

// Add the secrets your application uses to the configuration schema
configClient.addNewSecret("secret1", "password", "description secret 1");
```


### Initialise the client
(continued from code snippet above)
```typescript
await configClient.init()
```


### Bootstrap - send the configuration schema to the central service
(continued from code snippet above)
```typescript
const bootStrapSuccess = await configClient.bootstrap()
```

### Fetch the current values from the central service
This will get both the app config schema current values and the global schema current values.

(continued from code snippet above)
```typescript
await configClient.fetch();
```

### After init() and fetch() you can use your configClient instance anywhere you need config values

## Your own application schema values - current version and latest iteration

```typescript
const stringParam1Obj = configClient.appConfigs.getParam("stringParam1");
const stringParam1: string = stringParam1Obj.currentValue; 

const boolParam1Obj = configClient.appConfigs.getParam("boolParam1");
const boolParam1: boolean = boolParam1Obj.currentValue;

const intParam1Obj = configClient.appConfigs.getParam("intParam1");
const intParam1: number = intParam1Obj.currentValue;

const floatParam1Obj = configClient.appConfigs.getParam("floatParam1");
const floatParam1: number = floatParam1Obj.currentValue;

const featureFlag1Obj = configClient.appConfigs.getFeatureFlag("featureFlag1");
const featureFlag1: boolean = featureFlag1Obj.currentValue;

const secret1Obj = configClient.appConfigs.getSecret("secret1");
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

### TODO - reacting to platform configuration changes triggered upstream

### Keep the schema app version in sync with you application version 

When your application version increases, make sure to reflect that before creating the ConfigurationClient and executing the bootstrap. 

```typescript
// create the configClient instance, passing the defaultConfigProvider
const APP_VERSION = "0.0.2";
const  configClient = new ConfigurationClient(ENV_NAME, BC_NAME, APP_NAME, APP_VERSION, defaultConfigProvider);
const bootStrapSuccess = await configClient.bootstrap()
```

## How it works

- Applications define a **configuration schema**, which include the configurations items they need the configuration schema version;
- This configuration schema is sent to the central service by the client during the **boostrap step**, and stored in the form of a `ConfigurationSet` list;
- Administrators can change the central values (and trigger change notifications to connected clients);
- Everytime a change is made in a configuration set, its `iterationNumber` increases by one;
- Applications can fetch the centrally stored values at startup, on time, or as result of centrally emitted change notification. 

In a configuration schema, there are three types of configuration values:
- **Parameters** - General parameters that can be of type: bool, string, int and float
- **Feature Flags** - These are boolean values, which can be enabled or disabled 
- **Secrets** - Centrally stored string secret values

All configuration schemas are identified by their owner application, application version, bounded context and execution environment.
All configuration types have a unique name and a description.
Parameters and Feature Flags have a default value that is provided by the developer (secrets, for security reasons do not have te ability to set a default value).

The per-application configuration schema that is sent to the central service by the client during the boostrap step, called `AppConfigurationSet`, looks like:
```typescript
export type AppConfigurationSet = {
    environmentName: string;                        // target environment name
    boundedContextName: string;                     // target bounded context
    applicationName: string;                        // target application name
    applicationVersion: string;                     // target app version (semver format)
    schemaVersion: string;                          // schema version, may differ from the app version (semver format)
    iterationNumber: number;                        // monotonic integer - increases on every configuration/values change
    readonly parameters: ConfigParameter[];         // parameter list
    readonly featureFlags: ConfigFeatureFlag[];     // featureFlag list
    readonly secrets: ConfigSecret[];               // secret list
}
```

This client library provides an `ConfigurationClient` object that encapsulates both the `AppConfigurationSet` and the `GlobalConfigurationSet`, which deliver all the functionality required by the consuming application.
The `ConfigurationClient` requires an implementation of a `IConfigProvider` in order to interact with the central/remote system. The library provides a default implementation that allows the client to connect to the default central system interface.
For development only purposes, the client can be instanciated without an `IConfigProvider` implementation - this forces the client to work in a standalone mode, using only locally provided values. 

### Load order / precedence
1. Parameter / FeatureFlag / ~~Secret~~ default values definition when instantiating the `ConfigurationClient`;
2. Fetch request (from the IConfigProvider) that fetches central/remote values;
3. Environment Variables - these can be defined at OS level before the application starts.

**Note**: Each step overrides the previous

### DefaultProvider configuration via env var

The default implementation of the `ConfigProvider` this library provides, called `DefaultConfigProvider` can be configured via an environment variable, to that end, set the `PLATFORM_CONFIG_CENTRAL_URL_ENV_VAR_NAME` env var with the value of the central platform configuration service base url and construct the `DefaultConfigProvider` instance without passing a `configSvcBaseUrl`.    


### Overriding with Environment Variables

All configuration values can be overridden locally by defining a configuration value with the following name format: 
- For local per application config items: `ML_APP_`+`CONFIG_ITEM_NAME_UPPERCASE`
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
export ML_APP_SERVERBASEURL=https://192.168.1.1:443
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
