const {test} = require('ava');
const Ajv = require('ajv');
const {newContext, convert, UnknownTypeReference} = require('../src/converter');
const {
  parse, execute, buildSchema,
  GraphQLSchema, GraphQLObjectType, introspectionQuery
} = require('graphql');

function cannonicalize (introspectionResult) {
  introspectionResult.data.__schema.directives.sort(function (a, b) {
    return a.name < b.name;
  });
  return introspectionResult;
}

async function testConversion (test, jsonSchema, expectedTypeName, expectedType, context) {
  const ajv = new Ajv();
  ajv.addSchema(jsonSchema);

  context = context || newContext();
  const convertedType = convert(context, jsonSchema);
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
  const emptyType = {
    id: 'Empty',
    type: 'object',
    properties: { }
  };

  const expectedType = `type Empty {
    _typesWithoutFieldsAreNotAllowed_: String
  }`;

  await testConversion(test, emptyType, 'Empty', expectedType);
});

async function testAttrbuteType (test, jsonType, graphQLType) {
  const simpleType = {
    id: 'Simple',
    type: 'object',
    properties: {
      attribute: {type: jsonType}
    }
  };

  const expectedType = `type Simple {
    attribute: ${graphQLType}
  }`;

  await testConversion(test, simpleType, 'Simple', expectedType);
}

test('string attributes', async function (test) {
  await testAttrbuteType(test, 'string', 'String');
});

test('integer attributes', async function (test) {
  await testAttrbuteType(test, 'integer', 'Int');
});

test('float attributes', async function (test) {
  await testAttrbuteType(test, 'number', 'Float');
});

test('array attributes', async function (test) {
  const simpleType = {
    id: 'Array',
    type: 'object',
    properties: {
      attribute: {
        type: 'array',
        items: {
          type: 'integer'
        }
      }
    }
  };

  const expectedType = `type Array {
    attribute: [Int]
  }`;

  await testConversion(test, simpleType, 'Array', expectedType);
});

test('Unknown $ref attribute type', async function (test) {
  const simpleType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        $ref: 'UnknownType'
      }
    }
  };

  const expectedType = `type Ref {
    attribute: UnknownType
  }`;

  const schema = testConversion(test, simpleType, 'Ref', expectedType);
  await test.throws(schema, UnknownTypeReference);
});

test('Known $ref attribute type', async function (test) {
  const otherType = {
    id: 'OtherType',
    type: 'object',
    properties: {
      attribute: {
        type: 'string'
      }
    }
  };

  const refType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        $ref: 'OtherType'
      }
    }
  };

  const expectedType = `
  type OtherType {
    attribute: String
  }

  type Ref {
    attribute: OtherType
  }`;

  const context = newContext();
  convert(context, otherType);
  await testConversion(test, refType, 'Ref', expectedType, context);
});

test('Known $ref array attribute type', async function (test) {
  const otherType = {
    id: 'OtherType',
    type: 'object',
    properties: {
      attribute: {
        type: 'string'
      }
    }
  };

  const refType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        type: 'array',
        items: {
          $ref: 'OtherType'
        }
      }
    }
  };

  const expectedType = `
  type OtherType {
    attribute: String
  }

  type Ref {
    attribute: [OtherType]
  }`;

  const context = newContext();
  convert(context, otherType);
  await testConversion(test, refType, 'Ref', expectedType, context);
});
