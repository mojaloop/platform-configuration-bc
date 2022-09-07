/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 --------------
 ******/

"use strict"
import express from "express";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {AppConfigurationSet, GlobalConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {
    ConfigSetAggregate,
    AppConfigSetChangeValuesCmdPayload, GlobalConfigSetChangeValuesCmdPayload,
    CannotCreateDuplicateConfigSetError,GlobalConfigurationSetNotFoundError,
    CannotCreateOverridePreviousVersionConfigSetError,
    InvalidGlobalConfigurationSetError, CouldNotStoreConfigSetError,
    InvalidAppConfigurationSetError, AppConfigurationSetNotFoundError,
    ParameterNotFoundError
} from "@mojaloop/platform-configuration-bc-domain-lib";

// // Extend express request to include our security fields
// declare module "express-serve-static-core" {
//     export interface Request {
//         securityContext: null | CallSecurityContext;
//     }
// }

const APPCONFIGSET_URL_RESOURCE_NAME = "appConfigSets";
const GLOBALCONFIGSET_URL_RESOURCE_NAME = "globalConfigSets";

export class ExpressRoutes {
    private _logger: ILogger;
    // private _tokenHelper: TokenHelper;
    private _agg: ConfigSetAggregate;
    private _router = express.Router();


    constructor(aggregate: ConfigSetAggregate, logger: ILogger) {
        this._logger = logger;
        // this._tokenHelper = tokenHelper;
        this._agg = aggregate;

        // inject authentication - all request below this require a valid token
        //this._mainRouter.use(this._authenticationMiddleware.bind(this));

        // bind routes - per app config sets
        this._router.post( `/${APPCONFIGSET_URL_RESOURCE_NAME}/bootstrap`, this._appConfigSet_postBootstrap.bind(this));
        this._router.get(`/${APPCONFIGSET_URL_RESOURCE_NAME}/:env`, this._appConfigSet_getAll.bind(this));
        this._router.get(`/${APPCONFIGSET_URL_RESOURCE_NAME}/:env/:bc/:app`, this._appConfigSet_getById.bind(this));
        this._router.post(`/${APPCONFIGSET_URL_RESOURCE_NAME}/:env/:bc/:app/setvalues`, this._appConfigSet_setValues.bind(this));

        // bind routes - global config sets
        this._router.post(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/bootstrap`, this._globalConfigSet_postBootstrap.bind(this));
        this._router.get(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/:env`, this._globalConfigSet_get.bind(this));
        this._router.post(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/:env/setvalues`, this._globalConfigSet_setValues.bind(this));
    }

    get Router(): express.Router {
        return this._router;
    }

    // handlers - per app config sets
    private async _appConfigSet_postBootstrap(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const data: AppConfigurationSet = req.body;
        this._logger.debug(data);

        await this._agg.processCreateAppConfigSetCmd(data).then((success) => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (error instanceof CannotCreateDuplicateConfigSetError) {
                res.status(409).json({
                    status: "error",
                    msg: "received duplicated app configuration set, cannot update"
                });
            } else if (error instanceof CannotCreateOverridePreviousVersionConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "received app configuration set has lower id than latest available, cannot update"
                });
            } else if (error instanceof InvalidAppConfigurationSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "invalid app configuration set"
                });
            } else {
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }

    private async _appConfigSet_getAll(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;

        // validate
        if (!envParam || envParam==="" ) {
            this._logger.warn("Invalid environment param received");
            res.sendStatus(400);
            return;
        }

        const retAppConfigSets: AppConfigurationSet[] = await this._agg.getAllAppConfigSets(envParam);

        if (!retAppConfigSets) {
            this._logger.debug("no app configuration sets found");
            res.sendStatus(404);
            return;
        }
        res.status(200).json(retAppConfigSets);
    }

    private async _appConfigSet_getById(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;
        const ownerBcParam = req.params["bc"] ?? null;
        const ownerAppParam = req.params["app"] ?? null;
        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;

        // validate
        if (!envParam || envParam==="" || !ownerBcParam || ownerBcParam==="" || !ownerAppParam || ownerAppParam==="") {
            this._logger.warn("Invalid app configuration set request received");
            res.sendStatus(400);
            return;
        }

        let retAppConfigSet: AppConfigurationSet | null;

        if (!versionParam) {
            retAppConfigSet = await this._agg.getLatestAppConfigSet(envParam, ownerBcParam, ownerAppParam);
        } else {
            retAppConfigSet = await this._agg.getAppConfigSetVersion(envParam, ownerBcParam, ownerAppParam, versionParam);
        }

        if (!retAppConfigSet) {
            this._logger.debug("app configuration set not found");
            res.sendStatus(404);
            return;
        }
        res.status(200).json(retAppConfigSet);
        return;
    }

    private async _appConfigSet_setValues(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;
        const ownerBcParam = req.params["bc"] ?? null;
        const ownerAppParam = req.params["app"] ?? null;

        // optional query param
        //const versionParam = req.query["version"]?.toString() ?? null;

        // validate owner, app and version
        if (!envParam || envParam==="" || !ownerBcParam || ownerBcParam==="" || !ownerAppParam || ownerAppParam==="") {
            res.status(400).json({
                status: "error",
                msg: "invalid request"
            });
            return;
        }

        const cmdPayload: AppConfigSetChangeValuesCmdPayload = {
            environmentName: envParam,
            boundedContextName: ownerBcParam,
            applicationName: ownerAppParam,
            version: null, // disallow updates to older versions for now
            newValues: req.body
        };

        await this._agg.processChangeAppConfigSetValuesCmd(cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch(error => {
            // TODO should return multiple errors
            if (error instanceof AppConfigurationSetNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "app configuration set not found"
                });
            }else if (error instanceof ParameterNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "parameter set not found"
                });
            }else if (error instanceof CouldNotStoreConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "Not able to store app configuration set"
                });
            }else{
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }

    // handlers - global config sets
    private async _globalConfigSet_postBootstrap(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const data: GlobalConfigurationSet = req.body;
        this._logger.debug(data);

        await this._agg.processCreateGlobalConfigSetCmd(data).then((success) => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (error instanceof CannotCreateDuplicateConfigSetError) {
                res.status(409).json({
                    status: "error",
                    msg: "received duplicated global configuration set, cannot update"
                });
            } else if (error instanceof CannotCreateOverridePreviousVersionConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "received global configuration set has lower id than latest available, cannot update"
                });
            } else if (error instanceof InvalidGlobalConfigurationSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "invalid global configuration set"
                });
            } else {
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }

    private async _globalConfigSet_get(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;

        // optional query param
        // const versionParam = req.query["version"]?.toString() ?? null;

        // validate
        if (!envParam || envParam==="" ) {
            this._logger.warn("Invalid global configuration set request received");
            res.send(400).json({
                status: "error",
                msg: "Invalid global configuration set request received"
            });
            return;
        }

        let retGlobalConfigSet: GlobalConfigurationSet | null;

        // if (!versionParam) {
            retGlobalConfigSet = await this._agg.getLatestGlobalConfigSet(envParam);
        // } else {
        //     retAppConfigSet = await this._agg.getAppConfigSetSpecificVersion(envParam, ownerBcParam, ownerAppParam, versionParam);
        // }

        if (!retGlobalConfigSet) {
            this._logger.debug("global configset not found");
            res.sendStatus(404);
            return;
        }
        res.status(200).json(retGlobalConfigSet);
        return;
    }

    private async _globalConfigSet_setValues(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;

        if (!envParam || envParam==="") {
            res.status(400).json({
                status: "error",
                msg: "invalid request"
            });
            return;
        }

        const cmdPayload: GlobalConfigSetChangeValuesCmdPayload = {
            environmentName: envParam,
            version: null, // disallow updates to older versions for now
            newValues: req.body
        };

        await this._agg.processChangeGlobalConfigSetValuesCmd(cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch(error => {
            // TODO should return multiple errors
            if (error instanceof GlobalConfigurationSetNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "global configuration set not found"
                });
            }else if (error instanceof ParameterNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "parameter set not found"
                });
            }else if (error instanceof CouldNotStoreConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "Not able to store global configuration set"
                });
            }else{
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }
}
