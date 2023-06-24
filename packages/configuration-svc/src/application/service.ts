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

"use strict";
import {existsSync} from "fs";
import express, {Express} from "express";
import * as util from "util";
import {Server} from "net";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import process from "process";
import {FileConfigSetRepo} from "../infrastructure/file_configset_repo";
import {
    ConfigSetAggregate,
    IBoundedContextConfigSetRepository,
    IGlobalConfigSetRepository
} from "@mojaloop/platform-configuration-bc-domain-lib";
import {AuthorizationClient, TokenHelper} from "@mojaloop/security-bc-client-lib";
import {IAuthorizationClient} from "@mojaloop/security-bc-public-types-lib";
import {
    AuditClient,
    KafkaAuditClientDispatcher,
    LocalAuditClientCryptoProvider
} from "@mojaloop/auditing-bc-client-lib";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {PlatformConfigsRoutes} from "./routes";
import {IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {MLKafkaJsonProducer} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {PrivilegesDefinition} from "./privileges";
import {bootstrapGlobalConfigSet} from "../global_configs/global_config_schema";

const BC_NAME = "platform-configuration-bc";
const APP_NAME = "configuration-svc";
const APP_VERSION = process.env.npm_package_version || "0.0.1";
const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL:LogLevel = process.env["LOG_LEVEL"] as LogLevel || LogLevel.DEBUG;

const SVC_DEFAULT_HTTP_PORT = 3100;

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
const AUDIT_KEY_FILE_PATH = process.env["AUDIT_KEY_FILE_PATH"] || "/app/data/audit_private_key.pem";
const CONFIG_REPO_STORAGE_FILE_PATH = process.env["CONFIG_REPO_STORAGE_FILE_PATH"] || "/app/data/configSetRepoTempStorageFile.json";

const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
//const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token"; // TODO this should not be known here, libs that use the base should add the suffix
const AUTH_N_TOKEN_ISSUER_NAME = process.env["AUTH_N_TOKEN_ISSUER_NAME"] || "mojaloop.vnext.dev.default_issuer";
const AUTH_N_TOKEN_AUDIENCE = process.env["AUTH_N_TOKEN_AUDIENCE"] || "mojaloop.vnext.dev.default_audience";

const AUTH_N_SVC_JWKS_URL = process.env["AUTH_N_SVC_JWKS_URL"] || `${AUTH_N_SVC_BASEURL}/.well-known/jwks.json`;

const AUTH_Z_SVC_BASEURL = process.env["AUTH_Z_SVC_BASEURL"] || "http://localhost:3202";


const kafkaProducerOptions = {
    kafkaBrokerList: KAFKA_URL
};

let globalLogger: ILogger;


export class Service {
    static logger: ILogger;
    static app: Express;
    static authorizationClient: IAuthorizationClient;
    static auditClient: IAuditClient;
    static bcConfigRepo:IBoundedContextConfigSetRepository;
    static globalConfigRepo:IGlobalConfigSetRepository;
    static messageProducer: IMessageProducer;
    static aggregate:ConfigSetAggregate;
    static tokenHelper: TokenHelper;
    static expressServer: Server;

    static async start(
        logger?: ILogger,
        authorizationClient?: IAuthorizationClient,
        auditClient?:IAuditClient,
        bcConfigRepo?:IBoundedContextConfigSetRepository,
        globalConfigRepo?:IGlobalConfigSetRepository,
        messageProducer?: IMessageProducer
    ):Promise<void>{
        console.log(`${APP_NAME} - service starting with PID: ${process.pid}`);

        if (!logger) {
            logger = new KafkaLogger(
                BC_NAME,
                APP_NAME,
                APP_VERSION,
                kafkaProducerOptions,
                KAFKA_LOGS_TOPIC,
                LOG_LEVEL
            );
            await (logger as KafkaLogger).init();
        }
        globalLogger = this.logger = logger.createChild("Service");

        // start auditClient
        if (!auditClient) {
            if (!existsSync(AUDIT_KEY_FILE_PATH)) {
                if (PRODUCTION_MODE) process.exit(9);
                // create e tmp file
                LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(AUDIT_KEY_FILE_PATH, 2048);
            }
            const auditLogger = logger.createChild("AuditLogger");
            auditLogger.setLogLevel(LogLevel.INFO);
            const cryptoProvider = new LocalAuditClientCryptoProvider(AUDIT_KEY_FILE_PATH);
            const auditDispatcher = new KafkaAuditClientDispatcher(kafkaProducerOptions, KAFKA_AUDITS_TOPIC, auditLogger);
            // NOTE: to pass the same kafka logger to the audit client, make sure the logger is started/initialised already
            auditClient = new AuditClient(BC_NAME, APP_NAME, APP_VERSION, cryptoProvider, auditDispatcher);
            await auditClient.init();
        }
        this.auditClient = auditClient;

        // authorization client
        if (!authorizationClient) {
            // setup privileges - bootstrap app privs and get priv/role associations
            authorizationClient = new AuthorizationClient(BC_NAME, APP_NAME, APP_VERSION, AUTH_Z_SVC_BASEURL, logger.createChild("AuthorizationClient"));
            authorizationClient.addPrivilegesArray(PrivilegesDefinition);
            await (authorizationClient as AuthorizationClient).bootstrap(true);
            await (authorizationClient as AuthorizationClient).fetch();

        }
        this.authorizationClient = authorizationClient;

        if(!bcConfigRepo || !globalConfigRepo){
            globalConfigRepo = bcConfigRepo  = new FileConfigSetRepo(CONFIG_REPO_STORAGE_FILE_PATH, logger);
            await bcConfigRepo.init();
        }
        this.bcConfigRepo = bcConfigRepo;
        this.globalConfigRepo = globalConfigRepo;



        if (!messageProducer) {
            const producerLogger = logger.createChild("producerLogger");
            producerLogger.setLogLevel(LogLevel.INFO);
            messageProducer = new MLKafkaJsonProducer(kafkaProducerOptions, producerLogger);
            await messageProducer.connect();
        }
        this.messageProducer = messageProducer;


        this.aggregate = new ConfigSetAggregate(
            this.bcConfigRepo,
            this.globalConfigRepo,
            this.auditClient,
            this.authorizationClient,
            this.messageProducer,
            this.logger
        );

        // bootstrap global configs if not present
        await bootstrapGlobalConfigSet(this.aggregate, this.globalConfigRepo);

        // token helper
        this.tokenHelper = new TokenHelper(AUTH_N_SVC_JWKS_URL, logger, AUTH_N_TOKEN_ISSUER_NAME, AUTH_N_TOKEN_AUDIENCE);
        await this.tokenHelper.init();

        await this.setupAndStartExpress();
    }

    static async setupAndStartExpress(): Promise<void> {
        return new Promise<void>(resolve => {
            // Start express server
            this.app = express();
            this.app.use(express.json()); // for parsing application/json
            this.app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

            const routes = new PlatformConfigsRoutes(this.aggregate, this.logger, this.tokenHelper);

            this.app.use(routes.Router);

            this.app.use((req: express.Request, res: express.Response) => {
                // catch all
                res.sendStatus(404);
            });

            let portNum = SVC_DEFAULT_HTTP_PORT;
            if (process.env["SVC_HTTP_PORT"] && !isNaN(parseInt(process.env["SVC_HTTP_PORT"]))) {
                portNum = parseInt(process.env["SVC_HTTP_PORT"]);
            }

            this.expressServer = this.app.listen(SVC_DEFAULT_HTTP_PORT, () => {
                this.logger.info(`🚀 Server ready on port ${SVC_DEFAULT_HTTP_PORT}`);
                this.logger.info(`${APP_NAME} server v: ${APP_VERSION} started`);

                resolve();
            });
        });
    }


    static async stop() {
        if (this.auditClient) await this.auditClient.destroy();
        if (this.messageProducer) await this.messageProducer.destroy();
        if (this.bcConfigRepo) await this.bcConfigRepo.destroy();
        if (this.globalConfigRepo) await this.globalConfigRepo.destroy();

        if (this.logger && this.logger instanceof KafkaLogger) await this.logger.destroy();

        const expressClose = util.promisify(this.expressServer.close);
        if (this.expressServer) await expressClose();
    }
}



/**
 * process termination and cleanup
 */

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    console.info(`Service - ${signal} received - cleaning up...`);
    let clean_exit = false;
    setTimeout(() => {
        clean_exit || process.exit(99);
    }, 5000);

    // call graceful stop routine
    await Service.stop();

    clean_exit = true;
    process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals);
//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals);

//do something when BC is closing
process.on("exit", async () => {
    globalLogger.info("Microservice - exiting...");
});
process.on("uncaughtException", (err: Error) => {
    globalLogger.error(err);
    console.log("UncaughtException - EXITING...");
    process.exit(999);
});
