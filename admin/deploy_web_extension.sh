#!/bin/bash

[ -d web_extension/dist ] && rm -r web_extension/dist 
mv dist web_extension/dist
cp src/lang.json web_extension/dist/lang.json