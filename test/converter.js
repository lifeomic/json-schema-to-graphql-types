const {test} = require('ava');
const Ajv = require('ajv');
const {INPUT_SUFFIX, newContext, convert, UnknownTypeReference, getConvertEnumFromGraphQLCode} = require('../src/converter');
const {
  parse, execute, buildSchema, printSchema,
  GraphQLSchema, GraphQLObjectType, introspectionQuery
} = require('graphql');
const tmp = require('tmp-promise');
const fs = require('fs-extra');

function cannonicalize (introspectionResult) {
  introspectionResult.data.__schema.directives.sort(function (a, b) {
    return a.name < b.name;
  });

  for (const type of introspectionResult.data.__schema.types) {
    if (type.fields) {
      type.fields.sort(function (a, b) {
        return a.name < b.name;
      });
    }
    if (type.inputFields) {
      type.inputFields.sort(function (a, b) {
        return a.name < b.name;
      });
    }
  }
  return introspectionResult;
}

function makeSchemaForType (output, input) {
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      findOne: { type: output }
    }
  });

  const mutationType = input ? new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      create: {
        args: {input: {type: input}},
        type: output
      }
    }
  }) : undefined;

  return new GraphQLSchema({query: queryType, mutation: mutationType});
}

async function testConversion (test, jsonSchema, expectedTypeName, expectedType, context, skipInput) {
  const ajv = new Ajv();
  ajv.addSchema(jsonSchema);

  context = context || newContext();
  const {output, input} = convert(context, jsonSchema);
  const schema = makeSchemaForType(output, skipInput ? undefined : input);

  const exepectedSchema = buildSchema(`
    ${expectedType}
    type Query {
      findOne: ${expectedTypeName}
    }

    ${skipInput ? '' : `
    type Mutation {
      create(input: ${expectedTypeName}${INPUT_SUFFIX}): ${expectedTypeName}
    }`}
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
  }
  
  input Empty${INPUT_SUFFIX} {
    _typesWithoutFieldsAreNotAllowed_: String
  }
  `;

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

  const expectedType = `
  type Simple {
    attribute: ${graphQLType}
  }
  
  input Simple${INPUT_SUFFIX} {
    attribute: ${graphQLType}
  }
  `;

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

test('boolean attributes', async function (test) {
  await testAttrbuteType(test, 'boolean', 'Boolean');
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
    attribute: [Int!]
  }

  input Array${INPUT_SUFFIX} {
    attribute: [Int!]
  }
  `;

  await testConversion(test, simpleType, 'Array', expectedType);
});

test('required attributes', async function (test) {
  const simpleType = {
    id: 'Array',
    type: 'object',
    properties: {
      attribute1: {
        type: 'integer'
      },
      attribute2: {
        type: 'integer'
      },
      attribute3: {
        type: 'integer'
      }
    },
    required: ['attribute1', 'attribute3']
  };

  const expectedType = `type Array {
    attribute1: Int!
    attribute2: Int
    attribute3: Int!
  }

  input Array${INPUT_SUFFIX} {
    attribute1: Int!
    attribute2: Int
    attribute3: Int!
  }
  `;

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

  input OtherType${INPUT_SUFFIX} {
    attribute: String
  }

  type Ref {
    attribute: OtherType
  }

  input Ref${INPUT_SUFFIX} {
    attribute: OtherType${INPUT_SUFFIX}
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

  input OtherType${INPUT_SUFFIX} {
    attribute: String
  }

  type Ref {
    attribute: [OtherType!]
  }

  input Ref${INPUT_SUFFIX} {
    attribute: [OtherType${INPUT_SUFFIX}!]
  }`;

  const context = newContext();
  convert(context, otherType);
  await testConversion(test, refType, 'Ref', expectedType, context);
});

test('Circular $ref attribute types', async function (test) {
  const leftType = {
    id: 'Left',
    type: 'object',
    properties: {
      right: {
        $ref: 'Right'
      }
    }
  };

  const rightType = {
    id: 'Right',
    type: 'object',
    properties: {
      left: {
        $ref: 'Left'
      }
    }
  };

  const expectedType = `
  type Right {
    left: Left
  }

  type Left {
    right: Right
  }

  input Right${INPUT_SUFFIX} {
    left: Left${INPUT_SUFFIX}
  }

  input Left${INPUT_SUFFIX}{
    right: Right${INPUT_SUFFIX}
  }
  `;

  const context = newContext();
  convert(context, rightType);
  await testConversion(test, leftType, 'Left', expectedType, context);
});

test('Enumeration attribute types', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      height: {
        type: 'string',
        enum: ['tall', 'average', 'short']
      }
    }
  };

  const expectedType = `
  enum PersonHeight {
    tall, average, short
  }
  type Person {
    height: PersonHeight
  }
  input Person${INPUT_SUFFIX} {
    height: PersonHeight
  }`;

  const context = newContext();
  await testConversion(test, personType, 'Person', expectedType, context);
});

test('Enumeration attribute with forbidden characters', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      height: {
        type: 'string',
        enum: ['super-tall', 'average', 'really-really-short']
      }
    }
  };

  const expectedType = `
  enum PersonHeight {
    super_tall, average, really_really_short
  }
  type Person {
    height: PersonHeight
  }
  input Person${INPUT_SUFFIX} {
    height: PersonHeight
  }`;

  const context = newContext();
  await testConversion(test, personType, 'Person', expectedType, context);
});

test('Enumeration attribute with comparison symbols', async function (test) {
  const personType = {
    id: 'Comparator',
    type: 'object',
    properties: {
      operator: {
        type: 'string',
        enum: ['<', '<=', '>=', '>']
      }
    }
  };

  const expectedType = `
  enum ComparatorOperator {
    LT, LTE, GTE, GT
  }
  type Comparator {
    operator: ComparatorOperator
  }
  input Comparator${INPUT_SUFFIX} {
    operator: ComparatorOperator
  }`;

  const context = newContext();
  await testConversion(test, personType, 'Comparator', expectedType, context);
});

test('Enumeration attribute with numeric keys', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      age: {
        type: 'string',
        enum: ['1', '10', '100']
      }
    }
  };

  const expectedType = `
  enum PersonAge {
    VALUE_1, VALUE_10, VALUE_100
  }
  type Person {
    age: PersonAge
  }
  input Person${INPUT_SUFFIX} {
    age: PersonAge
  }
  `;

  const context = newContext();
  await testConversion(test, personType, 'Person', expectedType, context);
});

test('Enumeration conversion function', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      age: {
        type: 'string',
        enum: ['1', '10', '100']
      }
    }
  };

  const context = newContext();
  const {output, input} = convert(context, personType);
  // Make a schema an print it just to force the field 'thunks'
  // to be resolved
  const schema = makeSchemaForType(output, input);
  printSchema(schema);

  const convertCode = getConvertEnumFromGraphQLCode(context, 'Person.age');

  const convertModule = await tmp.file();
  // It is ok to ignore this non-literal require because the path is coming from
  // the temp file creation code above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(convertModule.fd, `module.exports = ${convertCode}`);
  // It is ok to ignore this non-literal require because the path is coming from
  // the temp file creation code above.
  // eslint-disable-next-line security/detect-non-literal-require
  const fromGraphQl = require(convertModule.path);
  test.is(fromGraphQl('VALUE_1'), '1');
  test.is(fromGraphQl('VALUE_10'), '10');
  test.is(fromGraphQl('VALUE_100'), '100');
});

test('map switch schemas to unions', async function (test) {
  const parentType = {
    id: 'Parent',
    type: 'object',
    properties: {
      type: {
        type: 'string'
      },
      name: {
        type: 'string'
      }
    }
  };

  const childType = {
    id: 'Child',
    type: 'object',
    properties: {
      type: {
        type: 'string'
      },
      name: {
        type: 'string'
      },
      parent: {
        $ref: 'Parent'
      },
      friend: {
        $ref: 'ParentOrChild'
      }
    }
  };

  const unionType = {
    id: 'ParentOrChild',
    switch: [
      {
        if: {
          properties: {
            type: {
              constant: 'Parent'
            }
          }
        },
        then: {
          $ref: 'Parent'
        }
      },
      {
        if: {
          properties: {
            type: {
              constant: 'Child'
            }
          }
        },
        then: {
          $ref: 'Child'
        }
      }
    ]
  };

  const expectedType = `
  type Parent {
    name: String
    type: String
  }
  type Child {
    name: String
    type: String
    parent: Parent
    friend: ParentOrChild
  }
  union ParentOrChild = Parent | Child
  input Parent${INPUT_SUFFIX} {
    name: String
    type: String
  }
  input Child${INPUT_SUFFIX} {
    name: String
    type: String
    parent: Parent${INPUT_SUFFIX}
  }
  `;

  const context = newContext();
  convert(context, unionType);
  convert(context, parentType);
  await testConversion(test, childType, 'Child', expectedType, context);
});
