#!/usr/bin/env node
'use strict';

function init(port, cb){

  var express = require('express'),
    path = require('path'),
    fs = require('fs'),
    yaml = require('js-yaml'),
    app = express(),
    api = require('./providers/common/api');

  // TODO: Parameterize this so we can use npm install scxmld-docker plug-in.
  var database = require('./providers/databases/postgres-db')(function (err) {
    if(err) return cb(err);

    console.log('Db initialized');
    cb(null, app, port);
  });
  var simulationServer = require('./providers/stateful/docker')(database);

  // Initialize the api
  api = api(simulationServer, database);

  var smaasJSON = yaml.safeLoad(fs.readFileSync(__dirname + '/smaas.yml','utf8'));

  port = port || process.env.PORT || 8002;

  smaasJSON.host = process.env.SMAAS_HOST_URL || ('localhost' + ':' + port);

  // buffer the body
  app.use(function(req, res, next) {
    req.body = '';
    req.on('data', function(data) {
      return req.body += data;
    });
    return req.on('end', next);
  });

  app.set('views', path.join(__dirname, './views'));
  app.engine('html', require('ejs').renderFile);
  app.use(express.static(path.join(__dirname, './public')));

  app.get('/smaas.json', function (req, res) {
    res.status(200).send(smaasJSON);
  });

  app.get('/api/v1/:StateChartName/:InstanceId/_viz', api.instanceViz);
  app.get('/api/v1/:StateChartName/_viz', api.statechartViz);

  function methodNotImplementedMiddleware(req, res){
    return res.send(501, { message: 'Not implemented' });
  }

  Object.keys(smaasJSON.paths).forEach(function(endpointPath){
    var endpoint = smaasJSON.paths[endpointPath];
    var actualPath = smaasJSON.basePath + endpointPath.replace(/{/g, ':').replace(/}/g, '');

    Object.keys(endpoint).forEach(function(methodName){
      var method = endpoint[methodName];

      var handler = api[method.operationId] || methodNotImplementedMiddleware;
      switch(methodName) {
        case 'get': {
          app.get(actualPath, handler);
          break;
        }
        case 'post': {
          app.post(actualPath, handler);
          break;
        }
        case 'put': {
          app.put(actualPath, handler);
          break;
        }
        case 'delete': {
          app.delete(actualPath, handler);
          break;
        }
        default:{
          console.log('Unsupported method name:', methodName);
        }
      }
    });
  });

  app.use(function(req, res) {
    res.status(404).send('Can\'t find ' + req.path);
  });
}


if(require.main === module) {
  init(null, function(err,app, port){
    console.log('Starting server on port:', port);
    if(err) throw new Error('Error initializing app');
    app.listen(port, function () {
      console.log('Server started');
    });
  });
} else {
  module.exports.init = init;
}
