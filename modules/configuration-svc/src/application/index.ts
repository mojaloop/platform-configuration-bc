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

'use strict'

import express from "express";
import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-logging-client-lib";
import {IConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {InMemoryConfigSetRepo} from "../infrastructure/inmemory_configset_repo";
import {ConfigSetAggregate} from "../domain/configset_agg";

import {
    CannotCreateDuplicateConfigSetError,
    CannotCreateOverridePreviousVersionConfigSetError,
    ConfigurationSetNotFoundError, CouldNotStoreConfigSetError, InvalidConfigurationSetError, ParameterNotFoundError
} from "../domain/errors";

const logger: ILogger = new ConsoleLogger();
const repo: InMemoryConfigSetRepo = new InMemoryConfigSetRepo(logger);
const configSetAgg: ConfigSetAggregate = new ConfigSetAggregate(repo, logger);

const app = express();

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post("/configsets", async (req: express.Request, res: express.Response, next: express.NextFunction)=> {
    const data: IConfigurationSet = req.body;
    logger.debug(data);

    await configSetAgg.createNewConfigSetVersion(data).then((success) => {
        res.status(200).json({status: "ok"});
    }).catch((error:Error) => {
        if(error instanceof CannotCreateDuplicateConfigSetError) {
            res.status(400).json({
                status: "error",
                msg: "received duplicated configuration, cannot update"
            });
        }else if(error instanceof CannotCreateOverridePreviousVersionConfigSetError){
            res.status(400).json({
                status: "error",
                msg: "received configuration has lower id than latest available, cannot update"
            });
        }else if(error instanceof InvalidConfigurationSetError){
            res.status(400).json({
                status: "error",
                msg: "invalid configuration set"
            });
        }else{
            res.status(400).json({
                status: "error",
                msg: "unknown error"
            });
        }
    });
});

app.get("/configsets/:bc/:app/:version?", async (req: express.Request, res: express.Response, next: express.NextFunction)=> {
    const ownerBcParam = req.params["bc"] ?? null;
    const ownerAppParam = req.params["app"] ?? null;
    const versionParam = req.params["version"] ?? -1;

    // validate
    if (!ownerBcParam || ownerBcParam === "" || !ownerAppParam || ownerAppParam === "" || isNaN(parseInt(versionParam))){
        logger.warn("Invalid configset request received");
        return res.status(400).send();
    }

    let retConfigSet: IConfigurationSet | null;
    const version = parseInt(versionParam);

    if(version == -1){
        retConfigSet = await configSetAgg.getLatestVersion(ownerBcParam, ownerAppParam);
    } else {
        retConfigSet = await configSetAgg.getSpecificVersion(ownerBcParam, ownerAppParam, version);
    }

    if(!retConfigSet){
        logger.debug("configset not found");
        return res.status(404).send();
    }
    return res.status(200).json(retConfigSet);
});

app.patch("/configsets/:bc/:app/:valtype/:paramname", async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> => {
    const ownerBcParam = req.params["bc"] ?? null;
    const ownerAppParam = req.params["app"] ?? null;

    const valtypeParam = req.params["valtype"] ?? null;
    const paramNameParam = req.params["paramname"] ?? null;
    const data:any = req.body;

    let invalidReq = false;
    // validate owner, app and version
    if (!ownerBcParam || ownerBcParam === "" || !ownerAppParam || ownerAppParam === ""){
        invalidReq = true;
    }

    if (!valtypeParam || (valtypeParam.toUpperCase() !== "PARAM" && valtypeParam.toUpperCase() !== "FEATUREFLAG" && valtypeParam.toUpperCase() !== "SECRET")){
        invalidReq = true;
    }

    if (!paramNameParam || paramNameParam === ""){
        invalidReq = true;
    }

    if (!data || data["value"] === undefined){
        invalidReq = true;
    }

    if(invalidReq){
        logger.debug("invalid request received to patch configSet");
        return res.status(400).send({status: "error", msg: "invalid request received"});
    }


    let fn: (bcName: string, appName: string, paramName:string, paramValue:any)=>Promise<void>;
    if(valtypeParam.toUpperCase() === "PARAM"){
        fn = configSetAgg.updateParamValue.bind(configSetAgg);//(ownerBcParam, ownerAppParam, version, paramNameParam, data["value"]);
    }else if(valtypeParam.toUpperCase() === "FEATUREFLAG"){
        fn = configSetAgg.updateFeatureFlagValue.bind(configSetAgg);//(ownerBcParam, ownerAppParam, version, paramNameParam, data["value"]);
    }else if(valtypeParam.toUpperCase() === "SECRET"){
        fn = configSetAgg.updateParamValue.bind(configSetAgg);//(ownerBcParam, ownerAppParam, version, paramNameParam, data["value"]);
    }else{
        logger.error("invalid request received to patch configSet");
        return res.status(400).send({status: "error", msg: "invalid request received"});
    }

    await fn(ownerBcParam, ownerAppParam, paramNameParam, data["value"]).then(()=> {
        return res.status(200).send({status: "ok"});
    }).catch((error:Error)=>{
        let statusCode = 400;
        let errorMsg:string;
        if(error instanceof ConfigurationSetNotFoundError) {
            statusCode = 404;
            errorMsg = "ConfigurationSetNotFoundError";
        }else if(error instanceof CouldNotStoreConfigSetError){
            errorMsg = "CouldNotStoreConfigSetError";
        }else{
            errorMsg = "unkonwn error";
        }
        return res.status(statusCode).send({status: "error", msg: errorMsg});
    })


});

app.use((req, res) => {
    // catch all
    res.send(404);
})


const server = app.listen(3000, () =>
        console.log(`
🚀 Server ready at: http://localhost:3000`),
)

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    logger.info(`Service - ${signal} received - cleaning up...`);
    process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals.bind(this));

//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals.bind(this));

//do something when app is closing
process.on('exit', () => {
    logger.info("Microservice - exiting...");
});

