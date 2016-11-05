/**
 * Created by kras on 02.03.16.
 */
'use strict';

/**
 * @constructor
 */
function DataSource() {
  /**
   * @returns {*}
   */
  this.connection = function () {
    return this._connection();
  };

  /**
   * @returns {Promise}
   */
  this.open = function () {
    return this._open();
  };

  /**
   * @returns {Promise}
   */
  this.close = function () {
    return this._close();
  };

  /**
   * @param {String} type
   * @param {{}} conditions
   * @returns {Promise}
   */
  this.delete = function (type, conditions) {
    return this._delete(type, conditions);
  };

  /**
   * @param {String} type
   * @param {{}} data
   * @returns {Promise}
   */
  this.insert = function (type, data) {
    return this._insert(type, data);
  };

  /**
   * @param {String} type
   * @param {{}} conditions
   * @param {{}} data
   * @returns {Promise}
   */
  this.update = function (type, conditions, data) {
    return this._update(type, conditions, data);
  };

  /**
   * @param {String} type
   * @param {{}} conditions
   * @param {{}} data
   * @returns {Promise}
   */
  this.upsert = function (type, conditions, data) {
    return this._upsert(type, conditions, data);
  };

  /**
   * @param {String} type
   * @param {{ filter: {}, sort: {}, offset: Number, count: Number, countTotal: Boolean }} options
   * @returns {Promise}
   */
  this.fetch = function (type, options) {
    return this._fetch(type, options);
  };

  /**
   * @param {String} type
   * @param {{filter: {}}} options
   * @returns {Promise}
   */
  this.count = function (type, options) {
    return this._count(type, options);
  };

  /**
   * @param {String} type
   * @param {{filter: {}, offset: Number, count: Number, batchSize: Number}} options
   * @param {Function} cb
   * @returns {Promise}
   */
  this.forEach = function (type, options, cb) {
    return this._forEach(type, options, cb);
  };

  /**
   * @param {String} type
   * @param {{expressions: {}, filter: {}, grouping: {}}} options
   * @returns {Promise}
   */
  this.aggregate = function (type, options) {
    return this._aggregate(type, options);
  };

  /**
   * @param {String} type
   * @param {{}} conditions
   * @returns {Promise}
   */
  this.get = function (type, conditions) {
    return this._get(type, conditions);
  };

  /**
   * @param {String} type
   * @param {{}} properties
   * @param {{unique: Boolean}} [options]
   * @returns {Promise}
   */
  this.ensureIndex = function (type, properties, options) {
    return this._ensureIndex(type, properties, options);
  };

  /**
   * @param {String} type
   * @param {{}} properties
   * @returns {Promise}
   */
  this.ensureAutoincrement = function (type, properties) {
    return this._ensureAutoincrement(type, properties);
  };

  /**
   * @param {String} type
   * @param {Array} stages
   * @returns {Promise}
   */
  this.aggregate = function (type, stages) {
    return this._aggregate(type, stages);
  };
}

module.exports = DataSource;
