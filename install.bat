echo Install root
call npm install
pushd .\remote-control
echo Install remote control
call npm install
popd
echo Install server
pushd .\server
call npm install
popd
echo Install public
pushd .\public
call npm install
popd

