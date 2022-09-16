'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));
const should = chai.should();
const joi = require('joi');
const P = require('bluebird');
const _ = require('lodash');
const DriverManager = require('../').DriverManager;

describe('DriverManager', function () {
    let drivers, schema;

    beforeEach(function () {
        schema = schema = {
            id: joi.string().required(),
            name: joi.string().required(),
            getName: joi.func().default(function () {
                return this.name;
            })
        };
        drivers = new DriverManager('driver', schema);
    });

    it('should exist', function () {
        should.exist(DriverManager);
    });

    it('should validate a driver against a joi schema', function () {
        drivers.add.bind(drivers, {}).should.throw('"id" is required');
    });

    it('should add a valid driver', function () {
        const driver = drivers.add({ id: 'foo', name: 'Foo Driver' });
        should.exist(driver);
    });

    it('should add an array of valid drivers', function () {
        const results = drivers.addAll([
            { id: 'foo', name: 'Foo Driver' },
            { id: 'bar', name: 'Bar Driver' }
        ]);

        results.should.have.lengthOf(2);
        drivers.all().should.have.lengthOf(2);
        drivers.get('foo');
        drivers.get('bar');
    });

    it('should create a default joi schema with id', function () {
        const drivers = new DriverManager('default');
        drivers.add.bind(drivers, {}).should.throw('"id" is required');
    });

    describe(`missing driver`, () => {
        let defaultSyncFn, defaultAsyncFn, defaultExpandFn;

        beforeEach(() => {
            defaultSyncFn = () => 'sync';
            defaultAsyncFn = async () => 'async';
            defaultExpandFn = () => '';

            schema = {
                id: joi.string().required(),
                name: joi.string().required(),
                syncFn: joi.func().default(defaultSyncFn),
                asyncFn: joi.func().default(defaultAsyncFn),
                requiredSyncFn: joi.func().required(),
                requiredAsyncFn: joi.func().required().tags('async'),
                optionalSyncFn: joi.func(),
                optionalAsyncFn: joi.func().tags('async'),
                taggedAsyncFn: joi.func().default(defaultSyncFn).tags('async'),
                expandFn: joi.func().forbidden().default(defaultExpandFn)
            };

            drivers = new DriverManager('things', schema);
        });

        it(`should return the configured 'missing' driver instead of throwing when getting an unknown driver, if one was provided to the driver manager`, () => {
            drivers.missing = () => ({ name: 'Missing Driver' });
            drivers.get.bind(drivers, 'foo').should.not.throw;
            const found = drivers.get('foo');
            should.exist(found);
            found.should.be.an('Object');
            found.should.have.property('id', 'missing');
            found.should.have.property('name', 'Missing Driver');
            found.should.have.property('syncFn').that.is.a('function');
            found.should.have.property('asyncFn');
            found.asyncFn[Symbol.toStringTag].should.equal('AsyncFunction');
        });

        it(`should dynamically generate a missing driver based on the requested driver id`, () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            drivers.get.bind(drivers, 'foo').should.not.throw;
            const foundFoo = drivers.get('foo');
            should.exist(foundFoo);
            foundFoo.should.be.an('Object');
            foundFoo.should.have.property('id', 'missing');
            foundFoo.should.have.property('name', 'Missing Driver: foo');
            const foundBar = drivers.get('bar');
            should.exist(foundBar);
            foundBar.should.be.an('Object');
            foundBar.should.have.property('id', 'missing');
            foundBar.should.have.property('name', 'Missing Driver: bar');
        });

        it(`should force the id of the missing driver to be 'missing'`, () => {
            const drivers = new DriverManager('things', schema, null, () => ({
                id: 'temporary',
                name: 'Missing Driver'
            }));
            should.exist(drivers.missing);
            drivers.missing().should.have.property('id', 'missing');
            drivers.get('foo').should.have.property('id', 'missing');
        });

        it(`should validate a manually configured 'missing' driver`, () => {
            const drivers = new DriverManager('things', schema);
            drivers.missing = () => ({ name: 'Missing Driver' });
            drivers.missing().should.have.property('id', 'missing');
            const found = drivers.get('foo');
            should.exist(found);
            found.should.be.an('Object');
            found.should.have.property('id', 'missing');
        });

        it(`should allow configuring a missing driver to the boolean value 'true' for convenience, provided the schema is simple enough`, () => {
            drivers = new DriverManager('things', {
                foo: joi.string(),
                bar: joi.number(),
                baz: joi.func(),
                defaulted: joi.func().default(() => ({}))
            });
            drivers.missing = true;
            const found = drivers.get('foo');
            should.exist(found);
            found.should.have.property('id', 'missing');
            found.should.have.property('defaulted').that.is.a('function');
        });

        it(`should support a 3-arg DriverManager constructor (name, joi, missingFn) to allow specifying a missing impl when there are no opts`, () => {
            drivers = new DriverManager('things', {
                name: joi.string().required(),
                foo: joi.string(),
                bar: joi.number(),
                baz: joi.func(),
                defaulted: joi.func().default(() => ({}))
            }, reqId => ({ name: `Missing Driver: ${reqId}` }));
            const found = drivers.get('foo');
            found.should.have.property('name', `Missing Driver: foo`);
        });

        it(`should support a 3-arg DriverManager constructor (name, joi, boolean) to allow specifying a missing impl when there are no opts`, () => {
            drivers = new DriverManager('things', {
                foo: joi.string(),
                bar: joi.number(),
                baz: joi.func(),
                defaulted: joi.func().default(() => ({}))
            }, true);
            const found = drivers.get('foo');
            found.should.have.property('defaulted').that.is.a('function');
        });

        it(`should generate an error-throwing synchronous function for joi.func() when there is a default`, () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            const missing = drivers.get('foo');
            missing.should.have.property('syncFn').that.is.a('function');
            missing.syncFn.should.throw(`Cannot call syncFn() - driver 'foo' is missing`);
        });

        it(`should generate an error-throwing synchronous function for joi.func() when the function is required but not marked async`, () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            const missing = drivers.get('foo');
            missing.should.have.property('requiredSyncFn').that.is.a('function');
            missing.requiredSyncFn.should.throw(`Cannot call requiredSyncFn() - driver 'foo' is missing`);
        });

        it(`should not generate an error-throwing function for joi.func() when it is not required and there is no default`, () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            const missing = drivers.get('foo');
            missing.should.not.have.property('optionalSyncFn');
            missing.should.not.have.property('optionalAsyncFn');
        });

        it(`should generate an rejecting async function for the missing driver if the default value is an async function`, async () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            const missing = drivers.get('foo');
            missing.should.have.property('asyncFn');
            missing.asyncFn[Symbol.toStringTag].should.equal('AsyncFunction');
            // throws in try/catch
            let e;
            try {
                await missing.asyncFn();
            } catch (err) {
                e = err;
            }
            should.exist(e);
            e.should.be.an('error').that.has.property('message', `Cannot call asyncFn() - driver 'foo' is missing`);
            // rejects direct await
            await (missing.asyncFn().should.eventually.be.rejectedWith(`Cannot call asyncFn() - driver 'foo' is missing`));
            // rejects in awaited promise
            await (P.resolve().then(() => missing.asyncFn()).should.eventually.be.rejectedWith(`Cannot call asyncFn() - driver 'foo' is missing`));
            // rejects in returned promise
            return P.resolve().then(() => missing.asyncFn()).should.eventually.be.rejectedWith(`Cannot call asyncFn() - driver 'foo' is missing`);
        });

        it(`should generate an rejecting async function for the missing driver if the property is tagged 'async' even if the default value is a synchronous function`, async () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            const missing = drivers.get('foo');
            missing.should.have.property('taggedAsyncFn');
            missing.taggedAsyncFn[Symbol.toStringTag].should.equal('AsyncFunction');
            // throws in try/catch
            let e;
            try {
                await missing.taggedAsyncFn();
            } catch (err) {
                e = err;
            }
            should.exist(e);
            e.should.be.an('error').that.has.property('message', `Cannot call taggedAsyncFn() - driver 'foo' is missing`);
            // rejects direct await
            await (missing.taggedAsyncFn().should.eventually.be.rejectedWith(`Cannot call taggedAsyncFn() - driver 'foo' is missing`));
            // rejects in awaited promise
            await (P.resolve().then(() => missing.taggedAsyncFn()).should.eventually.be.rejectedWith(`Cannot call taggedAsyncFn() - driver 'foo' is missing`));
            // rejects in returned promise
            return P.resolve().then(() => missing.taggedAsyncFn()).should.eventually.be.rejectedWith(`Cannot call taggedAsyncFn() - driver 'foo' is missing`);
        });

        it(`should generate an rejecting async function for the missing driver if the function is required`, async () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            const missing = drivers.get('foo');
            missing.should.have.property('requiredAsyncFn');
            missing.requiredAsyncFn[Symbol.toStringTag].should.equal('AsyncFunction');
            // throws in try/catch
            let e;
            try {
                await missing.requiredAsyncFn();
            } catch (err) {
                e = err;
            }
            should.exist(e);
            e.should.be.an('error').that.has.property('message', `Cannot call requiredAsyncFn() - driver 'foo' is missing`);
            // rejects direct await
            await (missing.requiredAsyncFn().should.eventually.be.rejectedWith(`Cannot call requiredAsyncFn() - driver 'foo' is missing`));
            // rejects in awaited promise
            await (P.resolve().then(() => missing.requiredAsyncFn()).should.eventually.be.rejectedWith(`Cannot call requiredAsyncFn() - driver 'foo' is missing`));
            // rejects in returned promise
            return P.resolve().then(() => missing.requiredAsyncFn()).should.eventually.be.rejectedWith(`Cannot call requiredAsyncFn() - driver 'foo' is missing`);
        });

        it(`should provide a convenience function for the missing driver if it wants to throw the standard 'not implemented' error w/ standard message for the called fn`, () => {
            drivers.missing = (id, notImplemented) => ({
                id: 'my-missing-driver',
                name: `Missing Driver: ${id}`,
                optionalSyncFn () {
                    throw notImplemented('optionalSyncFn');
                }
            });
            const missing = drivers.get('foo');
            missing.should.have.property('optionalSyncFn').that.is.a('function');
            missing.optionalSyncFn.should.throw(`Cannot call optionalSyncFn() - driver 'foo' is missing`);
        });

        it(`should allow the missing driver to still supply an override for a joi-defaulted function that throws a different thown error`, () => {
            drivers.missing = id => ({
                name: `Missing Driver: ${id}`,
                syncFn () {
                    throw new Error(`My custom error`);
                }
            });
            const missing = drivers.get('foo');
            missing.should.have.property('syncFn').that.is.a('function');
            missing.syncFn.should.throw(`My custom error`);
        });

        it(`should not allow a driver with id = 'missing' to be added when one has been configured on the manager`, () => {
            const drivers = new DriverManager('things', schema, null, () => ({ name: 'Missing Driver' }));
            drivers.add.bind(drivers, { id: 'missing', name: 'Registered Missing Driver' }).should.throw();
        });

        it(`should not allow a default 'missing' driver to be set after a driver with the id 'missing' has been registered`, () => {
            const drivers = new DriverManager('things', schema, null);
            drivers.add({
                id: 'missing',
                name: 'Missing Driver',
                requiredSyncFn: _.noop,
                requiredAsyncFn: async () => ({})
            });
            let error;
            try {
                drivers.missing = () => ({ name: 'Missing Driver set late' });
            } catch (err) {
                error = err;
            }
            should.exist(error);
            error.should.have.property('message', `Cannot configure a default 'missing' driver when a driver with that id has already been added`);
        });

        it(`should not try to add a forbidden property`, () => {
            drivers.missing = id => ({ name: `Missing Driver: ${id}` });
            drivers.get.bind(drivers, 'foo').should.not.throw;
            const foundFoo = drivers.get('foo');
            should.exist(foundFoo);
            foundFoo.should.be.an('Object');
            foundFoo.should.have.property('expandFn', defaultExpandFn);
        });
    });

    describe('when valid drivers have been registered', function () {
        beforeEach(function () {
            drivers.add({ id: 'foo', name: 'Foo Driver' });
            drivers.add({ id: 'bar', name: 'Bar Driver' });
        });

        it('should return a list of driver keys', function () {
            drivers.keys().should.have.members(['foo', 'bar']);
        });

        it('should return all the drivers', function () {
            const values = drivers.all();
            values.should.have.length(2);
            values[0].getName().should.equal('Foo Driver');
        });

        it('should return a driver by id', function () {
            drivers.get('foo').should.have.property('name', 'Foo Driver');
        });

        it('should throw an exception if the driver does not exist', function () {
            drivers.get.bind(drivers, 'baz').should.throw();
        });

        it('should return a null driver if allow null is true', function () {
            should.not.exist(drivers.get('baz', true));
        });

        it('should return a hash of all the drivers', function () {
            const newDrivers = drivers.get();
            newDrivers.should.have.property('foo');
            newDrivers.should.have.property('bar');
        });

        it('should remove a driver', function () {
            drivers.remove('bar');
            drivers.keys().should.have.length(1);
        });

        it('should not throw an error when removing a missing driver', function () {
            drivers.remove('baz');
        });

        it('should remove all drivers', function () {
            drivers.removeAll();
            drivers.keys().should.have.length(0);
        });

        it('should not register a driver with the same id', function () {
            drivers.add.bind(drivers, { id: 'foo', name: 'Another foo driver' }).should.throw();
        });

        it('should test if a driver exists', function () {
            drivers.exists('foo').should.be.true;
            drivers.exists('baz').should.be.false;
        });
    });
});