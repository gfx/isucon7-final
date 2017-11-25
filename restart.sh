#!/bin/bash
set -xe
cd /home/isucon/webapp/nodejs
git pull
export PATH="/home/isucon/local/node/bin/:$PATH"
npm install
npx tsc
npm test
sudo /usr/sbin/nginx -t
sudo service nginx reload
sudo systemctl restart cco.nodejs.service
