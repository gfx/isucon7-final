#!/bin/bash
set -xe
cd /home/isucon/webapp/nodejs
git pull
npm install
npm test
sudo /usr/sbin/nginx -t
sudo service nginx reload
sudo systemctl restart cco.nodejs.service
