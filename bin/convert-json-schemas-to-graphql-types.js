#!/usr/bin/env node
const fs = require('fs-extra');
const path = require('path');
const yargs = require('yargs');
const { printSchema } = require('graphql');
const { jsonSchemasToGraphqlSchema } = require('../src/index');

async function convertDir (dir, asJs) {
  // It is intentional to allow the user to specify the directory to be read.
  // The directory comes from the command line argument
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const files = await fs.readdir(dir);
  const schemas = [];

  for (const file of files) {
    // It is intentional to allow the user to specify the directory to be read.
    // The directory comes from the command line argument
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const schemaContents = await fs.readFile(path.join(dir, file));
    schemas.push(JSON.parse(schemaContents));
  }

  const schema = jsonSchemasToGraphqlSchema(schemas);
  const printed = printSchema(schema);

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
