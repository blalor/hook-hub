#!/bin/bash

## starts hook-hub via forever.

cd $(dirname $0)/..

## make sure our dependencies are installed
npm install

exec node_modules/.bin/forever start server.js
