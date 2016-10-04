'use strict';

var should = require('chai').should();
var joi = require('joi');
var DriverManager = require('../').DriverManager;

describe('DriverManager', function () {
    var schema = {
        id: joi.string().required(),
        name: joi.string().required(),
        getName: joi.func().default(function() { return this.name }) };

    var drivers;

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
        var driver = drivers.add({ id: 'foo', name: 'Foo Driver' });
        should.exist(driver);
    });

    it('should add an array of valid drivers', function () {
        var results = drivers.addAll([
            { id: 'foo', name: 'Foo Driver' },
            { id: 'bar', name: 'Bar Driver' }
        ]);

        results.should.have.lengthOf(2);
        drivers.all().should.have.lengthOf(2);
        drivers.get('foo');
        drivers.get('bar');
    });

    it('should create a default joi schema with id', function () {
        var drivers = new DriverManager('default');
        drivers.add.bind(drivers, {}).should.throw('"id" is required');
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
            var values = drivers.all();
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
            var newDrivers = drivers.get();
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