const {GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLList} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const mapValues = require('lodash/mapValues');

function mapBasicAttributeType (type, attributeName) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    default: throw new Error(`A JSON Schema attribute type ${type} on attribute ${attributeName} does not have a known GraphQL mapping`);
  }
}

function fieldsFromSchema (context, schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    };
  }

  return mapValues(schema.properties, function (attributeDefinition, key) {
    if (attributeDefinition.type === 'array') {
      const elementType = mapBasicAttributeType(attributeDefinition.items.type, key);
      return {
        type: GraphQLList(elementType)
      };
    }

    const typeReference = attributeDefinition.$ref;
    if (typeReference) {
      const referencedType = context.types[typeReference];
      if (!referencedType) {
        throw new UnknownTypeReference(`The referenced type ${typeReference} is unknown`);
      }
      return {type: referencedType};
    }

    return {type: mapBasicAttributeType(attributeDefinition.type, key)};
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
