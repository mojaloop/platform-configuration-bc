"use strict"

const { name } = require("./package.json");
let packageName = name.replace("@mojaloop", "");

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverage: true,
  collectCoverageFrom: ["./src/**/*.ts"],
  coverageReporters: ["json", "lcov"],
  coverageDirectory: `../../coverage/${packageName}/`,
  clearMocks: true
}
