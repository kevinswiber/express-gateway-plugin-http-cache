var msgpack = require('msgpack-js');
var cacheControl = require('./cache-control');

var CachingRules = module.exports = function(options) {
  if (!(this instanceof CachingRules)) {
    return new CachingRules(options);
  }

  options = options || {};

  this.showIndicator = options.showIndicator;
};

CachingRules.prototype.checkRequest = function(req, res, next) {
  req.httpCache.requestTime = Date.now();

  if (['GET', 'HEAD'].indexOf(req.method) === -1) {
    req.httpCache.pass = true;
    next();
    return;
  }

  var authorizationHeader = req.headers['authorization'];
  var cookieHeader = req.headers['cookie'];

  if (authorizationHeader || cookieHeader) {
    req.httpCache.pass = true;
    next();
    return;
  }

  var pragma = req.headers['pragma'];
  if (pragma && pragma.toLowerCase() === 'no-cache') {
    req.httpCache.pass = true;
    next();
    return;
  }

  var requestCacheControlHeader = req.headers['cache-control'];
  if (requestCacheControlHeader) {
    var requestCacheControl = cacheControl(requestCacheControlHeader, 'request');
    if (requestCacheControl.noCache || requestCacheControl.noStore) {
      req.httpCache.pass = true;
      next();
      return;
    }
  }

  req.httpCache.get(req.httpCache.key, (err, val) => {
    if (val) {
      val = msgpack.decode(val);
    }

    if (err) {
      req.httpCache.pass = true;
      req.httpCache.error = err;
      next();
      return;
    }

    if (!val || !val.entries) {
      req.httpCache.lookup = true;
      req.httpCache.miss = true;

      if (this.showIndicator) {
        res.setHeader('Express-Gateway-Cache', 'miss');
      }

      next();
    } else {
      var match = varyMatch(val.entries, req, res);

      if (!match) {
        req.httpCache.lookup = true;
        req.httpCache.miss = true;

        if (this.showIndicator) {
          res.setHeader('Express-Gateway-Cache', 'miss');
        }

        next();
        return;
      }

      var res1 = new (require('http').ServerResponse)(req);
      Object.keys(match.response.headers).forEach(function(name) {
        res1.setHeader(name, match.response.headers[name]);
      });
      res1.body = match.body;

      var expires = CachingRules._calculateExpires(req, res1);
      var dateHeader = match.response.headers['Date'];
      var date = new Date(dateHeader);
      var age = match.response.headers['age'] || 0;
      var responseTime = req.httpCache.responseTime = Date.now();
      var receivedAge = Math.max(responseTime - date, age) || 0;

      var initialAge = receivedAge + (responseTime - req.httpCache.requestTime);
      var residentTime = Date.now() - responseTime;

      match.response.headers['Age'] = Math.round((initialAge + residentTime) / 1000);

      if (match.response.headers['Age'] >= expires) {
        req.httpCache.remove(req.httpCache.key, (err) => {
          req.httpCache.pass = false;
          req.httpCache.cacheable = true;
          req.httpCache.lookup = true;
          req.httpCache.miss = true;

          if (this.showIndicator) {
            res.setHeader('Express-Gateway-Cache', 'miss');
          }

          next();
        });
        return;
      } else {
        Object.keys(match.response.headers).forEach(function(header) {
          res.setHeader(header, match.response.headers[header]);
        });

        if (this.showIndicator) {
          res.setHeader('Express-Gateway-Cache', 'hit');
        }

        req.httpCache.pass = true;

        req.httpCache.hit = true;
        res.end(match.body);
      }
    }
  });
};

function varyMatch(entries, req, res) {
  var idx = varyMatchIndexOf(entries, req, res);
  return !!~idx ? entries[idx] : null;
}

function varyMatchIndexOf(entries, req, res) {
  var idx = -1;
  var found = false;
  var stars = [];
  var varies = [];
  var other = [];

  // TODO: Sort entries by Vary... *, Vary headers, no Vary header
  entries.forEach(function(entry) {
    var vary = null;
    Object.keys(entry.response.headers).forEach(function(k) {
      if (k.toLowerCase() === 'vary') {
        vary = entry.response.headers[k];
      }
    });

    if (!vary) {
      other.push(entry);
    } else if (vary === '*') {
      stars.push(entry);
    } else {
      varies.push(entry);
      //var headers = vary.replace(/\s/g, '').split(',').map(function(n) { return n.toLowerCase(); });
    }
  });

  var sorted = stars.concat(varies, other);

  for (var i = 0, len = sorted.length; i < len; i++) {
    if (found) continue;

    var match = sorted[i];
    var vary = match.response.headers['Vary'];

    if (vary) {
      var headers = vary.replace(/\s/g, '').split(',').map(function(n) { return n.toLowerCase(); });
      var verified = true;
      headers.forEach(function(headerName) {
        var headerValue = req.headers[headerName];
        var requestHeader = match.request.headers[headerName];
        if (headerValue && requestHeader && headerValue !== requestHeader) {
          verified = false;
        }
      });

      if (verified) {
        idx = i;
        found = true;
      }
      
      /*if (!verified) {
        req.httpCache.pass = false;
        req.httpCache.cacheable = false;
        req.httpCache.lookup = true;
        var pipeline = env.pipeline('cache:miss');
        if (pipeline) {
          pipeline.siphon(env, next);
        } else {
          next(env);
        }
        returned = true;
        return;
      } else {
        ix = i;
      }*/
    } else {
      idx = i;
      found = true;
    }
  };

  return idx;
}

CachingRules.prototype.checkResponse = function(req, res) {
  const savedEnd = res.end;

  const self = this;

  const chunks = [];
  let size = 0;
  
  res.write = function(chunk) {
    chunks.push(chunk);
    size += chunk.length;
  };

  res.end = function(chunk, encoding) {
    if (chunk) {
      chunks.push(chunk);
      size += chunk.length;
    }

    encoding = encoding || 'utf8';

    res.body = Buffer.concat(chunks, size);

    function next() {
      savedEnd.call(res, chunk, encoding);
    }
    self._checkResponse(req, res, next);
  };

};

CachingRules.prototype._checkResponse = function(req, res, next) {
  if (req.httpCache.ended) {
    return;
  }

  req.httpCache.ended = true;

  if (req.httpCache.pass) {
    next();
    return;
  }

  req.httpCache.cacheable = true;

  var disallowedHeaders = ['connection', 'keep-alive', 'proxy-authentication', 'proxy-authorization', 'te',
      'transfer-encoding', 'upgrade'];

  var varyHeader = res.getHeader('vary');
  var setCookieHeader = res.getHeader('set-cookie');
  if (varyHeader === '*' || setCookieHeader) {
    req.httpCache.cacheable = false;
  }

  var expires;

  if (req.httpCache.cacheable) {
    expires = CachingRules._calculateExpires(req, res);
  }

  if (!req.httpCache.cacheable) {
    req.httpCache.get(req.httpCache.key, function(err, val) {
      if (!val) return;

      var match = varyMatchIndexOf(val.entries, req, res);
      
      val.entries.splice(match, 1);

      if (!val.entries.length) {
        req.httpCache.remove(req.httpCache.key, function(err) {
          next();
        });
      } else {
        req.httpCache.put(req.httpCache.key, val, function(err) {
          next();
        });
      }
    });
    return;
  }

  var dateHeader = res.getHeader('date');

  if (!dateHeader) {
    res.setHeader('Date', utcDate());
    dateHeader = res.getHeader('date');
  }

  var date = new Date(dateHeader);
  var age = res.getHeader('age') || 0;
  var responseTime = req.httpCache.responseTime = Date.now();
  var receivedAge = Math.max(responseTime - date, age) || 0;

  var initialAge = receivedAge + (responseTime - req.httpCache.requestTime);
  var residentTime = Date.now() - responseTime;
  var newAge = Math.round((initialAge + residentTime) / 1000);

  if (newAge >= expires) {
    req.httpCache.cacheable = false;
    req.httpCache.pass = true;
    next();
    return;
  }

  res.setHeader('Age', newAge);

  var responseHeaders = {};

  if (res._headerNames) {
    Object.keys(res._headerNames).forEach(function(headerName) {
      if (disallowedHeaders.indexOf(headerName) == -1) {
        var val = res.getHeader(headerName);
        responseHeaders[res._headerNames[headerName]] = val;
      }
    });
  }  

  var body = res.body;
  var obj = {
    request: {
      headers: req.headers
    },
    response: {
      headers: responseHeaders
    },
    body: body
  };

  req.httpCache.get(req.httpCache.key, function(err, val) {
    if (val) {
      val = msgpack.decode(val);
      if (val && val.entries) {
        val.entries.push(obj);
      } else {
        val = { entries: [obj] };
      }
    } else {
      val = { entries: [obj] };
    }

    req.httpCache.put(req.httpCache.key, msgpack.encode(val), function(err) {
      next(body);
    });
  });
};

CachingRules.prototype.generateKey = function(req, res, next) {
  var host = req.headers['host'];
  var url = req.url;
  var key = host + url;

  req.httpCache.key = key;
  next();
};

CachingRules._calculateExpires = function(req, res) {
  var cacheableStatusCodes = [200, 203, /*206*/, 300, 301, 410]; // for default ttl

  var expiresHeader = res.getHeader('expires');
  var pragmaHeader = res.getHeader('pragma');
  var cacheControlHeader = res.getHeader('cache-control');
  
  var cacheControlValue = cacheControl(cacheControlHeader);

  if (cacheControlValue.sharedMaxAge) {
    expires = cacheControlValue.sharedMaxAge;
  } else if (cacheControlValue.maxAge) {
    expires = cacheControl.maxAge;
  } else if (expiresHeader) {
    const dateHeader = res.getHeader('date');
    const date = new Date(dateHeader).getTime() / 1000;
    const exp = new Date(expiresHeader).getTime() / 1000;
    expires = exp - date;
  } else if (cacheableStatusCodes.indexOf(res.statusCode) !== -1 
      && (!pragmaHeader || pragmaHeader.toLowerCase() !== 'no-cache') && !cacheControl.noCache
      && !cacheControl.noStore) {
    expires = req.httpCache.ttl;
  } else {
    req.httpCache.cacheable = false;
  }

  return expires;
};

var dateCache;
function utcDate() {
  if (!dateCache) {
    var d = new Date();
    dateCache = d.toUTCString();
    setTimeout(function() {
      dateCache = undefined;
    }, 1000 - d.getMilliseconds());
  }
  return dateCache;
}
