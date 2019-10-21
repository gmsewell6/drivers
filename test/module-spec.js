'use strict';

const should = require('chai').should();
const joi = require('joi');
const DriverManager = require('../').DriverManager;

describe('DriverManager', function () {
    const schema = {
        id: joi.string().required(),
        name: joi.string().required(),
        getName: joi.func().default(function () {
            return this.name;
        })
    };

    let drivers;

    beforeEach(function () {
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
        it(`should return the configured 'missing' driver instead of throwing when getting an unknown driver, if one was provided to the driver manager`, () => {
            const drivers = new DriverManager('things', schema, null, () => ({ name: 'Missing Driver' }));
            drivers.get.bind(drivers, 'foo').should.not.throw;
            const found = drivers.get('foo');
            should.exist(found);
            found.should.be.an('Object');
            found.should.have.property('id', 'missing');
            found.should.deep.equal(drivers.missing('foo'));
        });

        it(`should dynamically generate a missing driver based on the requested driver id`, () => {
            const drivers = new DriverManager('things', schema, null, id => ({ name: `Missing Driver: ${id}` }));
            drivers.get.bind(drivers, 'foo').should.not.throw;
            const foundFoo = drivers.get('foo');
            should.exist(foundFoo);
            foundFoo.should.be.an('Object');
            foundFoo.should.have.property('id', 'missing');
            foundFoo.should.have.property('name', 'Missing Driver: foo');
            foundFoo.should.deep.equal(drivers.missing('foo'));
            const foundBar = drivers.get('bar');
            should.exist(foundBar);
            foundBar.should.be.an('Object');
            foundBar.should.have.property('id', 'missing');
            foundBar.should.have.property('name', 'Missing Driver: bar');
            foundBar.should.deep.equal(drivers.missing('bar'));
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
            found.should.deep.equal(drivers.missing());
        });

        it(`should not allow a driver with id = 'missing' to be added when one has been configured on the manager`, () => {
            const drivers = new DriverManager('things', schema, null, () => ({ name: 'Missing Driver' }));
            drivers.add.bind(drivers, { id: 'missing', name: 'Registered Missing Driver' }).should.throw();
        });

        it(`should not allow a default 'missing' driver to be set after a driver with the id 'missing' has been registered`, () => {
            const drivers = new DriverManager('things', schema, null);
            drivers.add({ id: 'missing', name: 'Missing Driver' });
            let error;
            try {
                drivers.missing = () => ({ name: 'Missing Driver set late' });
            } catch (err) {
                error = err;
            }
            should.exist(error);
            error.should.have.property('message', `Cannot configure a default 'missing' driver when a driver with that id has already been added`);
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