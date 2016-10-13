/**
 * Created by kras on 31.08.16.
 */
'use strict';

var ConditionTypes = require('core/ConditionTypes');
var OperationTypes = require('core/OperationTypes');
var equal = require('core/equal');
var cast = require('core/cast');

// jshint maxcomplexity: 40, eqeqeq: false
function contains(container, content) {
  if (container && content !== null) {
    if (typeof container === 'string') {
      if (content) {
        return container.indexOf(String(content)) !== -1 ? true : false;
      }
    } else if (Array.isArray(container)) {
      return container.indexOf(content) !== -1 ? true : false;
    }
  }
  return false;
}

function toArray(v) {
  if (!Array.isArray(v)) {
    return [v];
  }
  return v;
}

function toScalar(v) {
  if (Array.isArray(v) && v.length) {
    return v.length ? v[0] : null;
  }
  return v;
}

/**
 * @param {Item} item
 * @param {{}} condition
 * @returns {Boolean}
 */
function checkCondition(item, condition) {
  var pn, p, v;
  if (condition.property) {
    pn = condition.property;
    p = item.property(pn);
    if (!p) {
      throw new Error('Не найден указанный в условии атрибут ' + item.getClassName() + '.' + pn);
    }
    v = cast(condition.value, p.getType());
    switch (condition.operation) {
      case ConditionTypes.EQUAL:
        return equal(item.get(pn), toScalar(v));
      case ConditionTypes.NOT_EQUAL:
        return !equal(item.get(pn), toScalar(v));
      case ConditionTypes.EMPTY:
        return !item.get(pn);
      case ConditionTypes.NOT_EMPTY:
        return item.get(pn) ? true : false;
      case ConditionTypes.LIKE:
        return String(item.get(pn)).match(new RegExp(toScalar(v))) ? true : false;
      case ConditionTypes.LESS:
        return item.get(pn) < toScalar(v) ? true : false;
      case ConditionTypes.MORE:
        return item.get(pn) > toScalar(v) ? true : false;
      case ConditionTypes.LESS_OR_EQUAL:
        return item.get(pn) <= toScalar(v) ? true : false;
      case ConditionTypes.MORE_OR_EQUAL:
        return item.get(pn) >= toScalar(v) ? true : false;
      case ConditionTypes.IN:
        return contains(toArray(v), item.get(pn));
      case ConditionTypes.CONTAINS:
        return contains(item.get(pn), toScalar(v));
    }
  } else if (condition.nestedConditions) {
    switch (condition.operation) {
      case OperationTypes.AND: return conjunct(item, condition.nestedConditions);
      case OperationTypes.OR: return disjunct(item, condition.nestedConditions);
      case OperationTypes.NOT: return !conjunct(item, condition.nestedConditions);
    }
  }
  return false;
}

function conjunct(item, conditions) {
  if (Array.isArray(conditions) && conditions.length) {
    for (var i = 0; i < conditions.length; i++) {
      if (!checkCondition(item, conditions[i])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function disjunct(item, conditions) {
  if (Array.isArray(conditions) && conditions.length) {
    for (var i = 0; i < conditions.length; i++) {
      if (checkCondition(item, conditions[i])) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * @param {Item} item
 * @param {Array} conditions
 */
module.exports = function (item, conditions) {
  return conjunct(item, conditions);
};