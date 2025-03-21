/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Contributors
--------------
This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
Mojaloop Foundation for an example). Those individuals should have
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.

* Mojaloop Foundation
- Name Surname <name.surname@mojaloop.io>

* Crosslake
- Pedro Sousa Barreto <pedrob@crosslaketech.com>
*****/

"use strict";

import {ConfigParameterTypes} from "./general_config_types";

export type Currency = {
    // 3-letter currency code as in ISO 4217 - EUR, USD, etc
    code: string;
    // 3-number currency number as in ISO 4217 - 978, 840, etc
    num: string;
    // Number of decimals for currency (for most currencies this will be 2)
    decimals: number;
}

export const GLOBAL_FIXED_PARAMETERS_DEFINITION: {
    [key: string]: { name: string; jtdSchema: string; description: string; type: ConfigParameterTypes }
} = {
    "CURRENCIES":{
        name: "CURRENCIES",
        type: ConfigParameterTypes.LIST,
        description: "Global Currencies list as per ISO 4217 in format: {code: string, num: number, decimals: number}",
        jtdSchema: JSON.stringify({
            properties: {
                code: {type: "string"},
                num: {type: "int32"},
                decimals: {type: "int32"},
            }
        })
    }
};

