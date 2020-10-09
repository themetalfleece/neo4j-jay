/* eslint-disable @typescript-eslint/no-empty-interface */
import { QueryBuilder } from './QueryBuilder';
import { Neogma } from '../Neogma';
import * as dotenv from 'dotenv';
import { ModelFactory, NeogmaInstance } from '..';

let neogma: Neogma;

beforeAll(async () => {
    dotenv.config();
    neogma = new Neogma({
        url: process.env.NEO4J_URL ?? '',
        username: process.env.NEO4J_USERNAME ?? '',
        password: process.env.NEO4J_PASSWORD ?? '',
    });
});

afterAll(async () => {
    await neogma.driver.close();
});

const getOrdersModel = () => {
    type OrderAttributesI = {
        name: string;
        id: string;
        optionalWillBeSet?: string;
        optionalWillNotBeSet?: string;
    };
    interface OrdersRelatedNodesI {}

    interface OrdersMethodsI {}

    interface OrdersStaticsI {}

    type OrdersInstance = NeogmaInstance<
        OrderAttributesI,
        OrdersRelatedNodesI,
        OrdersMethodsI
    >;

    const Orders = ModelFactory<
        OrderAttributesI,
        OrdersRelatedNodesI,
        OrdersStaticsI,
        OrdersMethodsI
    >(
        {
            label: 'Order',
            schema: {
                name: {
                    type: 'string',
                    minLength: 3,
                    required: true,
                },
                id: {
                    type: 'string',
                    required: true,
                },
                optionalWillBeSet: {
                    type: 'string',
                    required: false,
                },
                optionalWillNotBeSet: {
                    type: 'string',
                    required: false,
                },
            },
            relationships: [],
            primaryKeyField: 'id',
            statics: {},
            methods: {},
        },
        neogma,
    );

    return Orders;
};

describe.only('QueryBuilder', () => {
    it('Builds a query of every parameters type', () => {
        const Orders = getOrdersModel();

        const queryBuilder = new QueryBuilder([
            {
                raw: 'MATCH (w:W)',
            },
            {
                match: '(u:User)',
            },
            {
                match: {
                    literal: '(v:V)',
                    optional: true,
                },
            },
            {
                match: {
                    identifier: 'o',
                    model: Orders,
                    where: {
                        id: '20',
                        age: 26,
                    },
                    optional: true,
                },
            },
            {
                match: {
                    identifier: 'p',
                    label: 'Product',
                    where: {
                        id: '21',
                    },
                },
            },
            {
                match: {
                    related: [
                        {
                            identifier: 'a',
                        },
                        {
                            direction: 'in',
                        },
                        {
                            identifier: 'oo',
                            where: {
                                id: '11',
                            },
                        },
                        {
                            direction: 'out',
                            name: 'CREATES',
                            identifier: 'r',
                            where: {
                                date: '05-10-2020',
                            },
                        },
                        {
                            identifier: 'u',
                        },
                    ],
                    optional: true,
                },
            },
            {
                match: {
                    multiple: [
                        {
                            identifier: 'a',
                            label: 'a',
                        },
                        {
                            identifier: 'p2',
                            model: Orders,
                        },
                    ],
                    optional: true,
                },
            },
            {
                create: '(n1:Location)',
            },
            {
                create: {
                    multiple: [
                        {
                            model: Orders,
                        },
                        {
                            identifier: 'n2',
                            label: 'Location',
                        },
                    ],
                },
            },
            {
                create: {
                    identifier: 'n3',
                    label: 'Location',
                },
            },
            {
                create: {
                    identifier: 'n4',
                    model: Orders,
                },
            },
            {
                create: {
                    related: [
                        {
                            identifier: 'n4',
                            label: 'Location',
                        },
                        {
                            direction: 'out',
                            name: 'HAS',
                        },
                        {
                            identifier: 'n5',
                            model: Orders,
                        },
                        {
                            direction: 'in',
                            name: 'CREATES',
                        },
                        {
                            identifier: 'n6',
                            label: 'User',
                        },
                    ],
                },
            },
            {
                merge: {
                    related: [
                        {
                            identifier: 'n7',
                            label: 'Location',
                        },
                        {
                            direction: 'out',
                            name: 'HAS',
                        },
                        {
                            identifier: 'n8',
                            model: Orders,
                        },
                        {
                            direction: 'in',
                            name: 'CREATES',
                        },
                        {
                            identifier: 'n9',
                            label: 'User',
                        },
                    ],
                },
            },
            {
                set: `o.age = 27`,
            },
            {
                set: {
                    identifier: 'p',
                    properties: {
                        name: 'New Name',
                        isAvailable: false,
                    },
                },
            },
            {
                remove: `u.id`,
            },
            {
                remove: {
                    identifier: 'p',
                    properties: ['name', 'isAvailable'],
                },
            },
            {
                remove: {
                    identifier: 'w',
                    labels: ['Label1', 'Label2'],
                },
            },
            {
                delete: 'w',
            },
            {
                delete: {
                    literal: 'v',
                    detach: true,
                },
            },
            {
                delete: {
                    identifiers: ['p', 'o'],
                    detach: true,
                },
            },
            {
                return: 'w, v.id',
            },
            {
                return: ['p', 'o', 'u.id'],
            },
            {
                with: ['a', 'b'],
            },
            {
                return: [
                    {
                        identifier: 'a',
                    },
                    {
                        identifier: 'b',
                        property: 'id',
                    },
                ],
            },
            {
                limit: 1,
            },
        ]);

        console.log(queryBuilder.getStatement());
        console.log(queryBuilder.getBindParam());
    });
});
