var Medea = require('medea');
var CachingRules = require('./caching-rules');

var Cache = function(db) {
  this.open = Medea.prototype.open.bind(db);
  this.get = Medea.prototype.get.bind(db);
  this.put = Medea.prototype.put.bind(db);
  this.remove = Medea.prototype.remove.bind(db);
};

var options;
var db;
var isOpen = false;

module.exports = function(opts) {
  options = opts || {};
  dirname = options.dirname || process.cwd() + '/data';
  db = new Medea(options);

  return httpCache(options);
};

var httpCache = function(options) {
  const rules = new CachingRules(options);

  return function(req, res, next) {
    req.httpCache = new Cache(db);
    req.httpCache.ttl = options.ttl;

    if (!isOpen) {
      db.open(dirname, options, function(err) {
        isOpen = true;
        db.compact(function(err) {
          generateKey(rules, req, res, next);
        });
      });
    } else {
      generateKey(rules, req, res, next);
    }
  };
};

function generateKey(rules, req, res, next) {
  rules.generateKey(req, res, () => {
    rules.checkResponse(req, res)
    rules.checkRequest(req, res, next);
  });
}
