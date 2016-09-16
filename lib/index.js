'use strict';

var joi = require('joi');
var util = require('util');
var events = require('events');
var _ = require('lodash');
var boom = require('boom');

function DriverManager(driverType, joiSchema, options) {
    events.EventEmitter.call(this);
    joiSchema = joi.compile(joiSchema || {});
    if (!(joiSchema.describe().children.hasOwnProperty('id'))) {
        joiSchema = joiSchema.concat(joi.object().keys({ id: joi.string().required() }));
    }

    this.drivers = {};
    this.schema = joiSchema;
    this.options = options;
    this.driverType = driverType;
}

util.inherits(DriverManager, events.EventEmitter);

/**
 * Called before validation
 * @param driver
 * @return {*}
 */
DriverManager.prototype.beforeValidate = function beforeValidate(driver) {
};

/**
 * Called after successful validation
 * @param driver
 */
DriverManager.prototype.afterValidate = function afterValidate(driver) {
};

/**
 * Validates and adds a new driver to the driver collection
 * @param {Object} driver
 * @return {*}
 */
DriverManager.prototype.add = function (driver) {
    var self = this;

    joi.validate(this.beforeValidate(driver) || driver, this.schema, this.options, function (err, validated) {
        if (err) throw err;

        driver = validated;

        if (self.drivers.hasOwnProperty(driver.id)) throw new Error('A driver is already registered with id ' + driver.id);

        self.drivers[driver.id] = driver;
    });
    this.afterValidate(driver);
    this.emit('add', driver);
    return driver;
};

/**
 * Tests whether a driver with the supplied id exists
 * @param driverId
 * @return {boolean}
 */
DriverManager.prototype.exists = function (driverId) {
    return this.drivers.hasOwnProperty(driverId);
};

/**
 * Returns a driver by its id. If no driver is found and allowNull is falsey, a boom.badRequest exception is thrown
 * @param id
 * @param allowNull
 * @return {*}
 */
DriverManager.prototype.get = function (id, allowNull) {
    if (arguments.length === 0) {
        return _.clone(this.drivers);
    }

    if (!allowNull && !this.drivers.hasOwnProperty(id)) throw boom.badRequest(util.format('No %s driver registered with id "%s"', this.driverType, id));

    return this.drivers[id];
};

/**
 * Returns an array of registered driver ids
 * @return {Array}
 */
DriverManager.prototype.keys = function () {
    return Object.keys(this.drivers);
};

/**
 * Returns an array of all registered drivers
 * @return {Array}
 */
DriverManager.prototype.all = function () {
    return _.values(this.drivers);
};

/**
 * Removes a driver with the specified id, if present
 * @param id
 */
DriverManager.prototype.remove = function (id) {
    if (this.drivers.hasOwnProperty(id)) {
        this.emit('remove', this.drivers[id]);
        delete this.drivers[id];
    }
};

/**
 * Removes all drivers
 */
DriverManager.prototype.removeAll = function () {
    this.drivers = {};
    this.emit('removeAll');
};

exports.DriverManager = DriverManager;

exports.register = function(server, app, next) {
    const drivers = new Map();

    function driverManager(id, manager) {
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
    next();
};

exports.register.attributes = { name: 'ent-drivers' };