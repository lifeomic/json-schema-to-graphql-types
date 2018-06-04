JSON Schema to GraphQL Types Converter
======================================
[![Greenkeeper badge](https://badges.greenkeeper.io/lifeomic/json-schema-to-graphql-types.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/lifeomic/json-schema-to-graphql-types.svg?branch=master)](https://travis-ci.org/lifeomic/json-schema-to-graphql-types)
[![Coverage Status](https://coveralls.io/repos/github/lifeomic/json-schema-to-graphql-types/badge.svg?branch=master)](https://coveralls.io/github/lifeomic/json-schema-to-graphql-types?branch=master)

This tools will convert a directory of JSON Schemas into set of GraphQL types.
To use it, do the following:

    npm install -g @lifeomic/json-schema-to-graphql-types
    convert-json-schemas-to-graphql-types <some-dir-with-json-schemas>

When that is run, the tool will output a list of GraphQL types that match the
types in the JSON schemas. After generating the types, you'll need to create
Query and Mutation types to complete you schema and then add resolvers as
needed.
