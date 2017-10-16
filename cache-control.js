var CacheControl = function(value, type) {
  this._original = value;

  if (!type || (type !== 'request' && type !== 'response')) {
    type = 'response';
  }

  // Params
  this.public = null;
  this.private = null;
  this.noCache = null;
  this.noStore = null;
  this.noTransform = null;
  this.maxAge = null;
  this.sharedMaxAge = null;
  this.mustRevalidate = null;
  this.proxyRevalidate = null;

  // Request-specific params
  this.minFresh = null;
  this.maxStale = null;
  this.onlyIfCached = null;

  this._parse(value);
};

CacheControl.prototype._parse = function(value) {
  if (!value || !value.length) {
    return;
  }

  var self = this;
  value.replace(' ', '').split(',').forEach(function(part) {
    if (!part || !part.length) {
      return;
    }

    var pair = part.split('=', 2);
    var name = pair[0] ? pair[0] : null;
    var val = pair[1] ? pair[1] : null;

    if (name && name.length) {
      self._assign(name.toLowerCase(), val || true);
      //self[name.toLowerCase()] = (val || true);
    }
  });
};

CacheControl.prototype._assign = function(key, value) {
  switch(key) {
    case 'public':
    case 'private':
      this[key] = value;
      break;
    case 'no-cache':
      this.noCache = value;
      break;
    case 'no-store':
      this.noStore = value;
      break;
    case 'no-transform':
      this.noTransform = value;
      break;
    case 'max-age':
      this.maxAge = Number(value);
      break;
    case 's-maxage':
      this.sharedMaxAge = Number(value);
      break;
    case 'must-revalidate':
      this.mustRevalidate = value;
      break;
    case 'proxy-revalidate':
      this.proxyRevalidate = value;
      break;
    case 'max-stale':
      value = value === true ? Number.MAX_VALUE : Number(value);
      this.maxStale = value;
      break;
    case 'only-if-cached':
      this.onlyIfCached = value;
      break;
  }
};

CacheControl.prototype.toString = function() {
  return this._original;
};

module.exports = function(value, type) {
  return new CacheControl(value, type);
};
