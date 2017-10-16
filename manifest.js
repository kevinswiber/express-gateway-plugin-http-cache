module.exports = {
  version: '1.0.0',
  policies: ['http-cache'],
  init: pluginContext => {
    pluginContext.registerPolicy({
      name: 'http-cache',
      policy: require('./http-cache')
    });
  }
};
