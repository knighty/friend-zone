#!/bin/bash
echo "-- Ending Containers...";
docker compose down;

echo "-- Pulling Code...";
if ! git pull ; then
  printf >&2 'git pull failed, please see log.\n'
  exit 1
fi

echo "-- Build...";
if ! docker compose -f production.yml build ; then
  printf >&2 'build failed, please see log.\n'
  exit 1
fi

echo "-- Running Containers...";
docker compose -f production.yml up;