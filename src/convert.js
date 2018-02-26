const {GraphQLObjectType, GraphQLString} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const mapValues = require('lodash/mapValues');

function fieldsFromSchema (schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    }; 
  }

  return mapValues(schema.properties, function (value, key) {
    return {
      type: GraphQLString
    };
  });
}

function convert (schema) {
  return new GraphQLObjectType({
    name: schema.title,
    fields: fieldsFromSchema(schema)
  });
}

module.exports = convert;