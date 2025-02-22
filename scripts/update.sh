#!/bin/bash

curdir=`pwd`

cd ~/lunar-bot

echo "pulling from git"
git pull

echo ""
echo "updating local dependencies"
npm install

echo ""
echo "compiling to js"
npm run build

echo ""
echo "done"

cd $curdir
