import { int, QueryResult } from 'neo4j-driver';
import revalidator from 'revalidator';
import { NeogmaConstraintError } from '../Errors/NeogmaConstraintError';
import { NeogmaError } from '../Errors/NeogmaError';
import { NeogmaInstanceValidationError } from '../Errors/NeogmaInstanceValidationError';
import { NeogmaNotFoundError } from '../Errors/NeogmaNotFoundError';
import { Neogma } from '../Neogma';
import { CreateRelationshipParamsI, Neo4jSupportedTypes, QueryRunner, Runnable, Where, WhereParamsByIdentifierI, WhereParamsI } from '../QueryRunner';
import { BindParam } from '../QueryRunner/BindParam';

const getResultsArray = <T>(result: QueryResult, identifier: string): T[] => {
    return result.records.map((v) => v.get(identifier).properties);
};

const getResultArrayFromEdit = <T>(result: QueryResult, identifier: string): T[] => {
    return result.records.map((v) => v.get(identifier).properties);
};

const getNodesDeleted = (result: QueryResult): number => {
    return result.summary.counters.updates().nodesDeleted;
};

/** the type of the properties to be added to a relationship */
export type RelationshipPropertiesI = Record<string, Neo4jSupportedTypes>;

interface GenericConfiguration {
    session?: Runnable | null;
}

/** used for defining the type of the RelatedNodesToAssociate interface, to be passed as the second generic to ModelFactory */
export interface ModelRelatedNodesI<
    /** the type of the related model */
    RelatedModel extends {
        createOne: (
            data: any,
            configuration?: GenericConfiguration,
        ) => Promise<any>;
    },
    /** the instance of the related model */
    RelatedInstance,
    /** properties for the relationship */
    RelationshipProperties extends RelationshipPropertiesI = {}
    > {
    /** interface of the data to create */
    CreateData: Parameters<RelatedModel['createOne']>[0] & RelationshipProperties;
    /** interface of the properties of the relationship */
    RelationshipProperties: RelationshipProperties;
    Instance: RelatedInstance;
}

/** to be used in create functions where the related nodes can be passed for creation */
export type RelatedNodesCreationParamI<
    Properties,
    RelatedNodesToAssociateI extends Record<string, any>
    > = {
        [key in keyof Partial<RelatedNodesToAssociateI>]: RelationshipTypePropertyForCreateI<Properties, RelatedNodesToAssociateI[key]['RelationshipProperties']>;
    };

/** the type to be used in RelationshipTypePropertyForCreateI.where */
type RelationshipTypePropertyForCreateWhereI<
    RelationshipProperties extends RelationshipPropertiesI,
    > = {
        /** where for the target nodes */
        params: WhereParamsI;
        /** whether to merge instead of create the relationship */
        merge?: boolean;
        relationshipProperties?: RelationshipProperties;
    };
/** the type of the relationship along with the properties, so the proper relationship and/or nodes can be created */
type RelationshipTypePropertyForCreateI
    <
    Properties,
    RelationshipProperties extends RelationshipPropertiesI
    > = {
        /** create new nodes and create a relationship with them */
        properties?: Array<Properties & RelationshipProperties>;
        /** configuration for merging instead of creating the properties/relationships */
        propertiesMergeConfig?: {
            /** merge the created nodes instead of creating them */
            nodes?: boolean;
            /** merge the relationship with the created properties instead of creating it */
            relationship?: boolean;
        }
        /** create a relationship with nodes which are matched by the where */
        where?: RelationshipTypePropertyForCreateWhereI<RelationshipProperties> |
        Array<RelationshipTypePropertyForCreateWhereI<RelationshipProperties>>;
    };

/** the type for the Relationship configuration of a Model */
export type RelationshipsI<
    RelatedNodesToAssociateI extends Record<string, any>,
    > = Array<{
        /** the related model. It could be the object of the model, or "self" for this model */
        model: NeogmaModel<any, any, any, any> | 'self', // we can't use the actual NeogmaModel type due to circular references
        /** the name of the relationship */
        name: CreateRelationshipParamsI['relationship']['name'];
        /** the direction of the relationship */
        direction: 'out' | 'in' | 'none';
        alias: keyof RelatedNodesToAssociateI;
        properties: Record<string, {
            property: string, // TODO property is keyof...
            schema: any
        }>;
    }>;

/** parameters when creating nodes */
type CreateDataParamsI = GenericConfiguration & {
    /** whether to merge instead of creating */
    merge?: boolean;
    /** validate all parent and children instances. default to true */
    validate?: boolean;
};

/** type used for creating nodes. It includes their Properties and Related Nodes */
type CreateDataI<
    Properties,
    RelatedNodesToAssociateI extends Record<string, any>,
    > = Properties & Partial<RelatedNodesCreationParamI<Properties, RelatedNodesToAssociateI>>;

/** the statics of a Neogma Model */
interface NeogmaModelStaticsI<
    Properties extends object,
    RelatedNodesToAssociateI extends Record<string, any>,
    MethodsI extends Record<string, any> = {},
    CreateData = CreateDataI<Properties, RelatedNodesToAssociateI>,
    Instance = NeogmaInstance<Properties, RelatedNodesToAssociateI, MethodsI>,
    > {
    getLabel: () => string | string[];
    getPrimaryKeyField: () => string;
    getModelName: () => string;
    __build: (
        data: CreateData,
        params: {
            status: 'new' | 'existing'
        }
    ) => Instance & Partial<RelatedNodesToAssociateI>;
    build: (
        data: CreateData,
    ) => Instance;
    createOne: (
        data: CreateData,
        configuration?: CreateDataParamsI,
    ) => Promise<Instance>;
    createMany: (
        data: CreateData[],
        configuration?: CreateDataParamsI,
    ) => Promise<Instance[]>;
    getRelationshipByAlias: (
        alias: keyof RelatedNodesToAssociateI
    ) => RelationshipsI<any>[0];
    update: (
        data: Partial<Properties>,
        params?: GenericConfiguration & {
            where?: WhereParamsI;
            /** defaults to false. Whether to return the properties of the nodes after the update. If it's false, the first entry of the return value of this function will be an empty array */
            return?: boolean;
        }
    ) => Promise<[Instance[], QueryResult]>;
    updateRelationship: (
        data: object,
        params: {
            alias: keyof RelatedNodesToAssociateI;
            where?: {
                source?: WhereParamsI;
                target?: WhereParamsI;
                relationship?: WhereParamsI;
            };
            session?: GenericConfiguration['session'];
        }
    ) => Promise<QueryResult>;
    delete: (
        configuration?: GenericConfiguration & {
            detach?: boolean,
            where: WhereParamsI;
        }
    ) => Promise<number>;
    findMany: (
        params?: GenericConfiguration & {
            /** where params for the nodes of this Model */
            where?: WhereParamsI;
            limit?: number;
            order?: Array<[keyof Properties, 'ASC' | 'DESC']>;
        },
    ) => Promise<Instance[]>;
    findOne: (
        params?: GenericConfiguration & {
            /** where params for the nodes of this Model */
            where?: WhereParamsI;
            order?: Array<[keyof Properties, 'ASC' | 'DESC']>;
        },
    ) => Promise<Instance>;
    relateTo: (
        params: {
            alias: keyof RelatedNodesToAssociateI;
            where: {
                source: WhereParamsI;
                target: WhereParamsI;
            };
            properties?: object;
            /** throws an error if the number of created relationships don't equal to this number */
            assertCreatedRelationships?: number;
            session?: GenericConfiguration['session'];
        }
    ) => Promise<number>;
    createRelationship: (
        params: CreateRelationshipParamsI & {
            /** throws an error if the number of created relationships don't equal to this number */
            assertCreatedRelationships?: number;
        }
    ) => Promise<number>;
    getLabelFromRelationshipModel: (
        relationshipModel: NeogmaModel<any, any, any, any> | 'self',
    ) => string | string[];
    getRelationshipModel: (
        relationshipModel: NeogmaModel<any, any, any, any> | 'self',
    ) => NeogmaModel<any, any, any, any>;
    assertPrimaryKeyField: (
        operation: string
    ) => void;
}
/** the methods of a Neogma Instance */
interface NeogmaInstanceMethodsI<
    Properties,
    RelatedNodesToAssociateI extends Record<string, any>,
    MethodsI extends Record<string, any>,
    Instance = NeogmaInstance<Properties, RelatedNodesToAssociateI, MethodsI>
    > {
    __existsInDatabase: boolean;
    dataValues: Properties;
    changed: Record<keyof Properties, boolean>;
    getDataValues: () => Properties;
    save: (
        configuration?: CreateDataParamsI
    ) => Promise<Instance>;
    validate: () => Promise<void>;
    updateRelationship: (
        data: object,
        params: {
            alias: keyof RelatedNodesToAssociateI;
            where?: {
                target?: WhereParamsI;
                relationship?: WhereParamsI;
            };
            session?: GenericConfiguration['session'];
        }
    ) => Promise<QueryResult>;
    delete: (
        configuration?: GenericConfiguration & {
            detach?: boolean,
        }
    ) => Promise<number>;
    relateTo: (
        params: {
            alias: keyof RelatedNodesToAssociateI;
            where: WhereParamsI;
            properties?: object;
            /** throws an error if the number of created relationships don't equal to this number */
            assertCreatedRelationships?: number;
            session?: GenericConfiguration['session'];
        }
    ) => Promise<number>;
}

/** the type of instance of the Model */
export type NeogmaInstance<
    /** the properties used in the Model */
    Properties,
    RelatedNodesToAssociateI extends Record<string, any>,
    /** the Methods used in the Model */
    MethodsI extends Record<string, any> = {},
    > = Properties & NeogmaInstanceMethodsI<Properties, RelatedNodesToAssociateI, MethodsI> & MethodsI;

/** the type of a Neogma Model */
export type NeogmaModel<
    Properties extends object,
    RelatedNodesToAssociateI extends Record<string, any>,
    MethodsI extends Record<string, any> = {},
    StaticsI extends Record<string, any> = {},
    > = NeogmaModelStaticsI<Properties, RelatedNodesToAssociateI, MethodsI> & StaticsI;

export type FindManyIncludeI<AliasKeys> = {
    alias: AliasKeys;
    /** where params for the nodes of the included Model */
    where?: WhereParamsI;
    /** default false */
    optional?: boolean;
    include?: FindManyIncludeI<any>;
};

/**
 * a function which returns a class with the model operation functions for the given Properties
 * RelatedNodesToAssociateI are the corresponding Nodes for Relationships
 */
export const ModelFactory = <
    /** the base Properties of the node */
    Properties extends object,
    /** related nodes to associate. Label-ModelRelatedNodesI pairs */
    RelatedNodesToAssociateI extends Record<string, any>,
    /** interface for the statics of the model */
    StaticsI extends Record<string, any> = {},
    /** interface for the methods of the instance */
    MethodsI extends Record<string, any> = {},
    >(
        parameters: {
            /** the schema for the validation */
            schema: {
                [index in keyof Properties]: Revalidator.ISchema<Properties> | Revalidator.JSONSchema<Properties>;
            };
            /** the label of the nodes */
            label: string | string[];
            /** statics of the Model */
            statics?: StaticsI;
            /** method of the Instance */
            methods?: MethodsI;
            /** the id key of this model. Is required in order to perform specific instance methods */
            primaryKeyField?: Extract<keyof Properties, string>;
            /** relationships with other models or itself */
            relationships?: RelationshipsI<RelatedNodesToAssociateI>;
        },
        neogma: Neogma,
): NeogmaModel<Properties, RelatedNodesToAssociateI, MethodsI, StaticsI> => {

    const { label: modelLabel, primaryKeyField: modelPrimaryKeyField, schema } = parameters;
    const statics = parameters.statics || {};
    const methods = parameters.methods || {};
    const relationships = parameters.relationships || [];
    /* helper name for queries */
    const modelName = (modelLabel instanceof Array ? modelLabel : [modelLabel]).join('');
    const schemaKeys = new Set(Object.keys(schema));
    const relationshipAliases = relationships.map(({ alias }) => alias);

    const queryRunner = neogma.getQueryRunner();

    // enforce unique relationship aliases
    const allRelationshipAlias = relationships.map(({ alias }) => alias);
    if (allRelationshipAlias.length !== new Set(allRelationshipAlias).size) {
        throw new NeogmaConstraintError(`Relationship aliases must be unique`, {
            description: relationships,
            actual: allRelationshipAlias,
            expected: [...new Set(allRelationshipAlias)],
        });
    }

    type CreateData = CreateDataI<Properties, RelatedNodesToAssociateI>;

    type InstanceMethodsI = NeogmaInstanceMethodsI<Properties, RelatedNodesToAssociateI, MethodsI>;
    type ModelStaticsI = NeogmaModelStaticsI<Properties, RelatedNodesToAssociateI, MethodsI>;
    type Instance = NeogmaInstance<Properties, RelatedNodesToAssociateI, MethodsI>;

    const Model = class ModelClass implements InstanceMethodsI {

        /** whether this instance already exists in the database or it new */
        public __existsInDatabase: InstanceMethodsI['__existsInDatabase'];

        /** the data of Properties */
        public dataValues: InstanceMethodsI['dataValues'];
        /** the changed properties of this instance, to be taken into account when saving it */
        public changed: InstanceMethodsI['changed'];

        /**
         * @returns {String} - the label of this Model
         */
        public static getLabel(): ReturnType<ModelStaticsI['getLabel']> {
            return modelLabel;
        }

        /**
         * 
         * @returns {String} - the primary key field of this Model
         */
        public static getPrimaryKeyField(): ReturnType<ModelStaticsI['getPrimaryKeyField']> {
            return modelPrimaryKeyField;
        }

        public static getModelName(): ReturnType<ModelStaticsI['getModelName']> {
            return modelName;
        }

        public getDataValues(): ReturnType<InstanceMethodsI['getDataValues']> {
            const data: Properties = Object.keys(schema).reduce((acc, key) => {
                acc[key] = this[key];
                return acc;
            }, {} as Properties);

            return data;
        }

        /**
         * validates the given instance
         * @throws NeogmaInstanceValidationError
         */
        public async validate(): ReturnType<InstanceMethodsI['validate']> {
            const validationResult = revalidator.validate(this.getDataValues(), {
                type: 'object',
                properties: schema,
            });

            if (validationResult.errors.length) {
                throw new NeogmaInstanceValidationError(null, {
                    model: Model,
                    errors: validationResult.errors,
                });
            }
        }

        /**
         * builds data Instance by data, setting information fields appropriately
         * status 'new' can be called publicly (hence the .build wrapper), but 'existing' should be used only internally when building instances after finding nodes from the database
         */
        public static __build(
            data: Parameters<ModelStaticsI['__build']>[0],
            { status }: Parameters<ModelStaticsI['__build']>[1]
        ): ReturnType<ModelStaticsI['__build']> {
            const instance = new Model() as Instance;

            instance.__existsInDatabase = status === 'existing';

            instance.dataValues = {} as Properties;
            instance.changed = {} as Record<keyof Properties, boolean>;

            for (const _key of [...Object.keys(schema), ...Object.values(relationshipAliases)]) {
                const key = _key as keyof typeof schema;

                /* set dataValues using data */
                if (data.hasOwnProperty(key)) {
                    instance.dataValues[key] = data[key];
                    instance.changed[key] = status === 'new';
                }

                /* set the setters and getters of the keys */
                Object.defineProperty(instance, key, {
                    get: () => {
                        return instance.dataValues[key];
                    },
                    set: (val) => {
                        instance.dataValues[key] = val;
                        instance.changed[key] = true;
                    },
                });
            }
            return instance;
        }

        /**
         * creates a new Instance of this Model, which can be saved to the database
         */
        public static build(
            data: Parameters<ModelStaticsI['build']>[0]
        ): ReturnType<ModelStaticsI['build']> {
            return Model.__build(data, { status: 'new' });
        }

        /**
         * saves an instance to the database. If it's new it creates it, and if it already exists it edits it
         */
        public async save(
            _configuration?: Parameters<InstanceMethodsI['save']>[0]
        ): ReturnType<InstanceMethodsI['save']> {
            const instance = this as Instance;
            const configuration = {
                validate: true,
                ..._configuration,
            };

            if (configuration.validate) {
                await instance.validate();
            }

            if (instance.__existsInDatabase) {
                Model.assertPrimaryKeyField('updating via save');
                // if it exists in the database, update the node by only the fields which have changed
                const updateData = Object.entries(instance.changed).reduce((val, [key, changed]) => {
                    if (changed && schemaKeys.has(key)) {
                        val[key] = instance[key];
                    }
                    return val;
                }, {});

                await Model.update(
                    updateData,
                    {
                        return: false,
                        session: configuration?.session,
                        where: {
                            [modelPrimaryKeyField]: instance[modelPrimaryKeyField],
                        },
                    }
                );

                // set all changed to false
                for (const key in this.changed) {
                    if (!this.changed.hasOwnProperty(key)) { continue; }
                    this.changed[key] = false;
                }
                return instance;
            } else {
                // if it's a new one - it doesn't exist in the database yet, need to create it
                return Model.createOne(instance, configuration);
            }
        }

        /**
         * creates the node, also creating its children nodes and relationships
         * @param {Properties} data - the data to create, potentially including data for related nodes to be created
         * @param {GenericConfiguration} configuration - query configuration
         * @returns {Properties} - the created data
         */
        public static async createOne(
            data: Parameters<ModelStaticsI['createOne']>[0],
            configuration?: Parameters<ModelStaticsI['createOne']>[1],
        ): ReturnType<ModelStaticsI['createOne']> {
            const instances = await Model.createMany([data], configuration);
            return instances[0];
        }

        public static async createMany(
            data: Parameters<ModelStaticsI['createMany']>[0],
            configuration?: Parameters<ModelStaticsI['createMany']>[1],
        ): ReturnType<ModelStaticsI['createMany']> {
            configuration = configuration || {};
            const validate = !(configuration.validate === false);

            const createOrMerge = (merge?: boolean) => merge ? 'MERGE' : 'CREATE';

            const statementParts: string[] = [];

            /** the bind param of the query */
            const bindParam = new BindParam();
            // used only for unique names
            const identifiers = new BindParam();

            /** identifiers and the where/relationship configuration for a relationship to be created */
            const toRelateByIdentifier: {
                [identifier: string]: Array<{
                    /** the where params to use */
                    where: WhereParamsI;
                    /** relatinship information */
                    relationship: Omit<RelationshipsI<any>[0], 'alias'>;
                    /** relationship properties */
                    properties?: object;
                    /** merge the relationship instead of creating it */
                    merge?: boolean;
                }>;
            } = {};

            const instances: Instance[] = [];
            const bulkCreateData: Properties[] = [];

            const addCreateToStatement = async (
                model: ModelStaticsI,
                dataToUse: Array<CreateData | Instance>,
                /** whether to merge instead of creating the properties */
                mergeProperties?: boolean,
                parentNode?: {
                    identifier: string;
                    relationship: Omit<RelationshipsI<any>[0], 'alias'>;
                    /** whether to merge the relationship instead of creating it */
                    mergeRelationship?: boolean;
                }
            ) => {
                for (const createData of dataToUse) {
                    /** identifier for the node to create */
                    const identifier = identifiers.getUniqueNameAndAdd('node', null);
                    const label = QueryRunner.getNormalizedLabels(model.getLabel());

                    const instance = (
                        createData instanceof (model as any) ? createData : model.__build(createData, { status: 'new' })
                    ) as Instance & Partial<RelatedNodesToAssociateI>;

                    instance.__existsInDatabase = true;
                    // set all changed to false as it's going to be saved
                    for (const key in instance.changed) {
                        if (!instance.changed.hasOwnProperty(key)) { continue; }
                        instance.changed[key] = false;
                    }

                    // push to instances only if it's the root node
                    if (!parentNode) {
                        instances.push(instance);
                    }

                    if (validate) {
                        await instance.validate();
                    }

                    const relatedNodesToAssociate: {
                        [key in keyof RelatedNodesToAssociateI]?: RelationshipTypePropertyForCreateI<any, any>
                    } = {};
                    for (const alias of relationshipAliases) {
                        if (instance[alias]) {
                            relatedNodesToAssociate[alias] = instance[alias];
                        }
                    }

                    if (relatedNodesToAssociate || parentNode || mergeProperties) {
                        /* if it has related nodes to associated or it has a parent node or it's to be merged, create it as a single node, with an identifier */

                        const identifierWithLabel = QueryRunner.getIdentifierWithLabel(identifier, label);

                        statementParts.push(`
                            ${createOrMerge(mergeProperties)} (${identifierWithLabel} ${QueryRunner.getPropertiesWithParams(instance.getDataValues(), bindParam)})
                        `);

                        /** if it has a parent node, also create a relationship with it */
                        if (parentNode) {
                            const { relationship, identifier: parentIdentifier } = parentNode;
                            const keysToUse = Object.keys(relationship.properties);
                            const relationshipProperties = {};
                            // tslint:disable-next-line:forin
                            for (const key in keysToUse) {
                                relationshipProperties[relationship.properties[key].property] = instance[key];
                            }

                            /* set an identifier only if we need to create relationship properties */
                            const relationshipIdentifier = relationshipProperties && identifiers.getUniqueNameAndAdd('r', null);
                            const directionAndNameString = QueryRunner.getRelationshipDirectionAndName({
                                direction: relationship.direction,
                                name: relationship.name,
                                identifier: relationshipIdentifier,
                            });
                            statementParts.push(`
                                ${createOrMerge(parentNode.mergeRelationship)} (${parentIdentifier})${directionAndNameString}(${identifier})
                            `);
                            if (relationshipProperties) {
                                /* create the relationship properties */
                                const relationshipPropertiesParam = bindParam.getUniqueNameAndAdd('relationshipProperty', relationshipProperties);
                                statementParts.push(`
                                    SET ${relationshipIdentifier} += $${relationshipPropertiesParam}
                                `);
                            }
                        }

                        /** create the related nodes */
                        for (const relationshipAlias in relatedNodesToAssociate) {
                            if (!relatedNodesToAssociate.hasOwnProperty(relationshipAlias)) { continue; }

                            const relatedNodesData: RelationshipTypePropertyForCreateI<any, any> = relatedNodesToAssociate[relationshipAlias];
                            const relationship = model.getRelationshipByAlias(relationshipAlias);
                            const otherModel = model.getRelationshipModel(relationship.model) as ModelStaticsI;

                            if (relatedNodesData.properties) {
                                await addCreateToStatement(
                                    otherModel,
                                    relatedNodesData.properties,
                                    relatedNodesData.propertiesMergeConfig?.nodes,
                                    {
                                        identifier,
                                        relationship,
                                        mergeRelationship: relatedNodesData.propertiesMergeConfig?.relationship,
                                    }
                                );
                            }
                            if (relatedNodesData.where) {
                                const whereArr = relatedNodesData.where instanceof Array ? relatedNodesData.where : [relatedNodesData.where];

                                for (const whereEntry of whereArr) {
                                    if (!toRelateByIdentifier[identifier]) {
                                        toRelateByIdentifier[identifier] = [];
                                    }

                                    // add the info to toRelateByIdentifier
                                    toRelateByIdentifier[identifier].push({
                                        relationship,
                                        where: whereEntry.params,
                                        properties: whereEntry.relationshipProperties,
                                        merge: whereEntry.merge,
                                    });
                                }
                            }
                        }
                    } else {
                        /* if it doesn't have related nodes to associated and it doesn't have a parent node add it to the array so they'll be bulk created */
                        bulkCreateData.push(instance.getDataValues());
                    }
                }
            };

            await addCreateToStatement(Model, data, configuration?.merge, null);

            // parse data to bulk create
            if (bulkCreateData.length) {
                const bulkCreateIdentifier = identifiers.getUniqueNameAndAdd('bulkCreateNodes', null);
                const bulkCreateOptionsParam = bindParam.getUniqueNameAndAdd('bulkCreateOptions', bulkCreateData);
                const bulkCreateDataIdentifier = identifiers.getUniqueNameAndAdd('bulkCreateData', null);
                statementParts.unshift(`
                    UNWIND $${bulkCreateOptionsParam} as ${bulkCreateDataIdentifier}
                `);
                statementParts.push(`
                    CREATE (${QueryRunner.getIdentifierWithLabel(bulkCreateIdentifier, QueryRunner.getNormalizedLabels(modelLabel))})
                    SET ${bulkCreateIdentifier} += ${bulkCreateDataIdentifier}
                `);
            }

            // parse toRelateByIdentifier
            const relationshipByWhereParts = [];
            for (const identifier of Object.keys(toRelateByIdentifier)) {
                /** to be used in the WITH clause */
                const allNeededIdentifiers = Object.keys(toRelateByIdentifier);
                for (const relateParameters of toRelateByIdentifier[identifier]) {
                    const relationship = relateParameters.relationship;
                    const relationshipIdentifier = identifiers.getUniqueNameAndAdd('r', null);
                    const targetNodeModel = Model.getRelationshipModel(relationship.model);
                    const targetNodeLabel = QueryRunner.getNormalizedLabels(targetNodeModel.getLabel());
                    const targetNodeIdentifier = identifiers.getUniqueNameAndAdd('targetNode', null);

                    relationshipByWhereParts.push(
                        `WITH DISTINCT ${allNeededIdentifiers.join(', ')}`,
                        `MATCH (${QueryRunner.getIdentifierWithLabel(targetNodeIdentifier, targetNodeLabel)})`,
                        `WHERE ${new Where({ [targetNodeIdentifier]: relateParameters.where }, bindParam).statement}`,
                        `${createOrMerge(relateParameters.merge)} (${identifier})${QueryRunner.getRelationshipDirectionAndName({
                            direction: relationship.direction,
                            name: relationship.name,
                            identifier: relationshipIdentifier,
                        })}(${targetNodeIdentifier})`
                    );
                    if (relateParameters.properties) {
                        /* create the relationship properties */
                        const relationshipPropertiesParam = bindParam.getUniqueNameAndAdd('relationshipProperty', relateParameters.properties);
                        relationshipByWhereParts.push(`
                                SET ${relationshipIdentifier} += $${relationshipPropertiesParam}
                            `);
                    }

                    // remove this relateParameters from the array
                    toRelateByIdentifier[identifier] = toRelateByIdentifier[identifier].filter((r) => r !== relateParameters);
                }
                // remove the identifier from the object
                delete toRelateByIdentifier[identifier];
            }

            statementParts.push(...relationshipByWhereParts);

            const statement = statementParts.join(' ');
            const queryParams = bindParam.get();

            await queryRunner.run(statement, queryParams, configuration?.session);

            return instances;
        }

        public static getRelationshipByAlias = (
            alias: Parameters<ModelStaticsI['getRelationshipByAlias']>[0]
        ): ReturnType<ModelStaticsI['getRelationshipByAlias']> => {
            const relationship = relationships.find((r) => r.alias === alias);

            if (!alias) {
                throw new NeogmaNotFoundError(`The relationship of the alias ${alias} can't be found for the model ${modelLabel}`);
            }

            return {
                model: relationship.model,
                direction: relationship.direction,
                name: relationship.name,
                alias,
                properties: relationship.properties,
            };
        }

        public static async update(
            data: Parameters<ModelStaticsI['update']>[0],
            params?: Parameters<ModelStaticsI['update']>[1]
        ): ReturnType<ModelStaticsI['update']> {
            const normalizedLabel = QueryRunner.getNormalizedLabels(modelLabel);
            const identifier = 'node';

            const where = params?.where ? {
                [identifier]: params.where,
            } : null;

            const res = await queryRunner.update(
                {
                    label: normalizedLabel,
                    data,
                    where,
                    identifier,
                    session: params?.session,
                }
            );
            const nodeProperties = params?.return ? getResultArrayFromEdit<Properties>(res, identifier) : [];

            const instances = nodeProperties.map((v) => Model.__build(v, { status: 'existing' }));
            return [instances, res] as [Instance[], QueryResult];
        }

        public static async updateRelationship(
            data: Parameters<ModelStaticsI['updateRelationship']>[0],
            params: Parameters<ModelStaticsI['updateRelationship']>[1]
        ): ReturnType<ModelStaticsI['updateRelationship']> {
            const relationship = relationships.find((r) => r.alias === params.alias);

            if (!relationship) {
                throw new NeogmaNotFoundError(`The relationship of the alias ${params.alias} can't be found for the model ${modelLabel}`);
            }

            const identifiers = {
                source: 'source',
                target: 'target',
                relationship: 'r',
            };
            const labels = {
                source: QueryRunner.getNormalizedLabels(modelLabel),
                target: QueryRunner.getNormalizedLabels(Model.getLabelFromRelationshipModel(relationship.model)),
            };

            const where: Where = new Where({});
            if (params.where?.source) {
                where.addParams({ [identifiers.source]: params.where.source });
            }
            if (params.where?.target) {
                where.addParams({ [identifiers.target]: params.where.target });
            }
            if (params.where?.relationship) {
                where.addParams({ [identifiers.relationship]: params.where.relationship });
            }

            const { getIdentifierWithLabel } = QueryRunner;

            const directionAndNameString = QueryRunner.getRelationshipDirectionAndName({
                direction: relationship.direction,
                name: relationship.name,
                identifier: identifiers.relationship,
            });

            /* clone the where bind param and construct one for the update, as there might be common keys between where and data */
            const updateBindParam = where.bindParam.clone();

            const { statement: setStatement } = QueryRunner.getSetParts({
                bindParam: updateBindParam,
                data,
                identifier: identifiers.relationship,
            });

            const statementParts: string[] = [];

            statementParts.push(`
                    MATCH
                    (${getIdentifierWithLabel(identifiers.source, labels.source)})
                    ${directionAndNameString}
                    (${getIdentifierWithLabel(identifiers.target, labels.target)})
                `);

            if (where.statement) {
                statementParts.push(`WHERE ${where.statement}`);
            }

            statementParts.push(setStatement);

            return queryRunner.run(
                statementParts.join(' '),
                updateBindParam.get(),
                params?.session
            );
        }

        public async updateRelationship(
            data: Parameters<InstanceMethodsI['updateRelationship']>[0],
            params: Parameters<InstanceMethodsI['updateRelationship']>[1]
        ): ReturnType<InstanceMethodsI['updateRelationship']> {
            Model.assertPrimaryKeyField('updateRelationship');
            return Model.updateRelationship(data, {
                ...params,
                where: {
                    ...params.where,
                    source: {
                        [modelPrimaryKeyField]: this[modelPrimaryKeyField as string],
                    },
                },
            });
        }

        public static async delete(
            configuration?: Parameters<ModelStaticsI['delete']>[0]
        ): ReturnType<ModelStaticsI['delete']> {
            const { detach, where } = configuration;
            const normalizedLabel = QueryRunner.getNormalizedLabels(modelLabel);

            const identifier = 'node';
            const res = await queryRunner.delete(
                {
                    label: normalizedLabel,
                    where: {
                        [identifier]: where,
                    },
                    detach,
                    identifier,
                    session: configuration?.session,
                }
            );
            return getNodesDeleted(res);
        }

        public async delete(
            configuration?: Parameters<InstanceMethodsI['delete']>[0]
        ): ReturnType<InstanceMethodsI['delete']> {
            Model.assertPrimaryKeyField('delete');

            return Model.delete({
                ...configuration,
                where: {
                    [modelPrimaryKeyField]: this[modelPrimaryKeyField as string],
                },
            });
        }

        public static async findMany(
            params?: Parameters<ModelStaticsI['findMany']>[0],
        ): ReturnType<ModelStaticsI['findMany']> {
            const normalizedLabel = QueryRunner.getNormalizedLabels(this.getLabel());

            const rootIdentifier = modelName;

            const bindParam = new BindParam();
            const rootWhere = params?.where && new Where({
                [rootIdentifier]: params?.where,
            }, bindParam);

            const statementParts: string[] = [];

            /* match the nodes of this Model */
            statementParts.push(`
                    MATCH (${rootIdentifier}:${normalizedLabel})
                `);
            if (rootWhere) {
                statementParts.push(`
                        WHERE ${rootWhere.statement}
                    `);
            }
            /* add the return statement */
            statementParts.push(`
                    RETURN ${rootIdentifier}
                `);

            if (params?.order) {
                statementParts.push(`
                        ORDER BY ${params?.order
                        .filter(([field]) => schemaKeys.has(field as string))
                        .map(([field, direction]) => `${rootIdentifier}.${field} ${direction}`)
                        .join(', ')
                    }
                    `);
            }

            if (params?.limit) {
                const limitParam = bindParam.getUniqueNameAndAdd('limit', int(params?.limit));
                statementParts.push(`LIMIT $${limitParam}`);
            }

            const statement = statementParts.join(' ');
            const res = await queryRunner.run(statement, bindParam.get(), params?.session);

            const instances = res.records.map((record) => {
                const node = record.get(rootIdentifier);
                const data: Properties = node.properties;
                const instance = Model.__build(data, { status: 'existing' });
                instance.__existsInDatabase = true;
                return instance;
            });

            return instances;
        }

        public static async findOne(
            params?: Parameters<ModelStaticsI['findOne']>[0],
        ): ReturnType<ModelStaticsI['findOne']> {
            const instances = await Model.findMany({
                ...params,
                limit: 1,
            });
            return instances[0];
        }

        /** creates a relationship by using the configuration specified in "relationships" from the given alias */
        public static async relateTo(
            params: Parameters<ModelStaticsI['relateTo']>[0],
        ): ReturnType<ModelStaticsI['relateTo']> {

            const relationship = relationships.find((r) => r.alias === params.alias);

            if (!relationship) {
                throw new NeogmaNotFoundError(`The relationship of the alias ${params.alias} can't be found for the model ${modelLabel}`);
            }

            const where: WhereParamsByIdentifierI = {};
            if (params.where) {
                where[QueryRunner.identifiers.createRelationship.source] = params.where.source;
                where[QueryRunner.identifiers.createRelationship.target] = params.where.target;
            }

            const res = await queryRunner.createRelationship({
                source: {
                    label: QueryRunner.getNormalizedLabels(modelLabel),
                },
                target: {
                    label: QueryRunner.getNormalizedLabels(Model.getLabelFromRelationshipModel(relationship.model)),
                },
                relationship: {
                    name: relationship.name,
                    direction: relationship.direction,
                    properties: {},
                },
                where,
                session: params.session,
            });
            const relationshipsCreated = res.summary.counters.updates().relationshipsCreated;

            const { assertCreatedRelationships } = params;
            if (assertCreatedRelationships && relationshipsCreated !== assertCreatedRelationships) {
                throw new NeogmaError(
                    `Not all required relationships were created`,
                    {
                        relationshipsCreated,
                        ...params,
                    },
                );
            }

            return relationshipsCreated;
        }

        /** wrapper for the static relateTo, where the source is always this node */
        public async relateTo(
            params: Parameters<InstanceMethodsI['relateTo']>[0]
        ): ReturnType<InstanceMethodsI['relateTo']> {
            Model.assertPrimaryKeyField('relateTo');

            return Model.relateTo({
                ...params,
                where: {
                    source: {
                        [modelPrimaryKeyField]: this[modelPrimaryKeyField as string],
                    },
                    target: params.where,
                },
            });
        }

        /**
         * @param {queryRunner.CreateRelationshipParamsI} - the parameters including the 2 nodes and the label/direction of the relationship between them
         * @param {GenericConfiguration} configuration - query configuration
         * @returns {Number} - the number of created relationships
         */
        public static async createRelationship(
            params: Parameters<ModelStaticsI['createRelationship']>[0],
        ): ReturnType<ModelStaticsI['createRelationship']> {

            const res = await queryRunner.createRelationship(params);
            const relationshipsCreated = res.summary.counters.updates().relationshipsCreated;

            const { assertCreatedRelationships } = params;
            if (assertCreatedRelationships && relationshipsCreated !== assertCreatedRelationships) {
                throw new NeogmaError(
                    `Not all required relationships were created`,
                    {
                        relationshipsCreated,
                        ...params,
                    },
                );
            }

            return relationshipsCreated;
        }

        /** gets the label from the given model for a relationship */
        public static getLabelFromRelationshipModel(
            relationshipModel: Parameters<ModelStaticsI['getLabelFromRelationshipModel']>[0]
        ): ReturnType<ModelStaticsI['getLabelFromRelationshipModel']> {
            return relationshipModel === 'self' ? modelLabel : relationshipModel.getLabel();
        }

        /** gets the model of a relationship */
        public static getRelationshipModel(
            relationshipModel: Parameters<ModelStaticsI['getRelationshipModel']>[0]
        ): ReturnType<ModelStaticsI['getRelationshipModel']> {
            return relationshipModel === 'self' ? Model : relationshipModel;
        }

        public static assertPrimaryKeyField(
            operation: Parameters<ModelStaticsI['assertPrimaryKeyField']>[0]
        ): ReturnType<ModelStaticsI['assertPrimaryKeyField']> {
            if (!modelPrimaryKeyField) {
                throw new NeogmaConstraintError(`This operation (${operation}) required the model to have a primaryKeyField`);
            }
        }

    };

    for (const staticKey in statics) {
        if (!statics.hasOwnProperty(staticKey)) { continue; }
        Model[staticKey as keyof typeof Model] = statics[staticKey];
    }

    for (const methodKey in methods) {
        if (!methods.hasOwnProperty(methodKey)) { continue; }
        Model.prototype[methodKey as keyof typeof Model.prototype] = methods[methodKey];
    }

    // add to modelsByName
    neogma.modelsByName[modelName] = Model;

    return Model as unknown as NeogmaModel<Properties, RelatedNodesToAssociateI, MethodsI, StaticsI>;
};
