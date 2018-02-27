const fs = require('fs-extra');
const {newContext, convert, UnknownTypeReference} = require('../src/converter');
const path = require('path');
const yargs = require('yargs');
const {
  GraphQLSchema, GraphQLObjectType, printSchema
} = require('graphql');

function convertSchemas (context, schemas) {
  const referencedUnknownType = [];
  let successful = 0;
  for (const schema of schemas) {
    try {
      convert(context, schema);
      successful++;
    } catch (error) {
      if (error instanceof UnknownTypeReference) {
        referencedUnknownType.push(schema);
        continue;
      }
      throw new Error(`Failed to convert schema ${schema.id}: ${error}`);
    }
  }

  if (successful > 0 && referencedUnknownType.length > 0) {
    convertSchemas(context, referencedUnknownType);
    return;
  }

  // If there is a type that was not handled, then attempt it
  // again just to generate an error for debugging
  if (referencedUnknownType.length > 0) {
    convert(context, referencedUnknownType[0]);
  }
}

async function convertDir (dir, asJs) {
  const files = await fs.readdir(dir);
  const schemas = [];

  for (const file of files) {
    const schemaContents = await fs.readFile(path.join(dir, file));
    schemas.push(JSON.parse(schemaContents));
  }

  const context = newContext();
  convertSchemas(context, schemas);

  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: () => {
      const result = {};
      for (const [name, type] of context.types.entries()) {
        result[name] = {type};
      }
      return result;
    }
  });
  const schema = new GraphQLSchema({query: queryType});
  const printed = printSchema(schema);

  // Strip out the Query type because it's not needed
  const withoutQuery = printed.replace(/^type Query {[^}]*}/m, '');

  if (asJs) {
    console.log(`module.exports = \`\n${withoutQuery}\``);
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
