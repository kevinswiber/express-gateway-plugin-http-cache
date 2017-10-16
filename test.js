const express = require('express');
const httpCache = require('./http-cache');

const app = express();

app
  .use(httpCache({ ttl: 60, showIndicator: true }))
  .get('/hello', (req, res) => {
    console.log('in route');
    res.setHeader('Cache-Control', 'public, s-maxage=20');
    res.setHeader('Expires', new Date(Date.now() + 10000).toUTCString());
    res.send('hello world');
  })
  .listen(3000);
