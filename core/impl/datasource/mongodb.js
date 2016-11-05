// jscs:disable requireCapitalizedComments
/**
 * Created by kras on 25.02.16.
 */
'use strict';

// var util = require('util'); //jscs:ignore requireSpaceAfterLineComments
var DataSource = require('core/interfaces/DataSource');
var mongo = require('mongodb');
var client = mongo.MongoClient;
var LoggerProxy = require('core/impl/log/LoggerProxy');

const AUTOINC_COLLECTION = '__autoinc';

// jshint maxstatements: 30, maxcomplexity: 20

/**
 * @param {{ uri: String, options: Object }} config
 * @constructor
 */
function MongoDs(config) {

  var _this = this;

  /**
   * @type {Db}
   */
  this.db = null;

  this.isOpen = false;

  this.busy = false;

  var log = config.logger || new LoggerProxy();

  /**
   * @returns {Promise}
   */
  this.openDb = function () {
    return new Promise(function (resolve, reject) {
      if (_this.db && _this.isOpen) {
        return resolve(_this.db);
      } else if (_this.db && _this.busy) {
        _this.db.once('isOpen', function () {
          resolve(_this.db);
        });
      } else {
        _this.busy = true;
        client.connect(config.uri, config.options, function (err, db) {
          if (err) {
            reject(err);
          }
          try {
            _this.db = db;
            _this.db.open(function () {
              _this.busy = false;
              _this.isOpen = true;
              log.info('Получено соединение с базой: ' + db.s.databaseName + '. URI: ' + db.s.options.url);
              _this._ensureIndex(AUTOINC_COLLECTION, {type: 1}, {unique: true}).then(
                function () {
                  resolve(_this.db);
                  _this.db.emit('isOpen', _this.db);
                }
              ).catch(reject);
            });
          } catch (e) {
            _this.busy = false;
            _this.isOpen = false;
            reject(e);
          }
        });
      }
    });
  };

  this._connection = function () {
    if (this.isOpen) {
      return this.db;
    }
    return null;
  };

  this._open = function () {
    return this.openDb();
  };

  this._close = function () {
    return new Promise(function (resolve, reject) {
      if (_this.db && _this.isOpen) {
        _this.busy = true;
        _this.db.close(true, function (err) {
          _this.isOpen = false;
          _this.busy = false;
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  };

  /**
   * @param {String} type
   * @returns {Promise}
   */
  this.getCollection = function (type) {
    return new Promise(function (resolve, reject) {
      _this.openDb().then(function () {
        // Здесь мы перехватываем автосоздание коллекций, чтобы вставить хук для создания индексов, например
        _this.db.collection(type, {strict: true}, function (err, c) {
          if (!c) {
            _this.db.createCollection(type)
              .then(resolve)
              .catch(reject);
          } else {
            if (err) {
              return reject(err);
            }
            resolve(c);
          }
        });
      }).catch(reject);
    });
  };

  this._delete = function (type, conditions) {
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          c.deleteMany(conditions,
            function (err, result) {
              if (err) {
                reject(err);
              } else if (result.deletedCount > 0) {
                resolve(result.deletedCount);
              }
            });
        });
      }
    );
  };

  function getAutoInc(type) {
    return new Promise(function (resolve, reject) {
      _this.getCollection(AUTOINC_COLLECTION).then(
        /**
         * @param {Collection} autoinc
         */
        function (autoinc) {
          autoinc.find({type: type}).limit(1).next(function (err, counters) {
            if (err) {
              return reject(err);
            }
            resolve({ai: autoinc, c: counters});
          });
        }
      ).catch(reject);
    });
  }

  function autoInc(type, data) {
    return new Promise(function (resolve, reject) {
      getAutoInc(type).then(
        /**
         * @param {{ai: Collection, c: {counters:{}, steps:{}}}} result
         */
        function (result) {
          if (result.c && result.c.counters) {
            var inc = {};
            var act = false;
            var counters = result.c.counters;
            for (var nm in counters) {
              if (counters.hasOwnProperty(nm)) {
                inc['counters.' + nm] =
                  result.c.steps && result.c.steps.hasOwnProperty(nm) ? result.c.steps[nm] : 1;
                act = true;
              }
            }

            if (act) {
              result.ai.findOneAndUpdate(
                {type: type},
                {$inc: inc},
                {returnOriginal: false, upsert: false},
                function (err, result) {
                  if (err) {
                    return reject(err);
                  }

                  for (var nm in result.value.counters) {
                    if (result.value.counters.hasOwnProperty(nm)) {
                      data[nm] = result.value.counters[nm];
                    }
                  }
                  resolve(data);
                }
              );
              return;
            }
          }
          resolve(data);
        }
      ).catch(reject);
    });
  }

  this._insert = function (type, data) {
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          autoInc(type, data).then(
            function (data) {
              c.insertOne(data, function (err, result) {
                if (err) {
                  reject(err);
                } else if (result.insertedId) {
                  _this._get(type, {_id: result.insertedId}).then(resolve).catch(reject);
                } else {
                  reject(new Error('Inser failed'));
                }
              });
            }
          ).catch(reject);
        });
      }
    );
  };

  function adjustAutoInc(type, data) {
    return new Promise(function (resolve, reject) {
      getAutoInc(type).then(
        /**
         * @param {{ai: Collection, c: {counters:{}, steps:{}}}} result
         */
        function (result) {
          var act = false;
          var up = {};
          if (result.c && result.c.counters) {
            var counters = result.c.counters;
            for (var nm in counters) {
              if (counters.hasOwnProperty(nm)) {
                if (counters[nm] < data[nm]) {
                  up['counters.' + nm] = data[nm];
                  act = true;
                }
              }
            }
          }

          if (!act) {
            return resolve(data);
          }

          result.ai.findOneAndUpdate(
            {type: type},
            {$set: up},
            {returnOriginal: false, upsert: false},
            function (err, result) {
              if (err) {
                return reject(err);
              }
              resolve(data);
            }
          );
          return;
        }
      ).catch(reject);
    });
  }

  this.doUpdate = function (type, conditions, data, upsert, multi) {
    var hasData = false;
    if (data) {
      for (var nm in data) {
        if (data.hasOwnProperty(nm) &&
          typeof data[nm] !== 'undefined' &&
          typeof data[nm] !== 'function'
        ) {
          hasData = nm;
          break;
        }
      }
    }

    if (!hasData) {
      return _this._get(type, conditions);
    }

    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          if (!multi) {
            c.updateOne(conditions, {$set: data}, {upsert: upsert},
              function (err, result) {
                if (err) {
                  reject(err);
                } else if (result.result && result.result.n > 0) {
                  _this._get(type, conditions).then(function (r) {
                    if (upsert) {
                      return adjustAutoInc(type, r);
                    }
                    return new Promise(function (resolve) { resolve(r); });
                  }).then(resolve).catch(reject);
                } else {
                  resolve();
                }
              });
          } else {
            c.updateMany(conditions, {$set: data},
              function (err, result) {
                if (err) {
                  reject(err);
                } else if (result.result && result.result.n > 0) {
                  _this._fetch(type, {filter: conditions}).then(resolve).catch(reject);
                } else {
                  resolve([]);
                }
              });
          }
        });
      });
  };

  this._update = function (type, conditions, data) {
    return this.doUpdate(type, conditions, data, false, false);
  };

  this._upsert = function (type, conditions, data) {
    return this.doUpdate(type, conditions, data, true, false);
  };

  function produceMatchObject(find, exists) { // jshint -W074
    var matchObj;
    if (Array.isArray(find)) {
      var array = null;
      for (var i = 0; i < find.length; i++) {
        matchObj = produceMatchObject(find[i], exists);
        exists = matchObj.exists;
        if (matchObj.find) {
          if (!array) {
            array = [];
          }
          array.push(matchObj.find);
        }
      }
      return {find: array, exists: exists};
    } else if (typeof find === 'object') {
      var match = null;
      for (var name in find) {
        if (find.hasOwnProperty(name)) {
          if (name === '_exists') {
            exists.push(find[name]);
          } else {
            matchObj = produceMatchObject(find[name], exists);
            exists = matchObj.exists;
            if (matchObj.find) {
              if (!match) {
                match = {};
              }
              match[name] = matchObj.find;
            }
          }
        }
      }
      return {find: match, exists: exists};
    }
    return {find: find, exists: exists};
  }

  function checkAggregation(options) {
    if (options.filter) {
      var exists = [];
      var obj = produceMatchObject(options.filter, exists);
      if (obj.exists.length) {
        var result = [];
        result.push({$match: obj.find});
        for (var i = 0; i < obj.exists.length; i++) {
          result = result.concat(obj.exists[i].stages);
        }
        if (options.sort) {
          result.push({$sort: options.sort});
        }

        result.push({$project: {tmp: '$$ROOT'}});
        result.push({$group: {_id: null, count: {$sum: 1}, data: {$addToSet: '$tmp'}}});
        result.push({$unwind: '$data'});

        if (options.offset) {
          result.push({$skip: options.offset});
        }

        if (options.count) {
          result.push({$limit: options.count});
        }
        return result;
      }
    }
    return false;
  }

  this._fetch = function (type, options) {
    options = options || {};
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          var r;
          var aggregate = checkAggregation(options);

          function work(amount) {
            r.toArray(function (err, docs) {
              r.close();
              if (err) {
                return reject(err);
              }
              if (amount !== null) {
                docs.total = amount;
              }
              resolve(docs);
            });
          }

          if (options.filter && aggregate) {
            r = c.aggregate(aggregate, {}, function (err,data) {
              if (err) {
                return reject(err);
              }
              var results = [];
              if (data.length) {
                for (var i = 0; i < data.length; i++) {
                  results.push(data[i].data);
                }
              }
              if (options.countTotal) {
                results.total = data.length ? data[0].count : 0;
              }
              resolve(results);
            });
          } else {
            r = c.find(options.filter || {});

            if (options.sort) {
              r = r.sort(options.sort);
            }

            if (options.offset) {
              r = r.skip(options.offset);
            }

            if (options.count) {
              r = r.limit(options.count);
            }

            if (options.countTotal) {
              r.count(false, function (err, amount) {
                if (err) {
                  r.close();
                  return reject(err);
                }
                work(amount);
              });
            } else {
              work(null);
            }
          }
        });
      }
    );
  };

  /**
   * @param {String} type
   * @param {{batchSize: Number}} options
   * @param {Function} cb
   * @returns {Promise}
   */
  this._forEach = function (type, options, cb) {
    options = options || {};
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          try {
            var r = c.find(options.filter || {});

            if (options.sort) {
              r = r.sort(options.sort);
            }

            if (options.offset) {
              r = r.skip(options.offset);
            }

            if (options.count) {
              r = r.limit(options.count);
            }

            r.batchSize(options.batchSize || 1);
            r.forEach(
              cb,
              function (err) {
                r.close();
                if (err) {
                  return reject(err);
                }
                resolve();
              }
            );
          } catch (err) {
            reject(err);
          }
        });
      }
    );
  };

  /**
   * @param {String} type
   * @param {{expressions: {}, filter: {}, groupBy: String[]}} options
   * @returns {Promise}
   */
  this._aggregate = function (type, options) {
    options = options || {};
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          if (!options.expressions) {
            return reject(new Error('Не указано выражение агрегации!'));
          }
          var i;
          var plan = [];
          if (options.filter) {
            plan.push({
              $match: options.filter
            });
          }

          var groupings = null;
          if (options.groupBy) {
            groupings = {};
            for (i = 0; i < options.groupBy.length; i++) {
              groupings[options.groupBy[i]] = '$' + options.groupBy[i];
            }
          }

          var expr = {
            $group: {
              _id: groupings
            }
          };

          var alias, oper, attr;
          for (alias in options.expressions) {
            if (options.expressions.hasOwnProperty(alias)) {
              for (oper in options.expressions[alias]) {
                if (options.expressions[alias].hasOwnProperty(oper)) {
                  attr = options.expressions[alias][oper];
                  if (oper === 'count') {
                    expr.$group[alias] = {$sum: 1};
                  } else if (oper === 'sum' || oper === 'avg' || oper === 'min' || oper === 'max') {
                    expr.$group[alias] = {};
                    expr.$group[alias]['$' + oper] = '$' + attr;
                  }
                }
              }
            }
          }

          plan.push(expr);

          c.aggregate(plan, function (err, result) {
            if (err) {
              return reject(err);
            }
            resolve(result);
          });
        });
      }
    );
  };

  this._count = function (type, options) {
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          var opts = {};
          if (options.offset) {
            opts.skip = options.offset;
          }
          if (options.count) {
            opts.limit = options.count;
          }

          c.count(options.filter || {}, opts, function (err, cnt) {
            if (err) {
              reject(err);
            } else {
              resolve(cnt);
            }
          });
        });
      }
    );
  };

  this._get = function (type, conditions) {
    return _this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          c.find(conditions).limit(1).next(function (err, result) {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      });
  };

  /**
   * @param {String} type
   * @param {{}} properties
   * @param {{unique: Boolean}} [options]
   * @returns {Promise}
   */
  this._ensureIndex = function (type, properties, options) {
    return _this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve) {
          c.createIndex(properties, options || {}, function () {
            resolve(c);
          });
        });
      });
  };

  /**
   * @param {String} type
   * @param {{}} properties
   * @returns {Promise}
   */
  this._ensureAutoincrement = function (type, properties) {
    var data = {};
    var steps = {};
    var act = false;
    if (properties) {
      for (var nm in properties) {
        if (properties.hasOwnProperty(nm)) {
          data[nm] = 0;
          steps[nm] = properties[nm];
          act = true;
        }
      }

      if (act) {
        return new Promise(function (resolve, reject) {
          _this.getCollection(AUTOINC_COLLECTION).then(
            function (c) {
              c.findOne({type: type}, function (err, r) {
                if (err) {
                  return reject(err);
                }

                if (r && r.counters) {
                  for (var nm in r.counters) {
                    if (r.counters.hasOwnProperty(nm) && data.hasOwnProperty(nm)) {
                      data[nm] = r.counters[nm];
                    }
                  }
                }

                c.updateOne(
                  {type: type},
                  {$set: {counters: data, steps: steps}},
                  {upsert: true},
                  function (err) {
                    if (err) {
                      return reject(err);
                    }
                    resolve();
                  }
                );
              });
            }
          ).catch(reject);
        });
      }
    }
    return new Promise(function (resolve) { resolve(); });
  };

  /**
   * @param {String} type
   * @param {Array} stages
   * @returns {Promise}
   */
  this._aggregate = function (type, stages) {
    return this.getCollection(type).then(
      function (c) {
        return new Promise(function (resolve, reject) {
          if (!Array.isArray(stages)) {
            stages = [stages];
          }
          c.aggregate(stages, {}, function (err,data) {
            if (err) {
              return reject(err);
            }
            resolve(data);
          });
        });
      }
    );
  };
}

// Util.inherits(MongoDs, DataSource); //jscs:ignore requireSpaceAfterLineComment

MongoDs.prototype = new DataSource();

module.exports = MongoDs;
