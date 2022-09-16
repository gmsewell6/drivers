'use strict';

const joi = require('joi');
const EventEmitter = require('events');
const _ = require('lodash');
const boom = require('boom');

_.mixin({
    isAsyncFunction: function (value) {
        return _.isObject(value) && value[Symbol.toStringTag] === 'AsyncFunction';
    },
    isGeneratorFunction: function (value) {
        return _.isObject(value) && value[Symbol.toStringTag] === 'GeneratorFunction';
    },
    isFunctionLike: function (value) {
        return _.isObject(value) && typeof value === 'function';
    },
    noopAsync: async function () {

    }
});

const notImplemented = exports.notImplemented = _.curry((driverId, fnName) => boom.notImplemented(`Cannot call ${fnName}() - driver '${driverId}' is missing`));
const makeAsync = exports.makeAsync = makeError => val => async () => {
    throw makeError(val);
};
const makeSync = exports.makeSync = makeError => val => () => {
    throw makeError(val);
};

class DriverManager extends EventEmitter {
    /**
     * Create a DriverManager
     *
     * Supported instance creations:
     *      new DriverManager(string)
     *      new DriverManager(string, joiSchema)
     *      new DriverManager(string, joiSchema, {joiOptions})
     *      new DriverManager(string, joiSchema, missingFn|true)
     *      new DriverManager(string, joiSchema, {joiOptions}, missingFn|true)
     *
     * @constructor
     * @param {string} driverType
     * @param {object=} joiSchema
     * @param {object=} options
     * @param {(function|boolean)=} missing
     */
    constructor (driverType, joiSchema, options, missing) {
        super();

        // 3-arg (type, schema, missingFn|bool) - no options
        if (arguments.length === 3 && !_.isPlainObject(options)) {
            missing = options;
            options = undefined;
        }

        joiSchema = joi.compile(joiSchema || {});
        if (!(joiSchema.describe().children.hasOwnProperty('id'))) {
            joiSchema = joiSchema.concat(joi.object().keys({ id: joi.string().required() }));
        }
        // generate overlay template for funcs that are defaulted or required based on joiSchema
        this.fnOverlayTpl = _.reduce(_.get(joiSchema, ['_inner', 'children']), (acc, child) => {
            const { _type, _flags, _tags } = child.schema;
            if (!(_type === 'object' && _flags.func && (_flags.default || _flags.presence === 'required'))) return acc;
            if(_flags.func && _flags.presence === 'forbidden') return acc;

            const makeError = notImplemented(_, child.key);
            return _.set(acc, [child.key], (_.isAsyncFunction(_flags.default) || _.contains(_tags, 'async')) ? makeAsync(makeError) : makeSync(makeError));
        }, {});

        this.drivers = {};
        this.schema = joiSchema;
        this.options = options;
        this.driverType = driverType;
        // validate (but do not add) a 'missing' driver generator if provided
        if (missing) {
            this.missing = missing;
        }
    }

    set missing (missingDriver) {
        if (!_.isFunction(missingDriver) && missingDriver !== true) throw new Error(`Configured 'missing' driver must be a function or 'true'`);
        if (this.exists('missing')) throw new Error(`Cannot configure a default 'missing' driver when a driver with that id has already been added`);

        if (missingDriver === true) {
            missingDriver = _.constant({});
        }

        // generate base 'missing' driver, overlay any unimplemented known joi-defaulted functions, validate & return
        this._genMissing = (requestedDriverId = '') => {
            const missingBase = _.set(missingDriver(requestedDriverId, notImplemented(requestedDriverId)) || {}, ['id'], 'missing');
            const missing = _.defaults(missingBase, _.mapValues(this.fnOverlayTpl, makeFn => makeFn(requestedDriverId)));
            return this.validate(missing);
        };
    }

    get missing () {
        return this._genMissing;
    }

    /**
     * Called before validation
     * @param driver
     * @return {*}
     */
    // eslint-disable-next-line no-unused-vars
    beforeValidate (driver) {
    }

    /**
     * Called after successful validation
     * @param driver
     */
    // eslint-disable-next-line no-unused-vars
    afterValidate (driver) {
    }

    /**
     * Validates a driver in a before/after sandwich and returns the validated driver
     * @param driver
     * @returns {*}
     */
    validate (driver) {
        joi.validate(this.beforeValidate(driver) || driver, this.schema, this.options, (err, validated) => {
            if (err) throw err;
            driver = validated;
        });
        this.afterValidate(driver);
        return driver;
    }

    /**
     * Validates and adds a new driver to the driver collection
     * @param {Object} driver
     * @return {*}
     */
    add (driver) {
        driver = this.validate(driver);

        if (this.missing && driver.id === 'missing') throw new Error(`A driver with id 'missing' cannot be registered when the DriverManager already has a default 'missing' driver. This should be done when the DriverManager is created.`);
        if (this.exists(driver.id)) throw new Error(`A driver is already registered with id ${driver.id}`);

        this.drivers[driver.id] = driver;

        this.emit('add', driver);
        return driver;
    }

    /**
     * Adds all drivers
     * @param drivers
     * @return {Array|*} a corresponding array of validated drivers
     */
    addAll (drivers) {
        drivers = _.isArray(drivers) ? drivers : [].slice.call(arguments);

        return drivers.map(d => this.add(d));
    }

    /**
     * Tests whether a driver with the supplied id exists
     * @param driverId
     * @return {boolean}
     */
    exists (driverId) {
        return this.drivers.hasOwnProperty(driverId);
    }

    /**
     * Returns a driver by its id.
     * If no driver is found
     *  - and a 'missing' driver has been configured -- return the missing driver
     *  - otherwise if allowNull is falsey -- a boom.badRequest exception is thrown.
     *  - otherwise fall through and ultimately return undefined
     * @param id
     * @param allowNull
     * @return {*}
     */
    get (id, allowNull) {
        if (arguments.length === 0) {
            return _.clone(this.drivers);
        }

        if (!this.exists(id)) {
            if (_.isFunction(this.missing)) return this.missing(id);
            if (!allowNull) throw boom.badRequest(`No ${this.driverType} driver registered with id "${id}" and no default 'missing' driver was configured.`);
        }

        return this.drivers[id];
    }

    /**
     * Returns an array of registered driver ids
     * @return {Array}
     */
    keys () {
        return Object.keys(this.drivers);
    }

    /**
     * Returns an array of all registered drivers
     * @return {Array}
     */
    all () {
        return _.values(this.drivers);
    }

    /**
     * Removes a driver with the specified id, if present
     * @param id
     */
    remove (id) {
        if (id === 'missing') throw new Error(`Cannot remove the configured default 'missing' driver`);

        if (this.exists(id)) {
            this.emit('remove', this.drivers[id]);
            delete this.drivers[id];
        }
    }

    /**
     * Removes all drivers
     */
    removeAll () {
        this.drivers = {};
        this.emit('removeAll');
    }
}

exports.DriverManager = DriverManager;

exports.register = function (server, app, next) {
    const drivers = new Map();

    function driverManager (id, manager) {
        if (!arguments.length) return drivers;
        if (manager) {
            drivers.set(id, manager);
            return this;
        }

        if (drivers.has(id)) return drivers.get(id);

        throw new Error(`Invalid driver type: ${id}`);
    }

    server.decorate('server', 'driverManager', driverManager);
    server.decorate('server', 'dm', driverManager);
    server.decorate('server', 'driver', (type, driver) => driverManager(type).add(driver));
    server.decorate('server', 'drivers', (type, drivers) => driverManager(type).addAll(drivers));
    next();
};

exports.register.attributes = { name: 'ent-drivers' };