const {
  GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLNonNull,
  GraphQLFloat, GraphQLList, GraphQLBoolean, GraphQLEnumType
} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const keyBy = require('lodash/keyBy');
const mapValues = require('lodash/mapValues');
const map = require('lodash/map');
const uppercamelcase = require('uppercamelcase');
const camelcase = require('camelcase');
const escodegen = require('escodegen');

function mapBasicAttributeType (type, attributeName) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    case 'boolean': return GraphQLBoolean;
    default: throw new Error(`A JSON Schema attribute type ${type} on attribute ${attributeName} does not have a known GraphQL mapping`);
  }
}

function toSafeEnumKey (value) {
  if (/^[0-9]/.test(value)) {
    value = 'VALUE_' + value;
  }
  return value.replace(/[^_a-zA-Z0-9]/g, '_');
}

function buildEnumType (context, attributeName, enumValues) {
  const enumName = uppercamelcase(attributeName);
  const graphqlToJsonMap = keyBy(enumValues, toSafeEnumKey);

  context.enumMaps.set(attributeName, graphqlToJsonMap);
  return new GraphQLEnumType({
    name: enumName,
    values: mapValues(graphqlToJsonMap, function (value) {
      return {value};
    })
  });
}

function mapType (context, attributeDefinition, attributeName) {
  if (attributeDefinition.type === 'array') {
    const elementType = mapType(context, attributeDefinition.items, attributeName);
    return GraphQLList(GraphQLNonNull(elementType));
  }

  const enumValues = attributeDefinition.enum;
  if (enumValues) {
    if (attributeDefinition.type !== 'string') {
      throw new Error(`The attribute ${attributeName} not supported because only conversion of string based enumertions are implemented`);
    }

    return buildEnumType(context, attributeName, enumValues);
  }

  const typeReference = attributeDefinition.$ref;
  if (typeReference) {
    const referencedType = context.types.get(typeReference);
    if (!referencedType) {
      throw new UnknownTypeReference(`The referenced type ${typeReference} is unknown`);
    }
    return referencedType;
  }

  return mapBasicAttributeType(attributeDefinition.type, attributeName);
}

function fieldsFromSchema (context, parentTypeName, schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    };
  }

  return mapValues(schema.properties, function (attributeDefinition, attributeName) {
    const qualifiedAttributeName = `${parentTypeName}.${attributeName}`;
    return {type: mapType(context, attributeDefinition, qualifiedAttributeName)};
  });
}

function convert (context, schema) {
  const typeName = schema.id || schema.title;
  const graphQlType = new GraphQLObjectType({
    name: typeName,
    fields: () => fieldsFromSchema(context, typeName, schema)
  });

  if (schema.id) {
    context.types.set(typeName, graphQlType);
  }

  return graphQlType;
}

function newContext () {
  return {
    types: new Map(),
    enumMaps: new Map()
  };
}

class UnknownTypeReference extends Error {
  constructor (message) {
    super(message);
    this.name = 'UnknownTypeReference';
  }
}

function getConvertEnumFromGraphQLCode (context, attributePath) {
  const valueMap = context.enumMaps.get(attributePath);

  const cases = map(valueMap, function (jsonValue, graphQlValue) {
    return {
      type: 'SwitchCase',
      test: {type: 'Literal', value: graphQlValue},
      consequent: [{
        type: 'ReturnStatement',
        argument: {type: 'Literal', value: jsonValue}
      }]
    };
  });

  const functionName = camelcase(`convert${attributePath}FromGraphQL`);

  const valueIdentifier = { type: 'Identifier', name: 'value' };
  return escodegen.generate({
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name: functionName },
    params: [ valueIdentifier ],
    body: {
      type: 'BlockStatement',
      body: [ {
        type: 'SwitchStatement',
        discriminant: valueIdentifier,
        cases
      }]
    }
  });
}

module.exports = {
  UnknownTypeReference,
  newContext,
  convert,
  getConvertEnumFromGraphQLCode
};
