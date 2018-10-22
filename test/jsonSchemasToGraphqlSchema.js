const {test} = require('ava');
const {buildSchema} = require('graphql');

const { jsonSchemasToGraphqlSchema } = require('../src/index');
const { compareSchemas } = require('./converter');

test('Nested object types', async function (test) {
  const schema = {
    id: 'Schema',
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    definitions: {},
    properties: {
      object: {
        type: 'object',
        properties: {
          attribute: {
            type: 'object',
            properties: {
              firstField: {
                type: 'integer'
              },
              secondField: {
                type: 'integer'
              }
            }
          }
        }
      }
    }
  };

  const graphqlSchema = jsonSchemasToGraphqlSchema([schema]);
  const expectedSchema = buildSchema(`
  type Mutation {
    Schema(input: SchemaIn): String
  }

  type Query {
    Schema: Schema
  }

  type Schema {
    object: SchemaObject
  }

  input SchemaIn {
    object: SchemaObjectIn
  }

  type SchemaObject {
    attribute: SchemaObjectAttribute
  }

  type SchemaObjectAttribute {
      firstField: Int
      secondField: Int
  }

  input SchemaObjectIn {
    attribute: SchemaObjectAttributeIn
  }

  input SchemaObjectAttributeIn {
    firstField: Int
    secondField: Int
  }
  `);
  await compareSchemas(test, graphqlSchema, expectedSchema);
});
