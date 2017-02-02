/**
 * Created by Vasiliy Ermilov (email: inkz@xakep.ru, telegram: @inkz1) on 29.04.16.
 */
'use strict';

var Property = require('./Property');
var PropertyTypes = require('core/PropertyTypes');

// jshint maxstatements: 30

/**
 * @param {String} id
 * @param {{}} base
 * @param {ClassMeta} classMeta
 * @constructor
 */
function Item(id, base, classMeta) {

  var _this = this;

  /**
   * @type {String}
   */
  this.id = id;

  /**
   * @type {Object}
   */
  this.base = base;

  /**
   * @type {ClassMeta}
   */
  this.classMeta = classMeta;

  this.properties = null;

  this.references = {};

  this.calculated = {};

  this.files = {};

  this.getItemId = function () {
    return this.id;
  };

  this.getClassName = function () {
    return this.classMeta.getCanonicalName();
  };

  /**
   * @returns {ClassMeta}
   */
  this.getMetaClass = function () {
    return this.classMeta;
  };

  /**
   * @returns {String}
   */
  this.getCreator = function () {
    return this.base._creator;
  };

  /**
   * @returns {String}
   */
  this.getEditor = function () {
    return this.base._editor;
  };

  /**
   * @param {String} name
   * @returns {Item | null}
   */
  this.getAggregate = function (name) {
    var props = this.getProperties();
    var p = props[name];
    if (p && p.getType() === PropertyTypes.REFERENCE) {
      return this.references[name];
    }
    return null;
  };

  /**
   * @param {String} name
   * @returns {Array}
   */
  this.getAggregates = function (name) {
    var props = this.getProperties();
    var p = props[name];
    if (p && p.getType() === PropertyTypes.COLLECTION && this.collections) {
      return this.collections[name] || [];
    }
    return [];
  };

  function getFromBase(name) {
    if (_this.calculated.hasOwnProperty(name)) {
      return _this.calculated[name];
    }

    if (_this.base.hasOwnProperty(name)) {
      var props = _this.getProperties();
      var p = props[name];
      if (p && (
        p.getType() === PropertyTypes.FILE ||
        p.getType() === PropertyTypes.IMAGE ||
        p.getType() === PropertyTypes.FILE_LIST
        )
      ) {
        if (_this.files.hasOwnProperty(name)) {
          return _this.files[name];
        }
      }
      return _this.base[name];
    }
    return null;
  }

  function setToBase(name,value) {
    var p = _this.property(name);
    if (p) {
      _this.base[name] = value;
    }
  }

  this.get = function (name) {
    var dot = name.indexOf('.');
    if (dot > -1) {
      var i = this.getAggregate(name.substring(0, dot));
      if (i) {
        return i.get(name.substring(dot + 1));
      }
    }
    return getFromBase(name);
  };

  this.set = function (name, value) {
    var dot = name.indexOf('.');
    if (dot > -1) {
      var i = this.getAggregate(name.substring(0, dot));
      if (i) {
        i.set(name.substring(dot + 1), value);
      }
    } else {
      setToBase(name, value);
    }
  };

  /**
   * @param {String} nm
   * @param {ClassMeta} cm
   */
  function findPropertyMeta(nm, cm) {
    var dot, pm;
    if ((dot = nm.lastIndexOf('.')) > -1) {
      pm = cm.getPropertyMeta(nm.substring(0, dot));
      if (pm.type === PropertyTypes.REFERENCE) {
        return findPropertyMeta(nm.substring(dot + 1), pm._refClass);
      } else {
        return null;
      }
    }
    return cm.getPropertyMeta(nm);
  }

  /**
   * @param {String} name
   * @returns {Property | null}
   */
  this.property = function (name) {
    var pm;
    var props = this.getProperties();
    if (props.hasOwnProperty(name)) {
      return props[name];
    } else {
      pm = findPropertyMeta(name, this.classMeta);
      if (pm) {
        return new Property(this, pm, name);
      }
    }
    return null;
  };

  function initClassProps(cm) {
    var pm = cm.getPropertyMetas();
    for (var i = 0; i < pm.length; i++) {
      if (pm[i].type !== PropertyTypes.STRUCT) {
        _this.properties[pm[i].name] = new Property(_this, pm[i]);
      }
    }
    if (cm.getAncestor()) {
      initClassProps(cm.getAncestor());
    }
  }

  /**
   * @returns {Property[]}
   */
  this.getProperties = function () {
    if (this.properties === null) {
      this.properties = {};
      initClassProps(this.classMeta);
    }
    return this.properties;
  };
}

Item.prototype.toString = function (semanticGetter, dateCallback) {
  if (typeof semanticGetter === 'function') {
    return semanticGetter.call(this, dateCallback);
  }
  return this.classMeta.getSemantics(this, dateCallback);
};

module.exports = Item;
