const {
  GraphQLObjectType, GraphQLString, GraphQLInt,
  GraphQLFloat, GraphQLList, GraphQLBoolean
} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const mapValues = require('lodash/mapValues');

function mapBasicAttributeType (type, attributeName) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    case 'boolean': return GraphQLBoolean;
    default: throw new Error(`A JSON Schema attribute type ${type} on attribute ${attributeName} does not have a known GraphQL mapping`);
  }
}

function mapType (context, attributeDefinition, attributeName) {
  if (attributeDefinition.type === 'array') {
    const elementType = mapType(context, attributeDefinition.items, attributeName);
    return GraphQLList(elementType);
  }

  const typeReference = attributeDefinition.$ref;
  if (typeReference) {
    const referencedType = context.types[typeReference];
    if (!referencedType) {
      throw new UnknownTypeReference(`The referenced type ${typeReference} is unknown`);
    }
    return referencedType;
  }

  return mapBasicAttributeType(attributeDefinition.type, attributeName);
}

function fieldsFromSchema (context, schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    };
  }

  return mapValues(schema.properties, function (attributeDefinition, attributeName) {
    return {type: mapType(context, attributeDefinition, attributeName)};
  });
}

function convert (context, schema) {
  const graphQlType = new GraphQLObjectType({
    name: schema.id || schema.title,
    fields: fieldsFromSchema(context, schema)
  });

  if (schema.id) {
    context.types[schema.id] = graphQlType;
  }

  return graphQlType;
}

function newContext () {
  return {
    types: []
  };
}

class UnknownTypeReference extends Error {
  constructor (message) {
    super(message);
    this.name = 'UnknownTypeReference';
  }
}

module.exports = {
  UnknownTypeReference,
  newContext,
  convert
};
