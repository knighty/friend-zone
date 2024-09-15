call git pull
echo Install root
call npm ci
echo Install shared
pushd .\shared
call npm ci
popd
pushd .\remote-control
echo Install remote control
call npm ci
call npm run build:dev
popd
echo Install server
pushd .\server
call npm ci
popd
echo Install public
pushd .\public
call npm ci
call npm run build:dev
popd