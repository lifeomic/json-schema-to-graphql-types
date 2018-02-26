const {test} = require('ava');
const convert = require('../src/convert');
const {
  parse, validate, execute, buildSchema, typeFromAST,
  GraphQLSchema, GraphQLObjectType, introspectionQuery
} = require('graphql');

const EMPTY_OBJECT = {
  title: "Empty",
  type: "object",
  properties: { }
};

const SIMPLE_OBJECT = {
  title: "Simple",
  type: "object",
  properties: { 
    attribute: "string"
  }
};

function cannonicalize (introspectionResult) {
  introspectionResult.data.__schema.directives.sort(function (a, b) {
    return a.name < b.name;
  });
  return introspectionResult;
}

async function testConversion (test, jsonSchema, expectedTypeName, expectedType) {
  const convertedType = convert(jsonSchema);
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      findOne: {
        type: convertedType
      }
    }
  });

  const schema = new GraphQLSchema({query: queryType});

  const exepectedSchema = buildSchema(`
    ${expectedType}
    type Query {
      findOne: ${expectedTypeName}
    }
  `);

  const introspection = await execute({
    schema,
    document: parse(introspectionQuery)
  });

  const expectedIntrospection = await execute({
    schema: exepectedSchema,
    document: parse(introspectionQuery)
  });
  
  test.deepEqual(cannonicalize(introspection), cannonicalize(expectedIntrospection));

}

test('empty object', async function (test) {
  const expectedType = `type Empty {
    _typesWithoutFieldsAreNotAllowed_: String
  }`;

  await testConversion(test, EMPTY_OBJECT, 'Empty', expectedType);
});

test('simple object', async function (test) {
  const expectedType = `type Simple {
    attribute: String
  }`;

  await testConversion(test, SIMPLE_OBJECT, 'Simple', expectedType);
});