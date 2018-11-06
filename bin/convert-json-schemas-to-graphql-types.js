#!/usr/bin/env node
const fs = require('fs-extra');
const path = require('path');
const yargs = require('yargs');
const { printSchema } = require('graphql');
const { jsonSchemasToGraphqlSchema } = require('../src/index');
const validators = require('../src/error-handling');

async function convertDir (dir, asJs) {
  // It is intentional to allow the user to specify the directory to be read.
  // The directory comes from the command line argument
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const files = await validators.validatePathName(dir); // If valid, will return an array of file names
  const schemas = [];

  for (const file of files) {
    const schemaContents = await validators.validateJSONSyntax(file, dir); // If valid, will return parsed JSON-schema from file
    schemas.push(schemaContents);
  }

  const schema = jsonSchemasToGraphqlSchema(schemas); // MH input: array of json-schemas; output: one graphQLSchema
  const printed = printSchema(schema); // MH converts graphQLSchema into readable string

  // Strip out the Query type because it's not needed
  const withoutQuery = printed.replace(/^type Query {[^}]*}/m, '');
  const withoutMutation = withoutQuery.replace(/^type Mutation {[^}]*}/m, '');

  if (asJs) {
    console.log(`'use strict';\nmodule.exports = \`\n${withoutMutation}\`;\n`);
  } else {
    console.log(withoutQuery);
  }
}

async function run () {
  const argv = yargs
    .boolean('asJs')
    .argv;
  const dir = argv._[0];
  await convertDir(dir, argv.asJs);
}

run()
  .catch(function (e) {
    console.error(e);
    process.exitCode = 1;
  });
